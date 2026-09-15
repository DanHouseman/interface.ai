import type { CapabilityArtifact, CapabilityStep } from "../artifact/capability-schema.js";
import type { ExecutionContext, JsonValue } from "../domain/contracts.js";
import type { PolicyEvaluator } from "../policy/policy-evaluator.js";
import type { ActionResult, ResolvedTarget, SurfaceAction, SurfaceAdapter } from "../surface/surface-adapter.js";
import { evaluateCheckpoint } from "./checkpoint-evaluator.js";
import type { ReplayResult, ReplayTraceEvent } from "./replay-contracts.js";

// Plan: Milestone 6 | REQ-RPL-001..004
// Deterministic production execution path. It consumes only a validated artifact, caller inputs,
// policy interface, and surface interface. There is intentionally no model/provider dependency.
export class DeterministicReplayEngine {
  public constructor(
    private readonly surface: SurfaceAdapter,
    private readonly policy: PolicyEvaluator,
  ) {}

  public async replay(artifact: CapabilityArtifact, context: ExecutionContext): Promise<ReplayResult> {
    const trace: ReplayTraceEvent[] = [];
    const inputFailure = validateInvocation(artifact, context);
    if (inputFailure) return { ...inputFailure, trace };

    for (const step of artifact.steps) {
      trace.push({ kind: "STEP_STARTED", stepId: step.id, timestamp: now() });

      // Plan: Milestone 8 | REQ-OUT-005
      // Session expiration is a first-class outcome. Replay never continues against an invalid session.
      const sessionState = await this.surface.getSessionState();
      trace.push({ kind: "SESSION_STATE", stepId: step.id, state: sessionState, timestamp: now() });
      if (sessionState === "expired") {
        return await this.failureWithEvidence(
          trace,
          "INTERVENTION_REQUIRED",
          "SESSION_EXPIRED",
          `Session expired before step '${step.id}'.`,
          step.id,
        );
      }
      if (sessionState !== "active") {
        return await this.failureWithEvidence(
          trace,
          "INTERVENTION_REQUIRED",
          "SESSION_NOT_ACTIVE",
          `Session is '${sessionState}' before step '${step.id}'.`,
          step.id,
        );
      }

      const businessOutcome = await this.detectBusinessOutcome(artifact, trace, step.id);
      if (businessOutcome) return businessOutcome;

      for (const checkpoint of step.preconditions) {
        const evaluation = await evaluateCheckpoint(artifact, checkpoint, this.surface);
        trace.push(checkpointEvent(step.id, checkpoint.id, "precondition", evaluation));
        await this.captureCheckpointEvidence(trace, checkpoint.id, "precondition", step.id);
        if (!evaluation.passed) {
          return await this.failureWithEvidence(
            trace,
            "FAILURE",
            "PRECONDITION_FAILED",
            `Precondition '${checkpoint.id}' failed before step '${step.id}'.`,
            step.id,
          );
        }
      }

      const observation = await this.surface.observe();
      const policyDecision = this.policy.evaluate({ artifact, step, context, observation });
      trace.push({
        kind: "POLICY_DECISION",
        stepId: step.id,
        disposition: policyDecision.disposition,
        code: policyDecision.code,
        reason: policyDecision.reason,
        timestamp: now(),
      });

      if (policyDecision.disposition === "DENY") {
        const disposition = policyDecision.code === "APPROVAL_REQUIRED" ? "INTERVENTION_REQUIRED" : "FAILURE";
        return await this.failureWithEvidence(
          trace,
          disposition,
          "POLICY_DENIED",
          policyDecision.reason,
          step.id,
        );
      }

      const actionBuild = await this.buildAction(artifact, step, context, trace);
      if ("failure" in actionBuild) {
        return await this.failureWithEvidence(trace, "FAILURE", actionBuild.failure.code, actionBuild.failure.message, step.id);
      }

      // Plan: Milestone 9 | REQ-EVD-002
      // High-risk writes get evidence on both sides of the action boundary.
      if (step.action.effect === "irreversible_write" || step.action.effect === "privileged") {
        await this.captureCheckpointEvidence(trace, `risk:${step.id}:before`, "precondition", step.id);
      }

      const execution = await this.executeWithRecovery(step, actionBuild.action, trace);
      if (!execution.ok) {
        if (execution.error?.ambiguousCommit) {
          // Plan: Milestone 8 | REQ-OUT-004
          // Reconciliation uses declared postconditions. A proven committed state may continue;
          // unresolved uncertainty never becomes an automatic retry.
          const reconciled = await this.reconcileAmbiguousCommit(artifact, step, trace);
          if (!reconciled) {
            return await this.failureWithEvidence(
              trace,
              "INTERVENTION_REQUIRED",
              "UNKNOWN_COMMIT_STATE",
              `Step '${step.id}' may have committed but reconciliation could not establish the result.`,
              step.id,
            );
          }
        } else if (execution.error?.recoverable) {
          trace.push({ kind: "RECOVERY", stepId: step.id, code: execution.error.code, outcome: "EXHAUSTED", timestamp: now() });
          return await this.failureWithEvidence(
            trace,
            step.recovery.onFailure === "intervene" ? "INTERVENTION_REQUIRED" : "RECOVERABLE",
            execution.error.code,
            execution.error.message,
            step.id,
          );
        } else {
          return await this.failureWithEvidence(
            trace,
            step.recovery.onFailure === "intervene" ? "INTERVENTION_REQUIRED" : "FAILURE",
            execution.error?.code ?? "ACTION_FAILED",
            execution.error?.message ?? `Step '${step.id}' failed.`,
            step.id,
          );
        }
      }

      if (step.action.effect === "irreversible_write" || step.action.effect === "privileged") {
        await this.captureCheckpointEvidence(trace, `risk:${step.id}:after`, "postcondition", step.id);
      }

      for (const checkpoint of step.postconditions) {
        const evaluation = await evaluateCheckpoint(artifact, checkpoint, this.surface);
        trace.push(checkpointEvent(step.id, checkpoint.id, "postcondition", evaluation));
        await this.captureCheckpointEvidence(trace, checkpoint.id, "postcondition", step.id);
        if (!evaluation.passed) {
          return await this.failureWithEvidence(
            trace,
            "FAILURE",
            "POSTCONDITION_FAILED",
            `Postcondition '${checkpoint.id}' failed after step '${step.id}'.`,
            step.id,
          );
        }
      }

      trace.push({ kind: "STEP_COMPLETED", stepId: step.id, timestamp: now() });

      const afterStepOutcome = await this.detectBusinessOutcome(artifact, trace, step.id);
      if (afterStepOutcome) return afterStepOutcome;
    }

    const success = await evaluateCheckpoint(artifact, artifact.successCheckpoint, this.surface);
    trace.push(checkpointEvent(undefined, artifact.successCheckpoint.id, "success", success));
    await this.captureCheckpointEvidence(trace, artifact.successCheckpoint.id, "success");
    if (!success.passed) {
      return await this.failureWithEvidence(
        trace,
        "FAILURE",
        "SUCCESS_CHECKPOINT_FAILED",
        `Success checkpoint '${artifact.successCheckpoint.id}' was not satisfied.`,
      );
    }

    const outputs = await this.extractOutputs(artifact);
    return {
      disposition: "SUCCESS",
      code: "SUCCESS",
      message: `Capability '${artifact.capability.id}' completed successfully.`,
      outputs,
      trace,
    };
  }

  // Plan: Milestone 6 | REQ-RPL-002
  // Target resolution remains artifact-driven and deterministic. The adapter interprets each
  // strategy; replay never asks an LLM to choose a locator.
  private async buildAction(
    artifact: CapabilityArtifact,
    step: CapabilityStep,
    context: ExecutionContext,
    trace: ReplayTraceEvent[],
  ): Promise<{ action: SurfaceAction } | { failure: { code: string; message: string } }> {
    let target: ResolvedTarget | undefined;
    if (step.action.targetId) {
      const declaredTarget = artifact.targets.find((candidate) => candidate.id === step.action.targetId);
      if (!declaredTarget) {
        return { failure: { code: "TARGET_UNDECLARED", message: `Target '${step.action.targetId}' is not declared.` } };
      }
      try {
        target = await this.surface.resolve(declaredTarget);
        trace.push({
          kind: "TARGET_RESOLVED",
          stepId: step.id,
          targetId: declaredTarget.id,
          strategyKind: target.strategy.kind,
          timestamp: now(),
        });
      } catch (error) {
        return { failure: { code: "TARGET_RESOLUTION_FAILED", message: errorMessage(error) } };
      }
    }

    const value = resolveValue(step, context);
    switch (step.action.type) {
      case "click":
      case "read":
      case "submit":
        return target
          ? { action: { type: step.action.type, target } }
          : { failure: { code: "TARGET_REQUIRED", message: `Action '${step.action.type}' requires a target.` } };
      case "type":
      case "select":
        if (!target) return { failure: { code: "TARGET_REQUIRED", message: `Action '${step.action.type}' requires a target.` } };
        if (typeof value !== "string") {
          return { failure: { code: "STRING_VALUE_REQUIRED", message: `Action '${step.action.type}' requires a string value.` } };
        }
        return { action: { type: step.action.type, target, value } };
      case "navigate":
        return typeof value === "string"
          ? { action: { type: "navigate", value } }
          : { failure: { code: "STRING_VALUE_REQUIRED", message: "Navigate requires a string value." } };
      case "wait":
        return typeof value === "number" && Number.isFinite(value) && value >= 0
          ? { action: { type: "wait", durationMs: value } }
          : { failure: { code: "WAIT_DURATION_REQUIRED", message: "Wait requires a non-negative numeric duration." } };
      case "custom":
        if (!step.action.customAction) {
          return { failure: { code: "CUSTOM_ACTION_REQUIRED", message: "Custom actions require a customAction name." } };
        }
        return {
          action: {
            type: "custom",
            name: step.action.customAction,
            ...(target ? { target } : {}),
            ...(value !== undefined ? { value } : {}),
          },
        };
    }
  }

  // Plan: Milestone 6 + Milestone 8 | REQ-RPL-003, REQ-OUT-003/004
  // Retries are bounded by the artifact. Ambiguous commits never auto-retry in this first slice.
  private async executeWithRecovery(
    step: CapabilityStep,
    action: SurfaceAction,
    trace: ReplayTraceEvent[],
  ): Promise<ActionResult> {
    const maxExecutions = step.recovery.retry.allowed ? 1 + step.recovery.retry.maxAttempts : 1;
    let last: ActionResult = { ok: false, error: { code: "ACTION_NOT_EXECUTED", message: "Action was not executed.", recoverable: false } };

    for (let attempt = 1; attempt <= maxExecutions; attempt += 1) {
      last = await this.surface.execute(action);
      trace.push({
        kind: "ACTION_RESULT",
        stepId: step.id,
        attempt,
        ok: last.ok,
        ...(last.error ? { errorCode: last.error.code } : {}),
        timestamp: now(),
      });

      if (last.ok || last.error?.ambiguousCommit || !last.error?.recoverable || attempt === maxExecutions) {
        return last;
      }

      trace.push({ kind: "RECOVERY", stepId: step.id, code: last.error.code, outcome: "RETRY", timestamp: now() });

      if (step.recovery.retry.backoffMs > 0) {
        await delay(step.recovery.retry.backoffMs);
      }
    }

    return last;
  }

  // Plan: Milestone 8 | REQ-OUT-001/002
  // Expected domain states are returned to the caller as BUSINESS_OUTCOME, not exceptions.
  private async detectBusinessOutcome(
    artifact: CapabilityArtifact,
    trace: ReplayTraceEvent[],
    stepId?: string,
  ): Promise<ReplayResult | undefined> {
    for (const outcome of artifact.contract.businessOutcomes) {
      const evaluation = await evaluateCheckpoint(artifact, outcome.checkpoint, this.surface);
      trace.push(checkpointEvent(stepId, outcome.checkpoint.id, "business_outcome", evaluation));
      if (evaluation.passed) {
        await this.captureCheckpointEvidence(trace, outcome.checkpoint.id, "business_outcome", stepId);
        return {
          disposition: "BUSINESS_OUTCOME",
          code: outcome.code,
          message: outcome.description,
          ...(stepId ? { stepId } : {}),
          trace,
        };
      }
    }
    return undefined;
  }

  private async extractOutputs(artifact: CapabilityArtifact): Promise<Readonly<Record<string, JsonValue>>> {
    const outputs: Record<string, JsonValue> = {};
    for (const output of artifact.contract.outputs) {
      if (output.source.adapterSignal) {
        const observation = await this.surface.observe();
        const value = observation.signals[output.source.adapterSignal];
        if (value !== undefined) outputs[output.name] = value;
        continue;
      }

      if (output.source.targetId) {
        const target = artifact.targets.find((candidate) => candidate.id === output.source.targetId);
        if (!target) continue;
        const resolved = await this.surface.resolve(target);
        const result = await this.surface.execute({ type: "read", target: resolved });
        if (result.ok && result.observedValue !== undefined) outputs[output.name] = result.observedValue;
      }
    }
    return outputs;
  }

  // Plan: Milestone 8 | REQ-OUT-004
  private async reconcileAmbiguousCommit(
    artifact: CapabilityArtifact,
    step: CapabilityStep,
    trace: ReplayTraceEvent[],
  ): Promise<boolean> {
    if (step.postconditions.length === 0) {
      trace.push({ kind: "RECOVERY", stepId: step.id, code: "UNKNOWN_COMMIT_STATE", outcome: "AMBIGUOUS", timestamp: now() });
      return false;
    }

    for (const checkpoint of step.postconditions) {
      const evaluation = await evaluateCheckpoint(artifact, checkpoint, this.surface);
      trace.push(checkpointEvent(step.id, checkpoint.id, "reconciliation", evaluation));
      await this.captureCheckpointEvidence(trace, checkpoint.id, "reconciliation", step.id);
      if (!evaluation.passed) {
        trace.push({ kind: "RECOVERY", stepId: step.id, code: "UNKNOWN_COMMIT_STATE", outcome: "AMBIGUOUS", timestamp: now() });
        return false;
      }
    }

    trace.push({ kind: "RECOVERY", stepId: step.id, code: "UNKNOWN_COMMIT_STATE", outcome: "COMMITTED", timestamp: now() });
    return true;
  }

  // Plan: Milestone 9 | REQ-EVD-002
  private async captureCheckpointEvidence(
    trace: ReplayTraceEvent[],
    checkpointId: string,
    phase: string,
    stepId?: string,
  ): Promise<void> {
    try {
      const evidence = await this.surface.captureEvidence(`${phase}:${checkpointId}`);
      trace.push({ kind: "EVIDENCE", ...(stepId ? { stepId } : {}), checkpointId, evidence, timestamp: now() });
    } catch (error) {
      trace.push({
        kind: "EVIDENCE_FAILURE",
        ...(stepId ? { stepId } : {}),
        code: "EVIDENCE_CAPTURE_FAILED",
        message: errorMessage(error),
        timestamp: now(),
      });
    }
  }

  private async failureWithEvidence(
    trace: ReplayTraceEvent[],
    disposition: ReplayResult["disposition"],
    code: string,
    message: string,
    stepId?: string,
  ): Promise<ReplayResult> {
    try {
      const evidence = await this.surface.captureEvidence(`${code}: ${message}`);
      trace.push({ kind: "EVIDENCE", ...(stepId ? { stepId } : {}), evidence, timestamp: now() });
    } catch (error) {
      // Plan: Milestone 9 | REQ-EVD-002
      // Evidence failure is secondary and explicit. It never hides the primary execution outcome.
      trace.push({
        kind: "EVIDENCE_FAILURE",
        ...(stepId ? { stepId } : {}),
        code: "EVIDENCE_CAPTURE_FAILED",
        message: errorMessage(error),
        timestamp: now(),
      });
    }

    return { disposition, code, message, ...(stepId ? { stepId } : {}), trace };
  }
}

function validateInvocation(
  artifact: CapabilityArtifact,
  context: ExecutionContext,
): Omit<ReplayResult, "trace"> | undefined {
  if (context.capabilityId !== artifact.capability.id || context.capabilityVersion !== artifact.capability.version) {
    return { disposition: "FAILURE", code: "CAPABILITY_MISMATCH", message: "Invocation capability identity/version does not match the artifact." };
  }

  const declared = new Map(artifact.contract.inputs.map((input) => [input.name, input]));
  for (const name of Object.keys(context.inputs)) {
    if (!declared.has(name)) {
      return { disposition: "FAILURE", code: "UNDECLARED_INPUT", message: `Invocation supplied undeclared input '${name}'.` };
    }
  }

  for (const input of artifact.contract.inputs) {
    const value = context.inputs[input.name];
    if (value === undefined) {
      if (input.required) return { disposition: "FAILURE", code: "MISSING_INPUT", message: `Required input '${input.name}' is missing.` };
      continue;
    }
    if (typeof value !== input.type) {
      return { disposition: "FAILURE", code: "INVALID_INPUT_TYPE", message: `Input '${input.name}' must be ${input.type}.` };
    }
  }

  return undefined;
}

function resolveValue(step: CapabilityStep, context: ExecutionContext): JsonValue | undefined {
  if (!step.action.value) return undefined;
  return step.action.value.kind === "literal" ? step.action.value.value : context.inputs[step.action.value.input];
}

function checkpointEvent(
  stepId: string | undefined,
  checkpointId: string,
  phase: "precondition" | "postcondition" | "business_outcome" | "success" | "reconciliation",
  evaluation: Awaited<ReturnType<typeof evaluateCheckpoint>>,
): ReplayTraceEvent {
  return {
    kind: "CHECKPOINT",
    ...(stepId ? { stepId } : {}),
    checkpointId,
    phase,
    passed: evaluation.passed,
    expected: evaluation.expected,
    observed: evaluation.observed,
    timestamp: now(),
  };
}

function now(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { parseCapabilityArtifact } from "../artifact/load-capability.js";
import type { CapabilityArtifact, CapabilityStep } from "../artifact/capability-schema.js";
import type { ExecutionContext, JsonValue } from "../domain/contracts.js";
import type { PolicyEvaluator } from "../policy/policy-evaluator.js";
import type { ActionResult, SurfaceAction, SurfaceAdapter } from "../surface/surface-adapter.js";
import { ExecutionError, errorMessage } from "../runtime/errors.js";
import { evaluateCheckpoint } from "./checkpoint-evaluator.js";
import type { ReplayResult, ReplayTraceEvent } from "./replay-contracts.js";

export interface ReplayOptions {
  // Milestone 10 | Assignment §3.6 | REQ-HITL-003
  // The callback must await explicit same-session handback. Continuation is in-memory,
  // so callers cannot replay a prefix of already completed writes by forging a cursor.
  readonly intervene?: (step: CapabilityStep, result: ReplayResult) => Promise<{ decision: "retry" | "complete"; approved: boolean }>;
}

// Milestone 6-10 | Assignment §3.2-3.6 | REQ-RPL-001..004, REQ-OUT-001..005
// One invocation owns this runner at a time. No model or provider is imported here.
export class DeterministicReplayEngine {
  private running = false;
  public constructor(private readonly surface: SurfaceAdapter, private readonly policy: PolicyEvaluator) {}

  public async replay(candidate: CapabilityArtifact, invocation: ExecutionContext, options: ReplayOptions = {}): Promise<ReplayResult> {
    if (this.running) return result("FAILURE", "RUN_CONFLICT", "This runner already has an active invocation.", []);
    this.running = true;
    const trace: ReplayTraceEvent[] = [];
    let stepId: string | undefined;
    let validated = false;
    try {
      const artifact = parseCapabilityArtifact(candidate);
      validateInvocation(artifact, invocation);
      validated = true;
      let context = invocation;
      for (const step of artifact.steps) {
        stepId = step.id;
        trace.push({ kind: "STEP_STARTED", stepId, timestamp: now() });
        let stopped = await this.executeStep(artifact, step, context, trace);
        if (stopped?.disposition === "INTERVENTION_REQUIRED" && options.intervene) {
          const handback = await options.intervene(step, stopped);
          trace.push({ kind: "HANDOFF", stepId, decision: handback.decision, timestamp: now() });
          if (handback.approved) context = { ...context, authorization: { approvedStepIds: [...(context.authorization?.approvedStepIds ?? []), step.id] } };
          if (handback.decision === "complete") {
            // A human may complete an uncertain action, but observed postconditions must prove it.
            if (!await this.reconcile(artifact, step, context, trace)) return await this.stop(trace, "INTERVENTION_REQUIRED", "RESUME_CHECKPOINT_FAILED", "Human-completed step could not be verified.", step.id);
            stopped = undefined;
          } else if (stopped.code !== "UNKNOWN_COMMIT_STATE") {
            stopped = await this.executeStep(artifact, step, context, trace);
          }
        }
        if (stopped) return stopped;
        trace.push({ kind: "STEP_COMPLETED", stepId, timestamp: now() });
      }
      stepId = undefined;
      const success = await this.check(artifact, artifact.successCheckpoint, "success", context, trace);
      if (!success) return await this.stop(trace, "FAILURE", "SUCCESS_CHECKPOINT_FAILED", "Declared success condition was not satisfied.");
      const outputs = await this.extractOutputs(artifact, context, trace);
      return { ...result("SUCCESS", "SUCCESS", "Capability completed successfully.", trace), outputs };
    } catch (error) {
      const code = error instanceof ExecutionError ? error.code : "EXECUTION_FAILED";
      if (!validated) return result("FAILURE", code, errorMessage(error), trace);
      return await this.stop(trace, "FAILURE", code, errorMessage(error), stepId);
    } finally { this.running = false; }
  }

  private async executeStep(artifact: CapabilityArtifact, step: CapabilityStep, context: ExecutionContext, trace: ReplayTraceEvent[]): Promise<ReplayResult | undefined> {
    const state = await this.surface.getSessionState();
    trace.push({ kind: "SESSION_STATE", stepId: step.id, state, timestamp: now() });
    if (state !== "active") return await this.stop(trace, "INTERVENTION_REQUIRED", state === "expired" ? "SESSION_EXPIRED" : "SESSION_NOT_ACTIVE", `Session is '${state}'.`, step.id);
    const denial = await this.authorize(artifact, step, context, trace);
    if (denial) return denial;
    const before = await this.businessOutcome(artifact, context, trace, step.id);
    if (before) return before;
    for (const checkpoint of step.preconditions) {
      if (!await this.check(artifact, checkpoint, "precondition", context, trace, step.id)) {
        return await this.stop(trace, "INTERVENTION_REQUIRED", "PRECONDITION_FAILED", `Precondition '${checkpoint.id}' failed.`, step.id);
      }
    }
    let action: SurfaceAction;
    try { action = await this.buildAction(artifact, step, context, trace); }
    catch (error) {
      const outcome = await this.businessOutcome(artifact, context, trace, step.id);
      if (outcome) return outcome;
      if (await this.surface.getSessionState() === "expired") return await this.stop(trace, "INTERVENTION_REQUIRED", "SESSION_EXPIRED", "Session expired while resolving a target.", step.id);
      throw error;
    }
    const risky = step.action.effect === "irreversible_write" || step.action.effect === "privileged" || action.type === "submit" || action.type === "custom";
    if (risky) await this.evidence(trace, `risk:${step.id}:before`, step.id);
    let execution: ActionResult;
    let attempt = 0;
    while (true) {
      attempt++;
      const denied = await this.authorize(artifact, step, context, trace);
      if (denied) return denied;
      execution = await this.surface.execute(action);
      trace.push({ kind: "ACTION_RESULT", stepId: step.id, attempt, ok: execution.ok, ...(execution.error ? { errorCode: execution.error.code } : {}), timestamp: now() });
      if (execution.ok) break;
      // A risky action's failure is uncertain regardless of adapter optimism.
      if (risky || execution.error?.ambiguousCommit) {
        if (!await this.reconcile(artifact, step, context, trace)) return await this.stop(trace, "INTERVENTION_REQUIRED", "UNKNOWN_COMMIT_STATE", "Action may have committed; automatic retry is prohibited.", step.id);
        break;
      }
      if (!execution.error) return await this.stop(trace, "FAILURE", "ACTION_FAILED", "Adapter returned an unsuccessful action.", step.id);
      if (!execution.error.recoverable) return await this.stop(trace, step.recovery.onFailure === "intervene" ? "INTERVENTION_REQUIRED" : "FAILURE", execution.error.code, execution.error.message, step.id);
      if (!step.recovery.retry.allowed || attempt > step.recovery.retry.maxAttempts) {
        trace.push({ kind: "RECOVERY", stepId: step.id, code: execution.error.code, outcome: "EXHAUSTED", timestamp: now() });
        return await this.stop(trace, step.recovery.onFailure === "intervene" ? "INTERVENTION_REQUIRED" : "RECOVERABLE", execution.error.code, execution.error.message, step.id);
      }
      trace.push({ kind: "RECOVERY", stepId: step.id, code: execution.error.code, outcome: "RETRY", timestamp: now() });
      await new Promise((resolve) => setTimeout(resolve, step.recovery.retry.backoffMs));
    }
    if (risky) await this.evidence(trace, `risk:${step.id}:after`, step.id);
    // Domain results take precedence over happy-path postconditions, including delayed results.
    const after = await this.businessOutcome(artifact, context, trace, step.id);
    if (after) return after;
    for (const checkpoint of step.postconditions) {
      if (!await this.check(artifact, checkpoint, "postcondition", context, trace, step.id)) {
        const outcome = await this.businessOutcome(artifact, context, trace, step.id);
        if (outcome) return outcome;
        return await this.stop(trace, "FAILURE", "POSTCONDITION_FAILED", `Postcondition '${checkpoint.id}' failed.`, step.id);
      }
    }
    return undefined;
  }

  private async authorize(artifact: CapabilityArtifact, step: CapabilityStep, context: ExecutionContext, trace: ReplayTraceEvent[]): Promise<ReplayResult | undefined> {
    const observation = await this.surface.observe();
    const decision = this.policy.evaluate({ artifact, step, context, observation });
    trace.push({ kind: "POLICY_DECISION", stepId: step.id, ...decision, timestamp: now() });
    if (decision.disposition === "DENY") return await this.stop(trace, decision.code === "APPROVAL_REQUIRED" ? "INTERVENTION_REQUIRED" : "FAILURE", "POLICY_DENIED", decision.reason, step.id);
    return undefined;
  }

  private async buildAction(artifact: CapabilityArtifact, step: CapabilityStep, context: ExecutionContext, trace: ReplayTraceEvent[]): Promise<SurfaceAction> {
    const value = step.action.value?.kind === "input" ? context.inputs[step.action.value.input] : step.action.value?.value;
    let target;
    if (step.action.targetId) {
      const declared = artifact.targets.find((item) => item.id === step.action.targetId)!;
      try { target = await this.surface.resolve(declared); }
      catch (error) { throw new ExecutionError("TARGET_RESOLUTION_FAILED", errorMessage(error)); }
      trace.push({ kind: "TARGET_RESOLVED", stepId: step.id, targetId: target.targetId, strategyKind: target.strategy.kind, timestamp: now() });
    }
    switch (step.action.type) {
      case "click": case "read": case "submit": return { type: step.action.type, target: target! };
      case "type": case "select":
        if (typeof value !== "string") throw new ExecutionError("STRING_VALUE_REQUIRED", "Action requires a string input value.");
        return { type: step.action.type, target: target!, value };
      case "navigate":
        return { type: "navigate", value: value as string };
      case "wait":
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 30000) throw new ExecutionError("WAIT_DURATION_REQUIRED", "Wait requires a duration between 0 and 30000 ms.");
        return { type: "wait", durationMs: value };
      case "custom": return { type: "custom", name: step.action.customAction!, ...(target ? { target } : {}), ...(value !== undefined ? { value } : {}) };
    }
  }

  private async extractOutputs(artifact: CapabilityArtifact, context: ExecutionContext, trace: ReplayTraceEvent[]): Promise<Record<string, JsonValue>> {
    const outputs: Record<string, JsonValue> = {};
    for (const output of artifact.contract.outputs) {
      // Extraction is an action, with the same policy and trace requirements as recorded steps.
      const step: CapabilityStep = { id: `output:${output.name}`, description: output.description, action: { type: "read", effect: "read", ...(output.source.targetId ? { targetId: output.source.targetId } : {}) }, preconditions: [], postconditions: [], recovery: { retry: { allowed: false, maxAttempts: 0, backoffMs: 0 }, onFailure: "fail", reconciliationRequiredAfterAmbiguousCommit: false }, humanApprovalRequired: false };
      const denied = await this.authorize(artifact, step, context, trace);
      if (denied) throw new ExecutionError("OUTPUT_POLICY_DENIED", denied.message);
      let value: JsonValue | undefined;
      if (output.source.adapterSignal) value = (await this.surface.observe()).signals[output.source.adapterSignal];
      else {
        const action = await this.buildAction(artifact, step, context, trace);
        const read = await this.surface.execute(action);
        trace.push({ kind: "ACTION_RESULT", stepId: step.id, attempt: 1, ok: read.ok, timestamp: now() });
        if (!read.ok) throw new ExecutionError("OUTPUT_READ_FAILED", `Could not extract '${output.name}'.`);
        value = read.observedValue;
      }
      if (value === undefined) {
        if (output.required) throw new ExecutionError("MISSING_OUTPUT", `Required output '${output.name}' is absent.`);
        continue;
      }
      const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
      if (type !== output.type || (typeof value === "number" && !Number.isFinite(value))) throw new ExecutionError("INVALID_OUTPUT_TYPE", `Output '${output.name}' must be ${output.type}.`);
      outputs[output.name] = value;
    }
    return outputs;
  }

  private async businessOutcome(artifact: CapabilityArtifact, context: ExecutionContext, trace: ReplayTraceEvent[], stepId: string): Promise<ReplayResult | undefined> {
    for (const outcome of artifact.contract.businessOutcomes) {
      if (await this.check(artifact, outcome.checkpoint, "business_outcome", context, trace, stepId)) {
        return { ...result("BUSINESS_OUTCOME", outcome.code, outcome.description, trace), stepId };
      }
    }
    return undefined;
  }
  private async reconcile(artifact: CapabilityArtifact, step: CapabilityStep, context: ExecutionContext, trace: ReplayTraceEvent[]): Promise<boolean> {
    let committed = step.postconditions.length > 0;
    for (const checkpoint of step.postconditions) {
      const passed = await this.check(artifact, checkpoint, "reconciliation", context, trace, step.id);
      committed = committed && passed;
    }
    trace.push({ kind: "RECOVERY", stepId: step.id, code: "UNKNOWN_COMMIT_STATE", outcome: committed ? "COMMITTED" : "AMBIGUOUS", timestamp: now() });
    return committed;
  }
  private async check(artifact: CapabilityArtifact, checkpoint: CapabilityArtifact["successCheckpoint"], phase: "precondition" | "postcondition" | "business_outcome" | "success" | "reconciliation", context: ExecutionContext, trace: ReplayTraceEvent[], stepId?: string): Promise<boolean> {
    const evaluation = await evaluateCheckpoint(artifact, checkpoint, this.surface, context.inputs);
    trace.push({ kind: "CHECKPOINT", ...(stepId ? { stepId } : {}), checkpointId: checkpoint.id, phase, ...evaluation, timestamp: now() });
    if (phase !== "business_outcome" || evaluation.passed) await this.evidence(trace, `${phase}:${checkpoint.id}`, stepId);
    return evaluation.passed;
  }
  private async evidence(trace: ReplayTraceEvent[], reason: string, stepId?: string): Promise<void> {
    try {
      const evidence = await this.surface.captureEvidence(reason);
      trace.push({ kind: "EVIDENCE", ...(stepId ? { stepId } : {}), evidence, timestamp: now() });
    } catch (error) {
      trace.push({ kind: "EVIDENCE_FAILURE", ...(stepId ? { stepId } : {}), code: "EVIDENCE_CAPTURE_FAILED", message: errorMessage(error), timestamp: now() });
    }
  }
  private async stop(trace: ReplayTraceEvent[], disposition: ReplayResult["disposition"], code: string, message: string, stepId?: string): Promise<ReplayResult> {
    await this.evidence(trace, `${code}: ${message}`, stepId);
    return { ...result(disposition, code, message, trace), ...(stepId ? { stepId } : {}) };
  }
}
function result(disposition: ReplayResult["disposition"], code: string, message: string, trace: ReplayTraceEvent[]): ReplayResult { return { disposition, code, message, trace }; }
function now(): string { return new Date().toISOString(); }
function validateInvocation(artifact: CapabilityArtifact, context: ExecutionContext): void {
  if (context.capabilityId !== artifact.capability.id || context.capabilityVersion !== artifact.capability.version) throw new ExecutionError("CAPABILITY_MISMATCH", "Invocation identity/version does not match artifact.");
  const declared = new Map(artifact.contract.inputs.map((input) => [input.name, input]));
  for (const name of Object.keys(context.inputs)) {
    if (!declared.has(name)) throw new ExecutionError("UNDECLARED_INPUT", `Undeclared input '${name}'.`);
  }
  for (const input of artifact.contract.inputs) {
    const value = context.inputs[input.name];
    if (value === undefined) {
      if (input.required) throw new ExecutionError("MISSING_INPUT", `Required input '${input.name}' is missing.`);
    } else if (typeof value !== input.type || (typeof value === "number" && !Number.isFinite(value))) throw new ExecutionError("INVALID_INPUT_TYPE", `Input '${input.name}' must be ${input.type}.`);
  }
}

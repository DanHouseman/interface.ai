import { resolveActionValue } from "../domain/action.js";
import { capabilityArtifactSchema, type CapabilityStep } from "../artifact/capability-schema.js";
import type { ExecutionContext } from "../domain/contracts.js";
import { ConfigurablePolicyEvaluator, evaluateLocation } from "../policy/policy-evaluator.js";
import { evaluateCheckpoint } from "../replay/checkpoint-evaluator.js";
import { withDeadline } from "../runtime/deadline.js";
import { ExecutionError } from "../runtime/errors.js";
import type { SurfaceAction, ExecutionSurface } from "../surface/surface-adapter.js";
import { discoveryDecisionSchema, type DiscoveryModel, type DiscoveryOptions, type DiscoveryRequest, type DiscoveryResult, type DiscoveryTraceEvent } from "./discovery-contracts.js";

// Milestone 5, 7, 9 | Assignment §3.1, §3.4-3.5 | REQ-DISC-001..004
export class DiscoveryEngine {
  private running = false;
  public constructor(private readonly surface: ExecutionSurface, private readonly model: DiscoveryModel) {}
  public async run(request: DiscoveryRequest, options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
    const trace: DiscoveryTraceEvent[] = [];
    const fail = (code: string, message: string, disposition: "FAILURE" | "INTERVENTION_REQUIRED" = "FAILURE"): DiscoveryResult => ({ disposition, runId: request.runId, code, message, trace });
    if (this.running) return fail("RUN_CONFLICT", "Discovery is already running.");
    this.running = true;
    try {
      if (!Number.isInteger(request.maxSteps) || request.maxSteps < 1 || !Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) return fail("INVALID_REQUEST", "Positive step and timeout bounds are required.");
      if (evaluateLocation(request.target, request.specification.policy)) return fail("POLICY_DENIED", "Entry point is outside discovery authority.");
      const result = await withDeadline<DiscoveryResult>(request.timeoutMs, async (signal) => {
        const intervene = async (code: string, step: number, canContinue: boolean): Promise<boolean> => {
          if (!options.intervene) return false;
          const requested = await options.intervene({ code, step, canContinue }, signal);
          signal.throwIfAborted();
          // A handback cannot renew the budget, grant approval, or retry an uncertain action.
          const decision = canContinue && requested === "continue" ? "continue" : "stop";
          trace.push({ kind: "HANDOFF", step, code, decision, timestamp: new Date().toISOString() });
          return decision === "continue";
        };
        discoveryLoop: for (let index = 1; index <= request.maxSteps; index++) {
          signal.throwIfAborted();
          const sensitiveTargets = new Set(request.specification.contract.outputs.filter(field => field.sensitive).map(field => field.source.targetId));
          const observation = await this.surface.observe(request.specification.targets.filter(target => sensitiveTargets.has(target.id)));
          trace.push({ kind: "OBSERVATION", step: index, observation });
          if (observation.signals.unexpectedDialog === true) {
            if (await intervene("UNEXPECTED_DIALOG", index, index < request.maxSteps)) continue;
            return fail("UNEXPECTED_DIALOG", "An unresolved dialog requires human verification.", "INTERVENTION_REQUIRED");
          }
          if (!observation.location || evaluateLocation(observation.location, request.specification.policy)) return fail("POLICY_DENIED", "Observed location is outside discovery authority.");
          const decision = discoveryDecisionSchema.parse(await this.model.decide({ goal: request.goal, observation, history: trace, specification: request.specification, inputs: request.inputs, signal }));
          signal.throwIfAborted();
          trace.push({ kind: "DECISION", step: index, decision });
          if (decision.kind === "stuck") {
            if (await intervene("DISCOVERY_STUCK", index, index < request.maxSteps)) continue;
            return fail("DISCOVERY_STUCK", decision.rationale, "INTERVENTION_REQUIRED");
          }
          const step = decision.kind === "act" ? this.materialize(request, decision, index) : readStep(index);
          const artifact = capabilityArtifactSchema.parse({ ...request.specification, steps: [step], provenance: { discoveryRunId: request.runId, createdAt: new Date().toISOString(), compilerVersion: "0.2.0" } });
          const context: ExecutionContext = { invocationId: request.runId, capabilityId: artifact.capability.id, capabilityVersion: artifact.capability.version, inputs: request.inputs, ...(request.authorization ? { authorization: request.authorization } : {}) };
          const policy = new ConfigurablePolicyEvaluator(request.specification.policy).evaluate({ artifact, step, context, observation });
          trace.push({ kind: "POLICY", step: index, decision: policy });
          if (policy.disposition === "DENY") {
            if (policy.code === "APPROVAL_REQUIRED") await intervene(policy.code, index, false);
            return fail(policy.code, policy.reason, policy.code === "APPROVAL_REQUIRED" ? "INTERVENTION_REQUIRED" : "FAILURE");
          }
          if (decision.kind === "complete") {
            // Completion is a model proposal, verified against an independently declared condition.
            const evaluation = await evaluateCheckpoint(artifact, artifact.successCheckpoint, this.surface, request.inputs, { policy: new ConfigurablePolicyEvaluator(request.specification.policy), context });
            trace.push({ kind: "CHECKPOINT", step: index, checkpointId: artifact.successCheckpoint.id, ...evaluation, timestamp: new Date().toISOString() });
            if (!evaluation.passed) {
              if (await intervene("GOAL_NOT_VERIFIED", index, index < request.maxSteps)) continue;
              return fail("GOAL_NOT_VERIFIED", "Model completion did not satisfy the declared goal condition.", "INTERVENTION_REQUIRED");
            }
            return { disposition: "SUCCESS", runId: request.runId, trace, outputs: {} };
          }
          for (const checkpoint of step.preconditions) {
            if (!(await evaluateCheckpoint(artifact, checkpoint, this.surface, request.inputs, { policy: new ConfigurablePolicyEvaluator(request.specification.policy), context })).passed) {
              if (await intervene("PRECONDITION_FAILED", index, index < request.maxSteps)) continue discoveryLoop;
              return fail("PRECONDITION_FAILED", "Discovery requires a verified state before acting.", "INTERVENTION_REQUIRED");
            }
          }
          const target = step.action.targetId ? await this.surface.resolve(artifact.targets.find((item) => item.id === step.action.targetId)!) : undefined;
          const value = resolveActionValue(step.action, request.inputs);
          let action: SurfaceAction;
          switch (step.action.type) {
            case "click": case "read": case "submit": action = { type: step.action.type, target: target! }; break;
            case "type": case "select":
              if (typeof value !== "string") throw new ExecutionError("INVALID_MODEL_ACTION", "Typing/selecting requires a string input.");
              action = { type: step.action.type, target: target!, value }; break;
            case "navigate": action = { type: "navigate", value: value as string }; break;
            case "wait": action = { type: "wait", durationMs: value as number }; break;
            case "custom": throw new ExecutionError("INVALID_MODEL_ACTION", "Custom actions are unavailable during discovery.");
          }
          signal.throwIfAborted();
          const result = await this.surface.execute(action);
          trace.push({ kind: "ACTION", step: index, capabilityStep: step, result });
          if (!result.ok) {
            if (result.error?.recoverable && !result.error.ambiguousCommit && step.action.effect === "read") continue;
            await intervene(result.error?.code ?? "ACTION_FAILED", index, false);
            return fail(result.error?.code ?? "ACTION_FAILED", "Discovery action could not safely complete.", "INTERVENTION_REQUIRED");
          }
        }
        await intervene("MAX_STEPS", request.maxSteps, false);
        return fail("MAX_STEPS", "Discovery reached its step limit.", "INTERVENTION_REQUIRED");
      });
      await this.evidence(trace);
      return result;
    } catch (error) {
      await this.evidence(trace);
      return fail(error instanceof ExecutionError ? error.code : "DISCOVERY_FAILED", "Discovery stopped; inspect the sanitized trace.");
    } finally { this.running = false; }
  }

  private materialize(request: DiscoveryRequest, decision: Extract<ReturnType<typeof discoveryDecisionSchema.parse>, { kind: "act" }>, index: number): CapabilityStep {
    const spec = request.specification;
    const grantKey = decision.targetId ?? decision.actionType;
    const grant = spec.grants[grantKey];
    if (!grant || !grant.actionTypes.includes(decision.actionType)) throw new ExecutionError("ACTION_TYPE_NOT_ALLOWED", "Model action is outside externally configured grants.");
    const binding = decision.targetId ? spec.inputBindings[decision.targetId] : undefined;
    return { id: `discovery-${index}`, description: `Discovered ${decision.actionType} action`, action: {
      type: decision.actionType, effect: grant.effect,
      ...(decision.targetId ? { targetId: decision.targetId } : {}),
      ...(binding ? { value: { kind: "input" as const, input: binding } } : decision.value !== undefined ? { value: { kind: "literal" as const, value: decision.value } } : {}),
      ...(decision.actionType === "custom" ? { customAction: "discovery" } : {}),
    }, preconditions: [...(grant.preconditions ?? [])], postconditions: [], recovery: { retry: { allowed: false, maxAttempts: 0, backoffMs: 0 }, onFailure: "intervene", reconciliationRequiredAfterAmbiguousCommit: true }, humanApprovalRequired: false };
  }
  private async evidence(trace: DiscoveryTraceEvent[]): Promise<void> {
    try { trace.push({ kind: "EVIDENCE", evidence: await this.surface.captureEvidence("discovery") }); }
    catch { trace.push({ kind: "EVIDENCE_FAILURE", code: "EVIDENCE_CAPTURE_FAILED" }); }
  }
}
function readStep(index: number): CapabilityStep {
  // A completion proposal authorizes only observation; no UI action is emitted.
  return { id: `complete-${index}`, description: "Verify goal", action: { type: "wait", effect: "read", value: { kind: "literal", value: 0 } }, preconditions: [], postconditions: [], recovery: { retry: { allowed: false, maxAttempts: 0, backoffMs: 0 }, onFailure: "fail", reconciliationRequiredAfterAmbiguousCommit: false }, humanApprovalRequired: false };
}

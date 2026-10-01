import type { CapabilityArtifact } from "../artifact/capability-schema.js";
import type { ExecutionContext, JsonValue } from "../domain/contracts.js";
import type { CheckpointSurface } from "../surface/surface-adapter.js";
import { EvidenceRedactor } from "../evidence/redactor.js";
import { ExecutionError } from "../runtime/errors.js";
import { ConfigurablePolicyEvaluator, type PolicyEvaluator, type PolicyDecision } from "../policy/policy-evaluator.js";

export interface CheckpointEvaluation { readonly passed: boolean; readonly expected: readonly string[]; readonly observed: readonly string[]; }
export interface CheckpointAuthority {
  readonly policy: PolicyEvaluator;
  readonly context: ExecutionContext;
  readonly record?: (stepId: string, decision: PolicyDecision) => void;
}

// Milestone 6 + 8 | Assignment §3.3 | REQ-RPL-003, REQ-OUT-003
// Poll observations rather than repeating actions. A bounded checkpoint wait handles slow
// UI updates without duplicating a write. Input equality binds success to this invocation.
export async function evaluateCheckpoint(
  artifact: CapabilityArtifact,
  checkpoint: CapabilityArtifact["successCheckpoint"],
  surface: CheckpointSurface,
  inputs: Readonly<Record<string, JsonValue>> = {},
  authority?: CheckpointAuthority,
): Promise<CheckpointEvaluation> {
  const deadline = Date.now() + (checkpoint.timeoutMs ?? 0);
  while (true) {
    const evaluation = await sample(artifact, checkpoint, surface, inputs, authority);
    if (evaluation.passed || Date.now() >= deadline) return evaluation;
    await new Promise((resolve) => setTimeout(resolve, Math.min(25, deadline - Date.now())));
  }
}

async function sample(artifact: CapabilityArtifact, checkpoint: CapabilityArtifact["successCheckpoint"], surface: CheckpointSurface, inputs: Readonly<Record<string, JsonValue>>, authority?: CheckpointAuthority): Promise<CheckpointEvaluation> {
  // Register sensitive live values before projecting observations into trace strings.
  // Extraction can fail later, so result.outputs must not be the privacy dependency.
  const sensitiveTargets = new Set(artifact.contract.outputs.filter(field => field.sensitive).map(field => field.source.targetId));
  const observation = await surface.observe(artifact.targets.filter(target => sensitiveTargets.has(target.id)));
  if (observation.signals.unexpectedDialog === true) throw new ExecutionError("UNEXPECTED_DIALOG", "A dialog prevents checkpoint verification.");
  const redactor = new EvidenceRedactor(artifact, inputs);
  redactor.sanitize(observation as unknown as JsonValue);
  const expected: string[] = [], observed: string[] = [];
  const results: boolean[] = [];
  for (const predicate of checkpoint.all) {
    expected.push(JSON.stringify(predicate));
    switch (predicate.kind) {
      case "url_matches": case "title_matches": {
        const value = predicate.kind === "url_matches" ? observation.location : observation.title;
        const matched = safeRegexTest(predicate.pattern, value ?? "");
        observed.push(value === undefined ? "<missing>" : `matched:${matched}`);
        results.push(matched);
        break;
      }
      case "text_visible": {
        const texts = observation.visibleText ?? [];
        const visible = texts.some((text) => text.includes(predicate.text));
        observed.push(`text:${predicate.text}:visible:${visible}`);
        results.push(visible);
        break;
      }
      case "target_present": case "target_value_equals_input": {
        const target = artifact.targets.find((candidate) => candidate.id === predicate.targetId);
        if (!target) { observed.push(`target:${predicate.targetId}:undeclared`); results.push(false); break; }
        try {
          const resolved = await surface.resolve(target);
          observed.push(`target:${predicate.targetId}:${resolved.strategy.kind}`);
          if (predicate.kind === "target_present") results.push(true);
          else {
            const step = { id: `checkpoint:${checkpoint.id}:${target.id}`, description: "Verify checkpoint value", action: { type: "read" as const, effect: "read" as const, targetId: target.id }, preconditions: [], postconditions: [], recovery: { retry: { allowed: false, maxAttempts: 0, backoffMs: 0 }, onFailure: "fail" as const, reconciliationRequiredAfterAmbiguousCommit: false }, humanApprovalRequired: false };
            const context = authority?.context ?? { invocationId: "checkpoint", capabilityId: artifact.capability.id, capabilityVersion: artifact.capability.version, inputs };
            const decision = (authority?.policy ?? new ConfigurablePolicyEvaluator()).evaluate({ artifact, step, context, observation: await surface.observe() });
            authority?.record?.(step.id, decision);
            if (decision.disposition === "DENY") throw new ExecutionError("CHECKPOINT_POLICY_DENIED", decision.reason);
            const result = await surface.execute({ type: "read", target: resolved });
            redactor.sanitize({ targetValues: { [predicate.targetId]: result.observedValue ?? null } });
            const matches = result.ok && inputs[predicate.input] !== undefined && result.observedValue === inputs[predicate.input];
            observed.push(`read_ok:${result.ok}:matches_input:${matches}`);
            results.push(matches);
          }
        } catch (error) {
          if (error instanceof ExecutionError && ["CHECKPOINT_POLICY_DENIED", "UNEXPECTED_DIALOG"].includes(error.code)) throw error;
          observed.push("unresolved:TARGET_RESOLUTION_FAILED"); results.push(false);
        }
        break;
      }
      case "session_state": {
        const state = await surface.getSessionState();
        observed.push(state); results.push(state === predicate.state); break;
      }
      case "adapter_signal": {
        const actual = observation.signals[predicate.name];
        const matches = actual !== undefined && (predicate.expected === undefined || JSON.stringify(actual) === JSON.stringify(predicate.expected));
        observed.push(`adapter_signal:${predicate.name}:matches:${matches}`);
        results.push(matches);
        break;
      }
    }
  }
  return { passed: results.every(Boolean), expected: expected.map(value => redactor.redactString(value)), observed: observed.map(value => redactor.redactString(value)) };
}
function safeRegexTest(pattern: string, value: string): boolean {
  try { return new RegExp(pattern).test(value); } catch { return false; }
}

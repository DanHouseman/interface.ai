import type { CapabilityArtifact } from "../artifact/capability-schema.js";
import type { JsonValue } from "../domain/contracts.js";
import type { SurfaceAdapter } from "../surface/surface-adapter.js";
import { errorMessage } from "../runtime/errors.js";

export interface CheckpointEvaluation { readonly passed: boolean; readonly expected: readonly string[]; readonly observed: readonly string[]; }

// Milestone 6 + 8 | Assignment §3.3 | REQ-RPL-003, REQ-OUT-003
// Poll observations rather than repeating actions. A bounded checkpoint wait handles slow
// UI updates without duplicating a write. Input equality binds success to this invocation.
export async function evaluateCheckpoint(
  artifact: CapabilityArtifact,
  checkpoint: CapabilityArtifact["successCheckpoint"],
  surface: SurfaceAdapter,
  inputs: Readonly<Record<string, JsonValue>> = {},
): Promise<CheckpointEvaluation> {
  const deadline = Date.now() + (checkpoint.timeoutMs ?? 0);
  while (true) {
    const evaluation = await sample(artifact, checkpoint, surface, inputs);
    if (evaluation.passed || Date.now() >= deadline) return evaluation;
    await new Promise((resolve) => setTimeout(resolve, Math.min(25, deadline - Date.now())));
  }
}

async function sample(artifact: CapabilityArtifact, checkpoint: CapabilityArtifact["successCheckpoint"], surface: SurfaceAdapter, inputs: Readonly<Record<string, JsonValue>>): Promise<CheckpointEvaluation> {
  const observation = await surface.observe();
  const expected: string[] = [], observed: string[] = [];
  const results: boolean[] = [];
  for (const predicate of checkpoint.all) {
    expected.push(JSON.stringify(predicate));
    switch (predicate.kind) {
      case "url_matches": case "title_matches": {
        const value = predicate.kind === "url_matches" ? observation.location : observation.title;
        observed.push(value ?? "<missing>");
        results.push(safeRegexTest(predicate.pattern, value ?? ""));
        break;
      }
      case "text_visible": {
        const texts = observation.visibleText ?? [];
        observed.push(texts.join(" | "));
        results.push(texts.some((text) => text.includes(predicate.text)));
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
            const result = await surface.execute({ type: "read", target: resolved });
            observed.push(JSON.stringify(result));
            results.push(result.ok && inputs[predicate.input] !== undefined && result.observedValue === inputs[predicate.input]);
          }
        } catch (error) { observed.push(`unresolved:${errorMessage(error)}`); results.push(false); }
        break;
      }
      case "session_state": {
        const state = await surface.getSessionState();
        observed.push(state); results.push(state === predicate.state); break;
      }
      case "adapter_signal": {
        const actual = observation.signals[predicate.name];
        observed.push(`adapter_signal:${predicate.name}:${JSON.stringify(actual)}`);
        results.push(actual !== undefined && (predicate.expected === undefined || JSON.stringify(actual) === JSON.stringify(predicate.expected)));
        break;
      }
    }
  }
  return { passed: results.every(Boolean), expected, observed };
}
function safeRegexTest(pattern: string, value: string): boolean {
  try { return new RegExp(pattern).test(value); } catch { return false; }
}

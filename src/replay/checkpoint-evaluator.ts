import type { CapabilityArtifact } from "../artifact/capability-schema.js";
import type { SurfaceAdapter } from "../surface/surface-adapter.js";

export interface CheckpointEvaluation {
  readonly passed: boolean;
  readonly expected: readonly string[];
  readonly observed: readonly string[];
}

// Plan: Milestone 6 | REQ-RPL-003
// Semantic checkpoint evaluation verifies observed state before replay advances.
export async function evaluateCheckpoint(
  artifact: CapabilityArtifact,
  checkpoint: CapabilityArtifact["successCheckpoint"],
  surface: SurfaceAdapter,
): Promise<CheckpointEvaluation> {
  const observation = await surface.observe();
  const expected: string[] = [];
  const observed: string[] = [];
  let passed = true;

  for (const predicate of checkpoint.all) {
    switch (predicate.kind) {
      case "url_matches": {
        expected.push(`url_matches:${predicate.pattern}`);
        const actual = observation.location ?? "<missing>";
        observed.push(`url:${actual}`);
        passed &&= safeRegexTest(predicate.pattern, observation.location ?? "");
        break;
      }
      case "title_matches": {
        expected.push(`title_matches:${predicate.pattern}`);
        const actual = observation.title ?? "<missing>";
        observed.push(`title:${actual}`);
        passed &&= safeRegexTest(predicate.pattern, observation.title ?? "");
        break;
      }
      case "text_visible": {
        expected.push(`text_visible:${predicate.text}`);
        const texts = observation.visibleText ?? [];
        observed.push(`visible_text:${texts.join(" | ")}`);
        passed &&= texts.some((text) => text.includes(predicate.text));
        break;
      }
      case "target_present": {
        expected.push(`target_present:${predicate.targetId}`);
        const target = artifact.targets.find((candidate) => candidate.id === predicate.targetId);
        if (!target) {
          observed.push(`target:${predicate.targetId}:undeclared`);
          passed = false;
          break;
        }
        try {
          const resolved = await surface.resolve(target);
          observed.push(`target:${predicate.targetId}:${resolved.strategy.kind}`);
        } catch (error) {
          observed.push(`target:${predicate.targetId}:unresolved:${errorMessage(error)}`);
          passed = false;
        }
        break;
      }
      case "session_state": {
        expected.push(`session_state:${predicate.state}`);
        const state = await surface.getSessionState();
        observed.push(`session_state:${state}`);
        passed &&= state === predicate.state;
        break;
      }
      case "adapter_signal": {
        expected.push(`adapter_signal:${predicate.name}`);
        const actual = observation.signals[predicate.name];
        observed.push(`adapter_signal:${predicate.name}:${JSON.stringify(actual)}`);
        passed &&= predicate.expected === undefined || deepEqual(actual, predicate.expected);
        break;
      }
    }
  }

  return { passed, expected, observed };
}

function safeRegexTest(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

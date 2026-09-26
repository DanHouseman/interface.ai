import type { CapabilityArtifact, CapabilityStep } from "../artifact/capability-schema.js";
import type { ExecutionContext } from "../domain/contracts.js";
import type { ResolvedTarget, SurfaceAction, TargetResolver } from "../surface/surface-adapter.js";
import { ExecutionError, errorMessage } from "../runtime/errors.js";
import { resolveActionValue } from "../domain/action.js";

// Builds a replay action without executing it or deciding policy/retry behavior.
export async function buildReplayAction(
  artifact: CapabilityArtifact,
  step: CapabilityStep,
  context: ExecutionContext,
  surface: TargetResolver,
  onResolved: (target: ResolvedTarget) => void,
): Promise<SurfaceAction> {
  const value = resolveActionValue(step.action, context.inputs);
  let target;
  if (step.action.targetId) {
    const declared = artifact.targets.find((item) => item.id === step.action.targetId)!;
    try { target = await surface.resolve(declared); }
    catch (error) { if (error instanceof ExecutionError) throw error; throw new ExecutionError("TARGET_RESOLUTION_FAILED", errorMessage(error)); }
    onResolved(target);
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

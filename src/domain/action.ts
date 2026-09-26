import type { ActionEffect, ActionType, JsonValue } from "./contracts.js";

export function isRiskyAction(action: { readonly type: ActionType; readonly effect: ActionEffect }): boolean {
  // Submit/custom stay conservative even when their declared effect is read-only.
  return action.effect === "irreversible_write" || action.effect === "privileged"
    || action.type === "submit" || action.type === "custom";
}

export function resolveActionValue(
  action: { readonly value?: { readonly kind: "input"; readonly input: string } | { readonly kind: "literal"; readonly value: JsonValue } | undefined },
  inputs: Readonly<Record<string, JsonValue>>,
): JsonValue | undefined {
  return action.value?.kind === "input" ? inputs[action.value.input] : action.value?.value;
}

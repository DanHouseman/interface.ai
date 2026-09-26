import type { CapabilityArtifact } from "../artifact/capability-schema.js";
import type { ExecutionContext } from "../domain/contracts.js";
import { ExecutionError } from "../runtime/errors.js";

export function validateInvocation(artifact: CapabilityArtifact, context: ExecutionContext): void {
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

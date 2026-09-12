import { capabilityArtifactSchema, type CapabilityArtifact } from "./capability-schema.js";

// Plan: Milestone 3 | REQ-ART-003
// Invalid/unsupported artifacts fail before replay can touch a live surface.
export class CapabilityValidationError extends Error {
  public constructor(public readonly issues: readonly string[]) {
    super(`Capability artifact validation failed:\n${issues.join("\n")}`);
    this.name = "CapabilityValidationError";
  }
}

// Plan: Milestone 3 | REQ-ART-001, REQ-ART-003
// Single validation entry point for untrusted serialized capability artifacts.
export function parseCapabilityArtifact(candidate: unknown): CapabilityArtifact {
  const parsed = capabilityArtifactSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new CapabilityValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "artifact"}: ${issue.message}`),
    );
  }

  return parsed.data;
}

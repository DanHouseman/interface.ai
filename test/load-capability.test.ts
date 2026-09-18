import { describe, expect, it } from "vitest";
import { CapabilityValidationError, parseCapabilityArtifact } from "../src/artifact/load-capability.js";
import { capabilityArtifactSchema } from "../src/artifact/capability-schema.js";

function validCandidate(): unknown {
  return {
    schemaVersion: "1.0",
    capability: { id: "x", name: "X", version: "1", description: "test" },
    application: { family: "demo", surface: "browser", compatibilityTags: [] },
    provenance: { discoveryRunId: "run", createdAt: "2026-09-17T00:00:00.000Z", compilerVersion: "1" },
    contract: { inputs: [], outputs: [], businessOutcomes: [] },
    policy: { permittedTargets: ["https://demo.invalid"], permittedRoutes: [], permittedActionTypes: ["wait"] },
    targets: [],
    steps: [{ id: "wait", description: "wait", action: { type: "wait", effect: "read", value: { kind: "literal", value: 1 } }, preconditions: [], postconditions: [], recovery: { retry: { allowed: false, maxAttempts: 0, backoffMs: 0 }, onFailure: "fail", reconciliationRequiredAfterAmbiguousCommit: false }, humanApprovalRequired: false }],
    successCheckpoint: { id: "done", description: "done", all: [{ kind: "session_state", state: "active" }] },
  };
}

describe("parseCapabilityArtifact", () => {
  it("returns a runtime validated artifact", () => {
    expect(parseCapabilityArtifact(validCandidate()).capability.id).toBe("x");
  });

  it("throws a named validation error with flattened issue paths", () => {
    const candidate = validCandidate() as Record<string, unknown>;
    candidate.schemaVersion = "2.0";
    expect(() => parseCapabilityArtifact(candidate)).toThrow(CapabilityValidationError);
    try { parseCapabilityArtifact(candidate); } catch (error) {
      const typed = error as CapabilityValidationError;
      expect(typed.name).toBe("CapabilityValidationError");
      expect(typed.issues[0]).toContain("schemaVersion");
      expect(typed.message).toContain("Capability artifact validation failed");
    }
  });

  it("rejects unknown targets, undeclared inputs, and unsafe risky retries", () => {
    const base = capabilityArtifactSchema.parse(validCandidate());
    const candidate = structuredClone(base);
    candidate.contract.inputs = [{ name: "declared", type: "string", required: true, sensitive: false, description: "x" }];
    candidate.steps[0]!.action = { type: "type", effect: "irreversible_write", targetId: "missing", value: { kind: "input", input: "missingInput" } };
    candidate.steps[0]!.recovery.retry = { allowed: true, maxAttempts: 1, backoffMs: 0 };
    candidate.steps[0]!.recovery.reconciliationRequiredAfterAmbiguousCommit = false;
    const result = capabilityArtifactSchema.safeParse(candidate);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(x => x.message)).toEqual(expect.arrayContaining([
      "Unknown targetId: missing",
      "Undeclared input: missingInput",
      "Risky actions may only retry when ambiguous-commit reconciliation is explicitly required.",
    ]));
  });
});

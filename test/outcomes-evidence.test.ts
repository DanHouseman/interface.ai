import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capabilityArtifactSchema, type CapabilityArtifact } from "../src/artifact/capability-schema.js";
import type { ExecutionContext } from "../src/domain/contracts.js";
import { JsonFileEvidenceStore } from "../src/evidence/evidence-store.js";
import { ConfigurablePolicyEvaluator } from "../src/policy/policy-evaluator.js";
import { DeterministicReplayEngine } from "../src/replay/replay-engine.js";
import { FakeSurfaceAdapter } from "../src/surface/fake-surface-adapter.js";

function artifact(): CapabilityArtifact {
  return capabilityArtifactSchema.parse({
    schemaVersion: "1.0",
    capability: { id: "transfer.submit", name: "Submit transfer", version: "1.0.0", description: "Submit a transfer." },
    application: { family: "demo-bank-admin", productVersion: "1", surface: "browser", compatibilityTags: ["base"] },
    provenance: { discoveryRunId: "disc-008", createdAt: "2026-09-15T00:00:00.000Z", compilerVersion: "0.1.0" },
    contract: {
      inputs: [{ name: "accountNumber", type: "string", required: true, sensitive: true, description: "Account number." }],
      outputs: [],
      businessOutcomes: [{ code: "TRANSFER_REJECTED", description: "Transfer rejected.", checkpoint: { id: "rejected", description: "Rejected banner.", all: [{ kind: "text_visible", text: "Transfer rejected" }] } }],
    },
    policy: { permittedTargets: ["https://demo.invalid"], permittedRoutes: ["/transfer"], permittedActionTypes: ["submit"] },
    targets: [{ id: "submit-transfer", description: "Submit transfer", strategies: [{ kind: "accessibility", role: "button", name: "Submit", exact: true }], requireUniqueMatch: true }],
    steps: [{
      id: "submit",
      description: "Submit transfer.",
      action: { type: "submit", effect: "irreversible_write", targetId: "submit-transfer" },
      preconditions: [],
      postconditions: [{ id: "submitted", description: "Confirmation visible.", all: [{ kind: "text_visible", text: "Transfer submitted" }] }],
      recovery: { retry: { allowed: false, maxAttempts: 0, backoffMs: 0 }, onFailure: "intervene", reconciliationRequiredAfterAmbiguousCommit: true },
      humanApprovalRequired: false,
    }],
    successCheckpoint: { id: "done", description: "Confirmation visible.", all: [{ kind: "text_visible", text: "Transfer submitted" }] },
  });
}

function context(): ExecutionContext {
  return { invocationId: "inv-sensitive", capabilityId: "transfer.submit", capabilityVersion: "1.0.0", inputs: { accountNumber: "987654321" }, authorization: { approvedStepIds: ["submit"] } };
}

function surface(): FakeSurfaceAdapter {
  const result = new FakeSurfaceAdapter(new Set(["submit-transfer"]));
  result.setObservation({ location: "https://demo.invalid/transfer", visibleText: ["Transfer submitted"], signals: { session: "active" } });
  return result;
}

describe("Milestone 8: outcomes and recovery", () => {
  // Milestone 8 | REQ-OUT-001/005
  it("returns a session-specific intervention result and performs no action after expiration", async () => {
    const fake = surface();
    fake.setSessionState("expired");
    const result = await new DeterministicReplayEngine(fake, new ConfigurablePolicyEvaluator()).replay(artifact(), context());
    expect(result.disposition).toBe("INTERVENTION_REQUIRED");
    expect(result.code).toBe("SESSION_EXPIRED");
    expect(fake.actions).toHaveLength(0);
  });

  // Milestone 8 | REQ-OUT-004
  it("reconciles an ambiguous irreversible commit from declared postconditions without retrying", async () => {
    const fake = surface();
    fake.queueActionResult({ ok: false, error: { code: "TRANSPORT_LOST", message: "Response lost.", recoverable: true, ambiguousCommit: true } });
    const result = await new DeterministicReplayEngine(fake, new ConfigurablePolicyEvaluator()).replay(artifact(), context());
    expect(result.disposition).toBe("SUCCESS");
    expect(fake.actions).toHaveLength(1);
    expect(result.trace.some((event) => event.kind === "RECOVERY" && event.outcome === "COMMITTED")).toBe(true);
  });

  // Milestone 8 | REQ-OUT-002
  it("returns a declared business outcome rather than throwing", async () => {
    const fake = surface();
    fake.setObservation({ visibleText: ["Transfer rejected"] });
    const result = await new DeterministicReplayEngine(fake, new ConfigurablePolicyEvaluator()).replay(artifact(), context());
    expect(result.disposition).toBe("BUSINESS_OUTCOME");
    expect(result.code).toBe("TRANSFER_REJECTED");
  });
});

describe("Milestone 9: evidence and redaction", () => {
  // Milestone 9 | REQ-EVD-001/003 + REQ-POL-004
  it("persists a structured trace while redacting declared sensitive values", async () => {
    const fake = surface();
    const result = await new DeterministicReplayEngine(fake, new ConfigurablePolicyEvaluator()).replay(artifact(), context());
    const directory = await mkdtemp(join(tmpdir(), "automation-evidence-"));
    const path = await new JsonFileEvidenceStore(directory).persist(artifact(), context(), result);
    const persisted = await readFile(path, "utf8");
    expect(persisted).not.toContain("987654321");
    expect(persisted).toContain("inv-sensitive");
    expect(persisted).toContain("STEP_STARTED");
  });

  // Milestone 9 | REQ-EVD-002
  it("records evidence capture failure without replacing the primary replay result", async () => {
    const fake = surface();
    fake.failEvidenceCapture();
    const result = await new DeterministicReplayEngine(fake, new ConfigurablePolicyEvaluator()).replay(artifact(), context());
    expect(result.disposition).toBe("SUCCESS");
    expect(result.trace.some((event) => event.kind === "EVIDENCE_FAILURE")).toBe(true);
  });
});

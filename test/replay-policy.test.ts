import { describe, expect, it } from "vitest";
import { capabilityArtifactSchema, type CapabilityArtifact } from "../src/artifact/capability-schema.js";
import type { ExecutionContext } from "../src/domain/contracts.js";
import { ConfigurablePolicyEvaluator } from "../src/policy/policy-evaluator.js";
import { DeterministicReplayEngine } from "../src/replay/replay-engine.js";
import { FakeSurfaceAdapter } from "../src/surface/fake-surface-adapter.js";

function artifact(): CapabilityArtifact {
  return capabilityArtifactSchema.parse({
    schemaVersion: "1.0",
    capability: {
      id: "member.lookup",
      name: "Member lookup",
      version: "1.0.0",
      description: "Look up a member by ID and return the displayed balance.",
    },
    application: {
      family: "demo-bank-admin",
      productVersion: "1",
      surface: "browser",
      compatibilityTags: ["base"],
    },
    provenance: {
      discoveryRunId: "disc-001",
      createdAt: "2026-09-11T20:00:00.000Z",
      compilerVersion: "0.1.0",
    },
    contract: {
      inputs: [
        {
          name: "memberId",
          type: "string",
          required: true,
          sensitive: true,
          description: "Member identifier supplied by the caller.",
        },
      ],
      outputs: [
        {
          name: "balance",
          type: "string",
          required: true,
          sensitive: true,
          description: "Current savings balance.",
          source: { targetId: "balance-value" },
        },
      ],
      businessOutcomes: [
        {
          code: "MEMBER_NOT_FOUND",
          description: "The requested member does not exist.",
          checkpoint: {
            id: "member-not-found",
            description: "Not-found banner is visible.",
            all: [{ kind: "text_visible", text: "Member not found" }],
          },
        },
      ],
    },
    policy: {
      permittedTargets: ["https://demo.invalid"],
      permittedRoutes: ["/member-search", "/member/*"],
      permittedActionTypes: ["type", "click", "read"],
    },
    targets: [
      {
        id: "member-id-input",
        description: "Member ID input",
        strategies: [{ kind: "label", text: "Member ID", exact: true }],
        requireUniqueMatch: true,
      },
      {
        id: "search-button",
        description: "Search button",
        strategies: [{ kind: "accessibility", role: "button", name: "Search", exact: true }],
        requireUniqueMatch: true,
      },
      {
        id: "balance-value",
        description: "Displayed savings balance",
        strategies: [{ kind: "structural", anchorText: "Savings Balance", relation: "following" }],
        requireUniqueMatch: true,
      },
    ],
    steps: [
      {
        id: "enter-member-id",
        description: "Enter member identifier.",
        action: {
          type: "type",
          effect: "reversible_write",
          targetId: "member-id-input",
          value: { kind: "input", input: "memberId" },
        },
        preconditions: [],
        postconditions: [],
        recovery: {
          retry: { allowed: false, maxAttempts: 0, backoffMs: 0 },
          onFailure: "fail",
          reconciliationRequiredAfterAmbiguousCommit: false,
        },
        humanApprovalRequired: false,
      },
      {
        id: "search",
        description: "Submit member search.",
        action: { type: "click", effect: "read", targetId: "search-button" },
        preconditions: [],
        postconditions: [],
        recovery: {
          retry: { allowed: true, maxAttempts: 1, backoffMs: 0 },
          onFailure: "intervene",
          reconciliationRequiredAfterAmbiguousCommit: false,
        },
        humanApprovalRequired: false,
      },
    ],
    successCheckpoint: {
      id: "balance-visible",
      description: "Balance field is visible.",
      all: [{ kind: "target_present", targetId: "balance-value" }],
    },
  });
}

function context(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    invocationId: "inv-001",
    capabilityId: "member.lookup",
    capabilityVersion: "1.0.0",
    inputs: { memberId: "12345" },
    ...overrides,
  };
}

describe("DeterministicReplayEngine + ConfigurablePolicyEvaluator", () => {
  // Milestone 6 | REQ-RPL-001/002/004
  // Proves artifact-defined steps replay through the adapter without any model dependency.
  it("replays a valid capability deterministically and returns declared outputs", async () => {
    const surface = new FakeSurfaceAdapter(new Set(["member-id-input", "search-button", "balance-value"]));
    const engine = new DeterministicReplayEngine(surface, new ConfigurablePolicyEvaluator());

    const result = await engine.replay(artifact(), context());

    expect(result.disposition).toBe("SUCCESS");
    expect(result.outputs?.balance).toBe("$123.45");
    expect(surface.actions.map((action) => action.type)).toEqual(["type", "click", "read"]);
    expect(result.trace.some((event) => event.kind === "POLICY_DECISION")).toBe(true);
  });

  // Milestone 7 | REQ-POL-000
  // Target/domain allowlisting is enforced before replay performs the first action.
  it("blocks execution outside the permitted target allowlist", async () => {
    const surface = new FakeSurfaceAdapter(new Set(["member-id-input", "search-button", "balance-value"]));
    surface.setObservation({ location: "https://evil.invalid/member-search" });
    const engine = new DeterministicReplayEngine(surface, new ConfigurablePolicyEvaluator());

    const result = await engine.replay(artifact(), context());

    expect(result.disposition).toBe("FAILURE");
    expect(result.code).toBe("POLICY_DENIED");
    expect(surface.actions).toHaveLength(0);
    expect(surface.evidence).toHaveLength(1);
  });

  // Milestone 7 | REQ-POL-000
  // Route allowlisting is independent from domain allowlisting.
  it("blocks an unapproved route on an otherwise permitted target", async () => {
    const surface = new FakeSurfaceAdapter(new Set(["member-id-input", "search-button", "balance-value"]));
    surface.setObservation({ location: "https://demo.invalid/admin" });
    const engine = new DeterministicReplayEngine(surface, new ConfigurablePolicyEvaluator());

    const result = await engine.replay(artifact(), context());

    expect(result.disposition).toBe("FAILURE");
    expect(result.code).toBe("POLICY_DENIED");
    expect(surface.actions).toHaveLength(0);
  });

  // Milestone 7 | REQ-POL-003 + Milestone 10 seam | REQ-HITL-000
  // Explicit approval is invocation-scoped; missing approval produces intervention, not execution.
  it("requires invocation approval when a step declares human approval", async () => {
    const candidate = artifact();
    candidate.steps[0]!.humanApprovalRequired = true;
    const surface = new FakeSurfaceAdapter(new Set(["member-id-input", "search-button", "balance-value"]));
    const engine = new DeterministicReplayEngine(surface, new ConfigurablePolicyEvaluator());

    const denied = await engine.replay(candidate, context());
    expect(denied.disposition).toBe("INTERVENTION_REQUIRED");
    expect(denied.code).toBe("POLICY_DENIED");
    expect(surface.actions).toHaveLength(0);

    const approvedSurface = new FakeSurfaceAdapter(new Set(["member-id-input", "search-button", "balance-value"]));
    const approvedEngine = new DeterministicReplayEngine(approvedSurface, new ConfigurablePolicyEvaluator());
    const approved = await approvedEngine.replay(
      candidate,
      context({ authorization: { approvedStepIds: ["enter-member-id"] } }),
    );
    expect(approved.disposition).toBe("SUCCESS");
  });

  // Milestone 6 | REQ-RPL-003
  // Failed preconditions stop progression before surface execution and include evidence.
  it("stops when a declared precondition is not satisfied", async () => {
    const candidate = artifact();
    candidate.steps[0]!.preconditions.push({
      id: "must-be-detail",
      description: "Must already be on member detail.",
      all: [{ kind: "text_visible", text: "Member Detail" }],
    });
    const surface = new FakeSurfaceAdapter(new Set(["member-id-input", "search-button", "balance-value"]));
    const engine = new DeterministicReplayEngine(surface, new ConfigurablePolicyEvaluator());

    const result = await engine.replay(candidate, context());

    expect(result.disposition).toBe("FAILURE");
    expect(result.code).toBe("PRECONDITION_FAILED");
    expect(surface.actions).toHaveLength(0);
    expect(surface.evidence).toHaveLength(1);
  });

  // Milestone 8 behavior implemented at the replay seam | REQ-OUT-002
  // Expected business states are caller-visible outcomes, not thrown infrastructure failures.
  it("returns a declared business outcome", async () => {
    const surface = new FakeSurfaceAdapter(new Set(["member-id-input", "search-button", "balance-value"]));
    surface.setObservation({ visibleText: ["Member Search", "Member not found"] });
    const engine = new DeterministicReplayEngine(surface, new ConfigurablePolicyEvaluator());

    const result = await engine.replay(artifact(), context());

    expect(result.disposition).toBe("BUSINESS_OUTCOME");
    expect(result.code).toBe("MEMBER_NOT_FOUND");
    expect(surface.actions).toHaveLength(0);
  });

  // Milestone 8 behavior implemented at the replay seam | REQ-OUT-003
  // Recoverable action failures retry only within the artifact-defined bound.
  it("retries a recoverable action only within the declared limit", async () => {
    const surface = new FakeSurfaceAdapter(new Set(["member-id-input", "search-button", "balance-value"]));
    surface.queueActionResult({ ok: true }); // enter member id
    surface.queueActionResult({
      ok: false,
      error: { code: "TRANSIENT_LOAD", message: "Temporary load failure.", recoverable: true },
    });
    surface.queueActionResult({ ok: true }); // bounded retry of search
    const engine = new DeterministicReplayEngine(surface, new ConfigurablePolicyEvaluator());

    const result = await engine.replay(artifact(), context());

    expect(result.disposition).toBe("SUCCESS");
    expect(surface.actions.filter((action) => action.type === "click")).toHaveLength(2);
  });

  // Milestone 8 behavior implemented at the replay seam | REQ-OUT-004
  // Ambiguous commit state never blindly retries and escalates for reconciliation/human judgment.
  it("escalates an ambiguous commit without automatic retry", async () => {
    const candidate = artifact();
    candidate.steps[1]!.action.effect = "irreversible_write";
    candidate.steps[1]!.recovery.retry.allowed = false;
    candidate.steps[1]!.recovery.retry.maxAttempts = 0;
    candidate.steps[1]!.recovery.reconciliationRequiredAfterAmbiguousCommit = true;

    const surface = new FakeSurfaceAdapter(new Set(["member-id-input", "search-button", "balance-value"]));
    surface.queueActionResult({ ok: true });
    surface.queueActionResult({
      ok: false,
      error: {
        code: "TRANSPORT_LOST",
        message: "Connection dropped after submit.",
        recoverable: true,
        ambiguousCommit: true,
      },
    });
    const engine = new DeterministicReplayEngine(surface, new ConfigurablePolicyEvaluator());

    const result = await engine.replay(candidate, context());

    expect(result.disposition).toBe("INTERVENTION_REQUIRED");
    expect(result.code).toBe("UNKNOWN_COMMIT_STATE");
    expect(surface.actions.filter((action) => action.type === "click")).toHaveLength(1);
  });
});

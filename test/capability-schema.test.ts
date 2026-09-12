import { describe, expect, it } from "vitest";
import { capabilityArtifactSchema } from "../src/artifact/capability-schema.js";

// Plan fixture: Milestone 3 | REQ-ART-001/002/004, plus REQ-POL-000.
// Represents the minimum reviewable capability contract we expect discovery to compile.
const validArtifact = {
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
        retry: { allowed: true, maxAttempts: 1, backoffMs: 0 },
        onFailure: "fail",
        reconciliationRequiredAfterAmbiguousCommit: false,
      },
      humanApprovalRequired: false,
    },
    {
      id: "search",
      description: "Submit member search.",
      action: {
        type: "click",
        effect: "read",
        targetId: "search-button",
      },
      preconditions: [],
      postconditions: [],
      recovery: {
        retry: { allowed: true, maxAttempts: 2, backoffMs: 100 },
        onFailure: "intervene",
        reconciliationRequiredAfterAmbiguousCommit: false,
      },
      humanApprovalRequired: false,
    },
    {
      id: "read-balance",
      description: "Read savings balance.",
      action: {
        type: "read",
        effect: "read",
        targetId: "balance-value",
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
  ],
  successCheckpoint: {
    id: "balance-visible",
    description: "Balance field is visible.",
    all: [{ kind: "target_present", targetId: "balance-value" }],
  },
} as const;

describe("capabilityArtifactSchema", () => {
  // REQ-ART-001: valid typed/versioned artifacts pass runtime validation.
  it("accepts a valid capability artifact", () => {
    expect(capabilityArtifactSchema.safeParse(validArtifact).success).toBe(true);
  });

  // REQ-ART-003: malformed cross-references fail before execution.
  it("rejects a step that references an undeclared input", () => {
    const candidate = structuredClone(validArtifact) as any;
    candidate.steps[0].action.value.input = "undeclared";

    const result = capabilityArtifactSchema.safeParse(candidate);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("Undeclared input"))).toBe(true);
    }
  });

  // REQ-ART-003: target references must resolve within the artifact contract.
  it("rejects a step that references an unknown target", () => {
    const candidate = structuredClone(validArtifact) as any;
    candidate.steps[0].action.targetId = "missing-target";

    const result = capabilityArtifactSchema.safeParse(candidate);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("Unknown targetId"))).toBe(true);
    }
  });

  // REQ-OUT-003/004: irreversible operations cannot blindly retry after ambiguous commit.
  it("rejects automatic risky retry without reconciliation", () => {
    const candidate = structuredClone(validArtifact) as any;
    candidate.steps[1].action.effect = "irreversible_write";
    candidate.steps[1].recovery.retry.allowed = true;
    candidate.steps[1].recovery.reconciliationRequiredAfterAmbiguousCommit = false;

    const result = capabilityArtifactSchema.safeParse(candidate);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("ambiguous-commit reconciliation"),
        ),
      ).toBe(true);
    }
  });
});

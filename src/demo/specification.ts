import { ExecutionError } from "../runtime/errors.js";
import type { DiscoverySpecification } from "../discovery/discovery-contracts.js";
import type { Target } from "../artifact/capability-schema.js";

export const defaultDemoGoal = "Find the supplied member and read their current savings balance from the member detail screen.";
export const demoTarget = "synthetic-member-desk";
export const demoPermissionDeniedSelector = '#result:text-is("Permission denied")';

// The demo accepts goal text for one reviewed application, not arbitrary URLs.
export function demoRequest(input: { readonly goal?: string; readonly target?: string }) {
  const goal = (input.goal ?? defaultDemoGoal).trim();
  const target = input.target ?? demoTarget;
  if (!goal || goal.length > 2000) throw new ExecutionError("DEMO_CONFIGURATION", "Goal must contain between 1 and 2000 characters.");
  if (target !== demoTarget) throw new ExecutionError("DEMO_CONFIGURATION", "Only the synthetic-member-desk target is supported.");
  return { goal, target };
}

// Milestone 3 + 11 | Assignment §3.2, §3.7 | REQ-ART-001, REQ-MT-001
// The host provides a small reviewed control catalog and contract, not the flow order.
// Only the local origin varies per run; the serialized artifact retains that authority.
export function demoSpecification(url: string): DiscoverySpecification {
  const target = (id: string, selector: string, description: string): Target => ({ id, description, strategies: [{ kind: "selector", selector }], requireUniqueMatch: true });
  return {
    schemaVersion: "1.0", capability: { id: "member.lookup", name: "Member lookup", version: "1.0.0", description: "Find a synthetic member and read their savings balance." },
    application: { family: "synthetic-member-desk", productVersion: "1", surface: "browser", compatibilityTags: ["local-demo"] },
    contract: {
      inputs: [{ name: "memberId", type: "string", required: true, sensitive: true, description: "Member identifier." }],
      outputs: [{ name: "balance", type: "string", required: true, sensitive: true, description: "Displayed savings balance.", source: { targetId: "balance" } }],
      businessOutcomes: [
        { code: "MEMBER_NOT_FOUND", description: "Member does not exist.", checkpoint: { id: "missing", description: "Not-found response", all: [{ kind: "text_visible", text: "Member not found" }] } },
        { code: "INVALID_MEMBER_ID", description: "Member identifier has invalid format.", checkpoint: { id: "invalid", description: "Validation response", all: [{ kind: "text_visible", text: "Invalid member ID" }] } },
      ],
    },
    policy: { permittedTargets: [new URL(url).origin], permittedRoutes: ["/"], permittedActionTypes: ["type", "click", "read", "wait"] },
    targets: [target("member", "#member", "Member ID field"), target("find", "#find", "Find member button"), target("open", "#open", "Open member button"), target("selected", "#selected", "Selected member ID"), target("balance", "#balance", "Savings balance")],
    grants: {
      member: { actionTypes: ["type"], effect: "reversible_write" },
      find: { actionTypes: ["click"], effect: "read", preconditions: [{ id: "operator-ready", description: "Operator released this session", all: [{ kind: "text_visible", text: "Ready" }] }] },
      open: { actionTypes: ["click"], effect: "read" },
      balance: { actionTypes: ["read"], effect: "read" },
      wait: { actionTypes: ["wait"], effect: "read" },
    },
    inputBindings: { member: "memberId" },
    successCheckpoint: { id: "member-detail", description: "Correct member and savings balance displayed", timeoutMs: 1000, all: [{ kind: "text_visible", text: "Member detail" }, { kind: "target_present", targetId: "balance" }, { kind: "target_value_equals_input", targetId: "selected", input: "memberId" }] },
  };
}

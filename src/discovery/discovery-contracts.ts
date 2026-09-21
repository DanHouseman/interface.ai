import { z } from "zod";
import { actionTypeSchema, jsonValue, type CapabilityArtifact, type CapabilityStep } from "../artifact/capability-schema.js";
import type { ActionEffect, ActionType, ExecutionContext, JsonValue } from "../domain/contracts.js";
import type { ActionResult, EvidenceReference, Observation } from "../surface/surface-adapter.js";
import type { PolicyDecision } from "../policy/policy-evaluator.js";

// Milestone 5 + 7 | Assignment §3.1, §3.4 | REQ-DISC-001/002
// The host declares affordances, effects, bindings and success, not action ordering.
// The model chooses which allowed control to operate based on current live observations.
export interface DiscoverySpecification extends Omit<CapabilityArtifact, "steps" | "provenance"> {
  readonly grants: Readonly<Record<string, { readonly actionTypes: readonly ActionType[]; readonly effect: ActionEffect; readonly preconditions?: CapabilityStep["preconditions"] }>>;
  readonly inputBindings: Readonly<Record<string, string>>;
}
export interface DiscoveryRequest {
  readonly runId: string;
  readonly goal: string;
  readonly target: string;
  readonly maxSteps: number;
  readonly timeoutMs: number;
  readonly specification: DiscoverySpecification;
  readonly inputs: Readonly<Record<string, JsonValue>>;
  readonly authorization?: ExecutionContext["authorization"];
}
export const discoveryDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("act"), rationale: z.string().min(1), actionType: actionTypeSchema, targetId: z.string().optional(), value: jsonValue.optional() }).strict(),
  z.object({ kind: z.literal("complete"), rationale: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("stuck"), rationale: z.string().min(1) }).strict(),
]);
export type DiscoveryDecision = z.infer<typeof discoveryDecisionSchema>;
export interface ModelInput {
  readonly goal: string;
  readonly observation: Observation;
  readonly history: readonly DiscoveryTraceEvent[];
  readonly specification: DiscoverySpecification;
  readonly inputs: Readonly<Record<string, JsonValue>>;
  readonly signal: AbortSignal;
}
export interface DiscoveryModel { decide(input: ModelInput): Promise<DiscoveryDecision>; metadata?(): JsonValue; }
export type DiscoveryTraceEvent =
  | { readonly kind: "CHECKPOINT"; readonly step: number; readonly checkpointId: string; readonly passed: boolean; readonly expected: readonly string[]; readonly observed: readonly string[]; readonly timestamp: string }
  | { readonly kind: "OBSERVATION"; readonly step: number; readonly observation: Observation }
  | { readonly kind: "DECISION"; readonly step: number; readonly decision: DiscoveryDecision }
  | { readonly kind: "POLICY"; readonly step: number; readonly decision: PolicyDecision }
  | { readonly kind: "ACTION"; readonly step: number; readonly capabilityStep: CapabilityStep; readonly result: ActionResult }
  | { readonly kind: "EVIDENCE"; readonly evidence: EvidenceReference }
  | { readonly kind: "EVIDENCE_FAILURE"; readonly code: "EVIDENCE_CAPTURE_FAILED" };
export type DiscoveryResult =
  | { readonly disposition: "SUCCESS"; readonly runId: string; readonly trace: readonly DiscoveryTraceEvent[]; readonly outputs: Readonly<Record<string, JsonValue>> }
  | { readonly disposition: "INTERVENTION_REQUIRED" | "FAILURE"; readonly runId: string; readonly code: string; readonly message: string; readonly trace: readonly DiscoveryTraceEvent[] };

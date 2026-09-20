import type { JsonValue, ResultDisposition } from "../domain/contracts.js";
import type { EvidenceReference } from "../surface/surface-adapter.js";

// Plan: Milestone 6 + Milestone 9 | REQ-RPL-001/003, REQ-EVD-001/002
export type ReplayTraceEvent =
  | { readonly kind: "HANDOFF"; readonly stepId: string; readonly decision: "retry" | "complete"; readonly timestamp: string }
  | { readonly kind: "STEP_STARTED"; readonly stepId: string; readonly timestamp: string }
  | { readonly kind: "STEP_COMPLETED"; readonly stepId: string; readonly timestamp: string }
  | { readonly kind: "CHECKPOINT"; readonly stepId?: string; readonly checkpointId: string; readonly phase: "precondition" | "postcondition" | "business_outcome" | "success" | "reconciliation"; readonly passed: boolean; readonly expected: readonly string[]; readonly observed: readonly string[]; readonly timestamp: string }
  | { readonly kind: "POLICY_DECISION"; readonly stepId: string; readonly disposition: "ALLOW" | "DENY"; readonly code: string; readonly reason: string; readonly timestamp: string }
  | { readonly kind: "TARGET_RESOLVED"; readonly stepId: string; readonly targetId: string; readonly strategyKind: string; readonly timestamp: string }
  | { readonly kind: "ACTION_RESULT"; readonly stepId: string; readonly attempt: number; readonly ok: boolean; readonly errorCode?: string; readonly timestamp: string }
  | { readonly kind: "RECOVERY"; readonly stepId: string; readonly code: string; readonly outcome: "RETRY" | "COMMITTED" | "AMBIGUOUS" | "EXHAUSTED"; readonly timestamp: string }
  | { readonly kind: "SESSION_STATE"; readonly stepId?: string; readonly state: string; readonly timestamp: string }
  | { readonly kind: "EVIDENCE"; readonly stepId?: string; readonly checkpointId?: string; readonly evidence: EvidenceReference; readonly timestamp: string }
  | { readonly kind: "EVIDENCE_FAILURE"; readonly stepId?: string; readonly code: string; readonly message: string; readonly timestamp: string };

export interface ReplayResult {
  readonly disposition: ResultDisposition;
  readonly code: string;
  readonly message: string;
  readonly stepId?: string;
  readonly outputs?: Readonly<Record<string, JsonValue>>;
  readonly trace: readonly ReplayTraceEvent[];
}

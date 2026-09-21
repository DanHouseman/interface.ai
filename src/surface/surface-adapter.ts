import type { JsonValue } from "../domain/contracts.js";
import type { Target, TargetStrategy } from "../artifact/capability-schema.js";

// Plan: Milestone 4 + Milestone 10 | REQ-SRF-001, REQ-HITL-001/002
// Session state/ownership are explicit so automation can pause and cede the SAME live session.
export type SessionState = "active" | "expired" | "paused" | "unknown";
export type SessionOwner = "automation" | "human" | "none";

// Plan: Milestone 4 | REQ-SRF-001, REQ-SRF-004
// Generic observation model: intentionally not HTML/DOM-specific.
export interface Observation {
  readonly surfaceKind: "browser" | "desktop" | "terminal" | "remote";
  readonly timestamp: string;
  readonly location?: string;
  readonly title?: string;
  readonly visibleText?: readonly string[];
  readonly signals: Readonly<Record<string, JsonValue>>;
  // Values classified by declared target, captured with the observation. Live only;
  // evidence redacts sensitive targets before serializing any part of a bundle.
  readonly targetValues?: Readonly<Record<string, JsonValue>>;
}

// Plan: Milestone 4 + Milestone 6 | REQ-SRF-001, REQ-RPL-002
// Adapter-specific handles remain opaque to replay; the artifact-selected strategy is retained
// for traceability/evidence.
export interface ResolvedTarget {
  readonly targetId: string;
  readonly strategy: TargetStrategy;
  readonly opaqueHandle: unknown;
}

export type SurfaceAction =
  | { readonly type: "click"; readonly target: ResolvedTarget }
  | { readonly type: "type"; readonly target: ResolvedTarget; readonly value: string }
  | { readonly type: "select"; readonly target: ResolvedTarget; readonly value: string }
  | { readonly type: "navigate"; readonly value: string }
  | { readonly type: "read"; readonly target: ResolvedTarget }
  | { readonly type: "wait"; readonly durationMs: number }
  | { readonly type: "submit"; readonly target: ResolvedTarget }
  | {
      readonly type: "custom";
      readonly name: string;
      readonly target?: ResolvedTarget;
      readonly value?: JsonValue;
    };

// Plan: Milestone 4 + Milestone 8 | REQ-SRF-001, REQ-OUT-003/004
// Surface errors expose recoverability and ambiguous-commit state without deciding policy.
export interface ActionResult {
  readonly ok: boolean;
  readonly observedValue?: JsonValue;
  readonly signals?: Readonly<Record<string, JsonValue>>;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly recoverable: boolean;
    readonly ambiguousCommit?: boolean;
  };
}

// Plan: Milestone 9 | REQ-EVD-002/003
// Evidence is referenced, not embedded into the capability artifact.
export interface EvidenceReference {
  readonly id: string;
  readonly kind: "screenshot" | "snapshot" | "trace" | "observation";
  readonly path?: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

// Plan: Milestone 4 | REQ-SRF-001, REQ-RPL-004
// Core seam between recorded flow and concrete computer-use technology. Replay and discovery
// depend on this interface, not on Playwright, accessibility APIs, or desktop automation directly.
export interface SurfaceAdapter {
  observe(targets?: readonly Target[]): Promise<Observation>;
  resolve(target: Target): Promise<ResolvedTarget>;
  execute(action: SurfaceAction): Promise<ActionResult>;
  captureEvidence(reason: string): Promise<EvidenceReference>;
  getSessionState(): Promise<SessionState>;
  getSessionOwner(): Promise<SessionOwner>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}

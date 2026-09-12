// Plan: Milestones 3-10 | shared core contracts
// Framework-neutral domain types used by artifact, policy, replay, evidence, and surface layers.
// Keeping these here prevents browser/model SDK types from leaking across architectural seams.
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SurfaceKind = "browser" | "desktop" | "terminal" | "remote";

export type ActionEffect =
  | "read"
  | "reversible_write"
  | "irreversible_write"
  | "privileged";

export type ActionType =
  | "click"
  | "type"
  | "select"
  | "navigate"
  | "read"
  | "wait"
  | "submit"
  | "custom";

// Plan: Milestone 8 | REQ-OUT-001
// Caller-visible result taxonomy separates domain outcomes from recoverable and hard failures.
export type ResultDisposition =
  | "SUCCESS"
  | "BUSINESS_OUTCOME"
  | "RECOVERABLE"
  | "INTERVENTION_REQUIRED"
  | "FAILURE";

// Plan: Milestone 6/7 | REQ-RPL-001, REQ-POL-001/003
// Invocation context is caller-supplied authority/data, distinct from observed UI content.
export interface ExecutionContext {
  invocationId: string;
  capabilityId: string;
  capabilityVersion: string;
  inputs: Readonly<Record<string, JsonValue>>;
}

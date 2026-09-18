import type { ActionEffect, ActionType, JsonValue } from "../domain/contracts.js";
import type { Observation, SurfaceAction } from "../surface/surface-adapter.js";
import type { Target } from "../artifact/capability-schema.js";

export interface DiscoveryRequest {
  readonly runId: string;
  readonly goal: string;
  readonly target: string;
  readonly applicationFamily: string;
  readonly maxSteps: number;
  readonly timeoutMs: number;
  readonly permittedRoutes?: readonly string[];
}

export type DiscoveryDecision =
  | { readonly kind: "act"; readonly rationale: string; readonly actionType: ActionType; readonly effect: ActionEffect; readonly target?: Target; readonly value?: JsonValue }
  | { readonly kind: "complete"; readonly rationale: string; readonly outputs?: Readonly<Record<string, JsonValue>> }
  | { readonly kind: "stuck"; readonly rationale: string };

export interface DiscoveryModel {
  decide(input: { readonly goal: string; readonly observation: Observation; readonly history: readonly DiscoveryTraceEvent[] }): Promise<DiscoveryDecision>;
}

export type DiscoveryTraceEvent =
  | { readonly kind: "OBSERVATION"; readonly step: number; readonly observation: Observation }
  | { readonly kind: "DECISION"; readonly step: number; readonly decision: DiscoveryDecision }
  | { readonly kind: "ACTION"; readonly step: number; readonly action: SurfaceAction; readonly ok: boolean; readonly errorCode?: string };

export type DiscoveryResult =
  | { readonly disposition: "SUCCESS"; readonly runId: string; readonly trace: readonly DiscoveryTraceEvent[]; readonly outputs: Readonly<Record<string, JsonValue>> }
  | { readonly disposition: "INTERVENTION_REQUIRED" | "FAILURE"; readonly runId: string; readonly code: string; readonly message: string; readonly trace: readonly DiscoveryTraceEvent[] };

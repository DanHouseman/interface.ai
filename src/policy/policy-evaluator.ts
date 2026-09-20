import type { CapabilityArtifact, CapabilityStep } from "../artifact/capability-schema.js";
import type { ExecutionContext } from "../domain/contracts.js";
import type { Observation } from "../surface/surface-adapter.js";

export type Authority = CapabilityArtifact["policy"];
export type PolicyDecision =
  | { readonly disposition: "ALLOW"; readonly code: "POLICY_ALLOWED"; readonly reason: string }
  | { readonly disposition: "DENY"; readonly code: "TARGET_NOT_ALLOWED" | "ROUTE_NOT_ALLOWED" | "ACTION_TYPE_NOT_ALLOWED" | "APPROVAL_REQUIRED"; readonly reason: string };
export interface PolicyEvaluationRequest {
  readonly artifact: CapabilityArtifact;
  readonly step: CapabilityStep;
  readonly context: ExecutionContext;
  readonly observation: Observation;
}
export interface PolicyEvaluator { evaluate(request: PolicyEvaluationRequest): PolicyDecision; }

// Milestone 7 | Assignment §3.4 | REQ-POL-000..003
// Both phases use the same gate. An optional host ceiling intersects artifact authority;
// a model may select behavior, but it cannot expand either allowlist or grant approval.
export class ConfigurablePolicyEvaluator implements PolicyEvaluator {
  public constructor(private readonly ceiling?: Authority) {}

  public evaluate({ artifact, step, context, observation }: PolicyEvaluationRequest): PolicyDecision {
    const policies = this.ceiling ? [artifact.policy, this.ceiling] : [artifact.policy];
    for (const policy of policies) {
      if (!policy.permittedActionTypes.includes(step.action.type)) {
        return deny("ACTION_TYPE_NOT_ALLOWED", `Action '${step.action.type}' is outside the allowlist.`);
      }
      if (observation.location !== undefined) {
        const decision = evaluateLocation(observation.location, policy);
        if (decision) return decision;
      } else if (observation.surfaceKind === "browser") {
        return deny("TARGET_NOT_ALLOWED", "Browser location is unavailable.");
      }
      if (step.action.type === "navigate") {
        const source = step.action.value;
        const value = source?.kind === "input" ? context.inputs[source.input] : source?.value;
        if (typeof value !== "string") return deny("TARGET_NOT_ALLOWED", "Navigation requires an absolute authorized URL.");
        const decision = evaluateLocation(value, policy);
        if (decision) return decision;
      }
    }
    // Submit/custom are conservative even if an artifact incorrectly labels their effect.
    const risky = step.action.effect === "irreversible_write" || step.action.effect === "privileged"
      || step.action.type === "submit" || step.action.type === "custom";
    if ((risky || step.humanApprovalRequired) && !context.authorization?.approvedStepIds?.includes(step.id)) {
      return deny("APPROVAL_REQUIRED", `Step '${step.id}' requires explicit invocation approval.`);
    }
    return { disposition: "ALLOW", code: "POLICY_ALLOWED", reason: "Action and destination are within configured authority." };
  }
}

// Milestone 7 | Assignment §3.4 | REQ-POL-000
// Shared by proposed-action checks and the browser request guard (including redirects).
export function evaluateLocation(raw: string, policy: Authority): PolicyDecision | undefined {
  let url: URL;
  try { url = new URL(raw); } catch { return deny("TARGET_NOT_ALLOWED", "Location is not an absolute URL."); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password
    || !policy.permittedTargets.some((candidate) => {
      try { return new URL(candidate).origin === url.origin; } catch { return false; }
    })) return deny("TARGET_NOT_ALLOWED", "Target is outside the configured allowlist.");
  if (policy.permittedRoutes.length && !policy.permittedRoutes.some((pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(url.pathname);
  })) return deny("ROUTE_NOT_ALLOWED", "Route is outside the configured allowlist.");
  return undefined;
}

function deny(code: Extract<PolicyDecision, { disposition: "DENY" }>["code"], reason: string): PolicyDecision {
  return { disposition: "DENY", code, reason };
}

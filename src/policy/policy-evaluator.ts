import type { CapabilityArtifact, CapabilityStep } from "../artifact/capability-schema.js";
import type { ExecutionContext } from "../domain/contracts.js";
import type { Observation } from "../surface/surface-adapter.js";

// Plan: Milestone 7 | REQ-POL-000, REQ-POL-001, REQ-POL-003
// Policy is an external authority boundary. Replay asks whether an artifact-declared action is
// authorized; neither model output nor observed UI content can grant additional authority.
export type PolicyDecision =
  | { readonly disposition: "ALLOW"; readonly code: "POLICY_ALLOWED"; readonly reason: string }
  | {
      readonly disposition: "DENY";
      readonly code:
        | "TARGET_NOT_ALLOWED"
        | "ROUTE_NOT_ALLOWED"
        | "ACTION_TYPE_NOT_ALLOWED"
        | "APPROVAL_REQUIRED";
      readonly reason: string;
    };

export interface PolicyEvaluationRequest {
  readonly artifact: CapabilityArtifact;
  readonly step: CapabilityStep;
  readonly context: ExecutionContext;
  readonly observation: Observation;
}

export interface PolicyEvaluator {
  evaluate(request: PolicyEvaluationRequest): PolicyDecision;
}

// Plan: Milestone 7 | REQ-POL-000
// Concrete first-slice evaluator for target/domain, route, action-type, and approval allowlists.
// This intentionally does not inspect UI text for authority decisions.
export class ConfigurablePolicyEvaluator implements PolicyEvaluator {
  public evaluate(request: PolicyEvaluationRequest): PolicyDecision {
    const { artifact, step, context, observation } = request;

    if (!artifact.policy.permittedActionTypes.includes(step.action.type)) {
      return {
        disposition: "DENY",
        code: "ACTION_TYPE_NOT_ALLOWED",
        reason: `Action type '${step.action.type}' is not permitted by the capability policy.`,
      };
    }

    if (observation.location) {
      const locationDecision = this.evaluateLocation(
        observation.location,
        artifact.policy.permittedTargets,
        artifact.policy.permittedRoutes,
      );
      if (locationDecision) return locationDecision;
    }

    if (step.humanApprovalRequired && !context.authorization?.approvedStepIds?.includes(step.id)) {
      return {
        disposition: "DENY",
        code: "APPROVAL_REQUIRED",
        reason: `Step '${step.id}' requires explicit invocation approval.`,
      };
    }

    return {
      disposition: "ALLOW",
      code: "POLICY_ALLOWED",
      reason: "Action is within the configured capability and invocation authority.",
    };
  }

  private evaluateLocation(
    rawLocation: string,
    permittedTargets: readonly string[],
    permittedRoutes: readonly string[],
  ): PolicyDecision | undefined {
    let url: URL;
    try {
      url = new URL(rawLocation);
    } catch {
      return {
        disposition: "DENY",
        code: "TARGET_NOT_ALLOWED",
        reason: `Observed location '${rawLocation}' is not a valid policy-addressable URL.`,
      };
    }

    const targetAllowed = permittedTargets.some((candidate) => {
      try {
        const allowed = new URL(candidate);
        return allowed.protocol === url.protocol && allowed.host === url.host;
      } catch {
        return candidate === url.origin;
      }
    });

    if (!targetAllowed) {
      return {
        disposition: "DENY",
        code: "TARGET_NOT_ALLOWED",
        reason: `Observed target '${url.origin}' is outside the configured allowlist.`,
      };
    }

    if (permittedRoutes.length > 0 && !permittedRoutes.some((pattern) => routeMatches(url.pathname, pattern))) {
      return {
        disposition: "DENY",
        code: "ROUTE_NOT_ALLOWED",
        reason: `Observed route '${url.pathname}' is outside the configured allowlist.`,
      };
    }

    return undefined;
  }
}

// Plan: Milestone 7 | REQ-POL-000
// Small deterministic glob matcher: '*' matches zero or more path characters. No regex from
// untrusted UI/model content is evaluated here.
function routeMatches(pathname: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(pathname);
}

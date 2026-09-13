import type { Target } from "../artifact/capability-schema.js";
import type {
  ActionResult,
  EvidenceReference,
  Observation,
  ResolvedTarget,
  SessionOwner,
  SessionState,
  SurfaceAction,
  SurfaceAdapter,
} from "./surface-adapter.js";

// Plan: Milestone 4 | REQ-SRF-001, REQ-RPL-004
// Deterministic test double proves replay/core logic can be tested without a browser.
export class FakeSurfaceAdapter implements SurfaceAdapter {
  public readonly actions: SurfaceAction[] = [];
  public readonly evidence: EvidenceReference[] = [];
  private state: SessionState = "active";
  private owner: SessionOwner = "automation";
  private actionResults: ActionResult[] = [];
  private observation: Observation = {
    surfaceKind: "browser",
    timestamp: new Date().toISOString(),
    location: "https://demo.invalid/member-search",
    title: "Member Search",
    visibleText: ["Member Search"],
    signals: { session: "active", balance: "$123.45" },
  };

  public constructor(private readonly knownTargetIds: ReadonlySet<string> = new Set()) {}

  // Plan: Milestone 6/7 tests | REQ-RPL-003, REQ-POL-000
  // Tests can deterministically model routes, business states, and adapter signals.
  public setObservation(observation: Partial<Observation>): void {
    this.observation = {
      ...this.observation,
      ...observation,
      timestamp: observation.timestamp ?? new Date().toISOString(),
      signals: observation.signals ?? this.observation.signals,
    };
  }

  // Plan: Milestone 6/8 tests | REQ-OUT-003/004
  // Scripted results allow deterministic retry/failure/ambiguous-commit scenarios.
  public queueActionResult(result: ActionResult): void {
    this.actionResults.push(result);
  }

  public async observe(): Promise<Observation> {
    return { ...this.observation, timestamp: new Date().toISOString() };
  }

  public async resolve(target: Target): Promise<ResolvedTarget> {
    if (this.knownTargetIds.size > 0 && !this.knownTargetIds.has(target.id)) {
      throw new Error(`Target not found: ${target.id}`);
    }

    return {
      targetId: target.id,
      strategy: target.strategies[0]!,
      opaqueHandle: { fake: true, targetId: target.id },
    };
  }

  // Plan: Milestone 10 | REQ-HITL-001/002
  // Automation actions are rejected whenever ownership has been transferred to a human.
  public async execute(action: SurfaceAction): Promise<ActionResult> {
    if (this.owner !== "automation" || this.state !== "active") {
      return {
        ok: false,
        error: {
          code: "SURFACE_NOT_OWNED_BY_AUTOMATION",
          message: "Automation does not currently own an active session.",
          recoverable: false,
        },
      };
    }

    this.actions.push(action);
    return this.actionResults.shift() ?? { ok: true, ...(action.type === "read" ? { observedValue: "$123.45" } : {}) };
  }

  public async captureEvidence(reason: string): Promise<EvidenceReference> {
    const evidence: EvidenceReference = {
      id: `fake-evidence-${this.evidence.length}`,
      kind: "observation",
      metadata: { reason },
    };
    this.evidence.push(evidence);
    return evidence;
  }

  public async getSessionState(): Promise<SessionState> {
    return this.state;
  }

  public async getSessionOwner(): Promise<SessionOwner> {
    return this.owner;
  }

  // Minimal same-session control-transfer model for the first vertical slice.
  public async pause(): Promise<void> {
    this.state = "paused";
    this.owner = "human";
  }

  public async resume(): Promise<void> {
    this.state = "active";
    this.owner = "automation";
  }
}

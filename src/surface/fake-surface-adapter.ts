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
  private state: SessionState = "active";
  private owner: SessionOwner = "automation";

  public constructor(private readonly knownTargetIds: ReadonlySet<string> = new Set()) {}

  public async observe(): Promise<Observation> {
    return {
      surfaceKind: "browser",
      timestamp: new Date().toISOString(),
      location: "https://demo.invalid/member-search",
      title: "Member Search",
      visibleText: ["Member Search"],
      signals: { session: this.state },
    };
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
    return { ok: true };
  }

  public async captureEvidence(reason: string): Promise<EvidenceReference> {
    return {
      id: `fake-evidence-${this.actions.length}`,
      kind: "observation",
      metadata: { reason },
    };
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

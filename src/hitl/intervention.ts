import { randomUUID } from "node:crypto";
import type { JsonValue } from "../domain/contracts.js";
import type { EvidenceReference, Observation, SurfaceAdapter } from "../surface/surface-adapter.js";

export interface InterventionRequest { readonly id: string; readonly invocationId: string; readonly capabilityId: string; readonly stepId?: string; readonly reason: string; readonly observation: Observation; readonly evidence: EvidenceReference; }
export interface HumanActionRecord { readonly timestamp: string; readonly operatorId: string; readonly description: string; readonly metadata?: Readonly<Record<string, JsonValue>>; }
export interface Handback { readonly operatorId: string; readonly actions: readonly HumanActionRecord[]; }
export interface InterventionRouter { route(request: InterventionRequest): Promise<void>; waitForResume(interventionId: string): Promise<Handback>; }

// Milestone 10 | Assignment §3.6 | REQ-HITL-000..003
// Pause before evidence/routing. Any routing/verification failure leaves the session
// paused, never silently returned to automation. The verifier runs while humans own it.
export class HumanHandoffCoordinator {
  private active = false;
  public constructor(private readonly surface: SurfaceAdapter, private readonly router: InterventionRouter) {}
  public async intervene(input: { invocationId: string; capabilityId: string; stepId?: string; reason: string }, verify: (observation: Observation) => boolean) {
    if (this.active) throw new Error("INTERVENTION_CONFLICT");
    this.active = true;
    try {
      await this.surface.pause();
      const observation = await this.surface.observe();
      const evidence = await this.surface.captureEvidence("intervention");
      const request: InterventionRequest = { id: randomUUID(), ...input, observation, evidence };
      await this.router.route(request);
      const human = await this.router.waitForResume(request.id);
      const resumedObservation = await this.surface.observe();
      if (!verify(resumedObservation)) throw new Error("RESUME_CHECKPOINT_FAILED");
      await this.surface.resume();
      if (await this.surface.getSessionOwner() !== "automation" || await this.surface.getSessionState() !== "active") throw new Error("CONTROL_TRANSFER_FAILED");
      return { request, human, resumedObservation };
    } finally { this.active = false; }
  }
}

// Milestone 10 | Assignment §3.6 | REQ-HITL-002
// Real deferred handback: no default operator, no automatic resume. Responses are scoped
// to an existing request and consumed once. Cancellation rejects the pending wait.
export class InMemoryInterventionRouter implements InterventionRouter {
  public readonly requests: InterventionRequest[] = [];
  private readonly pending = new Map<string, { promise: Promise<Handback>; resolve: (value: Handback) => void; reject: (error: Error) => void; settled: boolean }>();
  public async route(request: InterventionRequest): Promise<void> {
    if (this.pending.has(request.id)) throw new Error("DUPLICATE_INTERVENTION");
    let resolve!: (value: Handback) => void, reject!: (error: Error) => void;
    const promise = new Promise<Handback>((yes, no) => { resolve = yes; reject = no; });
    this.pending.set(request.id, { promise, resolve, reject, settled: false });
    this.requests.push(request);
  }
  public resolve(id: string, operatorId: string, actions: readonly HumanActionRecord[] = []): void {
    if (!operatorId.trim()) throw new Error("OPERATOR_REQUIRED");
    const pending = this.get(id);
    pending.settled = true;
    pending.resolve({ operatorId, actions });
  }
  public cancel(id: string): void {
    const pending = this.get(id);
    pending.settled = true;
    pending.reject(new Error("INTERVENTION_CANCELLED"));
  }
  public async waitForResume(id: string): Promise<Handback> {
    const pending = this.pending.get(id);
    if (!pending) throw new Error("UNKNOWN_INTERVENTION");
    try { return await pending.promise; } finally { this.pending.delete(id); }
  }
  private get(id: string) {
    const pending = this.pending.get(id);
    if (!pending || pending.settled) throw new Error("UNKNOWN_OR_SETTLED_INTERVENTION");
    return pending;
  }
}

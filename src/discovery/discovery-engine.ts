import type { SurfaceAction, SurfaceAdapter } from "../surface/surface-adapter.js";
import type { DiscoveryDecision, DiscoveryModel, DiscoveryRequest, DiscoveryResult, DiscoveryTraceEvent } from "./discovery-contracts.js";

export class DiscoveryEngine {
  public constructor(private readonly surface: SurfaceAdapter, private readonly model: DiscoveryModel) {}

  public async run(request: DiscoveryRequest): Promise<DiscoveryResult> {
    const trace: DiscoveryTraceEvent[] = [];
    const started = Date.now();
    for (let step = 1; step <= request.maxSteps; step += 1) {
      if (Date.now() - started >= request.timeoutMs) return fail(request, trace, "DISCOVERY_TIMEOUT", "Discovery exceeded its time limit.");
      const observation = await this.surface.observe();
      trace.push({ kind: "OBSERVATION", step, observation });
      if (!locationAllowed(observation.location, request.target, request.permittedRoutes)) return fail(request, trace, "POLICY_DENIED", "Observed location is outside discovery authority.");
      const decision = await this.model.decide({ goal: request.goal, observation, history: trace });
      trace.push({ kind: "DECISION", step, decision });
      if (decision.kind === "complete") return { disposition: "SUCCESS", runId: request.runId, trace, outputs: decision.outputs ?? {} };
      if (decision.kind === "stuck") return { disposition: "INTERVENTION_REQUIRED", runId: request.runId, code: "DISCOVERY_STUCK", message: decision.rationale, trace };
      const action = await buildAction(this.surface, decision);
      if (!action) return fail(request, trace, "INVALID_MODEL_ACTION", "Model produced an action that could not be safely materialized.");
      const result = await this.surface.execute(action);
      trace.push({ kind: "ACTION", step, action, ok: result.ok, ...(result.error ? { errorCode: result.error.code } : {}) });
      if (!result.ok) {
        if (result.error?.recoverable) continue;
        return { disposition: "INTERVENTION_REQUIRED", runId: request.runId, code: result.error?.code ?? "ACTION_FAILED", message: result.error?.message ?? "Discovery action failed.", trace };
      }
    }
    return fail(request, trace, "MAX_STEPS", `Discovery reached maxSteps=${request.maxSteps}.`);
  }
}

async function buildAction(surface: SurfaceAdapter, decision: Extract<DiscoveryDecision,{kind:"act"}>): Promise<SurfaceAction | undefined> {
  const target = decision.target ? await surface.resolve(decision.target) : undefined;
  switch (decision.actionType) {
    case "click": case "read": case "submit": return target ? { type: decision.actionType, target } : undefined;
    case "type": case "select": return target && typeof decision.value === "string" ? { type: decision.actionType, target, value: decision.value } : undefined;
    case "navigate": return typeof decision.value === "string" ? { type: "navigate", value: decision.value } : undefined;
    case "wait": return typeof decision.value === "number" && decision.value >= 0 ? { type: "wait", durationMs: decision.value } : undefined;
    case "custom": return { type: "custom", name: "discovery", ...(target ? { target } : {}), ...(decision.value !== undefined ? { value: decision.value } : {}) };
  }
}
function fail(r: DiscoveryRequest,t: readonly DiscoveryTraceEvent[],code:string,message:string): DiscoveryResult { return { disposition:"FAILURE",runId:r.runId,code,message,trace:t }; }
function locationAllowed(raw:string|undefined,target:string,routes:readonly string[]|undefined):boolean {
  if (!raw) return true;
  try { const a=new URL(raw), b=new URL(target); if(a.origin!==b.origin) return false; return !routes?.length || routes.some(x=>new RegExp(`^${x.replace(/[.+?^${}()|[\]\\]/g,"\\$&").replace(/\*/g,".*")}$`).test(a.pathname)); } catch { return false; }
}

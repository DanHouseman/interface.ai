import { capabilityArtifactSchema, type CapabilityArtifact, type CapabilityStep, type Target } from "../artifact/capability-schema.js";
import type { DiscoveryRequest, DiscoveryResult } from "./discovery-contracts.js";

export class CapabilityCompiler {
  public compile(request: DiscoveryRequest, result: Extract<DiscoveryResult,{disposition:"SUCCESS"}>): CapabilityArtifact {
    const targets = new Map<string, Target>();
    const steps: CapabilityStep[] = [];
    for (const event of result.trace) {
      if (event.kind !== "DECISION" || event.decision.kind !== "act") continue;
      const d=event.decision; if(d.target) targets.set(d.target.id,d.target);
      steps.push({ id:`step-${steps.length+1}`, description:d.rationale, action:{ type:d.actionType, effect:d.effect, ...(d.target?{targetId:d.target.id}:{}), ...(d.value!==undefined?{value:{kind:"literal",value:d.value}}:{}) }, preconditions:[], postconditions:[], recovery:{retry:{allowed:d.effect==="read"||d.effect==="reversible_write",maxAttempts:1,backoffMs:100},onFailure:"intervene",reconciliationRequiredAfterAmbiguousCommit:d.effect==="irreversible_write"||d.effect==="privileged"}, humanApprovalRequired:d.effect==="irreversible_write"||d.effect==="privileged" });
    }
    if (!steps.length) throw new Error("Cannot compile a discovery with no actions.");
    const lastObservation=[...result.trace].reverse().find(x=>x.kind==="OBSERVATION");
    const successText=lastObservation?.kind==="OBSERVATION" ? lastObservation.observation.visibleText?.[0] : undefined;
    return capabilityArtifactSchema.parse({schemaVersion:"1.0",capability:{id:slug(request.goal),name:request.goal,version:"1.0.0",description:`Discovered capability: ${request.goal}`},application:{family:request.applicationFamily,surface:"browser",compatibilityTags:[]},provenance:{discoveryRunId:request.runId,createdAt:new Date().toISOString(),compilerVersion:"0.1.0"},contract:{inputs:[],outputs:[],businessOutcomes:[]},policy:{permittedTargets:[new URL(request.target).origin],permittedRoutes:[...(request.permittedRoutes??[])],permittedActionTypes:[...new Set(steps.map(x=>x.action.type))]},targets:[...targets.values()],steps,successCheckpoint:{id:"discovery-final-state",description:"Observed terminal state from successful discovery",all:successText?[{kind:"text_visible",text:successText}]:[{kind:"session_state",state:"active"}]}});
  }
}
function slug(v:string):string { return v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"discovered-capability"; }

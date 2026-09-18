import type { JsonValue } from "../domain/contracts.js";
import type { EvidenceReference, Observation, SurfaceAdapter } from "../surface/surface-adapter.js";

export interface InterventionRequest { readonly id:string; readonly invocationId:string; readonly capabilityId:string; readonly stepId?:string; readonly reason:string; readonly observation:Observation; readonly evidence:EvidenceReference; }
export interface HumanActionRecord { readonly timestamp:string; readonly operatorId:string; readonly description:string; readonly metadata?:Readonly<Record<string,JsonValue>>; }
export interface InterventionRouter { route(request:InterventionRequest):Promise<void>; waitForResume(interventionId:string):Promise<{operatorId:string;actions:readonly HumanActionRecord[]}>; }

export class HumanHandoffCoordinator {
  public constructor(private readonly surface:SurfaceAdapter, private readonly router:InterventionRouter) {}
  public async intervene(input:{invocationId:string;capabilityId:string;stepId?:string;reason:string}) {
    const observation=await this.surface.observe(); const evidence=await this.surface.captureEvidence(`intervention:${input.reason}`);
    await this.surface.pause();
    const request:InterventionRequest={id:`int-${input.invocationId}-${Date.now()}`,...input,observation,evidence};
    await this.router.route(request);
    const human=await this.router.waitForResume(request.id);
    await this.surface.resume();
    const owner=await this.surface.getSessionOwner(), state=await this.surface.getSessionState();
    if(owner!=="automation"||state!=="active") throw new Error("CONTROL_TRANSFER_FAILED");
    return {request,human,resumedObservation:await this.surface.observe()};
  }
}

export class InMemoryInterventionRouter implements InterventionRouter {
  public readonly requests:InterventionRequest[]=[]; private responses=new Map<string,{operatorId:string;actions:readonly HumanActionRecord[]}>();
  public async route(r:InterventionRequest){this.requests.push(r);}
  public resolve(id:string,operatorId:string,actions:readonly HumanActionRecord[]=[]){this.responses.set(id,{operatorId,actions});}
  public async waitForResume(id:string){const r=this.responses.get(id); if(!r) return {operatorId:"demo-operator",actions:[]}; return r;}
}

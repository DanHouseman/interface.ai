import { describe, expect, it } from "vitest";
import { DiscoveryEngine, CapabilityCompiler, FakeSurfaceAdapter, HumanHandoffCoordinator, InMemoryInterventionRouter } from "../src/index.js";
import type { DiscoveryModel } from "../src/index.js";

describe("discovery vertical slice",()=>{
 it("discovers and compiles a deterministic capability",async()=>{
  const surface=new FakeSurfaceAdapter(new Set(["search"])); let n=0;
  const model:DiscoveryModel={async decide(){n++; return n===1?{kind:"act",rationale:"Search member",actionType:"type",effect:"read",target:{id:"search",description:"Member search",strategies:[{kind:"label",text:"Member ID",exact:true}]},value:"12345"}:{kind:"complete",rationale:"Goal reached",outputs:{member:"12345"}};}};
  const req={runId:"d1",goal:"look up member",target:"https://demo.invalid/member-search",applicationFamily:"demo",maxSteps:4,timeoutMs:5000,permittedRoutes:["/member-search"]};
  const result=await new DiscoveryEngine(surface,model).run(req); expect(result.disposition).toBe("SUCCESS");
  if(result.disposition!=="SUCCESS") throw new Error("unexpected");
  const artifact=new CapabilityCompiler().compile(req,result); expect(artifact.steps).toHaveLength(1); expect(artifact.provenance.discoveryRunId).toBe("d1");
 });
 it("blocks discovery when the surface leaves authority",async()=>{
  const surface=new FakeSurfaceAdapter(); surface.setObservation({location:"https://evil.invalid/"});
  const model:DiscoveryModel={async decide(){return {kind:"complete",rationale:"done"};}};
  const result=await new DiscoveryEngine(surface,model).run({runId:"d2",goal:"x",target:"https://demo.invalid/",applicationFamily:"demo",maxSteps:1,timeoutMs:1000});
  expect(result.disposition).toBe("FAILURE"); if(result.disposition!=="SUCCESS") expect(result.code).toBe("POLICY_DENIED");
 });
});
describe("human handoff",()=>{it("cedes and reacquires the same adapter session",async()=>{const surface=new FakeSurfaceAdapter();const router=new InMemoryInterventionRouter();const out=await new HumanHandoffCoordinator(surface,router).intervene({invocationId:"i1",capabilityId:"c1",reason:"approval"});expect(router.requests).toHaveLength(1);expect(await surface.getSessionOwner()).toBe("automation");expect(out.resumedObservation.location).toContain("demo.invalid");});});

import { describe, expect, it } from "vitest";
import { capabilityArtifactSchema, type CapabilityArtifact } from "../src/artifact/capability-schema.js";
import type { ExecutionContext, JsonValue } from "../src/domain/contracts.js";
import { ConfigurablePolicyEvaluator } from "../src/policy/policy-evaluator.js";
import { DeterministicReplayEngine } from "../src/replay/replay-engine.js";
import { FakeSurfaceAdapter } from "../src/surface/fake-surface-adapter.js";

function artifact(action: CapabilityArtifact["steps"][number]["action"] = {type:"wait",effect:"read",value:{kind:"literal",value:0}}): CapabilityArtifact {
  return capabilityArtifactSchema.parse({schemaVersion:"1.0",capability:{id:"x",name:"x",version:"1",description:"x"},application:{family:"x",surface:"browser",compatibilityTags:[]},provenance:{discoveryRunId:"r",createdAt:"2026-09-17T00:00:00.000Z",compilerVersion:"1"},contract:{inputs:[{name:"value",type:"string",required:false,sensitive:false,description:"value"}],outputs:[],businessOutcomes:[]},policy:{permittedTargets:["https://demo.invalid"],permittedRoutes:[],permittedActionTypes:[action.type]},targets:[{id:"t",description:"t",strategies:[{kind:"selector",selector:"#t"}],requireUniqueMatch:true}],steps:[{id:"s",description:"s",action,preconditions:[],postconditions:[],recovery:{retry:{allowed:false,maxAttempts:0,backoffMs:0},onFailure:"fail",reconciliationRequiredAfterAmbiguousCommit:false},humanApprovalRequired:false}],successCheckpoint:{id:"ok",description:"ok",all:[{kind:"session_state",state:"active"}]}});
}
function context(inputs: Readonly<Record<string, JsonValue>> = {}): ExecutionContext { return {invocationId:"i",capabilityId:"x",capabilityVersion:"1",inputs}; }
async function replay(a: CapabilityArtifact, c=context(), surface=new FakeSurfaceAdapter(new Set(["t"]))) { return {result:await new DeterministicReplayEngine(surface,new ConfigurablePolicyEvaluator()).replay(a,c),surface}; }

describe("replay invocation and action edge cases", () => {
  it.each([
    ["capability mismatch", {...context(),capabilityId:"wrong"}, "CAPABILITY_MISMATCH"],
    ["undeclared input", context({extra:"x"}), "UNDECLARED_INPUT"],
  ])("rejects %s", async (_name,c,code) => expect((await replay(artifact(),c)).result.code).toBe(code));

  it("rejects missing and incorrectly typed required inputs", async () => {
    const a=artifact(); a.contract.inputs[0]!.required=true;
    expect((await replay(a)).result.code).toBe("MISSING_INPUT");
    expect((await replay(a,context({value:3}))).result.code).toBe("INVALID_INPUT_TYPE");
  });

  it("handles inactive sessions", async () => {
    for (const state of ["paused","unknown"] as const) { const s=new FakeSurfaceAdapter(); s.setSessionState(state); const {result}=await replay(artifact(),context(),s); expect(result.code).toBe("SESSION_NOT_ACTIVE"); }
  });

  it("reports target resolution and target declaration failures", async () => {
    const a=artifact({type:"click",effect:"read",targetId:"t"});
    expect((await replay(a,context(),new FakeSurfaceAdapter(new Set(["other"])))).result.code).toBe("TARGET_RESOLUTION_FAILED");
    const malformed=structuredClone(a); malformed.steps[0]!.action.targetId="missing";
    expect((await replay(malformed)).result.code).toBe("TARGET_UNDECLARED");
  });

  it.each(["click","read","submit"] as const)("requires a target for %s", async type => {
    const a=artifact({type,effect:"read"}); expect((await replay(a)).result.code).toBe("TARGET_REQUIRED");
  });

  it.each(["type","select"] as const)("requires target and string value for %s", async type => {
    expect((await replay(artifact({type,effect:"reversible_write",value:{kind:"literal",value:"x"}}))).result.code).toBe("TARGET_REQUIRED");
    expect((await replay(artifact({type,effect:"reversible_write",targetId:"t",value:{kind:"literal",value:3}}))).result.code).toBe("STRING_VALUE_REQUIRED");
    expect((await replay(artifact({type,effect:"reversible_write",targetId:"t",value:{kind:"input",input:"value"}}),context({value:"ok"}))).result.disposition).toBe("SUCCESS");
  });

  it("validates navigate, wait, and custom action values", async () => {
    expect((await replay(artifact({type:"navigate",effect:"read",value:{kind:"literal",value:1}}))).result.code).toBe("STRING_VALUE_REQUIRED");
    expect((await replay(artifact({type:"wait",effect:"read",value:{kind:"literal",value:-1}}))).result.code).toBe("WAIT_DURATION_REQUIRED");
    expect((await replay(artifact({type:"custom",effect:"read"}))).result.code).toBe("CUSTOM_ACTION_REQUIRED");
    const custom=artifact({type:"custom",effect:"read",customAction:"x",targetId:"t",value:{kind:"literal",value:{a:true}}});
    expect((await replay(custom)).result.disposition).toBe("SUCCESS");
  });

  it("returns nonrecoverable failures and exhausted recoverable failures according to onFailure", async () => {
    const a=artifact(); const s=new FakeSurfaceAdapter(); s.queueActionResult({ok:false,error:{code:"HARD",message:"hard",recoverable:false}});
    expect((await replay(a,context(),s)).result).toMatchObject({disposition:"FAILURE",code:"HARD"});
    const b=artifact(); b.steps[0]!.recovery.onFailure="intervene"; b.steps[0]!.recovery.retry={allowed:true,maxAttempts:1,backoffMs:1};
    const s2=new FakeSurfaceAdapter(); s2.queueActionResult({ok:false,error:{code:"TEMP",message:"temp",recoverable:true}}); s2.queueActionResult({ok:false,error:{code:"TEMP",message:"temp",recoverable:true}});
    expect((await replay(b,context(),s2)).result).toMatchObject({disposition:"INTERVENTION_REQUIRED",code:"TEMP"});
  });

  it("fails postconditions and final success checkpoints", async () => {
    const a=artifact(); a.steps[0]!.postconditions=[{id:"post",description:"post",all:[{kind:"text_visible",text:"never"}]}];
    expect((await replay(a)).result.code).toBe("POSTCONDITION_FAILED");
    const b=artifact(); b.successCheckpoint={id:"final",description:"final",all:[{kind:"text_visible",text:"never"}]};
    expect((await replay(b)).result.code).toBe("SUCCESS_CHECKPOINT_FAILED");
  });

  it("reconciles ambiguous commits only when every postcondition proves committed state", async () => {
    const a=artifact(); a.steps[0]!.action.effect="irreversible_write"; a.steps[0]!.recovery.reconciliationRequiredAfterAmbiguousCommit=true; a.steps[0]!.postconditions=[{id:"post",description:"post",all:[{kind:"text_visible",text:"never"}]}];
    const s=new FakeSurfaceAdapter(); s.queueActionResult({ok:false,error:{code:"LOST",message:"lost",recoverable:true,ambiguousCommit:true}});
    expect((await replay(a,context(),s)).result.code).toBe("UNKNOWN_COMMIT_STATE");
  });

  it("extracts adapter-signal outputs only when present and skips missing target outputs", async () => {
    const a=artifact(); a.contract.outputs=[{name:"signal",type:"string",required:false,sensitive:false,description:"signal",source:{adapterSignal:"balance"}},{name:"missing",type:"string",required:false,sensitive:false,description:"missing",source:{targetId:"not-declared"}}];
    const {result}=await replay(a); expect(result.outputs).toEqual({signal:"$123.45"});
  });
});

import { describe, expect, it } from "vitest";
import { capabilityArtifactSchema } from "../src/artifact/capability-schema.js";
import { ConfigurablePolicyEvaluator } from "../src/policy/policy-evaluator.js";
import { evaluateCheckpoint } from "../src/replay/checkpoint-evaluator.js";
import { FakeSurfaceAdapter } from "../src/surface/fake-surface-adapter.js";
import type { ExecutionContext } from "../src/domain/contracts.js";

function artifact() {
  return capabilityArtifactSchema.parse({
    schemaVersion:"1.0", capability:{id:"x",name:"x",version:"1",description:"x"}, application:{family:"x",surface:"browser",compatibilityTags:[]}, provenance:{discoveryRunId:"r",createdAt:"2026-09-17T00:00:00.000Z",compilerVersion:"1"}, contract:{inputs:[],outputs:[],businessOutcomes:[]}, policy:{permittedTargets:["https://demo.invalid", "https://fallback.invalid"],permittedRoutes:["/member/*"],permittedActionTypes:["click"]}, targets:[{id:"present",description:"present",strategies:[{kind:"selector",selector:"#present"}],requireUniqueMatch:true}], steps:[{id:"s",description:"s",action:{type:"click",effect:"read",targetId:"present"},preconditions:[],postconditions:[],recovery:{retry:{allowed:false,maxAttempts:0,backoffMs:0},onFailure:"fail",reconciliationRequiredAfterAmbiguousCommit:false},humanApprovalRequired:false}], successCheckpoint:{id:"ok",description:"ok",all:[{kind:"session_state",state:"active"}]}
  });
}
const context: ExecutionContext = { invocationId:"i", capabilityId:"x", capabilityVersion:"1", inputs:{} };

describe("checkpoint edge cases", () => {
  it("evaluates every predicate kind and reports expected/observed state", async () => {
    const a = artifact();
    const surface = new FakeSurfaceAdapter(new Set(["present"]));
    surface.setObservation({ location:"https://demo.invalid/member/42", title:"Member 42", visibleText:["Hello Member"], signals:{ ready:{value:true} } });
    const result = await evaluateCheckpoint(a, { id:"all",description:"all",all:[
      {kind:"url_matches",pattern:"demo\\.invalid/member/42"}, {kind:"title_matches",pattern:"Member \\d+"}, {kind:"text_visible",text:"Hello"}, {kind:"target_present",targetId:"present"}, {kind:"session_state",state:"active"}, {kind:"adapter_signal",name:"ready",expected:{value:true}}, {kind:"adapter_signal",name:"missing"}
    ]}, surface);
    expect(result.passed).toBe(true);
    expect(result.expected).toHaveLength(7);
    expect(result.observed).toHaveLength(7);
  });

  it("fails safely for invalid regex, missing values, undeclared and unresolved targets, signal mismatch and session mismatch", async () => {
    const a=artifact(); const surface=new FakeSurfaceAdapter(new Set());
    surface.setObservation({ location:"", title:"", visibleText:[], signals:{answer:1} });
    surface.setSessionState("paused");
    const result=await evaluateCheckpoint(a,{id:"bad",description:"bad",all:[
      {kind:"url_matches",pattern:"["},{kind:"title_matches",pattern:"["},{kind:"text_visible",text:"no"},{kind:"target_present",targetId:"undeclared"},{kind:"target_present",targetId:"present"},{kind:"session_state",state:"active"},{kind:"adapter_signal",name:"answer",expected:2}
    ]},surface);
    expect(result.passed).toBe(false);
    expect(result.observed.join(" ")).toContain("url:");
    expect(result.observed.join(" ")).toContain("undeclared");
    expect(result.observed.join(" ")).toContain("target:present:selector");
  });
});

describe("policy edge cases", () => {
  it("denies disallowed action types before location checks", () => {
    const a=artifact(); a.steps[0]!.action.type="read";
    const d=new ConfigurablePolicyEvaluator().evaluate({artifact:a,step:a.steps[0]!,context,observation:{surfaceKind:"browser",timestamp:"x",location:"not a url",signals:{}}});
    expect(d.code).toBe("ACTION_TYPE_NOT_ALLOWED");
  });

  it("denies malformed locations", () => {
    const a=artifact(); const d=new ConfigurablePolicyEvaluator().evaluate({artifact:a,step:a.steps[0]!,context,observation:{surfaceKind:"browser",timestamp:"x",location:"not a url",signals:{}}});
    expect(d.code).toBe("TARGET_NOT_ALLOWED");
  });

  it("supports exact origin fallback and wildcard routes", () => {
    const a=artifact(); a.policy.permittedTargets=["https://demo.invalid"];
    const d=new ConfigurablePolicyEvaluator().evaluate({artifact:a,step:a.steps[0]!,context,observation:{surfaceKind:"browser",timestamp:"x",location:"https://demo.invalid/member/a/b",signals:{}}});
    expect(d.disposition).toBe("ALLOW");
  });

  it("allows observations without a location", () => {
    const a=artifact(); const d=new ConfigurablePolicyEvaluator().evaluate({artifact:a,step:a.steps[0]!,context,observation:{surfaceKind:"browser",timestamp:"x",signals:{}}});
    expect(d.disposition).toBe("ALLOW");
  });
});

describe("remaining checkpoint and policy branches", () => {
  it("records declared targets that fail resolution", async () => {
    const a = artifact();
    const surface = new FakeSurfaceAdapter(new Set(["different-target"]));
    const result = await evaluateCheckpoint(a, {
      id: "missing-target",
      description: "missing target",
      all: [{ kind: "target_present", targetId: "present" }],
    }, surface);
    expect(result.passed).toBe(false);
    expect(result.observed[0]).toContain("target:present:unresolved:Target not found: present");
  });

  it("stringifies non-Error target resolution failures", async () => {
    const a = artifact();
    const surface = new FakeSurfaceAdapter(new Set(["present"]));
    surface.resolve = async () => { throw "non-error-resolution-failure"; };
    const result = await evaluateCheckpoint(a, {
      id: "non-error",
      description: "non error",
      all: [{ kind: "target_present", targetId: "present" }],
    }, surface);
    expect(result.passed).toBe(false);
    expect(result.observed[0]).toContain("non-error-resolution-failure");
  });

  it("uses the origin fallback for non-hierarchical URL schemes", () => {
    const a = artifact();
    a.policy.permittedTargets = ["null"];
    a.policy.permittedRoutes = [];
    const decision = new ConfigurablePolicyEvaluator().evaluate({
      artifact: a,
      step: a.steps[0]!,
      context,
      observation: { surfaceKind: "browser", timestamp: "x", location: "foo:bar", signals: {} },
    });
    expect(decision.disposition).toBe("ALLOW");
  });
});

import { describe, expect, it } from "vitest";
import { capabilityArtifactSchema } from "../src/artifact/capability-schema.js";
import { EvidenceRedactor } from "../src/evidence/redactor.js";

function artifact() {
  return capabilityArtifactSchema.parse({
    schemaVersion:"1.0", capability:{id:"x",name:"x",version:"1",description:"x"}, application:{family:"x",surface:"browser",compatibilityTags:[]}, provenance:{discoveryRunId:"r",createdAt:"2026-09-17T00:00:00.000Z",compilerVersion:"1"},
    contract:{inputs:[{name:"secret",type:"string",required:true,sensitive:true,description:"secret"},{name:"public",type:"string",required:false,sensitive:false,description:"public"}],outputs:[],businessOutcomes:[]},
    policy:{permittedTargets:["https://x.invalid"],permittedRoutes:[],permittedActionTypes:["wait"]}, targets:[], steps:[{id:"s",description:"s",action:{type:"wait",effect:"read",value:{kind:"literal",value:0}},preconditions:[],postconditions:[],recovery:{retry:{allowed:false,maxAttempts:0,backoffMs:0},onFailure:"fail",reconciliationRequiredAfterAmbiguousCommit:false},humanApprovalRequired:false}], successCheckpoint:{id:"ok",description:"ok",all:[{kind:"session_state",state:"active"}]}
  });
}

describe("EvidenceRedactor", () => {
  it("redacts sensitive values recursively while preserving primitives", () => {
    const redactor = new EvidenceRedactor(artifact(), { secret: { nested: ["alpha", 42, true, null] }, public: "alpha" });
    expect(redactor.redact({ text:"alpha 42 true", number:7, bool:false, nil:null, list:["alpha", {x:"42"}] })).toEqual({ text:"[REDACTED] [REDACTED] [REDACTED]", number:7, bool:false, nil:null, list:["[REDACTED]", {x:"[REDACTED]"}] });
  });

  it("redacts secret-shaped keys regardless of declared inputs", () => {
    const redactor = new EvidenceRedactor(artifact(), {});
    expect(redactor.redact({ password:"p", api_key:"k", sessionId:"s", authorization:"a", cookie:"c", safe:"ok" })).toEqual({ password:"[REDACTED]", api_key:"[REDACTED]", sessionId:"[REDACTED]", authorization:"[REDACTED]", cookie:"[REDACTED]", safe:"ok" });
    expect(redactor.redactString("unchanged")).toBe("unchanged");
  });
});

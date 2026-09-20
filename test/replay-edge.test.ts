import { describe, expect, it, vi } from "vitest";
import { artifact, context, surface } from "./helpers.js";
import { DeterministicReplayEngine } from "../src/replay/replay-engine.js";
import { ConfigurablePolicyEvaluator } from "../src/policy/policy-evaluator.js";
import type { CapabilityArtifact } from "../src/artifact/capability-schema.js";
import type { JsonValue } from "../src/domain/contracts.js";
import { FakeSurfaceAdapter } from "../src/surface/fake-surface-adapter.js";

const replay = (a = artifact(), s = surface(), c = context(), options = {}) => new DeterministicReplayEngine(s, new ConfigurablePolicyEvaluator()).replay(a, c, options);
const output = (type: CapabilityArtifact["contract"]["outputs"][number]["type"] = "string", source = { adapterSignal: "balance" }) => ({ name: "answer", type, required: true, sensitive: false, description: "Output", source });
const checkpoint = (text = "done") => ({ id: "post", description: "Postcondition", all: [{ kind: "text_visible" as const, text }] });

// Milestone 6-8 | Assignment §3.2-3.4 | REQ-RPL-001..004, REQ-OUT-001..005
// Regression cases from the assessment assert caller-visible behavior and zero side effects.
describe("replay boundary regressions", () => {
  it("rejects malformed artifacts and invalid invocation before any surface access", async () => {
    const s = surface(), observe = vi.spyOn(s, "observe"), evidence = vi.spyOn(s, "captureEvidence");
    const a = artifact(); a.steps[0]!.action = { type: "click", effect: "read", targetId: "unknown" };
    expect((await replay(a, s)).code).toBe("EXECUTION_FAILED");
    expect((await replay(artifact(), s, { ...context(), capabilityId: "wrong" })).code).toBe("CAPABILITY_MISMATCH");
    expect((await replay(artifact(), s, { ...context(), capabilityVersion: "wrong" })).code).toBe("CAPABILITY_MISMATCH");
    expect((await replay(artifact(), s, { ...context(), inputs: { extra: 1 } })).code).toBe("UNDECLARED_INPUT");
    expect(observe).not.toHaveBeenCalled(); expect(evidence).not.toHaveBeenCalled();
  });
  it("validates required, optional, wrong-type and nonfinite inputs", async () => {
    const a = artifact(); a.contract.inputs = [{ name: "value", type: "number", required: true, sensitive: false, description: "Value" }];
    expect((await replay(a)).code).toBe("MISSING_INPUT");
    for (const value of ["x", NaN, Infinity]) expect((await replay(a, surface(), { ...context(), inputs: { value } })).code).toBe("INVALID_INPUT_TYPE");
    a.contract.inputs[0]!.required = false;
    expect((await replay(a)).code).toBe("SUCCESS");
  });
  it.each(["paused", "unknown", "expired"] as const)("stops in %s sessions", async state => {
    const s = surface(); s.setSessionState(state);
    expect((await replay(artifact(), s)).disposition).toBe("INTERVENTION_REQUIRED"); expect(s.actions).toHaveLength(0);
  });
  it("rejects simultaneous invocations and restores the run lock after errors", async () => {
    const s = surface(); let resolve!: () => void;
    vi.spyOn(s, "execute").mockImplementationOnce(() => new Promise(yes => { resolve = () => yes({ ok: true }); }));
    const engine = new DeterministicReplayEngine(s, new ConfigurablePolicyEvaluator());
    const first = engine.replay(artifact(), context()); await vi.waitFor(() => expect(resolve).toBeDefined());
    expect((await engine.replay(artifact(), context())).code).toBe("RUN_CONFLICT"); resolve(); await first;
    vi.spyOn(s, "observe").mockRejectedValueOnce("lost page");
    expect((await engine.replay(artifact(), context())).code).toBe("EXECUTION_FAILED");
    expect((await engine.replay(artifact(), context())).code).toBe("SUCCESS");
  });
  it("blocks a navigation destination and policy changes before a retry", async () => {
    const a = artifact(); a.steps[0]!.action = { type: "navigate", effect: "read", value: { kind: "literal", value: "https://outside.invalid" } };
    const s = surface(); expect((await replay(a, s)).code).toBe("POLICY_DENIED"); expect(s.actions).toHaveLength(0);
    const b = artifact(); b.steps[0]!.recovery.retry = { allowed: true, maxAttempts: 1, backoffMs: 0 };
    vi.spyOn(s, "execute").mockImplementationOnce(async () => { s.setObservation({ location: "https://outside.invalid" }); return { ok: false, error: { code: "TEMP", message: "retry", recoverable: true } }; });
    expect((await replay(b, s)).code).toBe("POLICY_DENIED");
  });
  it.each(["click", "read", "submit", "type", "select", "navigate", "custom"] as const)("materializes %s with declared targets and inputs", async type => {
    const a = artifact(); a.steps[0]!.action = { type, effect: "read", targetId: "t", customAction: "demo", value: { kind: "literal", value: "https://demo.invalid/member-search" } };
    const c = { ...context(), authorization: { approvedStepIds: ["s"] } };
    const s = surface(); expect((await replay(a, s, c)).code).toBe("SUCCESS"); expect(s.actions[0]!.type).toBe(type);
  });
  it("supports custom actions without optional target/value", async () => {
    const a = artifact(); a.steps[0]!.action = { type: "custom", effect: "privileged", customAction: "demo" };
    expect((await replay(a, surface(), { ...context(), authorization: { approvedStepIds: ["s"] } })).code).toBe("SUCCESS");
  });
  it("rejects missing typed input values and invalid wait input values", async () => {
    for (const type of ["type", "select", "wait"] as const) {
      const a = artifact(); a.contract.inputs = [{ name: "value", type: "number", required: false, sensitive: false, description: "Value" }];
      a.steps[0]!.action = { type, effect: "read", targetId: "t", value: { kind: "input", input: "value" } };
      expect((await replay(a)).code).toBe(type === "wait" ? "WAIT_DURATION_REQUIRED" : "STRING_VALUE_REQUIRED");
      expect((await replay(a, surface(), { ...context(), inputs: { value: -1 } })).disposition).toBe("FAILURE");
      if (type === "wait") expect((await replay(a, surface(), { ...context(), inputs: { value: 30001 } })).code).toBe("WAIT_DURATION_REQUIRED");
    }
  });
  it("captures target resolution failures", async () => {
    const a = artifact(); a.steps[0]!.action = { type: "click", effect: "read", targetId: "t" };
    expect((await replay(a, new FakeSurfaceAdapter(new Set(["other"])))).code).toBe("TARGET_RESOLUTION_FAILED");
  });
  it("classifies session expiration during target resolution", async () => {
    const a = artifact(); a.steps[0]!.action = { type: "click", effect: "read", targetId: "t" };
    const s = surface(); vi.spyOn(s, "resolve").mockImplementationOnce(async () => { s.setSessionState("expired"); throw new Error("session expired during target resolution");});
    const result = await replay(a, s);
    expect(result.disposition).toBe("INTERVENTION_REQUIRED");
    expect(result.code).toBe("SESSION_EXPIRED");
    expect(s.actions).toHaveLength(0);
  });
  it.each(["fail", "intervene"] as const)("classifies nonrecoverable and exhausted failures with %s", async onFailure => {
    for (const recoverable of [true, false]) {
      const a = artifact(); a.steps[0]!.recovery.onFailure = onFailure;
      const s = surface(); s.queueActionResult({ ok: false, error: { code: "TEST", message: "failed", recoverable } });
      const r = await replay(a, s); expect(r.code).toBe("TEST");
      expect(r.disposition).toBe(onFailure === "intervene" ? "INTERVENTION_REQUIRED" : recoverable ? "RECOVERABLE" : "FAILURE");
    }
  });
  it("handles failed actions with no error and bounded retries", async () => {
    const s = surface(); s.queueActionResult({ ok: false }); expect((await replay(artifact(), s)).code).toBe("ACTION_FAILED");
    const a = artifact(); a.steps[0]!.recovery.retry = { allowed: true, maxAttempts: 1, backoffMs: 1 };
    for (let i = 0; i < 2; i++) s.queueActionResult({ ok: false, error: { code: "TEMP", message: "temporary", recoverable: true } });
    expect((await replay(a, s)).disposition).toBe("RECOVERABLE"); expect(s.actions).toHaveLength(3);
  });
  it("never retries a risky failure even if the adapter omits ambiguousCommit", async () => {
    const a = artifact(); a.steps[0]!.action.effect = "irreversible_write"; a.steps[0]!.recovery = { retry: { allowed: true, maxAttempts: 3, backoffMs: 0 }, onFailure: "intervene", reconciliationRequiredAfterAmbiguousCommit: true };
    const s = surface(); s.queueActionResult({ ok: false, error: { code: "TIMEOUT", message: "possibly committed", recoverable: true } });
    expect((await replay(a, s, { ...context(), authorization: { approvedStepIds: ["s"] } })).code).toBe("UNKNOWN_COMMIT_STATE"); expect(s.actions).toHaveLength(1);
  });
  it.each([true, false])("reconciles ambiguous commits with postcondition=%s", async committed => {
    const a = artifact(); a.steps[0]!.postconditions = [checkpoint(), checkpoint("also")];
    const s = surface(); s.setObservation({ visibleText: committed ? ["done also"] : ["other"] });
    s.queueActionResult({ ok: false, error: { code: "LOST", message: "lost", recoverable: true, ambiguousCommit: true } });
    expect((await replay(a, s)).code).toBe(committed ? "SUCCESS" : "UNKNOWN_COMMIT_STATE"); expect(s.actions).toHaveLength(1);
  });
  it("prioritizes immediate and delayed business outcomes over success postconditions", async () => {
    for (const delayed of [false, true]) {
      const a = artifact(); a.steps[0]!.postconditions = [checkpoint()];
      a.contract.businessOutcomes = [{ code: "MISSING", description: "missing", checkpoint: checkpoint("missing") }];
      const s = surface(); let reads = 0;
      vi.spyOn(s, "observe").mockImplementation(async () => ({ surfaceKind: "browser", timestamp: "now", location: "https://demo.invalid", visibleText: [++reads >= (delayed ? 6 : 4) ? "missing" : "waiting"], signals: {} }));
      expect((await replay(a, s)).disposition).toBe("BUSINESS_OUTCOME");
    }
  });
  it("recognizes a business outcome after a target-resolution wait", async () => {
    const a = artifact(); a.steps[0]!.action = { type: "click", effect: "read", targetId: "t" }; a.contract.businessOutcomes = [{ code: "MISSING", description: "missing", checkpoint: checkpoint("missing") }];
    const s = surface(); vi.spyOn(s, "resolve").mockImplementation(async () => { s.setObservation({ visibleText: ["missing"] }); throw Error("no target"); });
    expect((await replay(a, s)).code).toBe("MISSING");
  });
  it("reports postcondition and final checkpoint failures", async () => {
    const a = artifact(); a.steps[0]!.postconditions = [checkpoint()]; expect((await replay(a)).code).toBe("POSTCONDITION_FAILED");
    a.steps[0]!.postconditions = []; a.successCheckpoint = checkpoint(); expect((await replay(a)).code).toBe("SUCCESS_CHECKPOINT_FAILED");
  });
});

// Milestone 6 | Assignment §3.2-3.3 | REQ-ART-001, REQ-RPL-003
describe("typed output contract", () => {
  it.each([[undefined, true, "MISSING_OUTPUT"], [undefined, false, "SUCCESS"], [42, true, "INVALID_OUTPUT_TYPE"], ["ok", true, "SUCCESS"]] as const)("handles value=%s required=%s", async (value, required, code) => {
    const a = artifact(); a.contract.outputs = [{ ...output(), required }]; const s = surface(); s.setObservation({ signals: value === undefined ? {} : { balance: value } });
    expect((await replay(a, s)).code).toBe(code);
  });
  it.each([["number", 42], ["boolean", true], ["array", [1]], ["object", { x: 1 }]] as const)("returns a valid %s output", async (type, value) => {
    const a = artifact(); a.contract.outputs = [output(type)]; const s = surface(); s.setObservation({ signals: { balance: value as JsonValue } });
    expect((await replay(a, s)).outputs).toEqual({ answer: value });
  });
  it.each([null, NaN, Infinity])("rejects invalid numeric output %s", async value => {
    const a = artifact(); a.contract.outputs = [output("number")]; const s = surface(); s.setObservation({ signals: { balance: value } }); expect((await replay(a, s)).code).toBe("INVALID_OUTPUT_TYPE");
  });
  it("enforces extraction policy and read errors", async () => {
    const a = artifact(); a.contract.outputs = [{ ...output(), source: { targetId: "t" } }]; const policy = new ConfigurablePolicyEvaluator({ ...a.policy, permittedActionTypes: ["wait"] });
    expect((await new DeterministicReplayEngine(surface(), policy).replay(a, context())).code).toBe("OUTPUT_POLICY_DENIED");
    const s = surface(); s.queueActionResult({ ok: true }); s.queueActionResult({ ok: false }); expect((await replay(a, s)).code).toBe("OUTPUT_READ_FAILED");
    s.queueActionResult({ ok: true }); s.queueActionResult({ ok: true }); expect((await replay(a, s)).code).toBe("MISSING_OUTPUT");
  });
});

// Milestone 10 | Assignment §3.6 | REQ-HITL-003
describe("verified continuation", () => {
  it("retries only the blocked step following an explicit handback", async () => {
    const a = artifact(); a.steps[0]!.humanApprovalRequired = true;
    const s = surface(); const r = await replay(a, s, context(), { intervene: async () => ({ decision: "retry", approved: true }) });
    expect(r.code).toBe("SUCCESS"); expect(s.actions).toHaveLength(1); expect(r.trace.some(x => x.kind === "HANDOFF")).toBe(true);
  });
  it("does not implicitly approve a denied action", async () => {
    const a = artifact(); a.steps[0]!.humanApprovalRequired = true;
    expect((await replay(a, surface(), context(), { intervene: async () => ({ decision: "retry", approved: false }) })).code).toBe("POLICY_DENIED");
  });
  it.each([true, false])("verifies human-completed postconditions (%s)", async verified => {
    const a = artifact(); a.steps[0]!.humanApprovalRequired = true; a.steps[0]!.postconditions = [checkpoint(verified ? "Member Search" : "missing")];
    const r = await replay(a, surface(), { ...context(), authorization: { approvedStepIds: ["another"] } }, { intervene: async () => ({ decision: "complete", approved: true }) });
    expect(r.code).toBe(verified ? "SUCCESS" : "RESUME_CHECKPOINT_FAILED");
  });
  it("refuses a retry handback for an uncertain commit", async () => {
    const s = surface(); s.queueActionResult({ ok: false, error: { code: "LOST", message: "lost", recoverable: true, ambiguousCommit: true } });
    expect((await replay(artifact(), s, context(), { intervene: async () => ({ decision: "retry", approved: false }) })).code).toBe("UNKNOWN_COMMIT_STATE"); expect(s.actions).toHaveLength(1);
  });
});

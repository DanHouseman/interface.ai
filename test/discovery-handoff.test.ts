import { describe, expect, it, vi } from "vitest";
import { DiscoveryEngine } from "../src/discovery/discovery-engine.js";
import { CapabilityCompiler } from "../src/discovery/capability-compiler.js";
import type { DiscoveryDecision, DiscoveryRequest, DiscoveryResult } from "../src/discovery/discovery-contracts.js";
import { HumanHandoffCoordinator, InMemoryInterventionRouter, type InterventionRequest } from "../src/hitl/intervention.js";
import { FakeSurfaceAdapter } from "../src/surface/fake-surface-adapter.js";
import { request } from "./helpers.js";

const complete: DiscoveryDecision = { kind: "complete", rationale: "Done" };
const act = (actionType: "type" | "select" | "click" | "read" | "wait" | "submit" | "custom" | "navigate", targetId?: string, value?: string | number): DiscoveryDecision => ({ kind: "act", actionType, rationale: "Next action", ...(targetId ? { targetId } : {}), ...(value !== undefined ? { value } : {}) });
function discoverySurface() { const s = new FakeSurfaceAdapter(); s.setObservation({ location: "https://demo.invalid/", visibleText: ["Member Search", "Ready"] }); return s; }
function model(decisions: DiscoveryDecision[]) { let index = 0; return { decide: vi.fn(async () => decisions[index++] ?? complete) }; }
async function discover(decisions: DiscoveryDecision[], req: DiscoveryRequest = request(), s = discoverySurface()) {const m = model(decisions); const result = await new DiscoveryEngine(s, m).run(req); return { result, s, m }; }
function withAuthorization(req: DiscoveryRequest): DiscoveryRequest {
  return { ...req, authorization: { approvedStepIds: ["discovery-1"] } } as unknown as DiscoveryRequest;
}
function malformedRequest(patch: Record<string, unknown>): DiscoveryRequest {
  return { ...request(), ...patch } as unknown as DiscoveryRequest;
}

// Milestone 5, 7, 11 | Assignment §3.1-3.4 | REQ-DISC-001..004
describe("guarded discovery and compilation", () => {
  it("compiles only successful executed actions, preserves contracts and input bindings", async () => {
    const req = request(), s = discoverySurface(); s.queueActionResult({ ok: false, error: { code: "SLOW", message: "slow", recoverable: true } });
    const { result } = await discover([act("wait", undefined, 0), act("type", "member"), complete], req, s);
    expect(result.disposition).toBe("SUCCESS");
    const artifact = new CapabilityCompiler().compile(req, result as Extract<DiscoveryResult, { disposition: "SUCCESS" }>);
    expect(artifact.steps).toHaveLength(1); expect(artifact.steps[0]!.action.value).toEqual({ kind: "input", input: "memberId" });
    expect(artifact.contract).toEqual(req.specification.contract); expect(artifact.policy).toEqual(req.specification.policy);
    expect(JSON.stringify(artifact)).not.toContain("DEMO-001"); expect(result.trace.some(x => x.kind === "POLICY")).toBe(true);
    expect(s.actions[1]).toMatchObject({ type: "type", value: "DEMO-001" });
  });
  it.each(["click", "read", "type", "select", "wait", "navigate", "submit"] as const)("executes a host-authorized %s", async type => {
    const req = request(); const key = type === "navigate" || type === "wait" ? type : "balance";
    req.specification.grants = { [key]: { actionTypes: [type], effect: "read" } };
    req.specification.policy.permittedActionTypes.push("navigate", "submit", "select");
    const target = key === type ? undefined : key;
    const value = type === "wait" ? 0 : type === "navigate" ? "https://demo.invalid/" : "x";
    const r = await discover([act(type, target, value), complete], withAuthorization(req));
    expect(r.result.disposition).toBe("SUCCESS"); expect(r.s.actions[0]!.type).toBe(type);
  });
  it("rejects provider-invented selectors and ungranted or unknown actions", async () => {
    expect((await discover([act("click", "unapproved")])).result).toMatchObject({ code: "ACTION_TYPE_NOT_ALLOWED" });
    expect((await discover([act("click", "member")])).result).toMatchObject({ code: "ACTION_TYPE_NOT_ALLOWED" });
    const invalid = { ...act("click", "find"), target: { selector: "#evil" } } as unknown as DiscoveryDecision;
    expect((await discover([invalid])).result).toMatchObject({ code: "DISCOVERY_FAILED" });
  });
  it("blocks entry points, missing locations and observed routes outside authority", async () => {
    expect((await discover([complete], { ...request(), target: "https://outside.invalid/" })).result).toMatchObject({ code: "POLICY_DENIED" });
    for (const location of ["https://outside.invalid/", ""]) {
      const s = discoverySurface(); s.setObservation({ location }); const { result, m } = await discover([complete], request(), s);
      expect(result).toMatchObject({ code: "POLICY_DENIED" }); expect(m.decide).not.toHaveBeenCalled();
    }
  });
  it("blocks a proposed destination, action type, or risky effect before execution", async () => {
    let req = request(); req.specification.grants = { navigate: { actionTypes: ["navigate"], effect: "read" } }; req.specification.policy.permittedActionTypes.push("navigate");
    let r = await discover([act("navigate", undefined, "https://outside.invalid/")], req); expect(r.result).toMatchObject({ code: "TARGET_NOT_ALLOWED" }); expect(r.s.actions).toHaveLength(0);
    req = request(); req.specification.policy.permittedActionTypes = ["read"];
    expect((await discover([act("click", "find")], req)).result).toMatchObject({ code: "ACTION_TYPE_NOT_ALLOWED" });
    req = request(); req.specification.grants = { find: { actionTypes: ["click"], effect: "irreversible_write" } };
    r = await discover([act("click", "find")], req); expect(r.result).toMatchObject({ code: "APPROVAL_REQUIRED", disposition: "INTERVENTION_REQUIRED" }); expect(r.s.actions).toHaveLength(0);
 });
  it("blocks a granted action when its host precondition is not met", async () => {
    const s = discoverySurface(); s.setObservation({ visibleText: ["Waiting for operator"] });
    expect((await discover([act("click", "find")], request(), s)).result).toMatchObject({ code: "PRECONDITION_FAILED" }); expect(s.actions).toHaveLength(0);
  });
  it("uses independent goal verification and honors stuck, bounds and invalid requests", async () => {
    const req = request(); req.specification.successCheckpoint.all = [{ kind: "text_visible", text: "never" }];
    expect((await discover([complete], req)).result).toMatchObject({ code: "GOAL_NOT_VERIFIED" });
    expect((await discover([{ kind: "stuck", rationale: "Need human" }])).result).toMatchObject({ code: "DISCOVERY_STUCK" });
    expect((await discover([act("wait", undefined, 0)], { ...request(), maxSteps: 1 })).result).toMatchObject({ code: "MAX_STEPS" });
    for (const bounds of [{ maxSteps: 0 }, { maxSteps: 1.5 }, { timeoutMs: 0 }, { timeoutMs: Infinity }]) {
      expect((await discover([complete], { ...request(), ...bounds })).result).toMatchObject({ code: "INVALID_REQUEST" });
    }
  });
  it("aborts a stalled model and blocks concurrent discovery", async () => {
    let signal!: AbortSignal;
    const s = discoverySurface(); const engine = new DiscoveryEngine(s, { decide: async input => { signal = input.signal; return await new Promise(() => {}); } });
    const first = engine.run({ ...request(), timeoutMs: 20 });
    expect(await engine.run(request())).toMatchObject({ code: "RUN_CONFLICT" });
    expect(await first).toMatchObject({ code: "DISCOVERY_TIMEOUT" }); expect(signal.aborted).toBe(true); expect(s.actions).toHaveLength(0);
  });
  it("never acts on a late model result after timeout", async () => {
    let resolve!: (d: DiscoveryDecision) => void; const s = discoverySurface();
    const engine = new DiscoveryEngine(s, { decide: async () => await new Promise(yes => { resolve = yes; }) });
    const result = await engine.run({ ...request(), timeoutMs: 10 }); expect(result).toMatchObject({ code: "DISCOVERY_TIMEOUT" });
    resolve(act("click", "find")); await new Promise(yes => setTimeout(yes, 5)); expect(s.actions).toHaveLength(0);
  });
  it("rejects unavailable custom actions and non-string input bindings", async () => {
    const req = request(); req.specification.policy.permittedActionTypes.push("custom"); req.specification.grants = { custom: { actionTypes: ["custom"], effect: "read" } };
    expect((await discover([act("custom")], withAuthorization(req))).result).toMatchObject({ code: "INVALID_MODEL_ACTION" });
    expect((await discover([act("type", "member")], malformedRequest({ inputs: {} }))).result).toMatchObject({ code: "INVALID_MODEL_ACTION" });
  });
  it.each([undefined, { code: "HARD", message: "hard", recoverable: false }, { code: "LOST", message: "lost", recoverable: true, ambiguousCommit: true }])("escalates unsafe action failure %s", async error => {
    const s = discoverySurface(); s.queueActionResult({ ok: false, ...(error ? { error } : {}) });
    expect((await discover([act("click", "find")], request(), s)).result.disposition).toBe("INTERVENTION_REQUIRED");
  });
  it("does not retry a failed reversible write; evidence errors stay secondary", async () => {
    const s = discoverySurface(); s.queueActionResult({ ok: false, error: { code: "TEMP", message: "failure", recoverable: true } }); s.failEvidenceCapture();
    const { result } = await discover([act("type", "member")], request(), s);
    expect(result.disposition).toBe("INTERVENTION_REQUIRED"); expect(s.actions).toHaveLength(1); expect(result.trace.some(x => x.kind === "EVIDENCE_FAILURE")).toBe(true);
  });
  it("rejects empty, mismatched and sensitive literal compilation", async () => {
    const req = request(); const { result } = await discover([complete], req); const success = result as Extract<DiscoveryResult, { disposition: "SUCCESS" }>;
    expect(() => new CapabilityCompiler().compile({ ...req, runId: "other" }, success)).toThrow("DISCOVERY_RUN_MISMATCH");
    expect(() => new CapabilityCompiler().compile(req, success)).toThrow("no successful actions");
    req.specification.inputBindings = {}; req.specification.grants = { member: { actionTypes: ["type"], effect: "reversible_write" } };
    const literal = await discover([act("type", "member", "DEMO-001"), complete], req);
    expect(() => new CapabilityCompiler().compile(req, literal.result as Extract<DiscoveryResult, { disposition: "SUCCESS" }>)).toThrow("SENSITIVE_ARTIFACT_LITERAL");
 });
});

const interventionRequest: InterventionRequest = { id: "r", invocationId: "i", capabilityId: "c", reason: "approval", observation: { surfaceKind: "browser", timestamp: "now", signals: {} }, evidence: { id: "e", kind: "snapshot", metadata: {} } };
// Milestone 10 | Assignment §3.6 | REQ-HITL-000..003
describe("explicit human handback", () => {
  it("waits for a real response and preserves same-session context", async () => {
    const s = discoverySurface(), router = new InMemoryInterventionRouter(), coordinator = new HumanHandoffCoordinator(s, router);
    const running = coordinator.intervene({ invocationId: "i", capabilityId: "c", reason: "approval" }, o => o.visibleText?.includes("Ready") === true);
    await vi.waitFor(() => expect(router.requests).toHaveLength(1)); expect(await s.getSessionOwner()).toBe("human");
    await expect(coordinator.intervene({ invocationId: "i", capabilityId: "c", reason: "duplicate" }, () => true)).rejects.toThrow("INTERVENTION_CONFLICT");
    s.setObservation({ visibleText: ["Ready"] }); router.resolve(router.requests[0]!.id, "operator", [{ timestamp: "now", operatorId: "operator", description: "Released session" }]);
    const done = await running; expect(done.human.actions).toHaveLength(1); expect(await s.getSessionOwner()).toBe("automation");
  });
  it("leaves the session paused on verification failure", async () => {
    const s = discoverySurface(); const coordinator = new HumanHandoffCoordinator(s, { async route() {}, async waitForResume() { return { operatorId: "human", actions: [] }; } });
    await expect(coordinator.intervene({ invocationId: "i", capabilityId: "c", reason: "x" }, () => false)).rejects.toThrow("RESUME_CHECKPOINT_FAILED");
    expect(await s.getSessionOwner()).toBe("human");
  });
  it.each(["owner", "state"])("detects failed %s restoration", async kind => {
    const s = discoverySurface(); vi.spyOn(s, "resume").mockImplementation(async () => { if (kind === "state") { await FakeSurfaceAdapter.prototype.resume.call(s); s.setSessionState("unknown"); } });
    const coordinator = new HumanHandoffCoordinator(s, { async route() {}, async waitForResume() { return { operatorId: "human", actions: [] }; } });
    await expect(coordinator.intervene({ invocationId: "i", capabilityId: "c", reason: "x" }, () => true)).rejects.toThrow("CONTROL_TRANSFER_FAILED");
  });
  it("rejects duplicate, unknown, invalid and repeated handbacks", async () => {
    const router = new InMemoryInterventionRouter(); await router.route(interventionRequest);
    await expect(router.route(interventionRequest)).rejects.toThrow("DUPLICATE_INTERVENTION");
    expect(() => router.resolve("r", " ")).toThrow("OPERATOR_REQUIRED"); expect(() => router.resolve("missing", "human")).toThrow("UNKNOWN_OR_SETTLED");
    router.resolve("r", "human"); expect(() => router.resolve("r", "human")).toThrow("UNKNOWN_OR_SETTLED");
    expect((await router.waitForResume("r")).actions).toEqual([]); await expect(router.waitForResume("r")).rejects.toThrow("UNKNOWN_INTERVENTION");
  });
  it("supports explicit cancellation without resuming", async () => {
    const router = new InMemoryInterventionRouter(); await router.route(interventionRequest);
    const wait = router.waitForResume("r"); const assertion = expect(wait).rejects.toThrow("INTERVENTION_CANCELLED"); router.cancel("r"); await assertion;
  });
});

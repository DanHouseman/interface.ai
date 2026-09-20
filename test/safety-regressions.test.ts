import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifact, context, surface } from "./helpers.js";
import { capabilityArtifactSchema } from "../src/artifact/capability-schema.js";
import { parseCapabilityArtifact } from "../src/artifact/load-capability.js";
import { ConfigurablePolicyEvaluator, evaluateLocation } from "../src/policy/policy-evaluator.js";
import { EvidenceRedactor } from "../src/evidence/redactor.js";
import { JsonFileEvidenceStore } from "../src/evidence/evidence-store.js";
import { writeRunBundle } from "../src/evidence/run-bundle.js";
import { evaluateCheckpoint } from "../src/replay/checkpoint-evaluator.js";
import type { CapabilityArtifact } from "../src/artifact/capability-schema.js";

// Milestone 3 + 7 | Assignment §3.2, §3.4 | REQ-ART-003, REQ-POL-000..003
describe("whole-artifact integrity and host authority", () => {
  it.each([
    (a: CapabilityArtifact) => { a.targets.push(a.targets[0]!); },
    (a: CapabilityArtifact) => { a.steps.push(a.steps[0]!); },
    (a: CapabilityArtifact) => { a.policy.permittedActionTypes = ["wait"]; a.contract.outputs = [{ name: "o", type: "string", required: true, sensitive: false, description: "o", source: { targetId: "t" } }]; },
    (a: CapabilityArtifact) => { a.contract.inputs = [0, 1].map(() => ({ name: "i", type: "string", required: true, sensitive: false, description: "i" })); },
    (a: CapabilityArtifact) => { a.contract.outputs = [0, 1].map(() => ({ name: "o", type: "string", required: true, sensitive: false, description: "o", source: { targetId: "t" } })); },
    (a: CapabilityArtifact) => { a.contract.businessOutcomes = [0, 1].map(() => ({ code: "OUTCOME", description: "outcome", checkpoint: a.successCheckpoint })); },
    (a: CapabilityArtifact) => { a.successCheckpoint.all = [{ kind: "target_present", targetId: "unknown" }]; },
    (a: CapabilityArtifact) => { a.successCheckpoint.all = [{ kind: "target_value_equals_input", targetId: "t", input: "unknown" }]; },
    (a: CapabilityArtifact) => { a.contract.outputs = [{ name: "o", type: "string", required: true, sensitive: false, description: "o", source: {} }]; },
    (a: CapabilityArtifact) => { a.contract.outputs = [{ name: "o", type: "string", required: true, sensitive: false, description: "o", source: { targetId: "unknown", adapterSignal: "x" } }]; },
    (a: CapabilityArtifact) => { a.steps[0]!.action = { type: "click", effect: "read" }; },
    (a: CapabilityArtifact) => { a.steps[0]!.action = { type: "type", targetId: "t", effect: "read" }; },
    (a: CapabilityArtifact) => { a.steps[0]!.action = { type: "type", targetId: "t", effect: "read", value: { kind: "literal", value: 3 } }; },
    (a: CapabilityArtifact) => { a.steps[0]!.action = { type: "custom", effect: "read" }; },
    (a: CapabilityArtifact) => { a.steps[0]!.action.value = { kind: "literal", value: "bad" }; },
    (a: CapabilityArtifact) => { a.steps[0]!.action.value = { kind: "literal", value: -1 }; },
    (a: CapabilityArtifact) => { a.steps[0]!.action.value = { kind: "literal", value: 30001 }; },
  ])("rejects invalid graph/action before execution (%#)", mutate => {
    const a = artifact(); mutate(a); expect(capabilityArtifactSchema.safeParse(a).success).toBe(false);
  });
  it("reports root-level parse errors without losing their path", () => {
    expect(() => parseCapabilityArtifact(null)).toThrow("artifact:");
    const a = artifact(); a.steps[0]!.action.effect = "privileged"; a.steps[0]!.recovery.retry.allowed = true;
    expect(capabilityArtifactSchema.safeParse(a).success).toBe(false);
  });
  it("checks schemes, credentials, malformed allowlists and route globs", () => {
    const policy = artifact().policy;
    for (const location of ["relative", "file:///tmp/a", "https://user:secret@demo.invalid", "https://outside.invalid"]) expect(evaluateLocation(location, policy)?.disposition).toBe("DENY");
    expect(evaluateLocation("https://demo.invalid", { ...policy, permittedTargets: ["bad"] })?.code).toBe("TARGET_NOT_ALLOWED");
    expect(evaluateLocation("https://demo.invalid/a.b", { ...policy, permittedRoutes: ["/a.b"] })).toBeUndefined();
    expect(evaluateLocation("https://demo.invalid/axb", { ...policy, permittedRoutes: ["/a.b"] })?.code).toBe("ROUTE_NOT_ALLOWED");
  });
  it("intersects the host policy and handles browser vs nonbrowser locations", async () => {
    const a = artifact(), s = surface(), c = context();
    const request = { artifact: a, step: a.steps[0]!, context: c, observation: await s.observe() };
    expect(new ConfigurablePolicyEvaluator({ ...a.policy, permittedActionTypes: ["read"] }).evaluate(request).code).toBe("ACTION_TYPE_NOT_ALLOWED");
    const { location: _, ...noLocation } = request.observation;
    expect(new ConfigurablePolicyEvaluator().evaluate({ ...request, observation: { ...noLocation, surfaceKind: "terminal" } }).disposition).toBe("ALLOW");
    a.steps[0]!.action = { type: "navigate", effect: "read" };
    expect(new ConfigurablePolicyEvaluator().evaluate(request).code).toBe("TARGET_NOT_ALLOWED");
    a.steps[0]!.action.value = { kind: "input", input: "url" }; c.inputs = { url: "https://demo.invalid" };
    expect(new ConfigurablePolicyEvaluator().evaluate(request).disposition).toBe("ALLOW");
  });
});

// Milestone 9 | Assignment §3.4-3.5 | REQ-EVD-003, REQ-POL-004
describe("persistence canaries", () => {
  it("redacts outputs, numeric and boolean values, embedded keys and overlapping strings", () => {
    const a = artifact(); a.contract.inputs = [{ name: "id", type: "number", required: false, sensitive: true, description: "id" }];
    a.contract.outputs = [{ name: "balance", type: "object", required: true, sensitive: true, description: "balance", source: { adapterSignal: "x" } }];
    const r = new EvidenceRedactor(a, { id: 12345 }, { balance: { a: "canary", b: "canary-long", c: true, empty: "", nil: null, list: [9876] } });
    expect(r.redact({ id: 12345, copy: 12345, nested: { balance: "private" }, flag: true })).toEqual({ id: "[REDACTED]", copy: "[REDACTED]", nested: { balance: "[REDACTED]" }, flag: "[REDACTED]" });
    expect(r.redactString("canary-long Bearer abc sk-test-canary token=abc&x=1")).toBe("[REDACTED] [REDACTED] [REDACTED] token=[REDACTED]&x=1");
    expect(r.redactString("9876")).toBe("[REDACTED]");
  });
  it("sanitizes run bundles and refuses path traversal or overwriting", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bundle-test-")); const a = artifact();
    await writeRunBundle(directory, a, {}, {}, { log: { token: "canary", safe: 1 } });
    expect(await readFile(join(directory, "log.json"), "utf8")).not.toContain("canary");
    await expect(writeRunBundle(directory, a, {}, {}, { "../escape": {} })).rejects.toThrow("INVALID_EVIDENCE_NAME");
    await expect(writeRunBundle(directory, a, {}, {}, { log: {} })).rejects.toThrow();
  });
  it("supports the default evidence store and sanitizes invocation filenames", async () => {
    const c = { ...context(), invocationId: "test/unsafe" };
    const path = await new JsonFileEvidenceStore().persist(artifact(), c, { disposition: "SUCCESS", code: "SUCCESS", message: "done", outputs: {}, trace: [] });
    expect(path).toContain("test_unsafe.json");
  });
});

// Milestone 6 + 8 | Assignment §3.3 | REQ-RPL-003, REQ-OUT-003
describe("checkpoint waiting and input-specific truth", () => {
  it("waits for delayed observations without replaying an action", async () => {
    const a = artifact(), s = surface(); let reads = 0;
    const observe = s.observe.bind(s); vi.spyOn(s, "observe").mockImplementation(async () => ({ ...await observe(), visibleText: [++reads > 1 ? "ready" : "waiting"] }));
    expect((await evaluateCheckpoint(a, { id: "x", description: "x", all: [{ kind: "text_visible", text: "ready" }], timeoutMs: 100 }, s)).passed).toBe(true); expect(s.actions).toHaveLength(0);
  });
  it("times out a condition and handles absent properties", async () => {
    const s = surface(); vi.spyOn(s, "observe").mockResolvedValue({ surfaceKind: "browser", timestamp: "now", signals: {} });
    for (const predicate of [{ kind: "url_matches", pattern: "exists" }, { kind: "title_matches", pattern: "exists" }, { kind: "text_visible", text: "exists" }, { kind: "adapter_signal", name: "missing" }] as const) {
      expect((await evaluateCheckpoint(artifact(), { id: "x", description: "x", all: [predicate], timeoutMs: 1 }, s)).passed).toBe(false);
    }
  });
  it.each(["expected", "different", undefined])("binds observed target values to invocation input %s", async input => {
    const s = surface(); s.queueActionResult({ ok: true, observedValue: "expected" });
    const checkpoint = { id: "x", description: "x", all: [{ kind: "target_value_equals_input" as const, targetId: "t", input: "id" }] };
    expect((await evaluateCheckpoint(artifact(), checkpoint, s, input === undefined ? {} : { id: input })).passed).toBe(input === "expected");
    s.queueActionResult({ ok: false }); expect((await evaluateCheckpoint(artifact(), checkpoint, s, { id: "expected" })).passed).toBe(false);
  });
  it("records unresolved targets including non-Error rejections", async () => {
    const s = surface(); vi.spyOn(s, "resolve").mockRejectedValue("lost handle");
    const r = await evaluateCheckpoint(artifact(), { id: "x", description: "x", all: [{ kind: "target_present", targetId: "t" }] }, s);
    expect(r.passed).toBe(false); expect(r.observed.join()).toContain("lost handle");
  });
});

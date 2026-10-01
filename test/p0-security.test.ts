import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { OpenAIDiscoveryModel } from "../src/discovery/openai-discovery-model.js";
import { DiscoveryEngine } from "../src/discovery/discovery-engine.js";
import { CapabilityCompiler } from "../src/discovery/capability-compiler.js";
import { parseCapabilityArtifact } from "../src/artifact/load-capability.js";
import { PlaywrightSurfaceAdapter } from "../src/surface/playwright-surface-adapter.js";
import { FakeSurfaceAdapter } from "../src/surface/fake-surface-adapter.js";
import { writeRunBundle } from "../src/evidence/run-bundle.js";
import { EvidenceRedactor } from "../src/evidence/redactor.js";
import type { JsonValue } from "../src/domain/contracts.js";
import type { ModelInput } from "../src/discovery/discovery-contracts.js";
import { DeterministicReplayEngine } from "../src/replay/replay-engine.js";
import { ConfigurablePolicyEvaluator } from "../src/policy/policy-evaluator.js";
import { evaluateCheckpoint } from "../src/replay/checkpoint-evaluator.js";
import { artifact as makeArtifact, request } from "./helpers.js";

const inputCanary = "SENSITIVE_MEMBER_CANARY_7F31A9";
const outputCanary = "SENSITIVE_BALANCE_CANARY_91C2EF";
const decision = { kind: "complete", rationale: "Verified" };
function data(): ModelInput {
  const r = request();
  return { ...r, observation: { surfaceKind: "browser", timestamp: "now", visibleText: [inputCanary], targetValues: { balance: null }, signals: {} }, history: [], inputs: { memberId: inputCanary }, signal: new AbortController().signal };
}
function response(patch: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ id: "resp-test", model: "test-model", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ decision }) }] }], ...patch }), { headers: { "x-request-id": "req-test" } });
}
async function scan(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await scan(path));
    else if (entry.isFile()) {
      const text = await readFile(path, "utf8");
      expect(text, path).not.toContain(inputCanary);
      expect(text, path).not.toContain(outputCanary);
      files.push(path);
    }
  }
  return files;
}

describe("P0 provider boundary (mock HTTP, never genuine provider evidence)", () => {
  it("excludes the input canary from the complete outbound body, including copied context", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response());
    const input = data();
    const model = new OpenAIDiscoveryModel("test-only", "test-model", transport);
    expect(await model.decide({ ...input, goal: `Find ${inputCanary}`, history: [{ kind: "DECISION", step: 1, decision: { kind: "stuck", rationale: inputCanary } }] })).toEqual(decision);
    const outboundRequest = JSON.parse(transport.mock.calls[0]![1]!.body as string);
    expect(JSON.stringify(outboundRequest).includes(inputCanary)).toBe(false);
    expect(outboundRequest.input[0].role).toBe("user");
    expect(outboundRequest.input[0].content[0]).toMatchObject({ type: "input_text", text: expect.stringContaining("JSON") });
    const context = JSON.parse(outboundRequest.input[0].content[1].text);
    expect(context.inputs).toEqual([{ name: "memberId", type: "string", present: true, hostBound: true, sensitive: true }]);
    expect(context.inputBindings).toEqual({ member: "memberId" });
    expect(context.targets).toContainEqual(expect.objectContaining({ id: "member" }));
    expect(context.grants.member.actionTypes).toEqual(["type"]);
    expect(model.calls).toMatchObject([{ responseId: "resp-test", requestId: "req-test", status: "completed", startedAt: expect.any(String), completedAt: expect.any(String) }]);
  });
  it.each([
    [{ status: "incomplete" }, "MODEL_UNUSABLE_RESPONSE"],
    [{ status: "failed" }, "MODEL_UNUSABLE_RESPONSE"],
    [{ id: "" }, "MODEL_INVALID_RESPONSE"],
    [{ status: undefined }, "MODEL_INVALID_RESPONSE"],
    [{ output: [{ type: "message", content: [{ type: "refusal", refusal: outputCanary }, { type: "output_text", text: JSON.stringify({ decision }) }] }] }, "MODEL_REFUSAL"],
    [{ output: [{ type: "message", content: [{ type: "output_text", text: "" }] }] }, "MODEL_UNUSABLE_RESPONSE"],
    [{ output: [{ type: "message", content: [{ type: "output_text" }] }] }, "MODEL_UNUSABLE_RESPONSE"],
    [{ output: [{ type: "message", content: [{ type: "output_text", text: outputCanary }] }] }, "MODEL_INVALID_DECISION"],
    [{ output: [{ type: "message", content: [{ type: "output_text", text: '{"kind":"complete","rationale":"x","grants":{}}' }] }] }, "MODEL_INVALID_DECISION"],
  ] as const)("rejects unusable provider output with a sanitized code", async (patch, code) => {
    const model = new OpenAIDiscoveryModel("test-only", "test-model", vi.fn<typeof fetch>().mockResolvedValue(response(patch)));
    await expect(model.decide(data())).rejects.toMatchObject({ code });
    expect(JSON.stringify(model.metadata())).not.toContain(outputCanary);
  });
  it("sanitizes transport and JSON errors, including cancellation while consuming a response", async () => {
    for (const transport of [vi.fn<typeof fetch>().mockRejectedValue(new Error(outputCanary)), vi.fn<typeof fetch>().mockResolvedValue(new Response(outputCanary))]) {
      await expect(new OpenAIDiscoveryModel("test-only", "test-model", transport).decide(data())).rejects.not.toThrow(outputCanary);
    }
    const controller = new AbortController();
    const transport = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error(outputCanary)))));
    const pending = new OpenAIDiscoveryModel("test-only", "test-model", transport).decide({ ...data(), signal: controller.signal });
    controller.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(new OpenAIDiscoveryModel("test-only", "test-model", transport).decide({ ...data(), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(transport).toHaveBeenCalledTimes(1);
    const late = new AbortController();
    const body = response(); vi.spyOn(body, "json").mockImplementation(async () => { late.abort(); return {}; });
    await expect(new OpenAIDiscoveryModel("test-only", "test-model", vi.fn<typeof fetch>().mockResolvedValue(body)).decide({ ...data(), signal: late.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("P0 evidence persistence boundary", () => {
  it.each(["complete", "stuck"] as const)("scans every file after %s with live browser canaries and empty discovered outputs", async kind => {
    const directory = await mkdtemp(join(tmpdir(), "p0-canary-"));
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route("https://demo.invalid/", route => route.fulfill({ contentType: "text/html", body: `<title>Member Search</title><p>Member Search</p><input id="member"><span id="balance">${outputCanary}</span><span>Public diagnostic</span>` }));
      await page.goto("https://demo.invalid/");
      const surface = new PlaywrightSurfaceAdapter(page, { evidenceDirectory: join(directory, "snapshots") });
      const transport = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(response({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ decision: { kind: "act", actionType: "type", targetId: "member", value: null, rationale: "Bind input" } }) }] }] }))
        .mockResolvedValueOnce(response({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ decision: { kind, rationale: "Host verifies" } }) }] }] }));
      const model = new OpenAIDiscoveryModel("test-only", "test-model", transport);
      const req = { ...request(), inputs: { memberId: inputCanary } };
      const result = await new DiscoveryEngine(surface, model).run(req);
      expect(result.disposition).toBe(kind === "complete" ? "SUCCESS" : "INTERVENTION_REQUIRED");
      expect(JSON.stringify(result)).toContain(outputCanary); // live/in-memory value really existed
      expect(await page.locator("#member").inputValue()).toBe(inputCanary); // binding remains host-owned
      for (const [, init] of transport.mock.calls) {
        expect(init!.body).not.toContain(inputCanary); expect(init!.body).not.toContain(outputCanary);
      }
      await surface.captureEvidence("test");
      const artifact = result.disposition === "SUCCESS" ? new CapabilityCompiler().compile(req, result) : null;
      await writeRunBundle(directory, req.specification, req.inputs, {}, {
        // Copies precede the observation intentionally: one-pass redaction is unsafe.
        errors: { message: `Failed ${outputCanary} ${inputCanary}`, [outputCanary]: "key copy" },
        manifest: { provider: model.metadata(), mode: "mock-provider-browser-test" },
        discovery: result as unknown as JsonValue, artifact: artifact as unknown as JsonValue,
      });
      const files = await scan(directory); expect(files.length).toBeGreaterThan(4);
      const persisted = await readFile(join(directory, "discovery.json"), "utf8");
      for (const event of JSON.parse(persisted).trace) {
        if (event.kind === "EVIDENCE") expect(JSON.parse(await readFile(event.evidence.path, "utf8"))).toHaveProperty("structure");
      }
      expect(persisted).not.toContain("Public diagnostic"); expect(persisted).toContain('"balance": "[REDACTED]"');
      if (artifact) expect(parseCapabilityArtifact(JSON.parse(await readFile(join(directory, "artifact.json"), "utf8"))).provenance.discoveryRunId).toBe(req.runId);
    } finally { await browser.close(); }
  });
  it.each([{ visibleText: [outputCanary] }, { title: outputCanary }, { signals: { controls: outputCanary } }])("refuses unclassified sensitive observations before creating any files", async observation => {
    const directory = await mkdtemp(join(tmpdir(), "p0-fail-closed-"));
    await expect(writeRunBundle(directory, request().specification, {}, {}, { observation: { surfaceKind: "browser", ...observation } })).rejects.toThrow("EVIDENCE_UNCLASSIFIED_SENSITIVE_OBSERVATION");
    expect(await readdir(directory)).toEqual([]);
  });
  it("registers sensitive signal/output/action values across payloads while retaining public outputs", () => {
    const spec = request().specification;
    spec.contract.outputs.push({ name: "signalOutput", type: "string", required: true, sensitive: true, description: "signal", source: { adapterSignal: "privateSignal" } });
    const redactor = new EvidenceRedactor(spec, {});
    const sanitized = redactor.sanitize({ earlierError: outputCanary, observation: { signals: { privateSignal: outputCanary, publicSignal: "Public" } }, trace: [{ kind: "ACTION", capabilityStep: { action: { targetId: "balance" } }, result: { ok: true, observedValue: outputCanary } }], outputs: { balance: outputCanary, ordinary: "Useful output" } });
    expect(JSON.stringify(sanitized)).not.toContain(outputCanary);
    expect(sanitized).toMatchObject({ outputs: { balance: "[REDACTED]", ordinary: "Useful output" } });
    const padded = new EvidenceRedactor(spec, {}).sanitize({ targetValues: { balance: `\n ${outputCanary} \r\n` }, textCopy: outputCanary });
    expect(JSON.stringify(padded)).not.toContain(outputCanary);
  });
  it("handles missing target data and malformed optional action results conservatively", async () => {
    const spec = request().specification;
    const fake = new FakeSurfaceAdapter();
    expect((await fake.observe(spec.targets)).targetValues!.member).toBeNull();
    for (const result of [null, [], "bad", {}, { observedValue: null }]) {
      expect(() => new EvidenceRedactor(spec, {}).sanitize({ kind: "ACTION", capabilityStep: { action: { targetId: "balance" } }, result })).not.toThrow();
    }
  });
});

// Audit F1: sensitive state must be safe even when replay never returns outputs.
describe("failed replay checkpoint privacy", () => {
  it.each(["wrong-type", "missing-output", "failed-checkpoint", "partial-output"] as const)("keeps browser canaries out of all files after %s", async scenario => {
    const directory = await mkdtemp(join(tmpdir(), "replay-canary-"));
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route("https://demo.invalid/", route => route.fulfill({ contentType: "text/html", body: `<p>Public diagnostic</p><span id="balance">${outputCanary}</span>` }));
      await page.goto("https://demo.invalid/");
      const surface = new PlaywrightSurfaceAdapter(page, { evidenceDirectory: join(directory, "snapshots") });
      const artifact = makeArtifact();
      artifact.targets = [{ id: "balance", description: "Private balance", requireUniqueMatch: true, strategies: [{ kind: "selector", selector: "#balance" }] }];
      artifact.contract.inputs = [{ name: "memberId", description: "Member", type: "string", required: true, sensitive: true }];
      artifact.contract.outputs = [{ name: "balance", description: "Balance", type: scenario === "wrong-type" ? "number" : "string", required: true, sensitive: true, source: { targetId: "balance" } }];
      artifact.successCheckpoint = { id: "done", description: "Public result", all: [{ kind: "text_visible", text: scenario === "failed-checkpoint" ? "Absent confirmation" : "Public diagnostic" }] };
      if (scenario === "partial-output") artifact.contract.outputs.push({ name: "later", description: "Missing later output", type: "string", sensitive: false, required: true, source: { adapterSignal: "absent" } });
      if (scenario === "missing-output") {
        const execute = surface.execute.bind(surface);
        vi.spyOn(surface, "execute").mockImplementation(action => action.type === "read" ? Promise.resolve({ ok: true }) : execute(action));
      }
      expect(await page.locator("#balance").innerText()).toBe(outputCanary);
      const result = await new DeterministicReplayEngine(surface, new ConfigurablePolicyEvaluator()).replay(artifact, {
        invocationId: "privacy", capabilityId: artifact.capability.id, capabilityVersion: artifact.capability.version, inputs: { memberId: inputCanary },
      });
      expect(result.disposition).toBe("FAILURE");
      expect(result.code).toBe(scenario === "wrong-type" ? "INVALID_OUTPUT_TYPE" : scenario === "failed-checkpoint" ? "SUCCESS_CHECKPOINT_FAILED" : "MISSING_OUTPUT");
      expect(result.outputs).toBeUndefined();
      expect(JSON.stringify(result.trace)).not.toContain(outputCanary);
      expect(JSON.stringify(result.trace)).toContain(scenario === "failed-checkpoint" ? "Absent confirmation" : "Public diagnostic");
      await writeRunBundle(directory, artifact, { memberId: inputCanary }, {}, { replay: result as unknown as JsonValue });
      expect((await scan(directory)).length).toBeGreaterThan(1);
    } finally { await browser.close(); }
  });
  it("redacts sensitive signals without changing the checkpoint boolean", async () => {
    const artifact = makeArtifact();
    artifact.contract.outputs = [{ name: "flag", description: "Private flag", type: "boolean", required: true, sensitive: true, source: { adapterSignal: "privateFlag" } }];
    const surface = new FakeSurfaceAdapter(); surface.setObservation({ signals: { privateFlag: false } });
    const evaluation = await evaluateCheckpoint(artifact, { id: "flag", description: "flag", all: [{ kind: "adapter_signal", name: "privateFlag", expected: true }] }, surface);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.observed).toEqual(["adapter_signal:privateFlag:matches:[REDACTED]"]);
  });
});

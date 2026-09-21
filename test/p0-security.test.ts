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
import { request } from "./helpers.js";

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
      expect(persisted).toContain("Public diagnostic"); expect(persisted).toContain('"balance": "[REDACTED]"');
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

import { describe, expect, it, vi } from "vitest";
import { OpenAIDiscoveryModel } from "../src/discovery/openai-discovery-model.js";
import { ScriptedDemoModel } from "../src/demo/scripted-model.js";
import { main } from "../src/demo/cli.js";
import { request, artifact } from "./helpers.js";
import type { ModelInput } from "../src/discovery/discovery-contracts.js";
import type { DemoOptions } from "../src/demo/run-demo.js";

function input(): ModelInput { const r = request(); return { goal: r.goal, observation: { surfaceKind: "browser", timestamp: "now", signals: {} }, history: [], specification: r.specification, inputs: r.inputs, signal: new AbortController().signal }; }
const response = (output: unknown) => new Response(JSON.stringify({ id: "response-1", model: "test-model", output }), { status: 200 });

// Milestone 5 | Assignment §3.1 | REQ-DISC-004
// Transport is always mocked. These tests never authenticate or contact a provider.
describe("OpenAI provider contract without API calls", () => {
  it("uses explicit configuration, abort propagation, no storage and parsed JSON decisions", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response([{ type: "reasoning" }, { type: "message", content: [{ type: "refusal" }, { type: "output_text" }, { type: "output_text", text: '{"kind":"complete","rationale":"Verified"}' }] }]));
    const model = new OpenAIDiscoveryModel("test-only-not-a-key", "test-model", transport); const data = input();
    expect(await model.decide(data)).toEqual({ kind: "complete", rationale: "Verified" });
    const [url, options] = transport.mock.calls[0]!; expect(url).toBe("https://api.openai.com/v1/responses"); expect(options!.signal).toBe(data.signal);
    expect(JSON.parse(options!.body as string)).toMatchObject({ store: false, model: "test-model", text: { format: { type: "json_object" } } });
    expect(model.calls).toEqual([{ responseId: "response-1", model: "test-model" }]);
    expect(model.metadata()).toMatchObject({ provider: "openai", calls: model.calls });
  });
  it.each([["", "model"], ["key", ""]])("rejects missing credentials/model without contacting the network", (key, model) => { expect(() => new OpenAIDiscoveryModel(key, model)).toThrow("required"); });
  it("reports only HTTP status on provider failure", async () => {
    const model = new OpenAIDiscoveryModel("test", "model", vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive canary", { status: 429 })));
    await expect(model.decide(input())).rejects.toThrow("MODEL_HTTP_429");
  });
  it.each([[], [{ type: "message" }], [{ type: "message", content: [{ type: "output_text", text: "not JSON" }] }], [{ type: "message", content: [{ type: "output_text", text: '{"kind":"invented"}' }] } ]].map(output => [output]))("rejects empty/refused/malformed decisions", async output => {
    await expect(new OpenAIDiscoveryModel("test", "model", vi.fn<typeof fetch>().mockResolvedValue(response(output))).decide(input())).rejects.toThrow();
  });
  it("offline fixture explicitly exhausts without a provider", async () => {
    const model = new ScriptedDemoModel(); for (let i = 0; i < 4; i++) await model.decide(); expect((await model.decide()).kind).toBe("stuck");
  });
});

// Milestone 13 | Assignment §6 | REQ-OPS-002/003
describe("credit-safe CLI", () => {
  const io = () => ({ log: vi.fn(), ask: vi.fn(async () => "resume") });
  const executor = () => vi.fn(async (_options: DemoOptions) => ({ directory: "/tmp/evidence", result: { disposition: "SUCCESS" as const, code: "SUCCESS", message: "done", trace: [] }, artifact: artifact() }));
  it.each([[], ["wrong"], ["discover"], ["offline", "--live"], ["replay"], ["handoff"], ["offline", "--port", "0"], ["offline", "--port", "70000"], ["offline", "--port", "NaN"]].map(args => [args]))("rejects unsafe or invalid command %j", async args => {
    const execute = executor(); await expect(main(args, {}, execute, io())).rejects.toThrow(); expect(execute).not.toHaveBeenCalled();
  });
  it("runs offline without keys and replay without a model", async () => {
    const execute = executor(); const terminal = io(); await main(["offline"], {}, execute, terminal);
    expect(execute.mock.calls[0]![0].model).toBeInstanceOf(ScriptedDemoModel);
    await main(["replay", "--artifact", "example.json", "--member", "DEMO-002"], {}, execute, terminal);
    expect(execute.mock.calls[1]![0]).toMatchObject({ artifactPath: "example.json", memberId: "DEMO-002", live: false }); expect(execute.mock.calls[1]![0].model).toBeUndefined(); expect(terminal.log).toHaveBeenCalledWith(expect.stringContaining("Evidence:"));
  });
  it("constructs a live model only with opt-in and configuration; does not call it", async () => {
    const execute = executor(); await expect(main(["discover", "--live"], {}, execute, io())).rejects.toThrow("required");
    await main(["discover", "--live"], { OPENAI_API_KEY: "test-only", MODEL_NAME: "test-model" }, execute, io()); expect(execute.mock.calls[0]![0].model).toBeInstanceOf(OpenAIDiscoveryModel);
  });
  it("requires explicit handback in the headed operator command", async () => {
    const terminal = io(); const execute = executor(); await main(["handoff", "--artifact", "example.json"], {}, execute, terminal);
    const operator = execute.mock.calls[0]![0].operator!;
    await operator({} as never, {} as never); expect(terminal.ask).toHaveBeenCalled();
    terminal.ask.mockResolvedValue("cancel"); await expect(operator({} as never, {} as never)).rejects.toThrow("INTERVENTION_CANCELLED");
  });
});

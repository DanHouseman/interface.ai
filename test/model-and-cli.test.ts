import { describe, expect, it, vi } from "vitest";
import { OpenAIDiscoveryModel } from "../src/discovery/openai-discovery-model.js";
import { ScriptedDemoModel } from "../src/demo/scripted-model.js";
import { main } from "../src/demo/cli.js";
import { request, artifact } from "./helpers.js";
import type { ModelInput } from "../src/discovery/discovery-contracts.js";
import type { DemoOptions } from "../src/demo/run-demo.js";
import { ExecutionError } from "../src/runtime/errors.js";

function input(): ModelInput { const r = request(); return { goal: r.goal, observation: { surfaceKind: "browser", timestamp: "now", signals: {}, targetValues: { balance: null } }, history: [], specification: r.specification, inputs: r.inputs, signal: new AbortController().signal }; }
const response = (output: unknown) => new Response(JSON.stringify({ id: "response-1", model: "test-model", status: "completed", output }), { status: 200 });

// Milestone 5 | Assignment §3.1 | REQ-DISC-004
// Transport is always mocked. These tests never authenticate or contact a provider.
describe("OpenAI provider contract without API calls", () => {
  it("uses explicit configuration, abort propagation, no storage and parsed JSON decisions", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response([{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: '{"decision":{"kind":"complete","rationale":"Verified"}}' }] }]));
    const model = new OpenAIDiscoveryModel("test-only-not-a-key", "test-model", transport); const data = input();
    expect(await model.decide(data)).toEqual({ kind: "complete", rationale: "Verified" });
    const [url, options] = transport.mock.calls[0]!; expect(url).toBe("https://api.openai.com/v1/responses"); expect(options!.signal).toBe(data.signal);
    expect(JSON.parse(options!.body as string)).toMatchObject({ store: false, model: "test-model", text: { format: { type: "json_schema", strict: true } } });
    expect(model.calls).toMatchObject([{ responseId: "response-1", model: "test-model", status: "completed" }]);
    expect(model.metadata()).toMatchObject({ provider: "openai", calls: model.calls });
  });
  it.each([["", "model"], ["key", ""]])("rejects missing credentials/model without contacting the network", (key, model) => { expect(() => new OpenAIDiscoveryModel(key, model)).toThrow("required"); });
  it.each([
    [{ kind: "act", rationale: "Bind", actionType: "type", targetId: "member", value: null }, { kind: "act", rationale: "Bind", actionType: "type", targetId: "member" }],
    [{ kind: "act", rationale: "Wait", actionType: "wait", targetId: null, value: 0 }, { kind: "act", rationale: "Wait", actionType: "wait", value: 0 }],
    [{ kind: "act", rationale: "Select", actionType: "select", targetId: "member", value: "public" }, { kind: "act", rationale: "Select", actionType: "select", targetId: "member", value: "public" }],
  ])("adapts only wire-format nulls while retaining host decision validation", async (decision, expected) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response([{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ decision }) }] }]));
    expect(await new OpenAIDiscoveryModel("test", "model", transport).decide(input())).toEqual(expected);
    const format = JSON.parse(transport.mock.calls[0]![1]!.body as string).text.format;
    expect(format).toMatchObject({ type: "json_schema", strict: true, schema: { type: "object", additionalProperties: false, required: ["decision"] } });
    expect(format.schema).not.toHaveProperty("anyOf");
    const variants = format.schema.properties.decision.anyOf;
    expect(variants).toHaveLength(3);
    for (const variant of variants) {
      expect(variant.additionalProperties).toBe(false);
      expect(variant.required.sort()).toEqual(Object.keys(variant.properties).sort());
    }
    expect(variants[0].properties.actionType.enum).toContain("type");
    expect(variants[0].properties.actionType.enum).not.toContain("click|type|select|read|navigate|wait");
  });
  it("reports only HTTP status on provider failure", async () => {
    const model = new OpenAIDiscoveryModel("test", "model", vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive canary", { status: 429 })));
    await expect(model.decide(input())).rejects.toMatchObject({ code: "MODEL_HTTP_429" });
  });
  it("requests strict structured decisions with an explicit input instruction", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, options) => {
      const body = JSON.parse(options!.body as string);
      expect(body.text.format.type).toBe("json_schema");
      expect(body.input).toEqual([{ role: "user", content: [
        { type: "input_text", text: expect.stringContaining("Return one JSON decision") },
        { type: "input_text", text: expect.any(String) },
      ] }]);
      expect(body.input[0].content[1].text).not.toMatch(/json/i);
      return response([{ type: "message", content: [{ type: "output_text", text: '{"decision":{"kind":"complete","rationale":"Verified"}}' }] }]);
    });
    await expect(new OpenAIDiscoveryModel("test", "model", transport).decide(input())).resolves.toEqual({ kind: "complete", rationale: "Verified" });
  });
  it("retains known API error codes/parameters without persisting echoed secrets", async () => {
    const canary = "SENSITIVE_PROVIDER_ERROR_CANARY";
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: {
      type: "invalid_request_error", code: "unsupported_value", param: "text.format.type", message: canary,
    } }), { status: 400 }));
    const model = new OpenAIDiscoveryModel("test", "model", transport);
    await expect(model.decide(input())).rejects.toMatchObject({ code: "MODEL_HTTP_400" });
    expect(model.calls).toMatchObject([{ error: { type: "invalid_request_error", code: "unsupported_value", param: "text.format.type" } }]);
    expect(JSON.stringify(model.metadata())).not.toContain(canary);
    transport.mockResolvedValue(new Response(JSON.stringify({ error: { type: canary, code: canary, param: canary, message: canary } }), { status: 400 }));
    await expect(model.decide(input())).rejects.toMatchObject({ code: "MODEL_HTTP_400" });
    expect(model.calls[1]).toMatchObject({ error: { type: null, code: null, param: null } });
    expect(JSON.stringify(model.metadata())).not.toContain(canary);
  });
  it.each(["credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "organization_usage_limit_exceeded", "slow_down"])("preserves the documented 429 cause %s without raw messages", async code => {
    const type = code === "slow_down" ? "rate_limit_error" : "insufficient_quota";
    const model = new OpenAIDiscoveryModel("test", "model", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { type, code, param: null, message: "SENSITIVE_BILLING_CANARY" } }), { status: 429 })));
    await expect(model.decide(input())).rejects.toMatchObject({ code: "MODEL_HTTP_429" });
    expect(model.calls).toMatchObject([{ error: { type, code, param: null } }]);
    expect(JSON.stringify(model.metadata())).not.toContain("SENSITIVE_BILLING_CANARY");
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
  it.each([new Error("raw error"), new ExecutionError("OTHER", "raw error"), new ExecutionError("DEMO_DISCOVERY_FAILED", "Sanitized failure: evidence/path")])("prints only the sanitized discovery failure envelope", async error => {
    const terminal = io(); const execute = executor().mockRejectedValue(error);
    await expect(main(["offline"], {}, execute, terminal)).rejects.toBe(error);
    if (error instanceof ExecutionError && error.code === "DEMO_DISCOVERY_FAILED") expect(terminal.log).toHaveBeenCalledWith(error.message);
    else expect(terminal.log).not.toHaveBeenCalled();
  });
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

import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeterministicReplayEngine } from "../src/replay/replay-engine.js";
import { ConfigurablePolicyEvaluator } from "../src/policy/policy-evaluator.js";
import { writeRunBundle } from "../src/evidence/run-bundle.js";
import { OpenAIDiscoveryModel } from "../src/discovery/openai-discovery-model.js";
import { artifact, context, request, surface } from "./helpers.js";
import { chromium } from "playwright";
import { PlaywrightSurfaceAdapter } from "../src/surface/playwright-surface-adapter.js";
import { HumanHandoffCoordinator } from "../src/hitl/intervention.js";
import { runDemo } from "../src/demo/run-demo.js";
import { ScriptedDemoModel } from "../src/demo/scripted-model.js";
import { recordHumanActions } from "../src/hitl/browser-recorder.js";
import { DiscoveryEngine } from "../src/discovery/discovery-engine.js";
import { evaluateCheckpoint } from "../src/replay/checkpoint-evaluator.js";
import { EvidenceRedactor } from "../src/evidence/redactor.js";
import { main } from "../src/demo/cli.js";

describe("assignment review regressions", () => {
  it("validates variant selection and prevents saved-artifact overrides", async () => {
    const execute = vi.fn();
    for (const args of [["offline", "--variant", "invalid"], ["replay", "--artifact", "file", "--variant", "legacy"], ["handoff", "--artifact", "file", "--variant", "standard"]]) await expect(main(args, {}, execute, { log() {}, async ask() { return "resume"; } })).rejects.toMatchObject({ code: "DEMO_CONFIGURATION" });
    execute.mockResolvedValue({ result: { disposition: "SUCCESS", code: "SUCCESS" }, directory: "test" });
    await main(["offline", "--variant", "legacy"], {}, execute, { log() {}, async ask() { return "resume"; } });
    expect(execute.mock.calls[0]![0].variant).toBe("legacy");
  });

  it.each([false, true])("discovery stops for a pending dialog and resumes only after handback: %s", async resume => {
    const s = surface(), req = request();
    s.setObservation({ location: "https://demo.invalid/", signals: { unexpectedDialog: true }, visibleText: ["Member Search"] });
    const model = { decide: vi.fn(async () => ({ kind: "complete" as const, rationale: "Verified" })) };
    const result = await new DiscoveryEngine(s, model).run(req, resume ? { intervene: async () => { s.setObservation({ signals: {} }); return "continue"; } } : {});
    expect(result.disposition).toBe(resume ? "SUCCESS" : "INTERVENTION_REQUIRED");
    expect(model.decide).toHaveBeenCalledTimes(resume ? 1 : 0);
  });

  it("prevents replay actions and success verification while a dialog is unresolved", async () => {
    const s = surface(); s.setObservation({ signals: { unexpectedDialog: true } });
    const result = await new DeterministicReplayEngine(s, new ConfigurablePolicyEvaluator()).replay(artifact(), context());
    expect(result.code).toBe("UNEXPECTED_DIALOG"); expect(s.actions).toHaveLength(0);
    await expect(evaluateCheckpoint(artifact(), artifact().successCheckpoint, s)).rejects.toMatchObject({ code: "UNEXPECTED_DIALOG" });
  });

  it("fails closed for malformed export fields and needs no page-derived vocabulary", () => {
    const minimal = { contract: { inputs: [], outputs: [], businessOutcomes: [] } };
    const redactor = new EvidenceRedactor(minimal, {});
    expect(redactor.sanitize({ goal: 42, rationale: null, targetValues: [], observation: { surfaceKind: "browser", signals: null } })).toEqual({ goal: "[OMITTED]", rationale: "[OMITTED]", targetValues: {}, observation: { surfaceKind: "browser", signals: {} } });
    const a = artifact(); a.targets[0]!.description = "123";
    const numeric = new EvidenceRedactor(a, {});
    expect(numeric.sanitize({ visibleText: "123", observation: { surfaceKind: "browser", signals: { owner: "invalid", session: "invalid" } } })).toMatchObject({ visibleText: [], observation: { signals: {} } });
    expect(numeric.sanitize({ visibleText: [42, "123"] })).toEqual({ visibleText: ["123"] });
  });

  it("classifies structural and accessible sensitive controls without trusting page text", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent('<label>Member<input value="PRIVATE_INPUT"></label><label>Selection<select aria-label="Selection"><option>PRIVATE_SELECT</option></select></label><label>Notes<textarea aria-label="Notes">PRIVATE_NOTES</textarea></label><button>Duplicate</button><button>Duplicate</button>');
      const adapter = new PlaywrightSurfaceAdapter(page);
      for (const [label, value] of [["Member", "PRIVATE_INPUT"], ["Selection", "PRIVATE_SELECT"], ["Notes", "PRIVATE_NOTES"]]) {
        const observed = await adapter.observe([{ id: "private", description: label!, requireUniqueMatch: true, strategies: [{ kind: "label", text: "Absent", exact: true }, { kind: "label", text: label!, exact: true }] }]);
        expect(observed.targetValues!.private).toBe(value);
      }
      const target = { id: "private", description: "Duplicate", requireUniqueMatch: true, strategies: [{ kind: "accessibility" as const, role: "button", name: "Duplicate", exact: true }] };
      await expect(adapter.observe([target])).rejects.toThrow("OBSERVATION_CLASSIFICATION_AMBIGUOUS");
      expect((await adapter.observe([{ ...target, requireUniqueMatch: false }])).targetValues!.private).toBe("Duplicate");
    } finally { await browser.close(); }
  });
  it("discovers and replays the no-ID legacy surface with changed inputs and structural targeting", async () => {
    const directory = await mkdtemp(join(tmpdir(), "legacy-demo-"));
    const model = new ScriptedDemoModel();
    const decide = vi.spyOn(model, "decide");
    const run = await runDemo({ directory, memberId: "DEMO-001", port: 0, scenario: "normal", live: false, variant: "legacy", model });
    expect(run.result.outputs).toEqual({ balance: "$123.45" });
    expect(run.artifact.targets.every(target => target.strategies.every(strategy => strategy.kind === "structural"))).toBe(true);
    const count = decide.mock.calls.length;
    const port = Number(new URL(run.artifact.policy.permittedTargets[0]!).port);
    for (const [memberId, scenario, code] of [["DEMO-002", "slow", "SUCCESS"], ["DEMO-999", "normal", "MEMBER_NOT_FOUND"], ["invalid", "normal", "INVALID_MEMBER_ID"], ["DEMO-001", "denied", "PERMISSION_DENIED"]]) {
      const replay = await runDemo({ directory, memberId: memberId!, port, scenario: scenario!, live: false, artifactPath: join(run.directory, "artifact.json") });
      expect(replay.result.code).toBe(code);
      if (code === "SUCCESS") expect(replay.result.outputs).toEqual({ balance: "$678.90" });
    }
    expect(decide.mock.calls.length).toBe(count);
  }, 20000);
  it.each(["type", "submit", "navigate", "wait", "delayed"])("latches %s dialogs until verified handback", async kind => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const adapter = new PlaywrightSurfaceAdapter(page);
      await page.setContent('<input id="entry" oninput="confirm(\'private prompt\')"><form id="form" onsubmit="event.preventDefault();confirm(\'private prompt\')">Submit form</form><button id="later" onclick="setTimeout(()=>confirm(\'private prompt\'),100)">Go</button>');
      const target = async (id: string) => adapter.resolve({ id, description: id, requireUniqueMatch: true, strategies: [{ kind: "selector", selector: `#${id}` }] });
      if (kind === "type") expect((await adapter.execute({ type: "type", target: await target("entry"), value: "private" })).error?.code).toBe("UNEXPECTED_DIALOG");
      if (kind === "submit") expect((await adapter.execute({ type: "submit", target: await target("form") })).error?.code).toBe("UNEXPECTED_DIALOG");
      if (kind === "navigate") {
        await page.route("https://demo.invalid/", route => route.fulfill({ contentType: "text/html", body: '<script>confirm("private")</script>' }));
        expect((await adapter.execute({ type: "navigate", value: "https://demo.invalid/" })).error?.code).toBe("UNEXPECTED_DIALOG");
      }
      if (kind === "wait" || kind === "delayed") {
        await adapter.execute({ type: "click", target: await target("later") });
        if (kind === "wait") expect((await adapter.execute({ type: "wait", durationMs: 150 })).error?.code).toBe("UNEXPECTED_DIALOG");
        else await page.waitForTimeout(150);
      }
      expect((await adapter.execute({ type: "wait", durationMs: 0 })).error?.code).toBe("UNEXPECTED_DIALOG");
      expect((await adapter.observe()).signals.unexpectedDialog).toBe(true);
      await adapter.pause(); await adapter.resume();
      expect((await adapter.execute({ type: "wait", durationMs: 0 })).ok).toBe(true);
    } finally { await browser.close(); }
  });

  it("distinguishes human controls, keyboard actions, and navigation without exporting identifiers or values", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent('<input id="PRIVATE_IDENTIFIER"><button>PRIVATE_LABEL</button><button>Another</button>');
      const adapter = new PlaywrightSurfaceAdapter(page);
      const records = await recordHumanActions(page, adapter, "test");
      await adapter.pause();
      await page.locator("input").fill("PRIVATE_VALUE");
      await page.keyboard.press("Tab");
      await page.locator("button").first().click(); await page.locator("button").last().click();
      await page.goto("about:blank#PRIVATE_URL");
      await page.waitForTimeout(25);
      expect(records.some(record => record.description === "keydown INPUT" && record.metadata?.key === "Tab")).toBe(true);
      const clicks = records.filter(record => record.description === "click BUTTON");
      expect(clicks).toHaveLength(2);
      expect(clicks[0]!.metadata!.controlPath).not.toBe(clicks[1]!.metadata!.controlPath);
      expect(records.some(record => record.description === "navigation")).toBe(true);
      expect(JSON.stringify(records)).not.toContain("PRIVATE");
    } finally { await browser.close(); }
  });
  it("routes missing-target recovery and resumes the blocked step without repeating the prefix", async () => {
    const a = artifact(), s = surface();
    a.steps.push({ ...a.steps[0]!, id: "missing", action: { type: "click", effect: "read", targetId: "t" }, recovery: { ...a.steps[0]!.recovery, onFailure: "intervene" } });
    const resolve = vi.spyOn(s, "resolve").mockRejectedValueOnce(new Error("Missing"));
    const intervene = vi.fn(async () => ({ decision: "retry" as const, approved: false }));
    const result = await new DeterministicReplayEngine(s, new ConfigurablePolicyEvaluator()).replay(a, context(), { intervene });
    expect(result.disposition).toBe("SUCCESS");
    expect(intervene).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(s.actions.map(action => action.type)).toEqual(["wait", "click"]);
  });

  it("routes expired-session takeover, rejects premature resume, and preserves the live page", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent('<body data-session-state="expired"><input value="preserved"></body>');
      const adapter = new PlaywrightSurfaceAdapter(page, { evidenceDirectory: await mkdtemp(join(tmpdir(), "expired-handoff-")) });
      expect(await adapter.getSessionState()).toBe("expired");
      const route = vi.fn(async () => {});
      const handoff = new HumanHandoffCoordinator(adapter, { route, waitForResume: async () => {
        expect(await adapter.getSessionOwner()).toBe("human");
        await expect(adapter.resume()).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
        expect(await adapter.getSessionOwner()).toBe("human");
        await page.evaluate(() => { delete document.body.dataset.sessionState; });
        return { operatorId: "test", actions: [] };
      } });
      await handoff.intervene({ invocationId: "test", capabilityId: "test", reason: "SESSION_EXPIRED" }, () => true);
      expect(route).toHaveBeenCalledOnce();
      expect(await page.locator("input").inputValue()).toBe("preserved");
      expect(await adapter.getSessionOwner()).toBe("automation");
      expect(await adapter.getSessionState()).toBe("active");
    } finally { await browser.close(); }
  });

  it("completes the expired demo through an explicit same-session operator restore", async () => {
    const run = await runDemo({ directory: await mkdtemp(join(tmpdir(), "expired-demo-")), memberId: "DEMO-001", port: 0, scenario: "expired", live: false, headless: true, model: new ScriptedDemoModel(), operator: async page => {
      await page.locator("#unblock").click();
      await page.locator("#open").waitFor();
    } });
    expect(run.result.disposition).toBe("SUCCESS");
    expect(run.result.trace.filter(event => event.kind === "HANDOFF")).toHaveLength(1);
    expect(run.result.trace.filter(event => event.kind === "ACTION_RESULT" && event.stepId === "discovery-1")).toHaveLength(1);
  });
  it.each(["success", "precondition", "postcondition", "business_outcome", "reconciliation"])("enforces the host read ceiling during %s checkpoints", async phase => {
    const a = artifact(), c = context(), s = surface();
    a.contract.inputs = [{ name: "member", type: "string", sensitive: true, required: true, description: "Member" }];
    c.inputs = { member: "$123.45" };
    const checkpoint = { id: "identity", description: "Correct member", all: [{ kind: "target_value_equals_input" as const, targetId: "t", input: "member" }] };
    if (phase === "success") a.successCheckpoint = checkpoint;
    if (phase === "precondition") a.steps[0]!.preconditions = [checkpoint];
    if (phase === "postcondition" || phase === "reconciliation") a.steps[0]!.postconditions = [checkpoint];
    if (phase === "business_outcome") a.contract.businessOutcomes = [{ code: "FOUND", description: "Found", checkpoint }];
    if (phase === "reconciliation") s.queueActionResult({ ok: false, error: { code: "LOST", message: "Unknown commit", recoverable: false, ambiguousCommit: true } });
    const result = await new DeterministicReplayEngine(s, new ConfigurablePolicyEvaluator({ ...a.policy, permittedActionTypes: ["wait"] })).replay(a, c);
    expect(result.code).toBe("CHECKPOINT_POLICY_DENIED");
    expect(s.actions.some(action => action.type === "read")).toBe(false);
    expect(result.trace).toContainEqual(expect.objectContaining({ kind: "POLICY_DECISION", code: "ACTION_TYPE_NOT_ALLOWED" }));
  });

  it("exports only reviewed workflow text to provider and persisted evidence", async () => {
    const req = request();
    const canaries = ["Morgan Example", "000-12-3456", "TW9yZ2FuIEV4YW1wbGU=", "morgan%40example.invalid"];
    const observation = { surfaceKind: "browser" as const, timestamp: "now", title: canaries[0]!, location: `https://demo.invalid/${canaries[2]}`, visibleText: [...canaries, "Member Search"], targetValues: { balance: "$123.45" }, signals: { controls: canaries.join(" "), arbitrary: canaries[2]! } };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "response", model: "test", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ decision: { kind: "complete", rationale: "Verified" } }) }] }] })));
    const data = { goal: `read savings balance for ${canaries.join(" ")}`, observation, history: [], specification: req.specification, inputs: req.inputs, signal: new AbortController().signal };
    await new OpenAIDiscoveryModel("test", "test", transport).decide(data);
    const directory = await mkdtemp(join(tmpdir(), "gap-privacy-"));
    await writeRunBundle(directory, req.specification, req.inputs, {}, { discovery: { goal: data.goal, observation, message: canaries.join(" "), rationale: canaries.join(" ") } });
    const outbound = String(transport.mock.calls[0]![1]!.body);
    const saved = await readFile(join(directory, "discovery.json"), "utf8");
    for (const canary of canaries) { expect(outbound).not.toContain(canary); expect(saved).not.toContain(canary); }
    expect(saved).toContain("Member Search");
    expect(outbound).toContain("read savings balance for");
  });
});

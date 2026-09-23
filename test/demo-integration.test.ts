import { chromium } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDemo } from "../src/demo/run-demo.js";
import { ScriptedDemoModel } from "../src/demo/scripted-model.js";
import { startDemoApp } from "../src/demo/target-app.js";

// Milestone 11-13 | Assignment §3.1-3.6, §6 | REQ-SRF-003, REQ-OPS-002
// Real browser + real local HTTP UI; only the model is an explicitly named offline fixture.
// These demonstrate integration, never masquerade as the required genuine LLM evidence.
describe("offline full-system acceptance", () => {
  it("discovers once, replays changed inputs without model calls and records not-found/validation failures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "demo-system-")); const model = new ScriptedDemoModel(); const decide = vi.spyOn(model, "decide");
    const discovered = await runDemo({ directory, memberId: "DEMO-001", port: 0, scenario: "normal", live: false, model });
    expect(discovered.result).toMatchObject({ disposition: "SUCCESS", outputs: { balance: "$123.45" } });
    const port = Number(new URL(discovered.artifact.policy.permittedTargets[0]!).port); const artifactPath = join(discovered.directory, "artifact.json");
    const calls = decide.mock.calls.length;
    for (const [memberId, scenario, code] of [["DEMO-002", "slow", "SUCCESS"], ["DEMO-999", "normal", "MEMBER_NOT_FOUND"], ["bad", "normal", "INVALID_MEMBER_ID"], ["DEMO-001", "denied", "TARGET_RESOLUTION_FAILED"], ["DEMO-001", "expired", "SESSION_EXPIRED"]]) {
      const replay = await runDemo({ directory, memberId: memberId!, port, scenario: scenario!, live: false, artifactPath });
      expect(replay.result.code).toBe(code);
      if (code === "SUCCESS") expect(replay.result.outputs).toEqual({ balance: "$678.90" });
      const persisted = await readFile(join(replay.directory, "replay.json"), "utf8");
      expect(persisted).not.toContain(memberId); expect(persisted).not.toContain("$678.90");
    }
    expect(decide).toHaveBeenCalledTimes(calls);
    const saved = await readFile(artifactPath, "utf8"); expect(saved).not.toContain("DEMO-001");
    expect(JSON.parse(await readFile(join(discovered.directory, "manifest.json"), "utf8")).discoveryMode).toBe("offline-scripted-fixture");
  }, 30000);
  it("persists live-mode provider metadata using a mocked model, without network calls", async () => {
    const directory = await mkdtemp(join(tmpdir(), "demo-live-contract-"));
    const model = new ScriptedDemoModel();
    const result = await runDemo({ directory, memberId: "DEMO-001", port: 0, scenario: "normal", live: true, model: { decide: () => model.decide(), metadata: () => ({ provider: "test-double" }) } });
    const manifest = JSON.parse(await readFile(join(result.directory, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ discoveryMode: "live-model", provider: { provider: "test-double" } });
  }, 15000);
  it("records manual activity in the same live session and resumes the blocked step", async () => {
    const directory = await mkdtemp(join(tmpdir(), "demo-handoff-"));
    const result = await runDemo({ directory, memberId: "DEMO-001", port: 0, scenario: "handoff", live: false, model: new ScriptedDemoModel(), headless: true,
      operator: async page => { await page.locator("#unblock").click(); await page.waitForTimeout(50); },
    });
    expect(result.result.disposition).toBe("SUCCESS");
    const evidence = await readFile(join(result.directory, "handoff.json"), "utf8"); expect(evidence).toContain("click BUTTON");
    expect(result.result.trace.filter(x => x.kind === "HANDOFF")).toHaveLength(1);
    expect(result.result.trace.filter(x => x.kind === "ACTION_RESULT" && x.stepId === "discovery-1")).toHaveLength(1);
  }, 15000);
  it("preserves discovery failure evidence and releases resources", async () => {
    const directory = await mkdtemp(join(tmpdir(), "demo-failure-"));
    await expect(runDemo({ directory, memberId: "DEMO-001", port: 0, scenario: "normal", live: true, model: { async decide() { return { kind: "stuck", rationale: "Cannot proceed" }; }, metadata() { return { provider: "mock" }; } } })).rejects.toThrow("DISCOVERY_STUCK");
    await expect(runDemo({ directory, memberId: "DEMO-001", port: 0, scenario: "normal", live: false, model: { async decide() { return { kind: "stuck", rationale: "Offline failure" }; } } })).rejects.toThrow("DISCOVERY_STUCK");
    const [id] = await readdir(directory); expect(await readFile(join(directory, id!, "discovery.json"), "utf8")).toContain("DISCOVERY_STUCK");
    await expect(runDemo({ directory, memberId: "DEMO-001", port: 0, scenario: "normal", live: false })).rejects.toThrow("DISCOVERY_MODEL_REQUIRED");
  }, 15000);
  it("rejects replay against a different origin and serves only the demo route", async () => {
    const directory = await mkdtemp(join(tmpdir(), "demo-origin-"));
    const original = await runDemo({ directory, memberId: "DEMO-001", port: 0, scenario: "normal", live: false, model: new ScriptedDemoModel() });
    // Reserve the old port to ensure the next ephemeral port is different.
    const reserved = await startDemoApp(Number(new URL(original.artifact.policy.permittedTargets[0]!).port));
    try {
      expect((await fetch(`${reserved.url}missing`)).status).toBe(404);
      await expect(startDemoApp(Number(new URL(reserved.url).port))).rejects.toThrow();
      await expect(runDemo({ directory, memberId: "DEMO-002", port: 0, scenario: "normal", live: false, artifactPath: join(original.directory, "artifact.json") })).rejects.toMatchObject({ code: "ARTIFACT_ORIGIN_MISMATCH" });
    } finally { await reserved.close(); }
    await expect(reserved.close()).rejects.toThrow();
  }, 15000);
});

// Real browser, deliberately scripted model/operator: this is not genuine human/provider evidence.
describe("discovery-to-operator integration", () => {
  it("keeps the stopped discovery page alive through handback, compiles and replays", async () => {
    const directory = await mkdtemp(join(tmpdir(), "discovery-operator-"));
    const scripted = new ScriptedDemoModel(); let blocked = false;
    const model: import("../src/discovery/discovery-contracts.js").DiscoveryModel = {
      async decide(input) {
        if (!blocked && input.history.some(event => event.kind === "ACTION")) { blocked = true; return { kind: "stuck", rationale: "Operator must release the session" }; }
        return scripted.decide();
      },
    };
    const operator = vi.fn(async (page: import("playwright").Page, request: import("../src/hitl/intervention.js").InterventionRequest) => {
      expect(request.reason).toBe("DISCOVERY_STUCK"); expect(request.observation.signals.owner).toBe("human");
      expect(await page.locator("#member").inputValue()).toBe("DEMO-001");
      await page.locator("#unblock").click();
      await page.waitForTimeout(30);
    });
    const run = await runDemo({ directory, memberId: "DEMO-001", port: 0, scenario: "discovery-handoff", live: false, headless: true, model, operator });
    expect(run.result.disposition).toBe("SUCCESS"); expect(operator).toHaveBeenCalledTimes(1);
    expect(run.artifact.steps.map(step => step.id)).toEqual(["discovery-1", "discovery-3", "discovery-4"]);
    const handoffs = JSON.parse(await readFile(join(run.directory, "discovery-handoff.json"), "utf8"));
    expect(handoffs.map((event: { phase: string }) => event.phase)).toEqual(["paused", "handback", "resumed"]);
    expect(handoffs[0]).toMatchObject({ owner: "human", state: "paused" });
    expect(handoffs[1].actions).toContainEqual(expect.objectContaining({ description: "click BUTTON" }));
    expect(handoffs[2]).toMatchObject({ owner: "automation", state: "active", verified: true });
    expect(JSON.stringify(handoffs)).not.toContain("DEMO-001");
    expect(JSON.parse(await readFile(join(run.directory, "discovery.json"), "utf8")).trace).toContainEqual(expect.objectContaining({ kind: "HANDOFF", decision: "continue" }));
  }, 15000);
  it.each(["cancel", "unverified", "exhausted"])("persists %s handoff and does not compile an unsuccessful discovery", async mode => {
    const directory = await mkdtemp(join(tmpdir(), "discovery-operator-stop-"));
    const run = runDemo({ directory, memberId: "DEMO-001", port: 0, scenario: "discovery-handoff", live: false, headless: true,
      model: { async decide() { return { kind: "stuck", rationale: "Waiting" }; } },
      operator: async page => {
        if (mode === "cancel") throw new Error("INTERVENTION_CANCELLED");
        if (mode === "exhausted") await page.locator("#unblock").evaluate(element => (element as HTMLElement).click());
      },
    });
    await expect(run).rejects.toThrow(mode === "exhausted" ? "DISCOVERY_STUCK" : "DISCOVERY_FAILED");
    const [id] = await readdir(directory); const files = await readdir(join(directory, id!));
    expect(files).not.toContain("artifact.json"); expect(files).not.toContain("replay.json");
    const handoff = await readFile(join(directory, id!, "discovery-handoff.json"), "utf8");
    expect(handoff).toContain(mode === "exhausted" ? '"resumed"' : '"failed"');
  }, 15000);
});


describe("safe demo setup diagnostics", () => {
  it("rejects unreadable and invalid artifacts before launching a browser", async () => {
    const directory = await mkdtemp(join(tmpdir(), "demo-input-errors-"));
    const options = { directory, memberId: "DEMO-001", port: 0, scenario: "normal", live: false };
    const launch = vi.spyOn(chromium, "launch");
    try {
      await expect(runDemo({ ...options, artifactPath: join(directory, "missing.json") })).rejects.toMatchObject({ code: "ARTIFACT_READ_FAILED" });
      const artifactPath = join(directory, "invalid.json");
      for (const content of ["not json", "{}"] ) {
        await writeFile(artifactPath, content);
        await expect(runDemo({ ...options, artifactPath })).rejects.toMatchObject({ code: "ARTIFACT_INVALID" });
      }
      expect(launch).not.toHaveBeenCalled();
    } finally { launch.mockRestore(); }
  });
  it("reports safe server and browser setup failures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "demo-setup-errors-"));
    const app = await startDemoApp(0);
    try {
      await expect(runDemo({ directory, memberId: "DEMO-001", port: Number(new URL(app.url).port), scenario: "normal", live: false })).rejects.toMatchObject({ code: "DEMO_SERVER_UNAVAILABLE" });
    } finally { await app.close(); }
    const launch = vi.spyOn(chromium, "launch").mockRejectedValue(new Error("DO_NOT_ECHO_SECRET"));
    try {
      await expect(runDemo({ directory, memberId: "DEMO-001", port: 0, scenario: "normal", live: false })).rejects.toMatchObject({ code: "BROWSER_LAUNCH_FAILED", message: expect.not.stringContaining("DO_NOT_ECHO_SECRET") });
    } finally { launch.mockRestore(); }
  });
});

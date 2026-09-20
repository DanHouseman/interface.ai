import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
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
      await expect(runDemo({ directory, memberId: "DEMO-002", port: 0, scenario: "normal", live: false, artifactPath: join(original.directory, "artifact.json") })).rejects.toThrow("ARTIFACT_ORIGIN_MISMATCH");
    } finally { await reserved.close(); }
    await expect(reserved.close()).rejects.toThrow();
  }, 15000);
});

import { chromium, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { parseCapabilityArtifact } from "../artifact/load-capability.js";
import type { CapabilityArtifact } from "../artifact/capability-schema.js";
import { CapabilityCompiler } from "../discovery/capability-compiler.js";
import { DiscoveryEngine } from "../discovery/discovery-engine.js";
import type { DiscoveryModel, DiscoveryRequest } from "../discovery/discovery-contracts.js";
import type { JsonValue } from "../domain/contracts.js";
import { writeRunBundle } from "../evidence/run-bundle.js";
import { ExecutionError } from "../runtime/errors.js";
import { HumanHandoffCoordinator, type InterventionRequest } from "../hitl/intervention.js";
import { recordHumanActions } from "../hitl/browser-recorder.js";
import { ConfigurablePolicyEvaluator } from "../policy/policy-evaluator.js";
import { DeterministicReplayEngine } from "../replay/replay-engine.js";
import { PlaywrightSurfaceAdapter } from "../surface/playwright-surface-adapter.js";
import { demoSpecification } from "./specification.js";
import { startDemoApp } from "./target-app.js";

export interface DemoOptions {
  readonly directory: string;
  readonly memberId: string;
  readonly port: number;
  readonly scenario: string;
  readonly model?: DiscoveryModel;
  readonly artifactPath?: string;
  readonly live: boolean;
  readonly headless?: boolean;
  readonly operator?: (page: Page, request: InterventionRequest) => Promise<void>;
}

// Milestone 11-13 | Assignment §3.1-3.6, §6 | REQ-DISC-004, REQ-OPS-002/003
// Discovery and saved-artifact replay use separate browser contexts. The replay branch
// never calls the model. Evidence records whether discovery was real or an offline fixture.
export async function runDemo(options: DemoOptions) {
  const app = await startDemoApp(options.port);
  try {
    const browser = await chromium.launch({ headless: options.headless ?? options.operator === undefined });
    try {
      const runId = randomUUID();
      const startedAt = new Date().toISOString();
      const directory = join(options.directory, runId);
      const inputs = { memberId: options.memberId };
      let artifact: CapabilityArtifact;
      let discovery: JsonValue = null;
      if (options.artifactPath) artifact = parseCapabilityArtifact(JSON.parse(await readFile(options.artifactPath, "utf8")));
      else {
        if (!options.model) throw new Error("DISCOVERY_MODEL_REQUIRED");
        const context = await browser.newContext({ serviceWorkers: "block" });
        const page = await context.newPage();
        const surface = new PlaywrightSurfaceAdapter(page, { evidenceDirectory: join(directory, "discovery") });
        const specification = demoSpecification(app.url);
        await surface.guard(specification.policy);
        await page.goto(app.url);
        const request: DiscoveryRequest = { runId, goal: "Find the supplied member and read their current savings balance from the member detail screen.", target: app.url, maxSteps: 15, timeoutMs: 120000, specification, inputs };
        const result = await new DiscoveryEngine(surface, options.model).run(request);
        if (result.disposition !== "SUCCESS") {
          await writeRunBundle(directory, specification, inputs, {}, { discovery: result as unknown as JsonValue, manifest: { runId, startedAt, completedAt: new Date().toISOString(), discoveryMode: options.live ? "live-model" : "offline-scripted-fixture", provider: options.model.metadata?.() ?? null } });
          // Read diagnostics back through the persistence sanitizer before exposing
          // them to the CLI. Never log a raw provider error or live observation.
          const saved = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
          const stopped = JSON.parse(await readFile(join(directory, "discovery.json"), "utf8"));
          throw new ExecutionError("DEMO_DISCOVERY_FAILED", `Discovery stopped: ${stopped.code}; provider: ${JSON.stringify(saved.provider)}; evidence: ${directory}`);
        }
        artifact = new CapabilityCompiler().compile(request, result);
        discovery = result as unknown as JsonValue;
        // Discovery evidence survives a subsequent replay/setup failure.
        await writeRunBundle(directory, artifact, inputs, { ...result.outputs }, {
          artifact: artifact as unknown as JsonValue, discovery,
          "discovery-manifest": { runId, startedAt, completedAt: new Date().toISOString(), discoveryMode: options.live ? "live-model" : "offline-scripted-fixture", provider: options.model.metadata?.() ?? null, decisionCount: result.trace.filter(event => event.kind === "DECISION").length, verifiedCompletion: true, artifactPath: "artifact.json" },
        });
        parseCapabilityArtifact(JSON.parse(await readFile(join(directory, "artifact.json"), "utf8")));
        await context.close();
      }
      // A saved capability must still authorize this exact local server; no silent rebinding.
      if (!artifact.policy.permittedTargets.includes(new URL(app.url).origin)) throw new Error("ARTIFACT_ORIGIN_MISMATCH: use the same --port as discovery.");
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      const surface = new PlaywrightSurfaceAdapter(page, { evidenceDirectory: join(directory, "replay") });
      await surface.guard(artifact.policy);
      await page.goto(`${app.url}?scenario=${encodeURIComponent(options.scenario)}`);
      const actions = await recordHumanActions(page, surface, "local-operator");
      const handoffs: JsonValue[] = [];
      const coordinator = new HumanHandoffCoordinator(surface, {
        async route(request) { handoffs.push({ id: request.id, reason: request.reason, stepId: request.stepId! }); },
        async waitForResume() {
          // Only supplied for explicit headed handoff runs; absence cannot auto-resume.
          await options.operator!(page, { id: runId, invocationId: runId, capabilityId: artifact.capability.id, reason: "Release the session, then explicitly resume.", observation: await surface.observe(), evidence: await surface.captureEvidence("operator") });
          return { operatorId: "local-operator", actions };
        },
      });
      const invocation = { invocationId: runId, capabilityId: artifact.capability.id, capabilityVersion: artifact.capability.version, inputs };
      const result = await new DeterministicReplayEngine(surface, new ConfigurablePolicyEvaluator(demoSpecification(app.url).policy)).replay(artifact, invocation, options.operator ? {
        intervene: async (step, stopped) => {
          const handoff = await coordinator.intervene({ invocationId: runId, capabilityId: artifact.capability.id, stepId: step.id, reason: stopped.code }, (observation) => observation.visibleText?.includes("Ready") === true);
          handoffs.push({ operatorId: handoff.human.operatorId, actions: [...handoff.human.actions] as unknown as JsonValue });
          return { decision: "retry", approved: false };
        },
      } : {});
      await writeRunBundle(directory, artifact, inputs, { ...result.outputs }, {
        ...(options.artifactPath ? { artifact: artifact as unknown as JsonValue, discovery } : {}),
        replay: result as unknown as JsonValue,
        handoff: handoffs,
        manifest: { runId, startedAt, completedAt: new Date().toISOString(), discoveryMode: options.artifactPath ? "saved-artifact-replay" : options.live ? "live-model" : "offline-scripted-fixture", modelCallsDuringReplay: 0, target: app.url, scenario: options.scenario, provider: options.model?.metadata?.() ?? null },
      });
      return { directory, result, artifact };
    } finally { await browser.close(); }
  } finally { await app.close(); }
}

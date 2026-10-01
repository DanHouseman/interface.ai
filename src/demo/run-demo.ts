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
import { HumanHandoffCoordinator, type HumanActionRecord, type InterventionRequest } from "../hitl/intervention.js";
import { recordHumanActions } from "../hitl/browser-recorder.js";
import { ConfigurablePolicyEvaluator } from "../policy/policy-evaluator.js";
import { DeterministicReplayEngine } from "../replay/replay-engine.js";
import { PlaywrightSurfaceAdapter } from "../surface/playwright-surface-adapter.js";
import { demoSpecification, demoRequest, demoPermissionDeniedSelector } from "./specification.js";
import { startDemoApp } from "./target-app.js";

export interface DemoOptions {
  readonly goal?: string;
  readonly target?: string;
  readonly variant?: "standard" | "legacy";
  readonly onProgress?: (phase: string) => void;
  readonly signal?: AbortSignal;
  readonly directory: string;
  readonly memberId: string;
  readonly port: number;
  readonly scenario: string;
  readonly model?: DiscoveryModel;
  readonly artifactPath?: string;
  readonly live: boolean;
  readonly headless?: boolean;
  readonly slowMoMs?: number;
  readonly operator?: (page: Page, request: InterventionRequest, signal?: AbortSignal) => Promise<void>;
}

// Milestone 11-13 | Assignment §3.1-3.6, §6 | REQ-DISC-004, REQ-OPS-002/003
// Discovery and saved-artifact replay use separate browser contexts. The replay branch
// never calls the model. Evidence records whether discovery was real or an offline fixture.
export async function runDemo(options: DemoOptions) {
  const requested = demoRequest(options);
  options.signal?.throwIfAborted();
  options.onProgress?.("Preparing application");
  // Validate saved input before opening a window, and expose only fixed safe diagnostics.
  let savedArtifact: CapabilityArtifact | undefined;
  if (options.artifactPath) {
    let serialized: string;
    try { serialized = await readFile(options.artifactPath, "utf8"); }
    catch { throw new ExecutionError("ARTIFACT_READ_FAILED", "Cannot read --artifact. Check that the file exists; use evidence/submission/genuine-discovery/artifact.json for the included example."); }
    try { savedArtifact = parseCapabilityArtifact(JSON.parse(serialized)); }
    catch { throw new ExecutionError("ARTIFACT_INVALID", "The saved file is not a valid capability artifact. Use artifact.json from a successful discovery run."); }
  }
  let app: Awaited<ReturnType<typeof startDemoApp>>;
  const variant = savedArtifact ? savedArtifact.application.compatibilityTags.includes("legacy-table") ? "legacy" : "standard" : options.variant ?? "standard";
  try { app = await startDemoApp(options.port, variant); }
  catch { throw new ExecutionError("DEMO_SERVER_UNAVAILABLE", "Cannot start the local demo server. Check that the requested port is available."); }
  try {
    let browser: Awaited<ReturnType<typeof chromium.launch>>;
    try { browser = await chromium.launch({ headless: options.headless ?? options.operator === undefined, slowMo: options.slowMoMs ?? 0 }); }
    catch { throw new ExecutionError("BROWSER_LAUNCH_FAILED", "Chromium could not start. Run npx playwright install chromium and verify that a desktop session is available for headed mode."); }
    const abort = () => { void browser.close().catch(Boolean); };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    try {
      const runId = randomUUID();
      const startedAt = new Date().toISOString();
      const directory = join(options.directory, runId);
      const inputs = { memberId: options.memberId };
      let artifact: CapabilityArtifact;
      let discovery: JsonValue = null;
      if (savedArtifact) artifact = savedArtifact;
      else {
        options.onProgress?.("Discovering capability");
        if (!options.model) throw new Error("DISCOVERY_MODEL_REQUIRED");
        const context = await browser.newContext({ serviceWorkers: "block" });
        const page = await context.newPage();
        const surface = new PlaywrightSurfaceAdapter(page, { permissionDeniedSelector: variant === "legacy" ? 'p:text-is("Permission denied")' : demoPermissionDeniedSelector, evidenceDirectory: join(directory, "discovery") });
        const specification = demoSpecification(app.url, variant);
        await surface.guard(specification.policy);
        await page.goto(options.scenario === "discovery-handoff" ? `${app.url}?scenario=handoff` : app.url);
        const discoveryActions = await recordHumanActions(page, surface, "local-operator");
        const discoveryHandoffs: JsonValue[] = [];
        const request: DiscoveryRequest = { runId, goal: requested.goal, target: app.url, maxSteps: 15, timeoutMs: 120000, specification, inputs };
        const result = await new DiscoveryEngine(surface, options.model).run(request, options.operator ? {
          intervene: async (stopped, signal) => {
            await operatorHandoff(page, surface, options.operator!, discoveryActions, discoveryHandoffs,
              { invocationId: runId, capabilityId: specification.capability.id, stepId: `discovery-${stopped.step}`, reason: stopped.code }, signal);
            return stopped.canContinue ? "continue" : "stop";
          },
        } : {});
        if (result.disposition !== "SUCCESS") {
          await writeRunBundle(directory, specification, inputs, {}, { discovery: result as unknown as JsonValue, "discovery-handoff": discoveryHandoffs, manifest: { runId, startedAt, completedAt: new Date().toISOString(), discoveryMode: options.live ? "live-model" : "offline-scripted-fixture", provider: options.model.metadata?.() ?? null } });
          // Read diagnostics back through the persistence sanitizer before exposing
          // them to the CLI. Never log a raw provider error or live observation.
          const saved = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
          const stopped = JSON.parse(await readFile(join(directory, "discovery.json"), "utf8"));
          throw new ExecutionError("DEMO_DISCOVERY_FAILED", `Discovery stopped: ${stopped.code}; provider: ${JSON.stringify(saved.provider)}; evidence: ${directory}`);
        }
        options.onProgress?.("Saving verified capability");
        artifact = new CapabilityCompiler().compile(request, result);
        discovery = result as unknown as JsonValue;
        // Discovery evidence survives a subsequent replay/setup failure.
        await writeRunBundle(directory, artifact, inputs, { ...result.outputs }, {
          artifact: artifact as unknown as JsonValue, discovery, "discovery-handoff": discoveryHandoffs,
          "discovery-manifest": { runId, startedAt, completedAt: new Date().toISOString(), discoveryMode: options.live ? "live-model" : "offline-scripted-fixture", provider: options.model.metadata?.() ?? null, decisionCount: result.trace.filter(event => event.kind === "DECISION").length, verifiedCompletion: true, artifactPath: "artifact.json" },
        });
        parseCapabilityArtifact(JSON.parse(await readFile(join(directory, "artifact.json"), "utf8")));
        await context.close();
      }
      // A saved capability must still authorize this exact local server; no silent rebinding.
      if (!artifact.policy.permittedTargets.includes(new URL(app.url).origin)) throw new ExecutionError("ARTIFACT_ORIGIN_MISMATCH", "Use the same --port as discovery; the included example uses 4173.");
      options.onProgress?.("Replaying saved steps (zero model calls)");
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      const surface = new PlaywrightSurfaceAdapter(page, { permissionDeniedSelector: variant === "legacy" ? 'p:text-is("Permission denied")' : demoPermissionDeniedSelector, evidenceDirectory: join(directory, "replay") });
      await surface.guard(artifact.policy);
      await page.goto(`${app.url}?scenario=${encodeURIComponent(options.scenario)}`);
      const actions = await recordHumanActions(page, surface, "local-operator");
      const handoffs: JsonValue[] = [];
      const invocation = { invocationId: runId, capabilityId: artifact.capability.id, capabilityVersion: artifact.capability.version, inputs };
      const result = await new DeterministicReplayEngine(surface, new ConfigurablePolicyEvaluator(demoSpecification(app.url).policy)).replay(artifact, invocation, options.operator ? {
        intervene: async (step, stopped) => {
          await operatorHandoff(page, surface, options.operator!, actions, handoffs,
            { invocationId: runId, capabilityId: artifact.capability.id, stepId: step.id, reason: stopped.code });
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
    } finally { options.signal?.removeEventListener("abort", abort); await browser.close(); }
  } finally { await app.close(); }
}

// Preserve the live page and record control transfer without recording typed values.
async function operatorHandoff(
  page: Page, surface: PlaywrightSurfaceAdapter, operator: NonNullable<DemoOptions["operator"]>,
  actions: HumanActionRecord[], events: JsonValue[],
  input: { invocationId: string; capabilityId: string; stepId: string; reason: string }, signal?: AbortSignal,
): Promise<void> {
  const firstAction = actions.length;
  let routed!: InterventionRequest;
  const coordinator = new HumanHandoffCoordinator(surface, {
    async route(request) {
      routed = request;
      events.push({ timestamp: new Date().toISOString(), phase: "paused", id: request.id, stepId: input.stepId, reason: input.reason,
        owner: await surface.getSessionOwner(), state: await surface.getSessionState(), evidence: request.evidence as unknown as JsonValue });
    },
    async waitForResume() {
      await operator(page, routed, signal);
      const human = { operatorId: "local-operator", actions: actions.slice(firstAction) };
      events.push({ timestamp: new Date().toISOString(), phase: "handback", id: routed.id, ...human } as unknown as JsonValue);
      return human;
    },
  });
  try {
    await coordinator.intervene(input, observation => observation.visibleText?.includes("Ready") === true, signal);
    events.push({ timestamp: new Date().toISOString(), phase: "resumed", id: routed.id, verified: true, owner: await surface.getSessionOwner(), state: await surface.getSessionState() });
  } catch (error) {
    events.push({ timestamp: new Date().toISOString(), phase: "failed", stepId: input.stepId, code: "HANDOFF_FAILED", actions: actions.slice(firstAction) as unknown as JsonValue });
    throw error;
  }
}

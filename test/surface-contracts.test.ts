import { describe, expect, it } from "vitest";
import { DiscoveryEngine } from "../src/discovery/discovery-engine.js";
import { HumanHandoffCoordinator, type InterventionRouter } from "../src/hitl/intervention.js";
import { ConfigurablePolicyEvaluator } from "../src/policy/policy-evaluator.js";
import { evaluateCheckpoint } from "../src/replay/checkpoint-evaluator.js";
import { DeterministicReplayEngine } from "../src/replay/replay-engine.js";
import type { CheckpointSurface, ExecutionSurface, HandoffSurface } from "../src/surface/surface-adapter.js";
import { artifact, context, request, surface } from "./helpers.js";

describe("consumer-specific surface contracts", () => {
  it("evaluates checkpoints without evidence or session-control methods", async () => {
    const adapter = surface();
    const reader: CheckpointSurface = {
      observe: adapter.observe.bind(adapter),
      resolve: adapter.resolve.bind(adapter),
      execute: adapter.execute.bind(adapter),
      getSessionState: adapter.getSessionState.bind(adapter),
    };
    const capability = artifact();
    expect((await evaluateCheckpoint(capability, capability.successCheckpoint, reader)).passed).toBe(true);
  });

  it("runs replay and discovery without handing them session ownership controls", async () => {
    const adapter = surface();
    const execution: ExecutionSurface = {
      observe: adapter.observe.bind(adapter),
      resolve: adapter.resolve.bind(adapter),
      execute: adapter.execute.bind(adapter),
      captureEvidence: adapter.captureEvidence.bind(adapter),
      getSessionState: adapter.getSessionState.bind(adapter),
    };
    expect((await new DeterministicReplayEngine(execution, new ConfigurablePolicyEvaluator()).replay(artifact(), context())).disposition).toBe("SUCCESS");
    adapter.setObservation({ location: "https://demo.invalid/" });
    const discovery = request();
    discovery.specification.successCheckpoint = artifact().successCheckpoint;
    const model = { decide: async () => ({ kind: "complete" as const, rationale: "Verify completion" }) };
    expect((await new DiscoveryEngine(execution, model).run(discovery)).disposition).toBe("SUCCESS");
  });

  it("hands control back without access to target resolution or action execution", async () => {
    const adapter = surface();
    const handoff: HandoffSurface = {
      observe: adapter.observe.bind(adapter),
      captureEvidence: adapter.captureEvidence.bind(adapter),
      getSessionState: adapter.getSessionState.bind(adapter),
      getSessionOwner: adapter.getSessionOwner.bind(adapter),
      pause: adapter.pause.bind(adapter),
      resume: adapter.resume.bind(adapter),
    };
    const router: InterventionRouter = {
      route: async () => {},
      waitForResume: async () => ({ operatorId: "test-operator", actions: [] }),
    };
    await new HumanHandoffCoordinator(handoff, router).intervene(
      { invocationId: "test", capabilityId: "test", reason: "Verify handback" },
      () => true,
    );
    expect(await adapter.getSessionOwner()).toBe("automation");
    expect(await adapter.getSessionState()).toBe("active");
  });
});

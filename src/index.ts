export * from "./artifact/capability-schema.js";
export * from "./artifact/load-capability.js";
export * from "./surface/surface-adapter.js";
export * from "./surface/fake-surface-adapter.js";
export * from "./domain/contracts.js";
export * from "./policy/policy-evaluator.js";
export * from "./replay/replay-contracts.js";
export * from "./replay/checkpoint-evaluator.js";
export * from "./replay/replay-engine.js";
export * from "./evidence/redactor.js";
export * from "./evidence/evidence-store.js";

export * from "./surface/playwright-surface-adapter.js";
export { DiscoveryEngine } from "./discovery/discovery-engine.js";
export { CapabilityCompiler } from "./discovery/capability-compiler.js";
export type {
  DiscoveryDecision,
  DiscoveryIntervention,
  DiscoveryOptions,
  DiscoveryModel,
  DiscoveryRequest,
  DiscoveryResult,
  DiscoveryTraceEvent,
} from "./discovery/discovery-contracts.js";
export {
  HumanHandoffCoordinator,
  InMemoryInterventionRouter,
} from "./hitl/intervention.js";
export type {
  HumanActionRecord,
  InterventionRequest,
  InterventionRouter,
} from "./hitl/intervention.js";

export { OpenAIDiscoveryModel } from "./discovery/openai-discovery-model.js";
export { discoveryDecisionSchema } from "./discovery/discovery-contracts.js";
export type { DiscoverySpecification, ModelInput } from "./discovery/discovery-contracts.js";

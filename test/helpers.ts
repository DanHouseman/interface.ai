import { capabilityArtifactSchema, type CapabilityArtifact } from "../src/artifact/capability-schema.js";
import type { ExecutionContext } from "../src/domain/contracts.js";
import type { DiscoveryRequest } from "../src/discovery/discovery-contracts.js";
import { demoSpecification } from "../src/demo/specification.js";
import { FakeSurfaceAdapter } from "../src/surface/fake-surface-adapter.js";

export function artifact(): CapabilityArtifact {
  return capabilityArtifactSchema.parse({
    schemaVersion: "1.0", capability: { id: "test", name: "Test", version: "1", description: "Test capability" },
    application: { family: "test", surface: "browser" }, provenance: { discoveryRunId: "test", createdAt: "2026-09-19T00:00:00Z", compilerVersion: "1" },
    contract: { inputs: [], outputs: [] }, policy: { permittedTargets: ["https://demo.invalid"], permittedRoutes: [], permittedActionTypes: ["read", "click", "type", "select", "navigate", "wait", "submit", "custom"] },
    targets: [{ id: "t", description: "Test target", strategies: [{ kind: "selector", selector: "#t" }] }],
    steps: [{ id: "s", description: "Test step", action: { type: "wait", effect: "read", value: { kind: "literal", value: 0 } }, recovery: { retry: { allowed: false, maxAttempts: 0 }, onFailure: "fail" } }],
    successCheckpoint: { id: "success", description: "Active", all: [{ kind: "session_state", state: "active" }] },
  });
}
export function context(): ExecutionContext { return { invocationId: "test", capabilityId: "test", capabilityVersion: "1", inputs: {} }; }
export function surface() { return new FakeSurfaceAdapter(new Set(["t"])); }
export function request() {
  const specification = { ...demoSpecification("https://demo.invalid/") };
  specification.successCheckpoint = { id: "done", description: "Verified", all: [{ kind: "text_visible", text: "Member Search" }] };
  return { runId: "discovery", goal: "Look up a synthetic member", target: "https://demo.invalid/", maxSteps: 8, timeoutMs: 1000, specification, inputs: { memberId: "DEMO-001" } };
}

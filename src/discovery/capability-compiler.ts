import { capabilityArtifactSchema, type CapabilityArtifact } from "../artifact/capability-schema.js";
import { EvidenceRedactor } from "../evidence/redactor.js";
import type { JsonValue } from "../domain/contracts.js";
import type { DiscoveryRequest, DiscoveryResult } from "./discovery-contracts.js";

// Milestone 11 | Assignment §3.2-3.3 | REQ-DISC-003, REQ-ART-001..004
// Compile only successful executed actions. Contracts, authority and parameter bindings
// come from the reviewed host specification, never from model text or inferred permissions.
export class CapabilityCompiler {
  public compile(request: DiscoveryRequest, result: Extract<DiscoveryResult, { disposition: "SUCCESS" }>): CapabilityArtifact {
    if (result.runId !== request.runId) throw new Error("DISCOVERY_RUN_MISMATCH");
    const steps = result.trace.flatMap((event) => event.kind === "ACTION" && event.result.ok ? [event.capabilityStep] : []);
    if (!steps.length) throw new Error("Cannot compile a discovery with no successful actions.");
    const artifact = capabilityArtifactSchema.parse({ ...request.specification, steps, provenance: { discoveryRunId: request.runId, createdAt: new Date().toISOString(), compilerVersion: "0.2.0" } });
    const redactor = new EvidenceRedactor(artifact, request.inputs, result.outputs);
    redactor.sanitize(result as unknown as JsonValue);
    // Reject sensitive literals instead of silently replacing behavior with '[REDACTED]'.
    const serialized = JSON.stringify(artifact);
    if (JSON.stringify(redactor.redact(artifact as unknown as JsonValue)) !== serialized) throw new Error("SENSITIVE_ARTIFACT_LITERAL");
    return artifact;
  }
}

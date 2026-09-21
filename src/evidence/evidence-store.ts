import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CapabilityArtifact } from "../artifact/capability-schema.js";
import type { ExecutionContext, JsonValue } from "../domain/contracts.js";
import type { ReplayResult } from "../replay/replay-contracts.js";
import { EvidenceRedactor } from "./redactor.js";

// Plan: Milestone 9 | REQ-EVD-001..003
// Persistence is deliberately behind a tiny interface so replay can remain storage-agnostic.
export interface EvidenceStore {
  persist(artifact: CapabilityArtifact, context: ExecutionContext, result: ReplayResult): Promise<string>;
}

// Plan: Milestone 9 | REQ-EVD-001..003
// File persistence is sufficient for the take-home vertical slice and directly produces the
// reviewable /evidence material requested by the assignment.
export class JsonFileEvidenceStore implements EvidenceStore {
  public constructor(private readonly directory: string = "evidence/runtime") {}

  public async persist(artifact: CapabilityArtifact, context: ExecutionContext, result: ReplayResult): Promise<string> {
    const redactor = new EvidenceRedactor(artifact, context.inputs, result.outputs);
    const payload: JsonValue = {
      schemaVersion: "1.0",
      capability: { id: artifact.capability.id, version: artifact.capability.version },
      invocationId: context.invocationId,
      result: result as unknown as JsonValue,
    };
    const redacted = redactor.sanitize(payload);
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${safe(redactor.redactString(context.invocationId))}.json`);
    await writeFile(path, `${JSON.stringify(redacted, null, 2)}\n`, "utf8");
    return path;
  }
}

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

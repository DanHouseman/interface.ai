import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CapabilityArtifact } from "../artifact/capability-schema.js";
import type { JsonValue } from "../domain/contracts.js";
import { EvidenceRedactor } from "./redactor.js";

// Milestone 9 + 13 | Assignment §3.5, §6 | REQ-EVD-001..003
// Every persisted structured payload crosses the same sanitizer. Exclusive creation
// prevents evidence replacement; callers supply a unique directory per run.
export async function writeRunBundle(directory: string, artifact: Pick<CapabilityArtifact, "contract">, inputs: Record<string, JsonValue>, outputs: Record<string, JsonValue>, payloads: Record<string, JsonValue>): Promise<void> {
  const redactor = new EvidenceRedactor(artifact, inputs, outputs);
  const sanitized = redactor.sanitize(payloads) as Record<string, JsonValue>;
  for (const name of Object.keys(sanitized)) if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error("INVALID_EVIDENCE_NAME");
  await mkdir(directory, { recursive: true });
  for (const [name, value] of Object.entries(sanitized)) {
    await writeFile(join(directory, `${name}.json`), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  }
}

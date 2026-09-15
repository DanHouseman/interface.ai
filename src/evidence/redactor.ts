import type { CapabilityArtifact } from "../artifact/capability-schema.js";
import type { JsonValue } from "../domain/contracts.js";

// Plan: Milestone 9 | REQ-EVD-003, REQ-POL-004
// Redaction happens before persistence. The evidence layer never relies on callers to remember
// which capability inputs/outputs were declared sensitive.
export class EvidenceRedactor {
  private readonly sensitiveValues = new Set<string>();

  public constructor(artifact: CapabilityArtifact, inputs: Readonly<Record<string, JsonValue>>) {
    for (const input of artifact.contract.inputs) {
      if (!input.sensitive) continue;
      const value = inputs[input.name];
      if (value !== undefined) this.collect(value);
    }
  }

  public redact(value: JsonValue): JsonValue {
    if (typeof value === "string") return this.redactString(value);
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (value !== null && typeof value === "object") {
      const result: Record<string, JsonValue> = {};
      for (const [key, child] of Object.entries(value)) {
        result[key] = isSecretKey(key) ? "[REDACTED]" : this.redact(child);
      }
      return result;
    }
    return value;
  }

  public redactString(value: string): string {
    let result = value;
    for (const sensitive of this.sensitiveValues) {
      if (sensitive.length > 0) result = result.split(sensitive).join("[REDACTED]");
    }
    return result;
  }

  private collect(value: JsonValue): void {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      this.sensitiveValues.add(String(value));
      return;
    }
    if (Array.isArray(value)) for (const item of value) this.collect(item);
    else if (value !== null) for (const item of Object.values(value)) this.collect(item);
  }
}

function isSecretKey(key: string): boolean {
  return /(password|passwd|secret|token|authorization|cookie|api[_-]?key|session[_-]?id)/i.test(key);
}

import type { CapabilityArtifact } from "../artifact/capability-schema.js";
import type { JsonValue } from "../domain/contracts.js";

// Milestone 9 | Assignment §3.4-3.5 | REQ-EVD-003, REQ-POL-004
// Register input AND output values before traversing evidence so copies in free text are
// removed too. Primitive values and sensitive field names share the same persistence gate.
export class EvidenceRedactor {
  private readonly sensitiveValues = new Set<string>();
  private readonly sensitiveKeys: Set<string>;

  public constructor(
    artifact: Pick<CapabilityArtifact, "contract">,
    inputs: Readonly<Record<string, JsonValue>>,
    outputs: Readonly<Record<string, JsonValue>> = {},
  ) {
    const fields = [...artifact.contract.inputs, ...artifact.contract.outputs].filter((field) => field.sensitive);
    this.sensitiveKeys = new Set(fields.map((field) => field.name));
    for (const field of fields) {
      for (const values of [inputs, outputs]) {
        const value = values[field.name];
        if (value !== undefined) this.collect(value);
      }
    }
  }

  public redact(value: JsonValue): JsonValue {
    if (typeof value === "string") return this.redactString(value);
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (value !== null && typeof value === "object") {
      const result: Record<string, JsonValue> = {};
      for (const [key, child] of Object.entries(value)) {
        result[key] = this.sensitiveKeys.has(key) || isSecretKey(key) ? "[REDACTED]" : this.redact(child);
      }
      return result;
    }
    return value !== null && this.sensitiveValues.has(String(value)) ? "[REDACTED]" : value;
  }

  public redactString(value: string): string {
    let result = value.replace(/\bBearer\s+\S+|\bsk-[\w-]+/gi, "[REDACTED]")
      .replace(/((?:password|token|secret|api_key)=)[^&\s]+/gi, "$1[REDACTED]");
    // Longest first avoids leaking the suffix of overlapping sensitive values.
    for (const sensitive of [...this.sensitiveValues].sort((a, b) => b.length - a.length)) {
      result = result.split(sensitive).join("[REDACTED]");
    }
    return result;
  }

  private collect(value: JsonValue): void {
    if (Array.isArray(value)) { for (const item of value) this.collect(item); }
    else if (value !== null && typeof value === "object") { for (const item of Object.values(value)) this.collect(item); }
    else if (value !== null && String(value).length > 0) this.sensitiveValues.add(String(value));
  }
}
function isSecretKey(key: string): boolean {
  return /(password|passwd|secret|token|authorization|cookie|api[_-]?key|session[_-]?id)/i.test(key);
}

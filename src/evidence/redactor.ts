import type { CapabilityArtifact } from "../artifact/capability-schema.js";
import type { JsonValue } from "../domain/contracts.js";

// Milestone 9 | Assignment §3.4-3.5 | REQ-EVD-003, REQ-POL-004
// Register input AND output values before traversing evidence so copies in free text are
// removed too. Primitive values and sensitive field names share the same persistence gate.
export class EvidenceRedactor {
  private readonly sensitiveValues = new Set<string>();
  private readonly sensitiveKeys: Set<string>;
  private readonly sensitiveTargets: Set<string>;
  private readonly sensitiveSignals: Set<string>;

  public constructor(
    artifact: Pick<CapabilityArtifact, "contract">,
    inputs: Readonly<Record<string, JsonValue>>,
    outputs: Readonly<Record<string, JsonValue>> = {},
  ) {
    const fields = [...artifact.contract.inputs, ...artifact.contract.outputs].filter((field) => field.sensitive);
    this.sensitiveKeys = new Set(fields.map((field) => field.name));
    this.sensitiveTargets = new Set(artifact.contract.outputs.filter(field => field.sensitive && field.source.targetId).map(field => field.source.targetId!));
    this.sensitiveSignals = new Set(artifact.contract.outputs.filter(field => field.sensitive && field.source.adapterSignal).map(field => field.source.adapterSignal!));
    for (const field of fields) {
      for (const values of [inputs, outputs]) {
        const value = values[field.name];
        if (value !== undefined) this.collect(value);
      }
    }
  }

  // Two passes over the WHOLE bundle: discover values before redacting copies in
  // earlier errors, provider metadata, manifests or free text. Never write then fix.
  public sanitize(value: JsonValue): JsonValue {
    this.registerEvidence(value);
    return this.redact(value);
  }

  private registerEvidence(value: JsonValue): void {
    if (Array.isArray(value)) { for (const child of value) this.registerEvidence(child); return; }
    if (value === null || typeof value !== "object") return;
    if (typeof value.surfaceKind === "string") {
      const targets = value.targetValues;
      for (const target of this.sensitiveTargets) {
        // An adapter without field classification may serve live callers, but cannot
        // persist unclassified page text under a sensitive-output contract.
        if (!targets || typeof targets !== "object" || Array.isArray(targets) || !(target in targets)) throw new Error("EVIDENCE_UNCLASSIFIED_SENSITIVE_OBSERVATION");
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (this.sensitiveKeys.has(key) || isSecretKey(key)) this.collect(child);
      if ((key === "targetValues" || key === "signals") && child && typeof child === "object" && !Array.isArray(child)) {
        const keys = key === "targetValues" ? this.sensitiveTargets : this.sensitiveSignals;
        for (const [name, field] of Object.entries(child)) if (keys.has(name)) this.collect(field);
      }
      this.registerEvidence(child);
    }
    if (value.kind === "ACTION" && value.capabilityStep && typeof value.capabilityStep === "object" && !Array.isArray(value.capabilityStep)) {
      const action = value.capabilityStep.action;
      if (action && typeof action === "object" && !Array.isArray(action) && typeof action.targetId === "string" && this.sensitiveTargets.has(action.targetId)) {
        const result = value.result;
        if (result && typeof result === "object" && !Array.isArray(result) && result.observedValue !== undefined) this.collect(result.observedValue);
      }
    }
  }

  public redact(value: JsonValue): JsonValue {
    if (typeof value === "string") return this.redactString(value);
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (value !== null && typeof value === "object") {
      const result: Record<string, JsonValue> = {};
      for (const [key, child] of Object.entries(value)) {
        result[this.redactString(key)] = this.sensitiveKeys.has(key) || isSecretKey(key) ? "[REDACTED]" : this.redact(child);
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
    else if (value !== null && String(value).length > 0) {
      this.sensitiveValues.add(String(value));
      // Observations split/trim visible text. Register that exact normalization too,
      // so multiline or padded target values cannot leak through the text projection.
      for (const line of String(value).split(/\r?\n/)) if (line.trim()) this.sensitiveValues.add(line.trim());
    }
  }
}
function isSecretKey(key: string): boolean {
  return /(password|passwd|secret|token|authorization|cookie|api[_-]?key|session[_-]?id)/i.test(key);
}

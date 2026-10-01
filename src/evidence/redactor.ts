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
  private readonly publicText = new Set<string>();
  private readonly goalWords = new Set("a an and are as at be by can current do find for from get goal has have i id in is it look lookup member no not of on open or please read report savings search should show supplied task the their then this to up use want with".split(" "));

  public constructor(
    artifact: Pick<CapabilityArtifact, "contract"> & Partial<CapabilityArtifact> & { grants?: Readonly<Record<string, { preconditions?: CapabilityArtifact["steps"][number]["preconditions"] }>> },
    inputs: Readonly<Record<string, JsonValue>>,
    outputs: Readonly<Record<string, JsonValue>> = {},
  ) {
    const fields = [...artifact.contract.inputs, ...artifact.contract.outputs].filter((field) => field.sensitive);
    this.sensitiveKeys = new Set(fields.map((field) => field.name));
    this.sensitiveTargets = new Set(artifact.contract.outputs.filter(field => field.sensitive && field.source.targetId).map(field => field.source.targetId!));
    this.sensitiveSignals = new Set(artifact.contract.outputs.filter(field => field.sensitive && field.source.adapterSignal).map(field => field.source.adapterSignal!));
    // Only host-reviewed constants may survive observation projection. Never learn
    // the public vocabulary from a page, a model response, or an invocation value.
    const checkpoints = [artifact.successCheckpoint, ...artifact.contract.businessOutcomes.map(item => item.checkpoint), ...(artifact.steps ?? []).flatMap(step => [...step.preconditions, ...step.postconditions]), ...Object.values(artifact.grants ?? {}).flatMap(grant => grant.preconditions ?? [])];
    for (const checkpoint of checkpoints) for (const predicate of checkpoint?.all ?? []) if (predicate.kind === "text_visible") this.publicText.add(predicate.text);
    for (const target of artifact.targets ?? []) {
      this.publicText.add(target.description);
      for (const strategy of target.strategies) {
        if (strategy.kind === "accessibility" && strategy.name) this.publicText.add(strategy.name);
        if (strategy.kind === "label") this.publicText.add(strategy.text);
        if (strategy.kind === "structural") this.publicText.add(strategy.anchorText);
      }
    }
    for (const text of this.publicText) for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) this.goalWords.add(word);
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
    return this.redact(this.project(value));
  }

  // Raw observations and diagnostics stay in process. Presence of reviewed text
  // is useful to discovery; arbitrary page content is never an exportable field.
  private project(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(child => this.project(child));
    if (value === null || typeof value !== "object") return value;
    const result: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (["message", "controls", "title", "location", "observedValue"].includes(key)) result[key] = "[OMITTED]";
      else if (key === "visibleText") {
        result[key] = [...this.publicText].filter(text => Array.isArray(child) && child.some(line => typeof line === "string" && line.includes(text)));
      } else if (key === "goal" || key === "rationale") {
        // Preserve supported natural-language intent without exporting names,
        // identifiers, punctuation encodings, or other caller-supplied data.
        result[key] = typeof child === "string" ? child.toLowerCase().split(/\s+/).map(word => this.goalWords.has(word) ? word : "[OMITTED]").join(" ") : "[OMITTED]";
      } else if (key === "targetValues") {
        result[key] = child && typeof child === "object" && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).map(([id, field]) => [id, field === null ? null : "[REDACTED]"])) : {};
      } else if (key === "signals" && typeof value.surfaceKind === "string") {
        result[key] = child && typeof child === "object" && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).filter(([name, field]) => (name === "session" && ["active", "expired", "paused", "unknown"].includes(String(field))) || (name === "owner" && ["automation", "human", "none"].includes(String(field))))) : {};
      } else result[key] = this.project(child);
    }
    return result;
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

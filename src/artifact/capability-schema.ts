import { z } from "zod";
import type { JsonValue } from "../domain/contracts.js";

// Plan: Milestone 3 | REQ-ART-001, REQ-ART-002
// Runtime-validated, portable artifact primitives. Shared domain values come from
// domain/contracts so the artifact remains independent of Playwright/model SDK types.
const identifier = z.string().min(1).max(200);
const jsonPrimitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitive, z.array(jsonValue), z.record(z.string(), jsonValue)]),
);

// Plan: Milestone 7 | REQ-POL-002
// Machine-readable action effects let policy reason about read/write/privileged risk.
export const actionEffectSchema = z.enum([
  "read",
  "reversible_write",
  "irreversible_write",
  "privileged",
]);

export const actionTypeSchema = z.enum([
  "click",
  "type",
  "select",
  "navigate",
  "read",
  "wait",
  "submit",
  "custom",
]);

// Plan: Milestone 3 + Milestone 6 | REQ-ART-001, REQ-RPL-002
// Ordered strategies are stored in the artifact; replay will attempt them deterministically.
// The schema includes non-DOM strategies so the IR does not assume a clean browser DOM.
export const targetStrategySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("accessibility"),
    role: z.string().min(1),
    name: z.string().min(1).optional(),
    exact: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal("label"),
    text: z.string().min(1),
    exact: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal("attribute"),
    name: z.string().min(1),
    value: z.string().min(1),
  }),
  z.object({
    kind: z.literal("selector"),
    selector: z.string().min(1),
  }),
  z.object({
    kind: z.literal("structural"),
    anchorText: z.string().min(1),
    relation: z.enum(["descendant", "following", "preceding", "ancestor"]),
    controlHint: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("visual"),
    description: z.string().min(1),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
  }),
  z.object({
    kind: z.literal("terminal_field"),
    screenId: z.string().min(1).optional(),
    fieldName: z.string().min(1).optional(),
    row: z.number().int().nonnegative().optional(),
    column: z.number().int().nonnegative().optional(),
    surroundingText: z.string().min(1).optional(),
  }),
]);

export const targetSchema = z.object({
  id: identifier,
  description: z.string().min(1),
  strategies: z.array(targetStrategySchema).min(1),
  requireUniqueMatch: z.boolean().default(true),
});

export const valueSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: jsonValue }),
  z.object({ kind: z.literal("input"), input: identifier }),
]);

// Plan: Milestone 3 + Milestone 6 | REQ-ART-001, REQ-RPL-003
// Checkpoints establish observed truth before/after actions instead of assuming success.
export const checkpointPredicateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url_matches"), pattern: z.string().min(1) }),
  z.object({ kind: z.literal("title_matches"), pattern: z.string().min(1) }),
  z.object({ kind: z.literal("text_visible"), text: z.string().min(1) }),
  z.object({ kind: z.literal("target_present"), targetId: identifier }),
  z.object({ kind: z.literal("target_value_equals_input"), targetId: identifier, input: identifier }),
  z.object({
    kind: z.literal("session_state"),
    state: z.enum(["active", "expired", "paused", "unknown"]),
  }),
  z.object({
    kind: z.literal("adapter_signal"),
    name: z.string().min(1),
    expected: jsonValue.optional(),
  }),
]);

export const checkpointSchema = z.object({
  id: identifier,
  description: z.string().min(1),
  all: z.array(checkpointPredicateSchema).min(1),
  timeoutMs: z.number().int().min(0).max(30000).optional(),
});

// Plan: Milestone 8 | REQ-OUT-003, REQ-OUT-004
// Recovery policy is explicit in the capability rather than hidden in executor heuristics.
export const recoverySchema = z.object({
  retry: z.object({
    allowed: z.boolean(),
    maxAttempts: z.number().int().nonnegative(),
    backoffMs: z.number().int().nonnegative().default(0),
  }),
  onFailure: z.enum(["fail", "intervene"]),
  reconciliationRequiredAfterAmbiguousCommit: z.boolean().default(false),
});

export const capabilityStepSchema = z.object({
  id: identifier,
  description: z.string().min(1),
  action: z.object({
    type: actionTypeSchema,
    effect: actionEffectSchema,
    targetId: identifier.optional(),
    value: valueSourceSchema.optional(),
    customAction: z.string().min(1).optional(),
  }),
  preconditions: z.array(checkpointSchema).default([]),
  postconditions: z.array(checkpointSchema).default([]),
  recovery: recoverySchema,
  humanApprovalRequired: z.boolean().default(false),
});

export const parameterSchema = z.object({
  name: identifier,
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean().default(true),
  sensitive: z.boolean().default(false),
  description: z.string().min(1),
});

export const outputSchema = z.object({
  name: identifier,
  type: z.enum(["string", "number", "boolean", "object", "array"]),
  required: z.boolean().default(true),
  sensitive: z.boolean().default(false),
  description: z.string().min(1),
  source: z.object({
    targetId: identifier.optional(),
    adapterSignal: z.string().min(1).optional(),
  }),
});

export const businessOutcomeSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  description: z.string().min(1),
  checkpoint: checkpointSchema,
});

// Plan: Milestone 3 | REQ-ART-001..004
// This is the central agent-invocable capability contract: identity/version, application
// compatibility, typed I/O, policy, targets, steps, checkpoints, and provenance.
export const capabilityArtifactSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    capability: z.object({
      id: identifier,
      name: z.string().min(1),
      version: z.string().min(1),
      description: z.string().min(1),
    }),
    application: z.object({
      family: z.string().min(1),
      productVersion: z.string().min(1).optional(),
      surface: z.enum(["browser", "desktop", "terminal", "remote"]),
      compatibilityTags: z.array(z.string().min(1)).default([]),
    }),
    provenance: z.object({
      discoveryRunId: identifier,
      createdAt: z.string().datetime(),
      compilerVersion: z.string().min(1),
    }),
    contract: z.object({
      inputs: z.array(parameterSchema),
      outputs: z.array(outputSchema),
      businessOutcomes: z.array(businessOutcomeSchema).default([]),
    }),
    // Plan: Milestone 7 | REQ-POL-000
    // Explicit configurable allowlist required by the assignment.
    policy: z.object({
      permittedTargets: z.array(z.string().min(1)).min(1),
      permittedRoutes: z.array(z.string().min(1)).default([]),
      permittedActionTypes: z.array(actionTypeSchema).min(1),
    }),
    targets: z.array(targetSchema),
    steps: z.array(capabilityStepSchema).min(1),
    successCheckpoint: checkpointSchema,
  })
  // Plan: Milestone 3 + Milestone 8 | REQ-ART-003, REQ-OUT-003/004
  // Cross-reference and safety validation happens before any surface interaction.
  .superRefine((artifact, ctx) => {
    const targetIds = new Set(artifact.targets.map((target) => target.id));
    const inputNames = new Set(artifact.contract.inputs.map((input) => input.name));

    // Milestone 3 | Assignment §3.2 | REQ-ART-003
    // Validate the whole reference graph before any observation or action occurs.
    const unique = (values: string[], label: string) => {
      if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", message: `Duplicate ${label}` });
    };
    unique(artifact.targets.map((x) => x.id), "target IDs");
    unique(artifact.steps.map((x) => x.id), "step IDs");
    unique(artifact.contract.inputs.map((x) => x.name), "input names");
    unique(artifact.contract.outputs.map((x) => x.name), "output names");
    unique(artifact.contract.businessOutcomes.map((x) => x.code), "outcome codes");
    const checkpoints = [artifact.successCheckpoint,
      ...artifact.contract.businessOutcomes.map((x) => x.checkpoint),
      ...artifact.steps.flatMap((x) => [...x.preconditions, ...x.postconditions])];
    if ((artifact.contract.outputs.length > 0 || checkpoints.some((checkpoint) => checkpoint.all.some((predicate) => predicate.kind === "target_value_equals_input")))
      && !artifact.policy.permittedActionTypes.includes("read")) {
      ctx.addIssue({ code: "custom", message: "Output/checkpoint reads require explicit read authority." });
    }
    for (const checkpoint of checkpoints) {
      for (const predicate of checkpoint.all) {
        if ("targetId" in predicate && !targetIds.has(predicate.targetId)) {
          ctx.addIssue({ code: "custom", message: `Unknown checkpoint target: ${predicate.targetId}` });
        }
        if ("input" in predicate && !inputNames.has(predicate.input)) {
          ctx.addIssue({ code: "custom", message: `Unknown checkpoint input: ${predicate.input}` });
        }
      }
    }
    for (const output of artifact.contract.outputs) {
      if (Number(Boolean(output.source.targetId)) + Number(Boolean(output.source.adapterSignal)) !== 1) {
        ctx.addIssue({ code: "custom", message: `Output '${output.name}' requires exactly one source.` });
      }
      if (output.source.targetId && !targetIds.has(output.source.targetId)) {
        ctx.addIssue({ code: "custom", message: `Unknown output target: ${output.source.targetId}` });
      }
    }

    for (const [index, step] of artifact.steps.entries()) {
      if (step.action.targetId && !targetIds.has(step.action.targetId)) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "action", "targetId"],
          message: `Unknown targetId: ${step.action.targetId}`,
        });
      }

      if (step.action.value?.kind === "input" && !inputNames.has(step.action.value.input)) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "action", "value", "input"],
          message: `Undeclared input: ${step.action.value.input}`,
        });
      }

      const { type, targetId, value, customAction } = step.action;
      if (["click", "type", "select", "read", "submit"].includes(type) && !targetId) {
        ctx.addIssue({ code: "custom", message: `Action '${type}' requires a target.` });
      }
      if (["type", "select", "navigate", "wait"].includes(type) && !value) {
        ctx.addIssue({ code: "custom", message: `Action '${type}' requires a value.` });
      }
      if (type === "custom" && !customAction) {
        ctx.addIssue({ code: "custom", message: "Custom action requires a name." });
      }
      if (value?.kind === "literal") {
        if (["type", "select", "navigate"].includes(type) && typeof value.value !== "string") {
          ctx.addIssue({ code: "custom", message: `Action '${type}' requires a string.` });
        }
        if (type === "wait" && (typeof value.value !== "number" || value.value < 0 || value.value > 30000)) {
          ctx.addIssue({ code: "custom", message: "Wait requires a duration between 0 and 30000 ms." });
        }
      }
      const requiresConservativeRetry =
        step.action.effect === "irreversible_write" || step.action.effect === "privileged";

      if (requiresConservativeRetry && step.recovery.retry.allowed && !step.recovery.reconciliationRequiredAfterAmbiguousCommit) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "recovery"],
          message:
            "Risky actions may only retry when ambiguous-commit reconciliation is explicitly required.",
        });
      }
    }
  });

export type CapabilityArtifact = z.infer<typeof capabilityArtifactSchema>;
export type CapabilityStep = z.infer<typeof capabilityStepSchema>;
export type Target = z.infer<typeof targetSchema>;
export type TargetStrategy = z.infer<typeof targetStrategySchema>;

# Interface.ai Computer-Use Automation

Validation status: September 21, 2026. Implemented behavior and observed results are distinguished below from proposed extensions. Reproduction commands are in [README.md](./README.md); detailed run records are in [P0_SECURITY_VALIDATION.md](./P0_SECURITY_VALIDATION.md).

## Architecture

The single-process TypeScript application separates discovery, authority, compilation, and replay:

```text
Goal + specification -> LLM proposals -> host validation -> external policy
                    -> browser actions -> verified discovery trace
                    -> compiled capability -> deterministic replay
```

OpenAI Responses API discovery operates a real, local synthetic member UI through Playwright. The host supplies a predeclared target catalog, action grants, typed inputs, and completion checkpoints. This restricts discovery to choosing an authorized workflow; it does not discover arbitrary applications or invent selectors. That cut makes authority reviewable and reduces model flexibility. Model-reported completion is insufficient: the host checks the resulting UI independently.

The compiler persists a capability before automatic replay in a fresh context. Replay has no model dependency. Playwright provides reliable browser interaction, but this demo does not establish robustness against arbitrary legacy desktop interfaces.

Observed genuine discovery used `gpt-4.1-mini-2025-04-14`: four completed provider calls, three UI actions, and host-verified success. The saved capability also succeeded with a second member input and zero replay model calls. These results establish this workflow's interoperability, not a general reliability rate.

## Artifact schema

The Zod-validated JSON contract includes schema version, capability identity/version, application and compatibility metadata, typed inputs/outputs, sensitivity declarations, external-authority constraints, ordered target strategies, steps, checkpoints, recovery rules, and discovery provenance. It contains no provider or Playwright types.

Actions bind invocation inputs by reference rather than embedding member values. The normal parser validates references and unsafe retry configurations. Targets carry ordered strategies and uniqueness requirements; the artifact defines permitted alternatives instead of allowing replay to improvise. Completion and business-outcome predicates express what must be observed after an action.

This is more explicit than a click recording and requires a reviewed specification. The benefit is an inspectable, parameterized capability that callers can invoke without replay-time reasoning. Compatibility tags describe intended applicability; they are not an implemented tenant registry or automatic version-certification system.

## Determinism & error handling

Replay follows artifact order, resolves declared targets in order, applies bounded waits/retries, checks session and policy state, and evaluates checkpoints. Determinism refers to the execution algorithm; an asynchronous or changed UI can still fail. Missing/ambiguous targets and checkpoint failures stop execution rather than trigger locator invention.

Results distinguish `SUCCESS`, `BUSINESS_OUTCOME`, `RECOVERABLE`, `INTERVENTION_REQUIRED`, and `FAILURE`. A possibly committed risky operation must satisfy reconciliation checks; uncertain commit state does not permit blind retry. Evidence-capture failures are recorded separately from application outcomes where the runner can continue reporting them.

| Observed execution | Result |
| --- | --- |
| Genuine discovery and automatic replay | `SUCCESS` |
| Saved-artifact replay with second input | `SUCCESS`; zero model calls |
| Missing member | `BUSINESS_OUTCOME / MEMBER_NOT_FOUND` |
| Injected session expiry | `INTERVENTION_REQUIRED / SESSION_EXPIRED` |

The exceptional runs stopped before executing the blocked third step. CLI exit status alone is insufficient: these expected dispositions can exit 0. Full recorded verification passed `npm run typecheck`, `npm run build`, and `npm run coverage` with 202 tests and 100% configured statement, branch, function, and line coverage. These checks also passed in a clean export of committed revision `30181831`, with a new dependency installation under Node 24.21.0. Offline discovery and saved genuine-artifact replay succeeded there. Authenticated discovery and manual handoff were not repeated in that export.

## Heterogeneity & multi-tenant

`SurfaceAdapter` separates observation, targeting, actions, evidence, and session ownership from the recorded workflow. The schema admits accessibility, structural, visual, and terminal-field concepts; currently the concrete implementations are Playwright and the test fake. A desktop adapter would map OS accessibility or bounded visual targeting into the same contracts and explicitly reject unsupported operations. Declaring a strategy in the schema does not prove an adapter implements it.

Proposed reuse would resolve a vendor-family base capability, then a reviewed product-version specialization, then a tenant specialization into one immutable validated artifact. Invocation inputs supply data only. Overrides should be explicit and conflict-checked; effective authority should intersect deployment policy rather than expand through tenant configuration. Changes to targets, checkpoints, or recovery would require revalidation and a new capability version.

Existing target/checkpoint failures expose some drift. A future compatibility preflight would verify version/fingerprint expectations, quarantine incompatible artifacts, and require reviewed rediscovery when bounded specialization is insufficient. Promotion would combine contract tests, representative tenant replays, and approval. Telemetry could track failure rates per artifact/version; it must never silently rewrite production behavior. Registry, override merging, automated drift classification, and promotion are design proposals, not implemented services.

## Escalation & handoff

Replay routes intervention when session state, checkpoints, policy approval, or uncertain outcomes prevent safe continuation. `HumanHandoffCoordinator` pauses action admission, drains an in-flight action, and transfers the same adapter session to human ownership. The headed CLI exposes the existing Chromium page. The operator clicks **Release session** and explicitly signals `resume`; click/change kinds and element tags are recorded without typed values.

The coordinator verifies resumed state before restoring automation ownership. Replay continues at the blocked step; previously completed actions are not restarted. A human-completed uncertain operation needs reconciliation, and handback does not itself grant risky-action approval. Routing or verification failure cannot silently restore control.

Automated tests cover these seams. Genuine headed run `ae8edcd1-5ebf-4c32-b32a-417f05a797a3` succeeded after the user clicked the release control and explicitly signaled handback. Evidence records human action kinds, failed then passing readiness checks, and continuation without repeating the completed prefix. Ownership checks execute in the coordinator; individual ownership transitions are not separately persisted. An earlier attempt with a closed page correctly rejected handback. The operator identity is a local demo label, not authenticated enterprise identity; ownership is in-memory, not a durable session lease.

## Safety

Authority comes from host contracts and external policy, never page text or model output. Origin/route/action constraints apply at runtime; irreversible and privileged actions receive conservative approval and recovery treatment. Saved demo artifacts remain bound to their original origin and port.

Sensitive inputs stay host-bound. The model receives input metadata and sanitized observations. Contract-aware whole-bundle sanitization registers sensitive values before persistence, including discovery outputs seen before successful extraction. Provider evidence retains allowlisted metadata rather than raw responses or free-form error messages. Structural DOM snapshots omit text, values, attributes, and URLs, sacrificing visual diagnostic detail to limit leakage.

Transport and real-browser mocked-provider tests place canaries in live state and scan complete requests and persisted files. Scans of genuine success/replay and runtime-taxonomy bundles found zero tested sensitive values or credential patterns. These checks are scoped evidence, not universal privacy guarantees. Sensitive-target classification currently requires supported, unambiguous standard CSS selectors and fails closed otherwise; undeclared sensitivity or transformed copies remain limits to assess before broader use.

## Cuts

The implementation deliberately omits desktop automation, a tenant registry, distributed orchestration, durable handoff leases, an authenticated operator console, and autonomous target discovery. These would obscure the current trust-boundary validation without proving the core workflow.

A local reviewer evidence archive is prepared. The unused standalone `chromium` dependency was removed, clearing the three reported audit findings. Clean installation, typecheck, build, all 202 coverage tests, and offline browser execution passed again. Separate delivery remains outstanding. Broader production work should start with adapter/privacy limits and durable ownership, then reviewed compatibility/promotion rules. CI configuration exists; no remote CI result is asserted here.

Generated `evidence/` remains gitignored at the user's direction. The genuine run is locally recorded under `evidence/live-validation/02def122-935d-4638-b66b-584849d5bffb/`; second-input replay is `282b5e47-c15a-4958-ae4d-912e129c3b56/`; exceptional-run assertions are in `evidence/runtime-taxonomy/validation.json`; handoff assertions are in `evidence/human-handoff/validation.json`. A checkout alone therefore does not provide these new bundles. The local package is `evidence/review-package-2026-09-21.zip`, with per-file hashes; it has not been sent. No evidence was force-added to Git.

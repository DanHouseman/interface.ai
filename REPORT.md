# Interface.ai Computer-Use Automation

Implementation status: September 30, 2026. Setup and exact demonstration commands are in [README.md](./README.md). Historical run provenance and limitations are in [evidence/submission/README.md](./evidence/submission/README.md).

## Architecture

The single-process TypeScript application separates discovery, authority, compilation, and replay:

```text
Goal + reviewed application specification -> LLM proposals -> host policy
  -> real browser actions -> verified trace -> capability artifact
  -> deterministic replay with new inputs -> structured result
```

The CLI accepts `--goal` and `--target synthetic-member-desk`; the GUI accepts goal text for the same application. The target ID resolves to the local sample app started on `--port`. Unknown targets and blank or oversized goals are rejected before execution. A privacy-safe projection of the caller's goal reaches the model, while reviewed controls, grants, typed inputs, and member-lookup success conditions remain host-defined. Arbitrary applications and tasks are unsupported. This limits discovery flexibility but makes authority and completion reviewable.

OpenAI discovery operates Chromium through Playwright. The model chooses actions from the supplied controls; it cannot invent selectors or permissions. Host checkpoints verify completion. The compiler saves the capability before replay in a fresh browser context. Replay has no model dependency. The offline model is an explicitly scripted fixture, not evidence of LLM discovery.

Replay validation and action construction are separate functions. Shared value binding and risk rules reduce drift between consumers. The local GUI receives snapshots through SSE and sends commands through token-protected HTTP POSTs. This is a convenience around the same execution path, not a distributed orchestration system. Client snapshots are replaced on each event without runtime deep freezing.

## Artifact schema

The Zod-validated JSON artifact contains schema and capability versions, application metadata, typed inputs/outputs, sensitivity declarations, policy, ordered target strategies, actions, checkpoints, recovery rules, and discovery provenance. It is independent of provider and Playwright types.

Actions bind invocation inputs by name rather than embedding member values. Parsing checks target/input references, output sources, and unsafe retry configurations. The compiler copies host-reviewed contracts and records successful executed actions separately from the model transcript. Sensitive literals are rejected instead of silently changing executable behavior through redaction.

Targets express ordered strategies and uniqueness requirements. The browser adapter supports selectors, accessible roles/labels, structural relationships, and explicit coordinates. The standard workflow uses reviewed CSS IDs. A legacy variant uses nested tables, unlabeled inputs, and clickable spans with no IDs or semantic roles. Its structural anchors and uniqueness checks support discovery, sensitive extraction, and changed-input replay. This is one representative legacy surface, not arbitrary-app support. Compatibility tags document intended applicability; they do not implement automatic version certification.

## Determinism & error handling

Replay follows artifact order, resolves declared targets deterministically, applies bounded waits/retries, checks policy and session state, verifies checkpoints, and returns typed outputs. Every checkpoint read passes the effective host/artifact policy, including business outcomes and reconciliation. It never asks a model to repair a failing step. Results distinguish success, expected business outcomes, recoverable conditions, intervention, and hard failure. Risky or ambiguous actions require reconciliation; unresolved commit state prohibits blind retry.

The demo reports missing members and invalid identifiers as business outcomes. Session expiry permits takeover of the existing window and blocks handback until the application session is restored. Target-resolution failures follow the declared escalation policy. A host-configured permission-denial indicator returns `PERMISSION_DENIED`, including when it appears while a target is being resolved. Unrelated page text does not trigger that classification. Missing targets without the indicator remain `TARGET_RESOLUTION_FAILED`. Classification does not alter artifact permissions or require rewriting older saved capabilities.

Dialogs are latched across action types and delayed events until verified human handback; uncertain writes retain reconciliation requirements. Structured traces identify steps, policy decisions, observed checkpoints, recovery, and evidence. After the discovery loop starts, every terminal result attempts a structural snapshot, including stuck, exhausted-budget, failed-checkpoint, and denied-action paths. Capture errors remain secondary evidence failures. Preflight rejection and concurrent-run rejection do not inspect the live session. Replay also captures failure evidence.

The curated genuine run records four completed OpenAI calls, three UI actions, successful compilation, and replay. The same artifact succeeds with a second member input and zero model calls. Included exceptional replays show not-found and expired-session outcomes. Current regressions additionally cover permission denial and richer discovery failure capture. These results demonstrate this workflow, not a general reliability rate.

## Heterogeneity & multi-tenant

The artifact/replay boundary uses observations, opaque resolved targets, actions, checkpoints, evidence, and session ownership. Consumers depend on the surface capabilities they use: execution, checkpoint evaluation, or handoff. Browser-specific targeting remains inside the Playwright adapter. A legacy-web or desktop adapter could map accessibility or visual controls to these contracts and explicitly reject unsupported strategies. Only Playwright and the test fake are implemented.

For future reuse, resolve a vendor-family capability with reviewed version and tenant specializations into one validated artifact. Invocation parameters supply data; overrides must be explicit and conflict-checked. Effective authority should intersect deployment policy. Changes to targets, checkpoints, or recovery require revalidation and a new version.

Existing checkpoint and target failures expose some drift. A future compatibility preflight could check version/fingerprint expectations, quarantine incompatible artifacts, and require reviewed rediscovery. Representative tenant replays would support promotion. Registry, override merging, drift classification, and promotion infrastructure are design proposals only.

## Escalation & handoff

Blocked discovery or replay can route an intervention request containing capability, step, reason, observation, and evidence. The coordinator pauses action admission, drains an in-flight action, and transfers ownership of the same browser session to the human. The CLI exposes the existing window and waits for explicit `resume`; the GUI supplies equivalent handback controls. Human events include numeric control paths and document IDs, navigation, click/change/input/focus events, and control keys. Labels, URLs, element IDs, printable keystrokes, and typed values are excluded.

Handback verifies readiness before returning control to automation. Replay resumes at the blocked step without restarting the completed prefix. Discovery retains its original step/time budget. Handback cannot grant risky-action approval, renew the budget, or authorize an uncertain retry. Failed verification leaves automation stopped.

Curated evidence distinguishes genuine human discovery handoff using the offline fixture from automated replay handoff tests. The live-model discovery record is separate. Ownership is in memory, and operator identity is a local label. These are deliberate limits of a minimal real handoff, not authenticated enterprise session management.

## Safety

Authority comes from host contracts and policy, never model output or page text. Origin, route, and action checks constrain execution. Browser request guards cover navigation and subresources. Submit/custom actions and irreversible effects receive conservative approval and recovery treatment. Saved artifacts remain bound to their recorded origin and port.

Sensitive input values remain host-bound. Model context and persisted bundles project observations onto reviewed public workflow text and finite session state; raw titles, URLs, control trees, action values, and error messages are omitted. Goal/rationale projection retains only supported vocabulary. Checkpoint diagnostics report matches rather than raw observed values. Provider records retain allowlisted metadata, not raw responses. Structural snapshots omit text, values, attributes, and URLs, sacrificing diagnostic detail to reduce leakage.

Tests cover undeclared personal data and encoded copies in goals, UI text, and diagnostics. Classification supports CSS, accessible, label, and structural targets; ambiguous controls fail closed. Raw live state remains in process. Reviewed configuration and typed output sensitivity remain trust boundaries, so new applications require explicit review. Goal text cannot expand grants or redefine the success condition.

## Cuts

The implementation omits arbitrary-app discovery, desktop automation, tenant infrastructure, queues, distributed orchestration, durable handoff leases, and a full co-browsing console. The assignment requires the core browser workflow and credible extension seams; building those systems would not establish additional correctness here.

Validation counts and commands are maintained in README and the latest ELOG entry. Tests use scripted or mocked models and do not make authenticated provider calls. The original genuine discovery evidence remains unchanged. `npm run verify:evidence` builds the project and checks the full checksum inventory, parsed artifacts, expected outcomes, and portable snapshot references; hashes establish integrity, not provider authenticity.

New curated regression bundles demonstrate the legacy surface, changed-input replay, current execution of the genuine artifact, and automated expiry recovery. Broader use still requires application-specific compatibility and error-indicator validation. Public repository accessibility, remote CI, and submission email require separate verification; this report does not assert their completion.

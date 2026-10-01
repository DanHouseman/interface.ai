# Implementation log

Dated notes on what changed and what I checked. Older entries describe the code at that time, including defects and work that was still open. Use the latest entry and README for current status.

## 09/30/2026 Assignment review fixes

### Fixes, in priority order

1. **G1/G5: authority and privacy.** Checkpoint reads now use the effective invocation policy in every checkpoint phase. Export sanitization projects observations onto host-reviewed workflow text and finite session state; raw diagnostic strings, titles, URLs, control trees, and action values are omitted. Goal/rationale text is restricted to reviewed workflow vocabulary. Model control metadata is kept separate from untrusted observations so sensitive target names cannot erase grant definitions.
2. **G3/G4: escalation and session recovery.** Missing targets follow `onFailure`. Expired but open sessions can transfer to an operator; premature handback remains blocked, and closed sessions produce an explicit error. The synthetic application supports a real same-window restore path.
3. **G2: dialogs.** Dialog detection persists across all action types and delayed events until verified handback. Uncertain side effects retain reconciliation requirements. Discovery, replay admission, and checkpoint verification all recognize the pending dialog.
4. **G6: human audit.** Records identify controls using numeric DOM paths and host-assigned document IDs. Navigation, focus, input/change, clicks, and non-printable control keys are captured without URLs, labels, element IDs, printable keystrokes, or values. The exposed binding validates event data.
5. **G7: legacy targeting.** `--variant legacy` runs a table-based demo with no IDs, semantic labels, roles, or test attributes. Structural targets support successful discovery/replay, new inputs, slow responses, validation outcomes, not-found results, and permission denial. Sensitive target classification now supports non-CSS locator strategies.

### Checks

- `npm run typecheck` and build passed.
- `npm run coverage`: **282 tests across 20 files**, 100% statements (1452/1452), branches (1110/1110), functions (249/249), and lines (1078/1078). Thresholds and configured coverage scope were preserved.
- Additional regressions reproduce the original authorization, privacy, expiry, missing-target, and dialog defects, and verify their fixed behavior.
- Captured four successful real-browser runs, including original genuine-artifact replay, structural legacy discovery, changed-input legacy replay, and expired-session recovery without repeated prefix actions.
- Submission verifier: **118 hashed files, 13 parsed artifacts**, expected outcomes and handoff assertions, zero tested sensitive matches, and portable references resolved.
- TypeScript production changes, test fixtures, scripts, and documentation passed whitespace/syntax checks.

### Evidence and scope

The original live-model and human evidence is unchanged. Newly captured discovery uses an offline scripted fixture; new takeover evidence uses an automated operator callback. No authenticated model call was made. Optional stretch goals were not added.

## 09/26/2026 Assignment Alignment Fixes

### Changes

- Added discovery `--goal` and `--target` arguments. The supported target is the application ID `synthetic-member-desk`, resolved to the local app started on `--port`. Shared validation rejects blank/oversized goals and unsupported targets before execution. Replay/handoff reject CLI goal/target overrides because their behavior comes from the saved artifact.
- Passed caller goal text through `runDemo` to the discovery model. Changed the existing GUI goal control to a text input and forwarded it to the same backend. Reviewed grants, output contracts, and success conditions remain limited to member lookup; goal text cannot authorize other tasks. The offline fixture still follows its script.
- Centralized final discovery evidence capture after the loop returns, covering stuck, step limit, failed completion/preconditions, and policy denial. Exceptions retain capture through the existing error path. Capture failure preserves the original result; invalid requests and run conflicts do not inspect an active session.
- Added an optional host-configured permission-denial selector to the browser adapter. The demo binds it to its exact result indicator. Resolution checks it before targeting and after resolution failure; execution checks it before performing an action. Typed `PERMISSION_DENIED` errors survive replay action construction. Unrelated page text does not trigger the indicator, and ordinary missing-target failures remain distinct.
- Added CLI configuration, goal forwarding, terminal evidence, GUI input, and browser permission-denial regressions. The real-browser stuck test reads the persisted structural snapshot, and replay tests verify that denial prevents the next action.
- Updated README commands and options, rewrote REPORT under the required seven headings to describe current behavior and limits, and removed stale validation/delivery claims. Existing curated evidence was left unchanged.

### Checks

- `npm run typecheck` and `node --check src/gui/panel.js` passed.
- Focused CLI/discovery/browser/GUI suite passed: 118 tests.
- `npm test -- --coverage` passed: 260 tests across 19 files with 100% configured statements, branches, functions, and lines. No authenticated model calls were made.
- `npm run verify:evidence` passed, including build: 81 hashed files, nine parsed artifacts, zero tested sensitive matches, and all referenced snapshots resolved.
- `git diff --check` passed.

### Scope

- No new framework, transport, service, infrastructure, or artifact schema was introduced.

## 09/26/2026 Execution Refactor and GUI State Streaming

### Changes

- Extracted replay invocation validation into `src/replay/validate-invocation.ts` and action construction into `src/replay/action-builder.ts`. Replay retains orchestration, authorization, trace ordering, recovery, and handoff decisions.
- Centralized input/literal value binding and runtime risk classification in `src/domain/action.ts`. Discovery keeps its distinct validation and custom-action restrictions. Artifact retry validation continues to use declared effects; runtime policy also treats submit/custom actions as risky.
- Split surface contracts by responsibility. Replay and discovery consume `ExecutionSurface`, checkpoints consume `CheckpointSurface`, and handoff consumes `HandoffSurface`. Existing adapters retain the full `SurfaceAdapter` contract.
- Replaced the GUI's one-second `/api/state` polling loop with one native `EventSource` connection to `/api/events`. Setup changes, run progress, model-call counts, handoff, cancellation, and completion publish state snapshots. Commands retain token-protected POSTs and existing local-origin checks.
- Added `src/gui/state-stream.ts` to own subscriptions, snapshot framing, disconnect cleanup, and shutdown. A blocked client retains only its newest pending snapshot while the response buffer drains; other clients continue receiving updates.
- Added fresh snapshots and session tokens on reconnect, disabled execution controls while disconnected, closed streams on page navigation, and cleared stale run displays after a server restart.
- Kept `/api/state` available for explicit snapshots and diagnostics. Library refreshes are serialized and occur on connection, explicit refresh, and run completion. Run validation independently scans saved artifacts before execution.
- Added surface-contract tests, stream lifecycle/backpressure tests, and browser coverage for zero panel state GETs, pushed updates, restart/reconnect, token renewal, and manual artifact refresh. Made the default-port test bind an ephemeral port while asserting that the launcher requests port 4310, avoiding interference with a running GUI.
- Updated README with execution boundaries, stream behavior, refresh semantics, and current validation counts.

### Decisions and limits

- Keep client snapshots as ordinary parsed JSON and replace them on each event, with form state held separately. Removed runtime deep freezing and its dedicated assertions: traversing each snapshot adds work without an established mutation defect in this panel. No performance improvement has been benchmarked.

- State updates flow from server to browser, so SSE fits the existing HTTP command API. WebSocket remains an option if bidirectional streaming becomes necessary; this application has no gRPC backend to reuse.
- Reconnect sends current state rather than replaying every transport event. Each snapshot contains the retained run history and activity records. Slow clients may skip intermediate snapshots.
- Elapsed time updates when state arrives. Artifacts created by another process appear after **Refresh** or reconnection. There is no periodic network refresh or filesystem watcher.
- Existing approval, ambiguous-commit, retry, redaction, and handoff behavior was preserved. The refactor does not introduce new permissions or model calls.

### Checks

- `npm run typecheck` passed.
- `npm test -- --coverage` passed: 248 tests across 19 test files; 100% configured statements, branches, functions, and lines. Coverage measures TypeScript production modules; `panel.js` is exercised through browser tests.
- Browser tests confirmed one initial event-stream request and zero panel `/api/state` requests across ten seconds of advanced browser time, then verified pushed state, cancellation, automatic reconnect after restart, commands using the renewed token, and explicit artifact refresh.
- `npm run verify:evidence` passed, including its build step: 81 hashed files, nine parsed artifacts, zero tested sensitive matches, and all referenced snapshots resolved.
- `git diff --check` passed. Browser/server tests required execution outside the filesystem sandbox so Chromium and local listeners could start.

### Restart after updating

- Restart the running GUI process and reload the panel to use the updated server and browser code. The existing GUI process was left running during development.
- Commit creation, publication, and remote CI remain separate steps.

## 09/22/2026 GUI Control Panel, Setup Script, and Coverage Closure

### Changes

- Added and documented the local GUI control panel flow, including `npm run gui`, default port behavior, saved capability scanning, replay, live discovery setup, and same-session handoff coverage.
- Added a top-level README TLDR with the setup path, GUI launch command, and the ordered commands used under the hood.
- Added `scripts/setup.mjs` and `npm run setup` as a single installation/verification entrypoint. The script outlines the plan, prints each command in blue parentheses, renders active steps in cyan in place, marks passes green, marks failures red, captures command output during normal execution, and prints captured output only when a step fails.
- Added `--print-only` to preview the setup plan without running the install/build/test commands, and `--launch-gui` to start the GUI after successful setup.
- Expanded `test/gui.test.ts` to cover GUI server request validation, browser setup state, saved artifact filtering, active-run guards, live model wrapping, run history trimming, cancellation, launcher startup/error paths, abort cleanup, and same-session handoff behavior.
- Tightened GUI/server and abort-cleanup branches so coverage tracks executable behavior without unreachable fallback counters.
- Fixed TypeScript mock shapes in GUI tests by returning a full `ReplayResult`, using a typed capability placeholder, passing a complete `InterventionRequest`, and supplying required `DemoOptions.live` values.

### Checks

- `npm run typecheck` passed after the GUI test type fixes.
- `npx vitest run test/gui.test.ts` passed: 9 tests.
- Full coverage passed after GUI coverage work: 241 tests with 100% statements, branches, functions, and lines.
- `node --check scripts/setup.mjs` passed.
- `npm run setup -- --print-only` passed and displayed the ordered setup plan without executing the heavyweight setup steps.

### Follow-up at the time

- The in-place setup display is intended for interactive terminals. CI and non-TTY logs still receive regular line output.

## 09/22/2026 Documentation and Submission Update

### Changes

- Standardized the runtime on Node 26.x in package metadata, lockfile, CI, and .nvmrc.
- Removed public-document references to local preparation notes and excluded those notes from Git tracking while retaining local copies.
- Retained curated assignment evidence under evidence/submission/, including genuine discovery, saved artifacts, deterministic replay, exceptional outcomes, handoff, provenance, and checksums. Generated runs remain ignored.
- Updated README with current CLI capabilities and explicit limits; added high-level architecture and user workflow Mermaid diagrams configured for ELK layout. A graphical launcher and arbitrary-window control remain unimplemented.

### Checks

- Evidence verification and TypeScript checks rerun for this documentation/configuration update; prior application validation remains 232 tests with 100% configured coverage.

## 09/22/2026 Completed

### Milestone 20: Audit Repairs, Curated Evidence, and Usable CLI

### Changes

- Sanitized classified checkpoint diagnostics before trace flattening, removing the failed-output privacy dependency on successful extraction. Preserved actual checkpoint boolean results.
- Connected discovery intervention to same-session human takeover with explicit handback, verification and original step/time limits. Approval, uncertain actions and exhausted budgets cannot be bypassed. Added `--operator` and the discovery-handoff scenario.
- Verified genuine human release/handback with scripted discovery, compilation and replay. This is labeled separately from genuine OpenAI discovery.
- Completed `evidence/submission/` with nine curated run directories, provenance, checksums, relative snapshot references and a verifier. Generated runs and archives remain ignored.
- Separated snapshot identifiers from redacted session IDs so new evidence references resolve.
- Bare `npm run demo` now shows help. Added `--headed` and `--slow-mo`; operator mode is visible. Added safe preflight diagnostics for artifact, origin, server and browser setup failures.
- Preserved the Node 26 runtime choice, broadened the exact runtime pin to `^26.6.2` so it includes tested Node 26.10.0, and aligned CI runtime configuration.
- Updated README, report, assessment and interview defenses to reflect the verified repairs.

### Tests

- Typecheck and build pass; 232 tests pass with 100% statements (1042/1042), branches (765/765), functions (182/182) and lines (819/819) under Node 26.10.0.
- Wrong-type replay still reports `INVALID_OUTPUT_TYPE`, now without sensitive balance text. Regression cases include missing/wrong outputs, failed checkpoints, partial extraction and boolean-sensitive values; persisted snapshot references also remain usable.
- `npm run verify:evidence` passes: 81 hashed files, nine parsed artifacts, zero tested sensitive matches and all snapshot references resolvable, without browser or provider calls.
- Manual discovery takeover: `578cd282-8cf4-4ba1-81e6-16fde6528edc`. Included genuine source: `cd70493f-ed42-4aa5-85e6-245d19b81f30`.
- An intermediate 231-test run failed the branch coverage threshold; CLI validation tests and unreachable post-validation fallbacks were corrected before the final passing run.

### Follow-up at the time

- Review and commit the changes, verify the public repository and remote CI, then submit the URL.
- This pass made no new model API calls and did not publish the changes.

## 09/21/2026 Completed

### Milestone 19: Assignment Reassessment and Interview Preparation

### Requirements

- Rechecked Assignment A sections 2-6 and 9-11, including every core subsection in section 3.
- Distinguished mandatory implementation, permitted design-only scope, and submission gates.

### Changes

- Recorded the assignment review locally, with requirement traceability, evidence classifications, objections, findings, reproduction details, and acceptance gates.
- Prepared local interview notes with concise technical defenses, alternatives, limits, likely challenges, and explicitly conditional cost/reliability/memory reasoning. No personal credentials or professional experience were invented.
- Updated README and linked historical assessment/report to the current findings.
- Preserved the pre-existing `.gitignore` edit removing `/evidence/`. No evidence was staged, published, or sent; application source was not changed during this audit.

### Tests

- Re-extracted and reviewed the actual ten-page assignment PDF.
- `npm run build` and `npm run coverage` passed under Node 24.21.0: 202 tests across 16 files; all four configured coverage metrics remain 100%.
- A new real-browser failure-path experiment changed only the sensitive balance output type to number in a schema-valid saved artifact. Replay returned `INVALID_OUTPUT_TYPE` with outputs absent, and persisted checkpoint text still contained the synthetic balance. Scratch run: `/private/tmp/interface-audit-B9ANJR/f5a9d883-501d-49e7-b3c0-0523ef48032e/`.
- The experiment is a reproduced privacy failure, not a passing acceptance check. Existing coverage does not establish requirement completeness. No fresh paid model call was made.

### Still open at the time

- Fix sensitive checkpoint/output classification on failed replay and add canary regressions.
- Route stopped discovery into real same-session operator takeover; current integration only enables takeover during replay.
- Curate required repository evidence, verify publication, and follow assignment submission instructions. The application must not currently be described as 100% aligned.

### Milestone 18: Dependency Audit Remediation

### Changes

- Removed unused standalone `chromium` and its installation-script permission. Source and tests use Playwright's Chromium API; no application code or browser behavior was changed.
- Regenerated the lockfile, removing the vulnerable standalone dependency tree.
- Reinstalled from the updated lockfile in the isolated source export under Node 24.21.0.
    `npm audit --json` passed with zero reported vulnerabilities.

### Tests

- Typecheck, build, and all 202 tests passed; all four configured coverage metrics remain 100%.
- Offline browser discovery/replay succeeded: `evidence/dependency-validation/f0811e3c-41e1-4b82-a53c-d623c51fab69/`.
- Refreshed the local reviewer package and verified per-file hashes and ZIP integrity. No external delivery or commit was performed.

### Milestone 17: Clean Installation and Evidence Packaging

### Changes

- Exported committed revision `30181831` into an isolated directory and installed locked dependencies under Node 24.21.0. Typecheck, build, and all 202 coverage tests passed; configured coverage remains 100% across all four metrics.
- Executed offline discovery/replay and second-input replay of the genuine artifact from the clean installation. Both succeeded; replay made zero model calls.
- Prepared a local gitignored reviewer ZIP with selected evidence, documentation, and per-file hashes. No external delivery occurred.

### Still open at the time

- `npm audit` reports three high-severity findings through standalone `chromium` and its dependencies. No automatic dependency fix was applied.
- Live discovery, exceptional scenarios, and human handoff were not repeated in this clean export. Prior successful runs remain separately identified.

### Milestone 16: Assignment Report and Operator Acceptance

### Changes

- Added `REPORT.md` with the assignment's seven exact headings, covering architecture, artifact design, deterministic outcomes, tenant extension design, handoff, safety, and cuts.
- Distinguished observed runtime results from mocked tests and proposed infrastructure.
- Documented that generated evidence stays gitignored and must be reviewed and delivered separately or regenerated for a reviewer.

### Tests

- Checked report headings against the assignment PDF, source claims against the implementation, and local Markdown links. `git diff --check` passed.
- The headed handoff command built successfully. The first operator attempt returned `FAILURE / EXECUTION_FAILED` with `RESUME_CHECKPOINT_FAILED`; its failure trace reports a closed page. Automation did not execute the blocked step after handback.
- Failed-run evidence: `evidence/human-handoff/eaa65b49-ab42-40b8-82a2-5fe532061d96/`. The next attempt succeeded after genuine operator interaction and explicit handback.
- Successful handoff: `evidence/human-handoff/ae8edcd1-5ebf-4c32-b32a-417f05a797a3/`. The saved artifact parsed unchanged, replay made zero model calls, readiness changed from failing to passing, and only the blocked step was retried. The completed prefix was not repeated.
- Scanned 21 handoff files, including both attempts and `validation.json`: zero occurrences of the specified member IDs, balances, canaries, and credential patterns. Individual ownership transitions are checked in code but are not separate persisted events.

### Milestone 15: P0 Security and Genuine Discovery Validation

### Requirements

- `REQ-DISC-001...004`
- `REQ-ART-001...004`
- `REQ-RPL-001...004`
- `REQ-EVD-001/002`
- `REQ-POL-000...003`

### Tests

- `test/p0-security.test.ts`: real-browser canary checks with mocked provider transport, including successful and stopped discovery. These tests do not count as genuine LLM proof.
- `test/model-and-cli.test.ts`: outbound structured schema, nullable argument normalization, safe provider error metadata, and CLI diagnostics.
- Last full validation: type checking and build passed; coverage ran 202 passing tests with 100% statements, branches, functions, and lines on 09/21/2026.
- Genuine discovery, a separate second-input replay, and two runtime taxonomy executions were inspected independently of the mocked-provider tests.

### Changes

- Kept sensitive invocation values host-bound. Discovery receives input metadata and sanitized context, while the host supplies actual input values to authorized actions.
- Sanitized whole evidence bundles before persistence, including sensitive values copied into observations, errors, and object keys. Unsupported sensitive-target classification fails closed.
- Added an independent host completion checkpoint and rejected sensitive artifact literals.
- Persisted discovery and its independently parseable capability before deterministic replay.
- Connected OpenAI Responses API discovery with strict structured output and safe diagnostics. Corrected the provider schema to use nested `anyOf` without relaxing host decision validation.
- Verified the genuine run with `gpt-4.1-mini-2025-04-14`: four completed HTTP 200 responses, three UI actions, host-verified completion, parsed artifact, and successful replay.
- Replayed that saved artifact with `DEMO-002` in a separate execution with zero model calls.
- Verified `BUSINESS_OUTCOME / MEMBER_NOT_FOUND` and `INTERVENTION_REQUIRED / SESSION_EXPIRED` against the same artifact and real local browser. Expiry was injected through the demo scenario; both executions stopped without further actions.
- Scanned the two successful bundles (16 files) and runtime taxonomy records (15 files) for specified member IDs, balances, canaries, and credential patterns, with zero matches. This establishes the stated scan scope, not universal absence of sensitive data.
- Updated README installation, actual Node engine range, CLI workflows, configuration, evidence interpretation, troubleshooting, and remaining validation limitations.

### Evidence

- Genuine discovery: `evidence/live-validation/02def122-935d-4638-b66b-584849d5bffb/`.
- Second-input replay: `evidence/live-validation/282b5e47-c15a-4958-ae4d-912e129c3b56/`.
- Runtime outcome assertions: `evidence/runtime-taxonomy/validation.json`.
- Detailed chronology and validation limits: [P0_SECURITY_VALIDATION.md](./P0_SECURITY_VALIDATION.md).

### Still open at the time

- Assessment items #7 and #8 are now recorded in Milestone 16 and `REPORT.md`.
- Clean-source install verification and local evidence packaging are now recorded below.
- Dependency audit remediation and actual reviewer delivery remain.
- Sensitive-target classification remains limited to supported, unambiguous standard CSS selectors.

## 09/19/2026 Completed

### Milestone 14: Connect discovery and human handoff

### Requirements

- `REQ-DISC-001...004`
- `REQ-ART-001...004`
- `REQ-RPL-001...004`
- `REQ-HITL-001...003`
- `REQ-EVD-001/002`
- `REQ-POL-000...003`

### Tests

- `test/discovery-handoff.test.ts`
- Discovery end-to-end workflow coverage for deterministic capability compilation and authority boundary enforcement.
- Same session HITL coverage for ceding and reacquiring the existing adapter session.
- Corrected discovery test fixtures to satisfy the current typed `DiscoveryRequest` input contract, including the required `memberId` input used by the discovery specification.

### Changes

- Connected discovery, compilation, and handoff in the same typed test workflow.
- Corrected the discovery end-to-end workflow so `DiscoveryEngine` is instantiated through the current implementation contract and exercised as a real constructor in the test path.
- Aligned discovery request fixtures with the current capability specification input contract, including the required `memberId` value.
- Verified successful discovery can produce a deterministic capability suitable for the existing replay architecture.
- Verified discovery is blocked when the observed surface leaves the authorized authority boundary.
- Verified automation can cede and reacquire the same adapter session through the HITL coordinator without replacing the underlying surface session.
- Discovery can use a model. Compiled replay remains model-free.

### Still open at the time

- Connect a real model provider to `DiscoveryModel`.
- Execute and persist a genuine LLM driven discovery run against the Playwright browser surface.
- Persist the generated capability and discovery evidence under `/evidence/`.
- Replay the generated capability without an LLM and persist replay evidence.
- Exercise the HITL coordinator against the live Playwright browser session and persist the intervention evidence.

## 09/18/2026 Completed

### Milestone 11: Genuine LLM Discovery Foundation

### Requirements

- `REQ-DISC-001...004`
- `REQ-POL-000...003`
- `REQ-EVD-001`

### Tests

- Discovery engine tests covering bounded observe, decide, policy check, act behavior, successful termination, failure, and intervention paths.

### Changes

- Added a bounded `DiscoveryEngine` implementing the observe, decide, act discovery loop.
- Added a provider independent `DiscoveryModel` boundary so discovery may use an LLM without introducing a model dependency into deterministic replay.
- Added explicit discovery request and result contracts, including goal, target URL, authorized context, maximum steps, and timeout boundaries.
- Added discovery authority enforcement for permitted origins and routes before surface interaction.
- Added structured discovery trace events for observations, model decisions, policy decisions, actions, and resulting states.
- Added explicit `SUCCESS`, `FAILURE`, and `INTERVENTION_REQUIRED` discovery outcomes.
- Kept model proposed actions subordinate to external policy authority.
- Preserved the existing `SurfaceAdapter` boundary so discovery and replay operate against the same surface abstraction without coupling replay to an LLM provider.

### Milestone 12: Discovery to Capability Compilation Foundation

### Requirements

- `REQ-DISC-003`
- `REQ-ART-001...004`
- `REQ-RPL-001...004`

### Tests

- Capability compiler tests covering successful trace compilation and artifact validation.

### Changes

- Added `CapabilityCompiler` to convert a successful discovery trace into the existing typed, runtime validated capability artifact.
- Compilation preserves the separation between raw model interaction and the reusable production capability contract.
- Generated capabilities remain plain serializable data and contain no model provider or Playwright runtime dependency.
- Compiled capabilities are validated through the existing artifact schema before they can enter deterministic replay.
- The existing `DeterministicReplayEngine` remains the production execution path after discovery and compilation complete.

### Milestone 13: Same Session HITL Orchestration Foundation

### Requirements

- `REQ-HITL-001...003`
- `REQ-EVD-001/002`

### Tests

- HITL coordinator tests covering automation to human ownership transfer, intervention routing, human action recording, and handback.

### Changes

- Added `HumanHandoffCoordinator` around the existing surface ownership primitives.
- Added structured `InterventionRequest` context for blocked or unsafe execution states.
- Added an `InterventionRouter` boundary so intervention delivery is independent from the replay and surface implementations.
- Added human action recording contracts so manual activity can remain part of the run evidence rather than becoming an unobservable gap.
- Added explicit automation to human and human to automation ownership transitions while preserving the same surface session.
- Added an in memory HITL implementation for deterministic tests and the first end-to-end workflow.

### Still open at the time

- Connect a real model provider to `DiscoveryModel`.
- Execute at least one genuine LLM driven discovery run against the Playwright browser surface.
- Persist the resulting discovery trace and compiled capability under `/evidence/`.
- Replay that generated capability without an LLM and persist the replay evidence.
- Exercise the HITL coordinator against the same live Playwright browser session and record the human intervention evidence.

## 09/15/2026 Completed

### Requirements

- `REQ-OUT-001...005`
- `REQ-EVD-001...003`
- `REQ-POL-004`

### Tests

- `test/outcomes-evidence.test.ts`
- Updated `test/replay-policy.test.ts` for expanded Milestone 9 evidence semantics.

### Milestone 8: Outcomes and Recovery

- Completed the explicit replay result taxonomy: `SUCCESS`, `BUSINESS_OUTCOME`, `RECOVERABLE`, `INTERVENTION_REQUIRED`, and `FAILURE`.
- Completed business outcome handling as part of the capability contract rather than treating expected domain states as exceptions.
- Completed bounded, action aware recovery behavior.
- Added ambiguous commit reconciliation before escalation.
- Prevented automatic retry when the result of an irreversible operation cannot be established safely.
- Added explicit session expiration detection and termination.
- Replay no longer continues acting against an invalid session.

### Milestone 9: Evidence and Observability

- Expanded the structured replay trace.
- Added evidence capture at declared checkpoints.
- Added terminal failure evidence.
- Added before and after evidence around configured high risk actions.
- Added explicit evidence capture failure trace events.
- Added JSON evidence persistence suitable for `/evidence/`.
- Added sensitive value redaction before persistence.
- Added defensive redaction for credential and token shaped fields.
- Evidence failures remain observable without replacing the actual execution result.

## 09/12/2026 Completed

### Requirements

- `REQ-RPL-001...004`
- `REQ-OUT-002/003`
- `REQ-EVD-001/002`
- `REQ-POL-000...003`

### Tests

- `test/replay-policy.test.ts`

## 09/11/2026 Completed

### Requirements

- `REQ-ART-001...004`
- `REQ-POL-000`
- `REQ-RPL-002...004`
- `REQ-OUT-003/004`
- `REQ-HITL-001...003`

## Requirement mapping

Code and tests use comments such as `Plan: Milestone 3 | REQ-ART-001`. These point to [notes.md](./notes.md). I use them at the relevant contract or behavior, rather than on every statement.

| Area | Requirements | Code and tests |
| --- | --- | --- |
| Artifact and references | `REQ-ART-001..004` | `src/artifact/`, `test/capability-schema.test.ts` |
| Policy and approvals | `REQ-POL-000..003` | `src/policy/`, `test/replay-policy.test.ts` |
| Replay and targeting | `REQ-RPL-001..004` | `src/replay/`, `src/surface/` |
| Outcomes and recovery | `REQ-OUT-001..005` | Replay engine, `test/outcomes-evidence.test.ts` |
| Evidence and redaction | `REQ-EVD-001..003`, `REQ-POL-004` | `src/evidence/`, privacy and browser tests |
| Human control | `REQ-HITL-001..003` | `src/hitl/`, handoff tests |

State fingerprints (`REQ-EVD-004`) remain optional. The mapping identifies relevant code; it does not certify every acceptance criterion.

## Design notes

### Keep one owner of execution

I considered having policy both approve and execute actions. That would leave policy and replay changing application state. Instead, policy returns `ALLOW`, `DENY`, or `REQUIRE_APPROVAL`. Replay owns progression. The adapter performs the interaction.

### Put target fallback in the artifact

Calling a model when a selector fails would change the meaning of replay. I chose reviewed, ordered target strategies. This makes the artifact larger and requires maintenance when the UI changes, but the next action remains inspectable. Model-assisted recovery would need a separate, explicit mode.

### Treat a lost response as an unknown outcome

A timeout does not establish that a write failed. The first implementation stopped on ambiguity. I then added reconciliation against declared state so replay could continue when it could establish the result. Unresolved uncertainty still stops for intervention. There is no exactly-once guarantee.

### Keep browser mechanics in the adapter

Direct Playwright calls would have taken less code initially. The adapter keeps DOM assumptions out of replay and makes core behavior testable without a browser. It leaves room for another surface, but that adapter would still need to be built and tested.

### Give the caller an explicit result

A missing member is a valid business result. A missing search button is an execution problem. Separate outcome codes let callers handle them without interpreting exception strings.

### Verify what happened

A click can succeed while navigation, validation, or saving fails. Preconditions and postconditions add reads and latency, but they provide a basis for deciding whether to continue. Weak conditions remain a risk.

### Limit approval to the invocation

A permanent approval flag on a capability would authorize too much. Approval belongs to a run and step. Production approval should also account for relevant state changes between review and execution.

### Capture evidence around state changes

Failure-only evidence can miss how the run reached that state. Checkpoint capture added another evidence artifact and broke an older test that expected only the terminal capture. I updated the assertion to the new behavior.

Evidence capture can fail after the application action succeeds. The trace needs to preserve both results. If evidence availability must be a prerequisite for an action, that rule belongs before execution.

### Sanitize before writing

Redacting on read would leave sensitive data on disk. Sanitization belongs before persistence. That costs diagnostic detail. The saved record should explain execution without becoming a copy of everything the browser saw.

Evidence references identify files. The trace records why they were captured. I kept those responsibilities separate rather than adding a field just to simplify a test.

## Test conventions

Tests live in `test/` as TypeScript. Builds clean `dist/`, so compiled tests are not rediscovered. V8 coverage requires 100% of configured statements, branches, functions, and lines. Type-only modules are excluded. Browser tests exercise the panel separately.

Use the [README commands](./README.md#install-and-verify) for current setup. Coverage is a check on exercised code, not proof that every relevant scenario has been tested.

# Implementation Progress

## 09/26/2026 Assignment Alignment Fixes

### Completed

- Added discovery `--goal` and `--target` arguments. The supported target is the application ID `synthetic-member-desk`, resolved to the local app started on `--port`. Shared validation rejects blank/oversized goals and unsupported targets before execution. Replay/handoff reject CLI goal/target overrides because their behavior comes from the saved artifact.
- Passed caller goal text through `runDemo` to the discovery model. Changed the existing GUI goal control to a text input and forwarded it to the same backend. Reviewed grants, output contracts, and success conditions remain limited to member lookup; goal text cannot authorize other tasks. The offline fixture still follows its script.
- Centralized final discovery evidence capture after the loop returns, covering stuck, step limit, failed completion/preconditions, and policy denial. Exceptions retain capture through the existing error path. Capture failure preserves the original result; invalid requests and run conflicts do not inspect an active session.
- Added an optional host-configured permission-denial selector to the browser adapter. The demo binds it to its exact result indicator. Resolution checks it before targeting and after resolution failure; execution checks it before performing an action. Typed `PERMISSION_DENIED` errors survive replay action construction. Unrelated page text does not trigger the indicator, and ordinary missing-target failures remain distinct.
- Added CLI configuration, goal forwarding, terminal evidence, GUI input, and browser permission-denial regressions. The real-browser stuck test reads the persisted structural snapshot, and replay tests verify that denial prevents the next action.
- Updated README commands and options, rewrote REPORT under the required seven headings to describe current behavior and limits, and removed stale validation/delivery claims. Existing curated evidence was left unchanged.

### Validation

- `npm run typecheck` and `node --check src/gui/panel.js` passed.
- Focused CLI/discovery/browser/GUI suite passed: 118 tests.
- `npm test -- --coverage` passed: 260 tests across 19 files with 100% configured statements, branches, functions, and lines. No authenticated model calls were made.
- `npm run verify:evidence` passed, including build: 81 hashed files, nine parsed artifacts, zero tested sensitive matches, and all referenced snapshots resolved.
- `git diff --check` passed.

### Scope

- No new framework, transport, service, infrastructure, or artifact schema was introduced.
- Public access, remote CI, and submission email remain unverified delivery items, separate from these local fixes.

## 09/26/2026 Execution Refactor and GUI State Streaming

### Completed

- Extracted replay invocation validation into `src/replay/validate-invocation.ts` and action construction into `src/replay/action-builder.ts`. Replay retains orchestration, authorization, trace ordering, recovery, and handoff decisions.
- Centralized input/literal value binding and runtime risk classification in `src/domain/action.ts`. Discovery keeps its distinct validation and custom-action restrictions. Artifact retry validation continues to use declared effects; runtime policy also treats submit/custom actions as risky.
- Split surface contracts by responsibility. Replay and discovery consume `ExecutionSurface`, checkpoints consume `CheckpointSurface`, and handoff consumes `HandoffSurface`. Existing adapters retain the full `SurfaceAdapter` contract.
- Replaced the GUI's one-second `/api/state` polling loop with one native `EventSource` connection to `/api/events`. Setup changes, run progress, model-call counts, handoff, cancellation, and completion publish state snapshots. Commands retain token-protected POSTs and existing local-origin checks.
- Added `src/gui/state-stream.ts` to own subscriptions, snapshot framing, disconnect cleanup, and shutdown. A blocked client retains only its newest pending snapshot while the response buffer drains; other clients continue receiving updates.
- Added fresh snapshots and session tokens on reconnect, disabled execution controls while disconnected, closed streams on page navigation, and cleared stale run displays after a server restart.
- Kept `/api/state` available for explicit snapshots and diagnostics. Library refreshes are serialized and occur on connection, explicit refresh, and run completion. Run validation independently scans saved artifacts before execution.
- Added surface-contract tests, stream lifecycle/backpressure tests, and browser coverage for zero panel state GETs, pushed updates, restart/reconnect, token renewal, and manual artifact refresh. Made the default-port test bind an ephemeral port while asserting that the launcher requests port 4310, avoiding interference with a running GUI.
- Updated README with execution boundaries, stream behavior, refresh semantics, and current validation counts.

### Design Decisions and Limits

- Keep client snapshots as ordinary parsed JSON and replace them on each event, with form state held separately. Removed runtime deep freezing and its dedicated assertions: traversing each snapshot adds work without an established mutation defect in this panel. No performance improvement has been benchmarked.

- State updates flow from server to browser, so SSE fits the existing HTTP command API. WebSocket remains an option if bidirectional streaming becomes necessary; this application has no gRPC backend to reuse.
- Reconnect sends current state rather than replaying every transport event. Each snapshot contains the retained run history and activity records. Slow clients may skip intermediate snapshots.
- Elapsed time updates when state arrives. Artifacts created by another process appear after **Refresh** or reconnection. There is no periodic network refresh or filesystem watcher.
- Existing approval, ambiguous-commit, retry, redaction, and handoff behavior was preserved. The refactor does not introduce new permissions or model calls.

### Validation

- `npm run typecheck` passed.
- `npm test -- --coverage` passed: 248 tests across 19 test files; 100% configured statements, branches, functions, and lines. Coverage measures TypeScript production modules; `panel.js` is exercised through browser tests.
- Browser tests confirmed one initial event-stream request and zero panel `/api/state` requests across ten seconds of advanced browser time, then verified pushed state, cancellation, automatic reconnect after restart, commands using the renewed token, and explicit artifact refresh.
- `npm run verify:evidence` passed, including its build step: 81 hashed files, nine parsed artifacts, zero tested sensitive matches, and all referenced snapshots resolved.
- `git diff --check` passed. Browser/server tests required execution outside the filesystem sandbox so Chromium and local listeners could start.

### Applying the Update

- Restart the running GUI process and reload the panel to use the updated server and browser code. The existing GUI process was left running during development.
- Commit creation, publication, and remote CI remain separate steps.

## 09/22/2026 GUI Control Panel, Setup Script, and Coverage Closure

### Completed

- Added and documented the local GUI control panel flow, including `npm run gui`, default port behavior, saved capability scanning, replay, live discovery setup, and same-session handoff coverage.
- Added a top-level README TLDR with the setup path, GUI launch command, and the ordered commands used under the hood.
- Added `scripts/setup.mjs` and `npm run setup` as a single installation/verification entrypoint. The script outlines the plan, prints each command in blue parentheses, renders active steps in cyan in place, marks passes green, marks failures red, captures command output during normal execution, and prints captured output only when a step fails.
- Added `--print-only` to preview the setup plan without running the install/build/test commands, and `--launch-gui` to start the GUI after successful setup.
- Expanded `test/gui.test.ts` to cover GUI server request validation, browser setup state, saved artifact filtering, active-run guards, live model wrapping, run history trimming, cancellation, launcher startup/error paths, abort cleanup, and same-session handoff behavior.
- Tightened GUI/server and abort-cleanup branches so coverage tracks executable behavior without unreachable fallback counters.
- Fixed TypeScript mock shapes in GUI tests by returning a full `ReplayResult`, using a typed capability placeholder, passing a complete `InterventionRequest`, and supplying required `DemoOptions.live` values.

### Validation

- `npm run typecheck` passed after the GUI test type fixes.
- `npx vitest run test/gui.test.ts` passed: 9 tests.
- Full coverage passed after GUI coverage work: 241 tests with 100% statements, branches, functions, and lines.
- `node --check scripts/setup.mjs` passed.
- `npm run setup -- --print-only` passed and displayed the ordered setup plan without executing the heavyweight setup steps.

### Remaining Delivery Work

- The in-place setup display is intended for interactive terminals. CI and non-TTY logs still receive regular line output.
- Public publication, remote CI, and submission email remain separate delivery steps.

## 09/22/2026 Documentation and Submission Update

### Completed

- Standardized the runtime on Node 26.x in package metadata, lockfile, CI, and .nvmrc.
- Removed public-document references to local preparation notes and excluded those notes from Git tracking while retaining local copies.
- Retained curated assignment evidence under evidence/submission/, including genuine discovery, saved artifacts, deterministic replay, exceptional outcomes, handoff, provenance, and checksums. Generated runs remain ignored.
- Updated README with current CLI capabilities and explicit limits; added high-level architecture and user workflow Mermaid diagrams configured for ELK layout. A graphical launcher and arbitrary-window control remain unimplemented.

### Validation

- Evidence verification and TypeScript checks rerun for this documentation/configuration update; prior application validation remains 232 tests with 100% configured coverage.
- Public publication, remote CI, and submission email remain separate delivery steps.

## 09/22/2026 Completed

### Milestone 20: Audit Repairs, Curated Evidence, and Usable CLI

### Completed

-   Sanitized classified checkpoint diagnostics before trace flattening, removing the failed-output
    privacy dependency on successful extraction. Preserved actual checkpoint boolean results.
-   Connected discovery intervention to same-session human takeover with explicit handback,
    verification and original step/time limits. Approval, uncertain actions and exhausted budgets
    cannot be bypassed. Added `--operator` and the discovery-handoff scenario.
-   Verified genuine human release/handback with scripted discovery, compilation and replay.
    This is labeled separately from genuine OpenAI discovery.
-   Completed `evidence/submission/` with nine curated run directories, provenance, checksums,
    relative snapshot references and a verifier. Generated runs and archives remain ignored.
-   Separated snapshot identifiers from redacted session IDs so new evidence references resolve.
-   Bare `npm run demo` now shows help. Added `--headed` and `--slow-mo`; operator mode is visible.
    Added safe preflight diagnostics for artifact, origin, server and browser setup failures.
-   Preserved the user's Node 26 direction, broadened the exact runtime pin to `^26.6.2` so it
    includes tested Node 26.10.0, and aligned CI runtime configuration.
-   Updated README, report, assessment and interview defenses to reflect the verified repairs.

### Tests

-   Typecheck and build pass; 232 tests pass with 100% statements (1042/1042), branches (765/765),
    functions (182/182) and lines (819/819) under Node 26.10.0.
-   Wrong-type replay still reports `INVALID_OUTPUT_TYPE`, now without sensitive balance text.
    Regression cases include missing/wrong outputs, failed checkpoints, partial extraction and
    boolean-sensitive values; persisted snapshot references also remain usable.
-   `npm run verify:evidence` passes: 81 hashed files, nine parsed artifacts, zero tested sensitive
    matches and all snapshot references resolvable, without browser or provider calls.
-   Manual discovery takeover: `578cd282-8cf4-4ba1-81e6-16fde6528edc`. Included genuine source:
    `cd70493f-ed42-4aa5-85e6-245d19b81f30`.
-   An intermediate 231-test run failed the branch coverage threshold; CLI validation tests and
    unreachable post-validation fallbacks were corrected before the final passing run.

### Remaining Delivery Work

-   Review and commit the changes, verify the public repository and remote CI, then submit the URL.
-   No new model API call, public push or submission email was performed by the agent here.

## 09/21/2026 Completed

### Milestone 19: Assignment Reassessment and Interview Preparation

### Requirements

-   Rechecked Assignment A sections 2-6 and 9-11, including every core subsection in section 3.
-   Distinguished mandatory implementation, permitted design-only scope, and submission gates.

### Completed

-   Recorded the assignment review locally, with requirement traceability,
    evidence classifications, objections, findings, reproduction details, and acceptance gates.
-   Prepared local interview notes with concise technical defenses, alternatives, limits, likely challenges,
    and explicitly conditional cost/reliability/memory reasoning. No personal credentials or
    professional experience were invented.
-   Updated README and linked historical assessment/report to the current findings.
-   Preserved the user's pre-existing `.gitignore` edit removing `/evidence/`. No evidence was staged,
    published, or sent; application source was not changed during this audit.

### Tests

-   Re-extracted and reviewed the actual ten-page assignment PDF.
-   `npm run build` and `npm run coverage` passed under Node 24.21.0: 202 tests across 16 files;
    all four configured coverage metrics remain 100%.
-   A new real-browser failure-path experiment changed only the sensitive balance output type
    to number in a schema-valid saved artifact. Replay returned `INVALID_OUTPUT_TYPE` with
    outputs absent, and persisted checkpoint text still contained the synthetic balance.
    Scratch run: `/private/tmp/interface-audit-B9ANJR/f5a9d883-501d-49e7-b3c0-0523ef48032e/`.
-   The experiment is a reproduced privacy failure, not a passing acceptance check. Existing
    coverage does not establish requirement completeness. No fresh paid model call was made.

### Remaining Integration Work

-   Fix sensitive checkpoint/output classification on failed replay and add canary regressions.
-   Route stopped discovery into real same-session operator takeover; current integration only
    enables takeover during replay.
-   Curate required repository evidence, verify publication, and follow assignment submission
    instructions. The application must not currently be described as 100% aligned.

### Milestone 18: Dependency Audit Remediation

### Completed

-   Removed unused standalone `chromium` and its installation-script permission. Source and
    tests use Playwright's Chromium API; no application code or browser behavior was changed.
-   Regenerated the lockfile, removing the vulnerable standalone dependency tree.
-   Reinstalled from the updated lockfile in the isolated source export under Node 24.21.0.
    `npm audit --json` passed with zero reported vulnerabilities.

### Tests

-   Typecheck, build, and all 202 tests passed; all four configured coverage metrics remain 100%.
-   Offline browser discovery/replay succeeded: `evidence/dependency-validation/f0811e3c-41e1-4b82-a53c-d623c51fab69/`.
-   Refreshed the local reviewer package and verified per-file hashes and ZIP integrity.
    No external delivery or commit was performed.

### Milestone 17: Clean Installation and Evidence Packaging

### Completed

-   Exported committed revision `30181831` into an isolated directory and installed locked
    dependencies under Node 24.21.0. Typecheck, build, and all 202 coverage tests passed;
    configured coverage remains 100% across all four metrics.
-   Executed offline discovery/replay and second-input replay of the genuine artifact from
    the clean installation. Both succeeded; replay made zero model calls.
-   Prepared a local gitignored reviewer ZIP with selected evidence, documentation, and
    per-file hashes. No external delivery occurred.

### Remaining Integration Work

-   `npm audit` reports three high-severity findings through standalone `chromium` and its
    dependencies. No automatic dependency fix was applied.
-   Live discovery, exceptional scenarios, and human handoff were not repeated in this
    clean export. Prior successful runs remain separately identified.

### Milestone 16: Assignment Report and Operator Acceptance

### Completed

-   Added `REPORT.md` with the assignment's seven exact headings, covering architecture,
    artifact design, deterministic outcomes, tenant extension design, handoff, safety, and cuts.
-   Distinguished observed runtime results from mocked tests and proposed infrastructure.
-   Documented that generated evidence stays gitignored and must be reviewed and delivered
    separately or regenerated for a reviewer.

### Tests

-   Checked report headings against the assignment PDF, source claims against the implementation,
    and local Markdown links. `git diff --check` passed.
-   The headed handoff command built successfully. The first operator attempt returned
    `FAILURE / EXECUTION_FAILED` with `RESUME_CHECKPOINT_FAILED`; its failure trace reports
    a closed page. Automation did not execute the blocked step after handback.
-   Failed-run evidence: `evidence/human-handoff/eaa65b49-ab42-40b8-82a2-5fe532061d96/`.
    The next attempt succeeded after genuine operator interaction and explicit handback.
-   Successful handoff: `evidence/human-handoff/ae8edcd1-5ebf-4c32-b32a-417f05a797a3/`.
    The saved artifact parsed unchanged, replay made zero model calls, readiness changed from
    failing to passing, and only the blocked step was retried. The completed prefix was not repeated.
-   Scanned 21 handoff files, including both attempts and `validation.json`: zero occurrences
    of the specified member IDs, balances, canaries, and credential patterns. Individual ownership
    transitions are checked in code but are not separate persisted events.

### Milestone 15: P0 Security and Genuine Discovery Validation

### Requirements

-   `REQ-DISC-001...004`
-   `REQ-ART-001...004`
-   `REQ-RPL-001...004`
-   `REQ-EVD-001/002`
-   `REQ-POL-000...003`

### Tests

-   `test/p0-security.test.ts`: real-browser canary checks with mocked provider transport,
    including successful and stopped discovery. These tests do not count as genuine LLM proof.
-   `test/model-and-cli.test.ts`: outbound structured schema, nullable argument normalization,
    safe provider error metadata, and CLI diagnostics.
-   Last full validation: type checking and build passed; coverage ran 202 passing tests with
    100% statements, branches, functions, and lines on 09/21/2026.
-   Genuine discovery, a separate second-input replay, and two runtime taxonomy executions
    were inspected independently of the mocked-provider tests.

### Completed

-   Kept sensitive invocation values host-bound. Discovery receives input metadata and sanitized
    context, while the host supplies actual input values to authorized actions.
-   Sanitized whole evidence bundles before persistence, including sensitive values copied into
    observations, errors, and object keys. Unsupported sensitive-target classification fails closed.
-   Added an independent host completion checkpoint and rejected sensitive artifact literals.
-   Persisted discovery and its independently parseable capability before deterministic replay.
-   Connected OpenAI Responses API discovery with strict structured output and safe diagnostics.
    Corrected the provider schema to use nested `anyOf` without relaxing host decision validation.
-   Verified the user's genuine run with `gpt-4.1-mini-2025-04-14`: four completed HTTP 200
    responses, three UI actions, host-verified completion, parsed artifact, and successful replay.
-   Replayed that saved artifact with `DEMO-002` in a separate execution with zero model calls.
-   Verified `BUSINESS_OUTCOME / MEMBER_NOT_FOUND` and
    `INTERVENTION_REQUIRED / SESSION_EXPIRED` against the same artifact and real local browser.
    Expiry was injected through the demo scenario; both executions stopped without further actions.
-   Scanned the two successful bundles (16 files) and runtime taxonomy records (15 files) for
    specified member IDs, balances, canaries, and credential patterns, with zero matches.
    This establishes the stated scan scope, not universal absence of sensitive data.
-   Updated README installation, actual Node engine range, CLI workflows, configuration,
    evidence interpretation, troubleshooting, and remaining validation limitations.

### Evidence

-   Genuine discovery: `evidence/live-validation/02def122-935d-4638-b66b-584849d5bffb/`.
-   Second-input replay: `evidence/live-validation/282b5e47-c15a-4958-ae4d-912e129c3b56/`.
-   Runtime outcome assertions: `evidence/runtime-taxonomy/validation.json`.
-   Detailed chronology and validation limits: [P0_SECURITY_VALIDATION.md](./P0_SECURITY_VALIDATION.md).

### Remaining Integration Work

-   Assessment items #7 and #8 are now recorded in Milestone 16 and `REPORT.md`.
-   Clean-source install verification and local evidence packaging are now recorded below.
-   Dependency audit remediation and actual reviewer delivery remain.
-   Sensitive-target classification remains limited to supported, unambiguous standard CSS selectors.

## 09/19/2026 Completed

### Milestone 14: Discovery and HITL Integration Hardening

### Requirements

-   `REQ-DISC-001...004`
-   `REQ-ART-001...004`
-   `REQ-RPL-001...004`
-   `REQ-HITL-001...003`
-   `REQ-EVD-001/002`
-   `REQ-POL-000...003`

### Tests

-   `test/discovery-handoff.test.ts`
-   Discovery vertical slice coverage for deterministic capability compilation and authority
    boundary enforcement.
-   Same session HITL coverage for ceding and reacquiring the existing adapter session.
-   Corrected discovery test fixtures to satisfy the current typed `DiscoveryRequest` input
    contract, including the required `memberId` input used by the discovery specification.

### Completed

-   Integrated the discovery, capability compilation, and human handoff foundations into the
    current typed test surface rather than leaving them as isolated architectural seams.
-   Corrected the discovery vertical slice so `DiscoveryEngine` is instantiated through the
    current implementation contract and exercised as a real constructor in the test path.
-   Aligned discovery request fixtures with the current capability specification input contract,
    including the required `memberId` value.
-   Verified successful discovery can produce a deterministic capability suitable for the
    existing replay architecture.
-   Verified discovery is blocked when the observed surface leaves the authorized authority
    boundary.
-   Verified automation can cede and reacquire the same adapter session through the HITL
    coordinator without replacing the underlying surface session.
-   Preserved the architectural boundary that discovery may reason with a model while compiled
    capability replay remains deterministic and model independent.

### Remaining Integration Work

-   Connect a real model provider to `DiscoveryModel`.
-   Execute and persist a genuine LLM driven discovery run against the Playwright browser
    surface.
-   Persist the generated capability and discovery evidence under `/evidence/`.
-   Replay the generated capability without an LLM and persist replay evidence.
-   Exercise the HITL coordinator against the live Playwright browser session and persist the
    intervention evidence.

## 09/18/2026 Completed

### Milestone 11: Genuine LLM Discovery Foundation

### Requirements

-   `REQ-DISC-001...004`
-   `REQ-POL-000...003`
-   `REQ-EVD-001`

### Tests

-   Discovery engine tests covering bounded observe, decide, policy check, act behavior,
    successful termination, failure, and intervention paths.

### Completed

-   Added a bounded `DiscoveryEngine` implementing the observe, decide, act discovery loop.
-   Added a provider independent `DiscoveryModel` boundary so discovery may use an LLM
    without introducing a model dependency into deterministic replay.
-   Added explicit discovery request and result contracts, including goal, target URL,
    authorized context, maximum steps, and timeout boundaries.
-   Added discovery authority enforcement for permitted origins and routes before surface
    interaction.
-   Added structured discovery trace events for observations, model decisions, policy
    decisions, actions, and resulting states.
-   Added explicit `SUCCESS`, `FAILURE`, and `INTERVENTION_REQUIRED` discovery outcomes.
-   Kept model proposed actions subordinate to external policy authority.
-   Preserved the existing `SurfaceAdapter` boundary so discovery and replay operate against
    the same surface abstraction without coupling replay to an LLM provider.

### Milestone 12: Discovery to Capability Compilation Foundation

### Requirements

-   `REQ-DISC-003`
-   `REQ-ART-001...004`
-   `REQ-RPL-001...004`

### Tests

-   Capability compiler tests covering successful trace compilation and artifact validation.

### Completed

-   Added `CapabilityCompiler` to convert a successful discovery trace into the existing
    typed, runtime validated capability artifact.
-   Compilation preserves the separation between raw model interaction and the reusable
    production capability contract.
-   Generated capabilities remain plain serializable data and contain no model provider or
    Playwright runtime dependency.
-   Compiled capabilities are validated through the existing artifact schema before they can
    enter deterministic replay.
-   The existing `DeterministicReplayEngine` remains the production execution path after
    discovery and compilation complete.

### Milestone 13: Same Session HITL Orchestration Foundation

### Requirements

-   `REQ-HITL-001...003`
-   `REQ-EVD-001/002`

### Tests

-   HITL coordinator tests covering automation to human ownership transfer, intervention
    routing, human action recording, and handback.

### Completed

-   Added `HumanHandoffCoordinator` around the existing surface ownership primitives.
-   Added structured `InterventionRequest` context for blocked or unsafe execution states.
-   Added an `InterventionRouter` boundary so intervention delivery is independent from the
    replay and surface implementations.
-   Added human action recording contracts so manual activity can remain part of the run
    evidence rather than becoming an unobservable gap.
-   Added explicit automation to human and human to automation ownership transitions while
    preserving the same surface session.
-   Added an in memory HITL implementation for deterministic tests and the initial vertical
    slice.

### Remaining Integration Work

-   Connect a real model provider to `DiscoveryModel`.
-   Execute at least one genuine LLM driven discovery run against the Playwright browser
    surface.
-   Persist the resulting discovery trace and compiled capability under `/evidence/`.
-   Replay that generated capability without an LLM and persist the replay evidence.
-   Exercise the HITL coordinator against the same live Playwright browser session and record
    the human intervention evidence.


## 09/15/2026 Completed

### Requirements

-   `REQ-OUT-001...005`
-   `REQ-EVD-001...003`
-   `REQ-POL-004`

### Tests

-   `test/outcomes-evidence.test.ts`
-   Updated `test/replay-policy.test.ts` for expanded Milestone 9
    evidence semantics.

### Milestone 8: Outcomes and Recovery

-   Completed the explicit replay result taxonomy: `SUCCESS`,
    `BUSINESS_OUTCOME`, `RECOVERABLE`, `INTERVENTION_REQUIRED`, and
    `FAILURE`.
-   Completed business outcome handling as part of the capability
    contract rather than treating expected domain states as exceptions.
-   Completed bounded, action aware recovery behavior.
-   Added ambiguous commit reconciliation before escalation.
-   Prevented automatic retry when the result of an irreversible
    operation cannot be established safely.
-   Added explicit session expiration detection and termination.
-   Replay no longer continues acting against an invalid session.

### Milestone 9: Evidence and Observability

-   Expanded the structured replay trace.
-   Added evidence capture at declared checkpoints.
-   Added terminal failure evidence.
-   Added before and after evidence around configured high risk actions.
-   Added explicit evidence capture failure trace events.
-   Added JSON evidence persistence suitable for `/evidence/`.
-   Added sensitive value redaction before persistence.
-   Added defensive redaction for credential and token shaped fields.
-   Evidence failures remain observable without replacing the actual
    execution result.

## 09/12/2026 Completed

### Requirements

-   `REQ-RPL-001...004`
-   `REQ-OUT-002/003`
-   `REQ-EVD-001/002`
-   `REQ-POL-000...003`

### Tests

-   `test/replay-policy.test.ts`

## 09/11/2026 Completed

### Requirements

-   `REQ-ART-001...004`
-   `REQ-POL-000`
-   `REQ-RPL-002...004`
-   `REQ-OUT-003/004`
-   `REQ-HITL-001...003`

# Current Scope

This implementation establishes the load bearing contracts, genuine model discovery,
and deterministic browser execution path:

1.  A typed, runtime validated capability artifact.
2.  A surface abstraction that deterministic replay can depend on
    without importing Playwright or an LLM provider.
3.  A deterministic replay engine operating against the
    `SurfaceAdapter`.
4.  An explicit policy boundary controlling what replay is authorized to
    execute.
5.  An explicit outcome and recovery model distinguishing successful
    execution, business outcomes, recoverable conditions, intervention,
    and hard failure.
6.  Action aware recovery with ambiguous commit reconciliation.
7.  Structured execution evidence with checkpoint capture, failure
    capture, persistence, and redaction.

The deterministic execution architecture now operates against both the fake test
surface and a real Playwright browser surface.

Genuine OpenAI discovery, compilation into a reusable capability, and model-free replay
with a second input are verified. Genuine operator takeover and handback are also verified;
see the 09/21/2026 entry and validation record above.

# Run

``` bash
npm ci
npx playwright install chromium
npm test
npm run typecheck
npm run build
```

# Design Invariants

-   Discovery may use an LLM. Deterministic replay may not.
-   Artifact validation occurs before surface interaction.
-   Policy authority is external to model and UI content.
-   Target fallback order is declared by the artifact.
-   Risky actions cannot be blindly retried after an ambiguous commit.
-   Surface and session ownership are explicit so same session HITL can
    be implemented without changing replay's abstraction.
-   Policy determines what may happen.
-   Replay determines what happens next.
-   `SurfaceAdapter` determines how it happens.

# Requirement Traceability in Code

Production code and tests use concise comments such as:

`Plan: Milestone 3 | REQ-ART-001`

These comments connect implementation decisions directly to `notes.md`.
They identify the primary requirements demonstrated by an architectural
boundary or test without attempting to replace the requirements matrix.

### Current coverage:

  ----------------------------------------------------------------------------------
  Area                    Plan / requirements     Implementation
  ----------------------- ----------------------- ----------------------------------
  Capability contract     Milestone 3;            `src/artifact/*`,
                          `REQ-ART-001..004`      `test/capability-schema.test.ts`

  Explicit allowlist      Milestone 7;            `capability-schema.ts`
  metadata                `REQ-POL-000`           

  Ordered target          Milestones 3/6;         `capability-schema.ts`,
  strategies              `REQ-RPL-002`           `surface-adapter.ts`

  Checkpoint              Milestones 3/6;         `capability-schema.ts`
  representation          `REQ-RPL-003`           

  Recovery / ambiguous    Milestone 8;            schema refinement + tests
  commit safety           `REQ-OUT-003/004`       

  Surface abstraction     Milestone 4;            `surface-adapter.ts`
                          `REQ-SRF-001`,          
                          `REQ-RPL-004`           

  Same-session ownership  Milestone 10;           fake adapter + tests
  seam                    `REQ-HITL-001..003`     

  Explicit result         Milestone 8;            replay contracts + replay engine +
  taxonomy                `REQ-OUT-001`           outcome tests

  Business outcomes       Milestone 8;            replay result handling + outcome
                          `REQ-OUT-002`           tests

  Recoverable conditions  Milestone 8;            bounded action aware recovery
                          `REQ-OUT-003`           

  Ambiguous commits       Milestone 8;            reconciliation + escalation
                          `REQ-OUT-004`           behavior

  Session expiration      Milestone 8;            replay session validation + tests
                          `REQ-OUT-005`           

  Execution trace         Milestone 9;            structured replay trace
                          `REQ-EVD-001`           

  Checkpoint evidence     Milestone 9;            checkpoint + failure evidence
                          `REQ-EVD-002`           capture

  Evidence redaction      Milestone 9;            evidence persistence + redaction +
                          `REQ-EVD-003`,          tests
                          `REQ-POL-004`           
  ----------------------------------------------------------------------------------

As implementation expands, new code and tests should cite the relevant
requirement IDs at the architectural boundary or behavior being proven
rather than commenting every statement.

# Current Implementation Slice

## Milestone 6: Deterministic Replay Engine

### Implemented

-   `DeterministicReplayEngine` with no model or provider dependency
    (`REQ-RPL-001`, `REQ-RPL-004`)
-   Artifact defined target resolution through `SurfaceAdapter`
    (`REQ-RPL-002`)
-   Invocation and input validation before surface execution
    (`REQ-RPL-001`)
-   Precondition, postcondition, and final success checkpoint
    verification (`REQ-RPL-003`)
-   Bounded artifact defined retry behavior (`REQ-OUT-003` seam)
-   Explicit ambiguous commit escalation (`REQ-OUT-004` seam)
-   Declared business outcome detection (`REQ-OUT-002` seam)
-   Structured replay trace and failure evidence references
    (`REQ-EVD-001/002` seam)

## Milestone 7: Policy Enforcement

### Implemented

-   Explicit domain and target allowlist (`REQ-POL-000`)
-   Explicit route allowlist with deterministic wildcard matching
    (`REQ-POL-000`)
-   Action type allowlist (`REQ-POL-000`)
-   Policy as an authority boundary independent from observed UI content
    (`REQ-POL-001`)
-   Invocation scoped explicit step approval (`REQ-POL-003`)
-   Structured policy decisions recorded in replay trace (`REQ-POL-001`)

Tests in `test/replay-policy.test.ts` are annotated with the milestone
and requirement IDs demonstrated by each behavior.

## Milestone 8: Outcomes and Recovery

### Implemented

-   Complete explicit result taxonomy (`REQ-OUT-001`)
-   Declared business outcomes remain domain results rather than generic
    execution failures (`REQ-OUT-002`)
-   Bounded, action aware retry behavior (`REQ-OUT-003`)
-   Ambiguous commit reconciliation before retry or escalation
    (`REQ-OUT-004`)
-   Unresolved commit ambiguity produces explicit intervention rather
    than blind retry (`REQ-OUT-004`)
-   Explicit session expiration detection and termination
    (`REQ-OUT-005`)

Tests in `test/outcomes-evidence.test.ts` and
`test/replay-policy.test.ts` exercise the outcome and recovery paths.

## Milestone 9: Evidence and Observability

### Implemented

-   Expanded structured execution trace (`REQ-EVD-001`)
-   Checkpoint evidence capture (`REQ-EVD-002`)
-   Terminal failure evidence capture (`REQ-EVD-002`)
-   Evidence surrounding configured high risk operations (`REQ-EVD-002`)
-   Explicit evidence capture failure events (`REQ-EVD-002`)
-   JSON evidence persistence suitable for repository evidence
    (`REQ-EVD-001`, `REQ-EVD-002`)
-   Sensitive capability value redaction before persistence
    (`REQ-EVD-003`)
-   Credential and session token shaped field redaction (`REQ-EVD-003`,
    `REQ-POL-004`)
-   Evidence subsystem failures remain distinct from the primary
    execution result

`REQ-EVD-004` state fingerprints remain optional and are intentionally
not part of this implementation slice.

# Next Implementation

1.  Review and commit the audit repairs, CLI improvements and curated evidence.
2.  Verify the final public repository and CI result.
3.  Submit the repository URL as instructed; do not substitute a ZIP.

# Planned Milestones

The original milestone plan is retained below. Current completion and remaining
acceptance work are recorded in the dated entries above.

## Milestone 10: Real Browser Surface

-   Implement the minimal Playwright backed `SurfaceAdapter`.
-   Add real browser observation, target resolution, actions, session
    state, and evidence capture.
-   Move ordered target strategy fallback into deterministic replay so
    the artifact controls locator priority and each attempt can be
    traced.
-   Add browser integration coverage against a controlled live surface.

Primary requirements: `REQ-SRF-001/002`, `REQ-RPL-002...004`,
`REQ-EVD-002`.

## Milestone 11: Genuine LLM Discovery

-   Implement the bounded observe, decide, act discovery loop.
-   Keep model proposed actions constrained by external policy.
-   Record model decisions, reasons, policy results, actions, and
    resulting observations.
-   Run at least one genuine discovery against the real browser surface.

## Milestone 12: Discovery to Capability Compilation

-   Compile a successful discovery trace into the existing validated
    capability artifact.
-   Persist the generated artifact for review.
-   Replay the generated capability without an LLM.
-   Preserve discovery, artifact, and replay evidence under `/evidence/`.

## Milestone 13: Real Same Session HITL

-   Add explicit automation to human ownership transfer.
-   Preserve the same live browser session during intervention.
-   Record intervention context and human actions.
-   Reobserve and verify state before returning ownership to automation.


# Architecture Tradeoffs and Decisions

## One More Time Without the Oops

No major gotchas this time. Most of the focus was on architecture
tradeoffs and deciding where responsibility should live.

I need to keep reminding myself that **deterministic does not mean
simplistic**. Discovery gets to reason. Replay gets to execute what was
learned. If replay starts making open ended decisions, then I have
effectively moved discovery back into production and broken the primary
boundary.

## 1. Policy Execution vs. Policy Decision

Could have policy evaluate an action and execute it when allowed. Less
plumbing. Fewer calls between components.

I don't like the ownership ambiguity this creates though. Now both
policy and replay are capable of changing application state.

Chose to keep policy **decision only**.

1.  Policy decides what **may happen**.
2.  Replay decides what happens **next**.
3.  `SurfaceAdapter` determines **how it happens**.

Policy answers:

-   `ALLOW`
-   `DENY`
-   `REQUIRE_APPROVAL`

Replay owns execution state and determines what happens next.
`SurfaceAdapter` performs the actual interaction.

One execution state machine. Much easier to reason about who has
authority versus who has mechanism.

## 2. Intelligent Target Resolution vs. Deterministic Target Resolution

It would be easy to let the model help when a selector fails. Probably
makes the demo look more resilient too.

The problem is that replay is no longer really deterministic. The same
artifact plus the same observed state could result in different actions
depending on what the model decides.

Chose ordered locator strategies stored in the artifact instead.
Accessibility and semantic identity first, followed by progressively
weaker fallbacks.

The artifact gets larger, but that is probably where this complexity
belongs.

1.  Discovery figures out how to find something.
2.  Capability records what it learned.
3.  Replay should not rediscover it.

### Possible Later Extension

Bounded LLM recovery after deterministic resolution is exhausted.

Important distinction though. That would be an explicit recovery mode,
not normal replay behavior.

## 3. Generic Retry vs. Action Aware Recovery

Normal automation instinct is to retry on timeout or network failure.
Fine for some reads. Potentially disastrous for writes.

If I submit something and lose the response, I do not necessarily have a
failed operation. I have an operation whose outcome I don't know.

``` text
submit
  -> connection failure
  -> ???
```

That `???` deserves its own state.

Chose:

``` text
UNKNOWN_COMMIT_STATE
```

Recovery becomes:

``` text
UNKNOWN_COMMIT_STATE
  -> reconcile
      -> proven committed
          -> continue

      -> proven not committed
          -> retry if permitted and safe

      -> still ambiguous
          -> HITL
```

This creates more states and makes recovery more complicated, but
duplicating a financial transaction because `retry: 3` seemed reasonable
would be a much worse design.

## 4. Playwright Replay Engine vs. SurfaceAdapter

Direct Playwright implementation would absolutely be faster right now.
Could probably remove a meaningful amount of interface and type code.

But then DOM and browser assumptions start leaking into replay,
capability definitions, tests, and eventually discovery.

The requirement specifically tells me the real environment is not
necessarily a nice browser DOM.

**Chose the adapter.**

Replay should understand:

``` text
observe -> resolve -> act -> verify
```

It should not inherently understand:

``` text
page -> locator -> click
```

Playwright is an implementation of the surface boundary, not the
architecture.

Costs abstraction now. Saves redesign if the next surface is an ugly
frameset, accessibility driven application, desktop UI, terminal,
Citrix, or something else entirely.

Need to avoid overengineering this abstraction though. I only need the
seam right now, not five adapters proving that the seam exists.

## 5. Exceptions vs. Explicit Outcomes

Initially tempting to have replay either return success or throw.

Doesn't model the domain correctly.

`"member not found"` is not an infrastructure failure. Neither is a
validation response necessarily.

The caller needs to know the difference between:

> The capability successfully determined that this member does not
> exist.

and:

> The automation couldn't find the member search button.

So use an explicit result taxonomy:

-   `SUCCESS`
-   `BUSINESS_OUTCOME`
-   `RECOVERABLE`
-   `INTERVENTION_REQUIRED`
-   `FAILURE`

More contract surface, but much better semantics.

It also gives the calling agent something machine readable instead of
forcing it to interpret exception strings.

## 6. Checkpoint Verification vs. Trusting Successful Actions

A click succeeding tells me almost nothing except that a click was
issued.

It does not prove:

-   Navigation occurred.
-   Data was saved.
-   The expected member loaded.
-   The application accepted the operation.
-   The resulting application state is what I expected.

Chose explicit preconditions, postconditions, and checkpoints even
though this adds observations and therefore execution time.

State transitions need evidence.

Otherwise I am building a macro that assumes its own actions worked.

## 7. Global Approval vs. Invocation Scoped Approval

Could mark a capability `"approved"` and allow its risky actions
indefinitely.

Simpler.

Too broad.

Approval should correspond to the actual invocation and action being
authorized.

Chose invocation scoped approval so approval cannot accidentally become
permanent authority attached to the capability itself.

### Potential Future Concern: Approval TOCTOU

If application state materially changes between approval and execution,
is the approval still valid?

Don't need to solve this completely now, but it is worth keeping the
approval context tied to:

``` text
invocation
  + capability
  + action
  + relevant observed state
```

That gives us somewhere to enforce stronger approval semantics later
without changing the fundamental architecture.

## 8. General Theme Emerging

Move intelligence toward **discovery**.

Move authority toward **explicit policy**.

Move reusable knowledge into the **capability artifact**.

Keep **replay boring**.

Boring is good here.

Production execution should be predictable enough that when something
goes wrong I can identify the exact step, policy decision, target
strategy, observed state, and resulting outcome without asking an LLM
what it thinks happened.

## 9. Immediate Escalation vs. Ambiguous Commit Reconciliation

The first pass at ambiguous commits was safe, but conservative.

If an irreversible action returned an ambiguous result, replay stopped
rather than risk executing it twice.

Could have left it there. Safe. Simple. Easy to explain.

But uncertainty does not necessarily mean I need a human. Sometimes the
application itself contains enough observable state to establish what
actually happened.

Chose deterministic reconciliation before escalation.

``` text
action
  -> response lost
  -> UNKNOWN_COMMIT_STATE
      -> verify declared resulting state
          -> proven committed
              -> continue

          -> proven not committed
              -> retry only if permitted and safe

          -> still unknown
              -> INTERVENTION_REQUIRED
```

The distinction matters.

**Unknown does not mean failed. Unknown means I have not established
truth yet.**

Could have used the model here to reason about whether the operation
probably succeeded. Chose not to. That would put open ended reasoning
back into replay exactly where I have been trying to remove it.

Reconciliation therefore uses declared observable state. If the
capability cannot establish what happened, it stops.

That is less clever than guessing.

Good.

## 10. Failure Evidence Only vs. Evidence Around State Transitions

Could capture evidence only when something fails.

Less storage. Less instrumentation. Fewer adapter calls.

The problem is that failure evidence gives me a picture of where the
system ended up, but not necessarily enough information to establish how
it got there.

Chose to capture evidence around meaningful state transitions and
declared checkpoints.

A failed precondition now produces evidence associated with the
checkpoint evaluation and evidence associated with the resulting
terminal failure.

This actually broke an older test.

The test expected:

``` text
1 evidence artifact
```

The new implementation correctly produced:

``` text
checkpoint evidence
+
terminal failure evidence
```

Initially looks like a regression. It wasn't. The old test was asserting
the previous evidence contract.

Chose to update the test rather than weaken the new implementation.

Good reminder that tests protect behavior, but a test should not become
an accidental architectural requirement just because it existed first.

## 11. Evidence Failure vs. Execution Failure

What happens if the application operation succeeds but evidence capture
fails?

Could fail the entire replay.

Evidence is important. For some environments it may eventually be
mandatory.

But an observability failure cannot retroactively change what happened
to the target application.

If the transaction succeeded, it succeeded.

Chose to preserve both truths independently.

``` text
application operation = SUCCESS
evidence persistence  = FAILURE
```

The resulting trace records the evidence failure, but the execution
result remains `SUCCESS`.

Otherwise I would be allowing my telemetry system to rewrite application
truth.

There may eventually be policy that says:

> Do not execute this action unless evidence capture is available.

That is different.

That decision belongs **before execution** as policy. Once an operation
has happened, failure to record it does not mean it unhappened.

## 12. Raw Evidence vs. Redacted Evidence

Could persist observations exactly as received and sanitize them when
somebody reads the evidence later.

Maximum debugging information. Simplest capture path.

Also means credentials, tokens, and PII may already be sitting on disk
before sanitization ever occurs.

That boundary is backwards.

Chose redaction before persistence.

``` text
live application state
        |
        v
normalization
        |
        v
redaction
        |
        v
persistent evidence
```

Known sensitive capability inputs can be removed because the artifact
already tells me which values are sensitive. Credential and token shaped
fields get another defensive redaction pass.

I lose some debugging fidelity.

Acceptable.

The evidence store should explain execution behavior. It should not
quietly become another database containing everything the automation has
ever seen.

## 13. Evidence References vs. Evidence Semantics

The evidence test exposed another smaller boundary decision.

`EvidenceReference` identifies the captured artifact. It does not
currently contain the reason the evidence was captured.

Could add `reason` to `EvidenceReference`.

Would make the test convenient.

But I would be changing a production contract because a unit test wanted
an easier assertion.

Chose not to.

The evidence reference answers:

> What evidence exists and where is it?

The execution trace answers:

> Why was this evidence captured and what was happening?

Those are related concerns, but not the same concern.

Keep the reference small. Keep execution semantics in the trace.

## 14. Another Theme Emerging

The further this gets, the more the architecture seems to revolve around
different kinds of truth.

The model can propose what to do.

Policy establishes whether it is allowed.

The capability establishes what was learned.

Checkpoints establish what the application currently says is true.

Reconciliation establishes what happened after an uncertain operation.

Evidence preserves what was observed.

The result contract tells the caller what that truth means.

That gives me a useful rule:

**Do not infer something when the system has a boundary capable of
establishing it.**

Do not infer authorization from the model.

Do not infer success from a click.

Do not infer failure from a lost response.

Do not infer a business failure from an exception.

Do not infer execution truth from whether evidence persistence worked.

Make each boundary establish the thing it actually owns.

## Test and coverage discipline

All authored tests live under `test/` as TypeScript (`*.test.ts`).  `dist/` is build output only and is cleaned before each build, so compiled JavaScript tests are not retained or rediscovered by Vitest.  Coverage uses V8 across executable production modules with 100% statement, branch, function, and line thresholds.  Type-only contract/barrel modules are excluded because they emit no executable behavior.

```bash
npm install
npx playwright install chromium
npm run typecheck
npm test
npm run coverage
npm run build
```

# Assignment A alignment assessment

> Status update, 2026-09-21: the assessment below is historical. P0 items #1-#6 now have implementation/validation records in [P0_SECURITY_VALIDATION.md](./P0_SECURITY_VALIDATION.md); #8 is documented in [REPORT.md](./REPORT.md), and #9 in [README.md](./README.md). Genuine headed handoff (#7) succeeded on the second attempt after an initial rejected handback; see the latest validation entry. Generated evidence is gitignored by user direction, so earlier recommendations to commit evidence are superseded by separate reviewed delivery or regeneration.

Assessment date: 2026-09-20. Scope: the current extracted project workspace under `interface_work/`, compared directly against `Assignment A — Computer-Use Automation System.pdf`. This assessment supersedes earlier snapshots and distinguishes implemented mechanisms from assignment-required proof.

## 1. Executive assessment

**[STRONG INFERENCE, HIGH confidence] The implementation has advanced materially since the prior assessment and now contains a credible end-to-end vertical-slice architecture. It is not yet submission-ready because the assignment's two explicit proof/deliverable gates are still absent: (1) evidence from at least one genuine LLM-driven discovery run, and (2) `/REPORT.md`.** The README is also stale relative to the code and does not provide the required exact demo commands.

The most important change is that several earlier architectural blockers are now implemented rather than merely planned:

- a concrete OpenAI discovery provider exists;
- discovery applies external policy before actions and independently verifies completion;
- compilation preserves reviewed typed I/O, targets, authority, and input bindings while recording only successful executed actions;
- deterministic replay handles typed outputs, business outcomes, bounded waiting/retry, ambiguous commits, and structured failures;
- browser-level network/navigation guarding exists;
- same-session human pause/takeover/handback is implemented and human actions are recorded;
- a synthetic local member-service UI and runnable demo CLI exist;
- regression coverage has expanded substantially, including browser, policy, replay, redaction, CLI, handoff, and integrated demo tests.

However, the assignment explicitly states that the discovery run **has to be real** and that evidence must be committed under `/evidence/`. The supplied `/evidence/` contains test/runtime artifacts, not a genuine model discovery bundle. That remains a hard acceptance blocker regardless of test breadth.

## 2. Verification basis and limits

### Reviewed

**[FACT]** The supplied snapshot contains 27 authored TypeScript source files and 16 test files (15 `*.test.ts` files plus `test/helpers.ts`), approximately 3,577 lines across `src/` and `test/`. The assessment reviewed the assignment PDF, source tree, test inventory, README, ELOG, engineering notes, package/configuration files, and evidence inventory.

**[FACT]** The assignment PDF was text-extracted and rendered page-by-page for inspection. Its must-have acceptance path is:

`goal -> genuine LLM-driven live UI run -> saved typed capability -> deterministic model-free replay with inputs/outputs/outcomes -> real same-session human escalation -> evidence for both phases`.

### Verification limitation

**[FACT]** I could not independently execute the current test/typecheck/build suite from this archive because dependencies are not included and `npm install --ignore-scripts` did not complete within the available execution window. The local runtime available for this assessment is Node 22.16.0, while the project targets Node 24. Therefore, current test-pass and 100% coverage claims in project notes are **not independently re-verified here**.

**[FACT]** The current workspace contains no `package-lock.json`, `REPORT.md`, `.github/` workflow, `.gitignore`, `.env.example`, or `LICENSE`. The README nevertheless links to `LICENSE` and states a Node requirement (`24.21+`) that does not match `package.json` (`^24.3.0`). The workspace also contains macOS `__MACOSX` packaging artifacts. No `.git` metadata is present, so public-repository state, commit history, and CI cannot be verified from this snapshot.

## 3. Requirement-by-requirement comparison

| Assignment requirement | Current state | Assessment |
| --- | --- | --- |
| **3.1 Goal-driven agent loop** | `DiscoveryEngine` implements bounded observe-decide-act, timeout/abort, concurrency protection, live `SurfaceAdapter` interaction, model decisions, policy gating, and independent success verification. `OpenAIDiscoveryModel` provides a concrete live provider. | **Mostly implemented.** Missing the assignment-required genuine run evidence. Discovery is also highly scaffolded by a host-provided target/grant catalog, so the model discovers action order rather than element-identification strategy. |
| **3.2 Structured artifact** | Zod schema is typed/versioned and includes application compatibility, typed inputs/outputs, outcomes, policy, ordered target strategies, steps, recovery, checkpoints, and provenance. Compiler records successful executed actions and preserves host-reviewed bindings/contracts. | **Strong implementation.** The schema is one of the strongest parts of the project. Need a saved real generated artifact in `/evidence/`. |
| **3.3 Deterministic replay** | Replay has no model dependency; validates invocation/artifact; resolves declared targets deterministically; checks pre/post/success checkpoints; polls bounded conditions; extracts typed outputs; distinguishes business outcomes, recoverable states, intervention, and failure; treats ambiguous risky commits conservatively. | **Strong implementation.** Must still be demonstrated from a saved artifact generated by a real discovery run. |
| **3.4 Safety & policy** | Artifact and optional host ceiling are intersected; action types, origins/routes, navigation destinations, approvals, and risky effects are checked. Browser request interception constrains redirects/subresources. Evidence redaction and structural evidence reduce persistence risk. | **Substantially implemented, with one important data-minimization gap:** the live model request currently receives `inputs`, including fields marked sensitive, even when host input binding means the model does not need their values. Discovery persistence can also contain sensitive output text before the output value has been registered with the redactor. |
| **3.5 Evidence / observability** | Discovery/replay traces, policy/checkpoint/action events, run bundles, provider metadata, and structural DOM evidence exist. Evidence filenames are run-scoped and overwrite-resistant. | **Mechanism implemented; submission evidence missing.** Existing `/evidence/` is test/runtime evidence rather than the required genuine discovery + replay demonstration bundle. Structural snapshots are safe but diagnostically sparse because they intentionally omit text/attributes. |
| **3.6 Human escalation & handoff** | `HumanHandoffCoordinator` pauses the same session, transfers ownership, routes an intervention, waits for explicit handback, verifies resumed state, restores automation ownership, and records human click/change kinds without values. Replay resumes the blocked step rather than restarting the capability. | **Strong minimal implementation.** This now satisfies the required seam conceptually and in code. Needs committed demonstration evidence from the headed handoff path. |
| **3.7 Heterogeneity & scale design** | Artifact has browser/desktop/terminal/remote surface identity and multiple target strategy types, including accessibility, structural, visual, and terminal-field concepts. Surface behavior is isolated behind `SurfaceAdapter`; compatibility tags exist. | **Good abstraction, incomplete required write-up.** Tenant specialization/override precedence, drift detection, version compatibility, and promotion/revalidation policy need to be explained in `/REPORT.md`. |
| **Section 6 deliverables** | Source exists; README exists; demo CLI exists. | **Incomplete.** `/REPORT.md` absent; README does not document the current demo commands; `/evidence/` lacks genuine LLM discovery/replay example; public GitHub state not verified. |

## 3.1 Assignment acceptance-gate status

This is the shortest reviewer-facing view of the current project. “Implemented” means the mechanism exists in source; “Proven” means the supplied repository evidence demonstrates the assignment requirement end to end.

| Acceptance gate | Implemented | Proven in supplied snapshot | Remaining proof/work |
| --- | :---: | :---: | --- |
| Natural-language goal + live target | Yes | Partial | Live-model run is not committed. |
| Genuine LLM observe-decide-act loop | Yes | **No** | Execute `discover --live` against the local app and preserve provider/run evidence. |
| Real UI interaction | Yes | Yes, via Playwright tests/offline demo path | Tie this to the genuine model run. |
| Typed/versioned reusable capability | Yes | Partial | Commit the artifact produced by the genuine run. |
| Deterministic model-free replay | Yes | Partial | Replay the genuine artifact with a second input and preserve zero-model-call evidence. |
| Typed output extraction | Yes | Partial | Preserve successful replay output evidence after fixing sensitive-output redaction. |
| Business outcome vs recoverable vs failure | Yes | Partial | Commit at least one exceptional replay bundle. |
| Explicit allowlist and risky-action policy | Yes | Yes in code/tests | Add reviewer-facing evidence/description in `REPORT.md`. |
| No sensitive data persisted | Partial | **No** | Close discovery-output redaction gap and scan evidence with canary values. |
| Human same-session takeover and handback | Yes | Partial | Run headed handoff and commit evidence showing pause, operator action, resume. |
| Heterogeneous surface abstraction | Yes | Design-level | Explain extension seam and limitations in `REPORT.md`. |
| Multi-tenant reuse/drift strategy | Partial | **No write-up** | Define base capability + tenant/version specialization and revalidation strategy. |
| `/README.md` exact setup/demo path | Partial | **No** | Rewrite around actual CLI. |
| `/REPORT.md` seven exact headings | **No** | **No** | Create required 1-3 page report. |
| `/evidence/` discovery + replay demonstration | Mechanism only | **No** | Produce reviewer-oriented evidence bundle from real discovery and deterministic replay. |

### 3.2 Highest-value gaps by evaluation weight

The assignment says evaluation is weighted roughly toward system design first, then core-loop correctness, robustness/error handling, human escalation, generalization, safety, code quality, and communication. Against that weighting, the remaining gaps are not equal:

1. **Core-loop proof:** the code has a provider-backed discovery path, but the repository does not contain the mandatory genuine LLM-driven run. This is the single highest-risk acceptance gap because the brief explicitly says the discovery run "has to be real."
2. **Safety proof:** `OpenAIDiscoveryModel.decide()` serializes `input.inputs` into the provider request even though the prompt says host-bound fields are filled by the host. For the demo, `memberId` is marked sensitive. This is unnecessary disclosure and should be removed before generating final evidence.
3. **Evidence privacy:** `writeRunBundle()` can redact known sensitive inputs/outputs, but the discovery trace is persisted before discovered sensitive output values are supplied as `outputs`. A sensitive value present only in an observation/free-text trace can therefore escape value-based redaction.
4. **Communication/deliverables:** `REPORT.md` is an explicit required artifact and is absent. README does not expose the actual end-to-end CLI despite the CLI existing.
5. **Reproducibility:** no lockfile is present, README/package Node constraints disagree, and this workspace cannot be clean-installed/tested under its declared Node 24 runtime here.

**[STRONG INFERENCE, HIGH confidence]** The project is past the architecture-build phase. The critical path is now privacy-boundary repair -> genuine integration proof -> deliverable hardening. Adding more framework or platform breadth before those gates close would reduce submission quality by consuming time without addressing the assignment's highest-weight criteria.

## 4. What changed since the previous assessment

The previous assessment identified several correctness gaps that are now closed or materially reduced.

### Closed or substantially closed

**[FACT] Discovery action authority.** Discovery now materializes model proposals through externally supplied grants, constructs a temporary validated capability step, and runs the same policy evaluator before execution. Model completion is verified against an independently declared success checkpoint.

**[FACT] Destination enforcement.** Policy now validates navigation destinations as well as current location. The Playwright adapter also installs a request guard before navigation, covering redirects and subresources within the configured authority boundary.

**[FACT] Capability compilation.** The compiler no longer invents empty contracts or weak checkpoints. The host specification supplies typed I/O, targets, outcomes, policy, bindings, and success criteria; the compiler records only successful executed actions from the discovery trace.

**[FACT] Same-session handoff.** The former synthetic immediate resume has been replaced by a deferred handback model. The coordinator pauses automation, cedes the same page/session to a human, waits for an explicit response, verifies state, then restores automation ownership.

**[FACT] Browser runtime handling.** The target app and tests now exercise delayed UI behavior, session expiry, permission denial, unexpected dialogs, and human blocking. Replay polls checkpoints instead of repeating actions while waiting for UI state.

**[FACT] Evidence safety.** Rich browser evidence is deliberately structural rather than raw screenshots/text, avoiding direct persistence of page text, input values, URLs, and credentials. Run-bundle JSON passes through a central redactor.

### Still open or newly visible

#### F1. Genuine discovery evidence is still absent

**[FACT, blocker]** The assignment explicitly requires at least one genuine LLM-driven run against a live surface with evidence under `/evidence/`. The project now has the implementation path (`demo discover --live`) but the supplied evidence directory contains only test/runtime artifacts. There is no committed live-model manifest, discovery trace, generated capability, and deterministic replay bundle demonstrating the required thread.

This is the highest-priority remaining item.

#### F2. The discovery seam is arguably over-scaffolded

**[FACT]** `demoSpecification()` predeclares every demo target, locator, input/output contract, business outcome, action grant/effect, and success checkpoint. The model chooses actions among those reviewed controls and discovers their ordering.

**[STRONG INFERENCE, MED-HIGH confidence]** This is defensible as a safety-first design, but it narrows "discovery" substantially. A reviewer may reasonably ask what the model actually learned beyond the sequence. The assignment specifically emphasizes recording how target controls are identified and robustness reasoning. In the current demo, target identification is supplied by the host before discovery rather than learned from the run.

The project does not need a general autonomous selector generator, but the write-up should state this cut explicitly. A small improvement would let discovery select among predeclared candidate strategies or capture which strategy actually resolved each control, then persist that evidence/provenance into the compiled artifact.

#### F3. Sensitive values are unnecessarily exposed to the model

**[FACT]** `OpenAIDiscoveryModel.decide()` serializes `input.inputs` into the provider request. In the demo, `memberId` is declared `sensitive: true`, while the prompt already says input-bound fields are filled by the host and the model should omit their value.

**[STRONG INFERENCE, HIGH confidence]** Sending the raw bound value to the model violates the project's own data-minimization intent and is unnecessary for this workflow. For a financial-data architecture, sensitive bound inputs should be replaced with typed placeholders or omitted from model context unless the model demonstrably needs them.

#### F4. Discovery evidence redaction does not yet know sensitive output values

**[FACT]** `writeRunBundle()` redacts sensitive output values only when those concrete values are supplied in its `outputs` argument. During discovery, `result.outputs` is `{}` and the discovery trace can contain full visible page text from the terminal observation. Therefore a sensitive output such as the displayed balance can appear in persisted discovery observations without being registered as a sensitive value.

**[STRONG INFERENCE, HIGH confidence]** This is a real persistence boundary gap even though the demo data is synthetic. Fix before using real or realistic sensitive values. Options include extracting declared sensitive outputs before persistence, field-aware observation sanitization, or suppressing/transforming model-facing and persisted visible text for declared sensitive targets.

#### F5. Submission documentation is stale/incomplete

**[FACT, blocker]** `/REPORT.md` is absent despite being an explicit deliverable with seven required headings.

**[FACT]** README describes architecture accurately at a high level but does not document the implemented `offline`, `discover --live`, `replay --artifact`, and `handoff --artifact` demo commands. Its minimal replay example references `capabilities/example.json`, which is not present. It says the supported Node range is `>=24.21.0 <25`, while `package.json` declares `^24.3.0`. README references a `LICENSE` file not present in this snapshot.

#### F6. Reproducible packaging is incomplete in the supplied snapshot

**[FACT]** There is no lockfile in the supplied archive. For a take-home that reviewers should run quickly, a committed `package-lock.json` materially improves reproducibility. The archive also lacks the CI/config files referenced by the prior assessment.

**[UNKNOWN]** These files may exist in the actual Git repository and simply have been omitted from the zip. Verify the repository itself before changing anything solely on this basis.

#### F7. Provider integration should be validated against the current API contract

**[FACT]** The live provider is hand-written against the Responses HTTP endpoint and tests mock transport behavior. No genuine provider call is present in evidence.

**[STRONG INFERENCE, HIGH confidence]** The first real discovery run is also the required integration test for response-format compatibility, model behavior, abort semantics, and prompt sufficiency. Do not assume mocked transport proves live API compatibility.

## 5. Architecture and security assessment

### Strongest design choices

The following are well aligned with the assignment's evaluation priorities:

1. **Artifact as the production trust boundary.** Replay depends on a validated artifact and policy, not a model transcript.
2. **External authority.** The model cannot mint targets, grants, approvals, or policy authority.
3. **Explicit outcome taxonomy.** Business outcomes are separate from infrastructure failures and recoverable conditions.
4. **Conservative uncertain commits.** Ambiguous risky actions are reconciled or escalated rather than blindly retried.
5. **Surface seam.** Playwright is behind an adapter and the artifact schema does not contain Playwright-specific types.
6. **Same-session ownership model.** Human/automation ownership is explicit and action admission is drained before transfer.
7. **Bounded waiting without repeated side effects.** Checkpoints poll observations instead of replaying actions while waiting.

### Main residual risks

| Risk | Impact | Current mitigation | Remaining action |
| --- | --- | --- | --- |
| No genuine discovery proof | Submission rejection / central requirement unproven | Live provider and CLI exist | Run and commit a real discovery + replay bundle |
| Sensitive input sent to model | Data-minimization/privacy violation in realistic deployment | Synthetic demo data only | Remove/mask sensitive bound values from model context |
| Sensitive discovery output in trace | Raw regulated value could persist in JSON | Central redactor, structural browser snapshots | Make discovery observation/output redaction field-aware |
| Discovery relies on predeclared controls | Reviewer may view model role as too narrow | Strong safety and deterministic target catalog | Document cut; optionally persist actual resolved strategy provenance |
| No REPORT / stale README | Explicit deliverable failure | Design reasoning exists in `notes.md`/`ELOG.md` | Produce concise required report and exact commands |
| Missing lockfile in snapshot | Reviewer setup friction / dependency drift | Version ranges in package metadata | Commit lockfile and verify clean install |
| Structural evidence too sparse | Harder debugging of failures | Trace contains observations/checkpoints | Consider sanitized accessibility snapshot or masked screenshot for failure-only evidence |

## 6. Recommended next development steps

The next work should be executed as a dependency-ordered sequence. Do not start optional generalization work until P0 is green.

| Order | Priority | Development step | Concrete implementation target | Acceptance gate |
| ---: | --- | --- | --- | --- |
| 1 | **P0** | Minimize model-visible data | In `src/discovery/openai-discovery-model.ts`, derive a model-safe invocation view from the contract. Do not serialize raw values for sensitive host-bound inputs. The model already receives target IDs and `inputBindings`; expose only field name/type/presence where needed. | A canary `memberId` is absent from the serialized HTTP request body; transport-level unit test proves it. |
| 2 | **P0** | Close discovery evidence leakage | In the discovery/evidence boundary, sanitize observations before persistence using contract-aware sensitive targets/outputs, or extract/register sensitive outputs before serializing the discovery trace. Treat provider context, in-memory execution state, and persisted evidence as three separate trust boundaries. | A unique balance canary does not occur anywhere under the generated run directory. Test should recursively scan files. |
| 3 | **P0** | Validate the real provider path | Run one genuine `OpenAIDiscoveryModel` discovery against the local app. Verify Responses API parsing, structured decision format, abort behavior, target/grant compliance, and completion verification. | Manifest records `live-model`, provider/model metadata and response IDs; discovery reaches verified success. |
| 4 | **P0** | Persist the discovered capability as the handoff boundary | Ensure live discovery always writes the compiled `artifact.json` in a stable reviewer-visible location before any replay is attempted. | Artifact parses independently with `parseCapabilityArtifact`; provenance points to the discovery run. |
| 5 | **P0** | Prove deterministic replay from disk | Start a fresh browser context/process path, load only the saved artifact, invoke with another member ID, and prohibit model construction/import on replay path where practical. | Correct typed output; `modelCallsDuringReplay: 0`; same artifact works for at least two member IDs. |
| 6 | **P0** | Prove runtime taxonomy | Execute `DEMO-999`/not-found plus one technical blocked scenario such as session expiry or unexpected dialog. | Evidence clearly distinguishes `BUSINESS_OUTCOME` from `RECOVERABLE`/`INTERVENTION_REQUIRED`/`FAILURE` and names the stopped step/checkpoint. |
| 7 | **P0** | Prove human control transfer | Run the headed handoff scenario. Preserve same browser session, explicit ownership transfer, human action metadata, resume signal, resumed-state verification, and retry of only the blocked step. | Evidence shows automation pause -> human owner -> recorded manual action -> explicit handback -> automation owner -> continuation. |
| 8 | **P0** | Create `/REPORT.md` | Use exactly the seven assignment headings. Keep it 1-3 pages. Explicitly defend external authority, predeclared target catalog, deterministic targeting/checkpoints, ambiguous-commit handling, handoff ownership, privacy limits, and cuts. | All seven exact headings present and claims match code/evidence. |
| 9 | **P0** | Make README executable | Replace stale minimal example with exact `offline`, `discover --live`, `replay --artifact`, and `handoff --artifact` commands. Reconcile Node version text with `package.json`; remove references to nonexistent files unless added. | Reviewer can follow README from clean checkout without guessing paths or flags. |
| 10 | **P1** | Make repository reproducible | Generate/commit `package-lock.json`; reconcile the Node engine requirement between README and `package.json`; add `.gitignore`, `.env.example`, and `LICENSE` if referenced/intended; remove `__MACOSX`; verify public-repo contents. | `npm ci` succeeds on declared Node 24 version and repo has no secrets/generated junk. |
| 11 | **P1** | Establish a clean verification gate | Run typecheck, unit/integration tests, coverage, build, offline demo, live discovery, replay, exceptional replay, and handoff from a fresh checkout. | Record exact commands and observed pass results in README/REPORT. No unsupported coverage claim. |
| 12 | **P2** | Improve discovery provenance, if time remains | Record which locator strategy actually resolved each target during discovery, or let the model choose among host-reviewed candidates. | Artifact/evidence can explain why a target strategy was selected without allowing the model to mint authority. |
| 13 | **P2** | Add tenant specialization design, not infrastructure | Define base vendor capability identity, compatibility constraints, tenant override precedence, drift detection, quarantine/revalidation, and promotion semantics in the report/schema notes. | Reviewer can see how one capability safely specializes across institutions/versions without per-tenant rerecording. |

### Development stop condition

Stop adding features once steps 1-11 pass. At that point the assignment's core thread is demonstrated. The optional P2 items are useful only if they improve the defense of the existing architecture without destabilizing the vertical slice.

## 7. Concrete submission runbook

After P0 privacy fixes, use one fixed port so the artifact's origin authority remains valid. The intended sequence should be documented and then executed approximately as follows (exact model name is environment-specific):

```bash
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run coverage
npm run build

# Reproducible no-credit integration path
npm run demo -- offline --port 4173 --member DEMO-001

# Assignment-required genuine discovery
OPENAI_API_KEY=... MODEL_NAME=... npm run demo -- discover --live --port 4173 --member DEMO-001

# Replay the artifact saved by that live run, with no model required
npm run demo -- replay --port 4173 --member DEMO-002 --artifact evidence/<live-run>/artifact.json

# Expected business outcome
npm run demo -- replay --port 4173 --member DEMO-999 --artifact evidence/<live-run>/artifact.json

# Same-session human takeover
npm run demo -- handoff --port 4173 --member DEMO-001 --artifact evidence/<live-run>/artifact.json
```

If the live discovery command does not currently save `artifact.json` before replay, fix that before the final run. The evidence directory should make the reviewer able to trace one `runId`/capability from discovery to artifact and separate replay invocations without guessing.

## 8. Submission-readiness decision

**[STRONG INFERENCE, HIGH confidence] Keep the current architecture. Do not add distributed services, more adapters, a capability registry, or another framework before submission.** The load-bearing implementation is now largely present.

The remaining work is concentrated and measurable:

- eliminate the two sensitive-data boundary gaps;
- perform and preserve the required genuine LLM discovery;
- prove saved-artifact replay and handoff from that artifact;
- produce the required report and accurate README;
- verify a clean reproducible checkout.

A submission should be considered ready only when all of these are true:

- one committed **genuine** live-model discovery bundle exists;
- its saved artifact replays with at least two input values and zero model decisions;
- one business outcome and one intervention/failure path are preserved as evidence;
- same-session human takeover and explicit handback are demonstrated;
- sensitive canaries do not appear in provider-unnecessary context or persisted evidence;
- `REPORT.md` has the seven exact required headings;
- README commands work from a fresh checkout;
- clean typecheck, tests, coverage policy, build, and demo commands pass under the declared Node version;
- the public GitHub repository contains the complete deliverable and no secrets.

At that point the project would present a small, coherent, defensible system that matches the assignment's stated preference for a complete vertical slice over additional breadth.

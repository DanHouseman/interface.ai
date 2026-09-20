# Assignment A alignment assessment

Assessment date: 2026-09-19. Scope: the current working tree, including existing staged dependency changes.

## 1. Objective, assumptions, and limits

The objective is submission readiness against Assignment A, especially its required end-to-end workflow. The assignment PDF is the acceptance authority. `notes.md` and `ELOG.md` describe intended behavior and development history; their completion claims are not independent proof.

Reviewed all 17 authored source TypeScript files, all 10 test files, both TypeScript configuration files, all three existing Markdown files, package metadata and the parsed lockfile, CI configuration, environment template, ignore rules, license, and the evidence inventory. Read all 10 assignment pages and inspected their rendered layout. Dependency source, Git objects, and generated build/coverage files are not authored project implementation.

Assumptions and constraints:

- Assess the local project as supplied; do not presume that uncommitted or externally stored discovery evidence exists.
- A synthetic local application is an acceptable real UI under the assignment. A scripted model test double does not satisfy genuine LLM discovery.
- Keep the current single-process architecture. Desktop implementation, a production operator console, and distributed infrastructure are not required.
- Model access and provider preference are unknown. Neither is needed to identify the current gaps.
- Public repository visibility, remote CI status, a clean-machine install, and any external evidence were not verified. **Incomplete Evidence** for those items.
- No model calls, external transactions, publication, or source fixes were performed. Verification regenerated ignored build/coverage output; the browser test regenerated its existing screenshot without a Git-visible change.

Confidence labels below are engineering judgments, not statistically measured probabilities: **Fact: 99%**, for source inspection or observed test/probe results; **Strong Inference: 95-98%**, for implications established by several facts; **Reasonable Hypothesis: 80%**, for the proposed shortest completion path; **Speculation: unquantified**, excluded from scoring and recommendations.

## 2. Adversarial assessment

This assessment combines dependency analysis, first-principles acceptance criteria, failure-mode and security analysis, reviewer incentives, and the risk of mistaking reassuring internal metrics for demonstrated behavior.

| Perspective | Assessment | Evidence tier |
| --- | --- | --- |
| Strongest supporting argument | The core boundaries fit the brief: portable artifact schema, model-free replay, a replaceable surface adapter, explicit outcomes, checkpoints, and an isolated policy component. Reuse these components. | Fact / Strong Inference |
| Strongest opposing argument | The assignment's central proof is absent: a genuine model-driven UI run producing a saved, parameterized capability that replays with outputs and a real human handoff. Passing component tests cannot replace that proof. | Fact / Strong Inference |
| Edge cases | An action navigates outside authority; a write times out after committing; a not-found result conflicts with success postconditions; an output is absent; human control has not actually been returned; screenshots contain sensitive text. Current gaps occur at these boundaries. | Fact for reproduced cases; Strong Inference for browser commit and concurrency consequences |
| Second-order effects | Weak success checkpoints can make a broken compiler look reliable. Model-derived allowlists convert discovered behavior into permission. A high coverage target can reward exercising current behavior without challenging its correctness. | Strong Inference |
| Unintended consequences | Retrying a write can duplicate an effect; restarting replay after handoff can repeat completed actions; raw screenshots can defeat JSON redaction; inconsistent documentation makes review harder. | Strong Inference |
| Reviewer incentives | The brief explicitly prioritizes a complete, small system and clear trade-offs. Additional abstractions and longer notebooks provide less acceptance value than one reproducible integrated demonstration. | Strong Inference |

## 3. Evidence and concrete findings

### Verification results

| Check | Observed result | Tier |
| --- | --- | --- |
| Runtime | Node 24.21.0; npm 12.0.2 | Fact |
| `npm run typecheck` | Passed; configuration includes production source only | Fact |
| `npm run build` | Passed | Fact |
| Existing tests | 54/54 passed across 10 files when executed with browser-launch permissions | Fact |
| Initial sandboxed test attempt | 49 passed; browser suite could not launch Chromium because macOS denied its process bootstrap operation | Fact |
| `npm run coverage` | All tests passed, command exited 1 because configured 100% thresholds were unmet | Fact |
| Coverage | Statements 94.32%; branches 80.40%; functions 94.84%; lines 96.42% | Fact |
| Coverage of discovery engine | Branches 38.88% | Fact |
| Coverage of handoff coordinator/router | Branches 57.14% | Fact |

The initial browser failure was environmental. The coverage failure is a reproducible project check failure. CI currently runs typecheck, tests, and build, but does not run coverage. See [vitest.config.ts](/Users/null/interface.ai/vitest.config.ts:7) and [CI](/Users/null/interface.ai/.github/workflows/ci.yml:1).

### F1. Genuine discovery and submission evidence are missing

**Fact.** `DiscoveryModel` is an interface; there is no concrete provider implementation, executable discovery entry point, demo application, or goal-to-replay command. Discovery tests use a scripted object and `FakeSurfaceAdapter`. The browser tests exercise adapter mechanics against inline HTML independently of discovery and replay. `/evidence/` contains one browser-test screenshot, no saved capability, discovery log, or replay log.

The PDF, Section 4, explicitly requires a genuine LLM-driven live run. Section 6 requires a saved artifact and logs from both phases. This is a submission blocker regardless of unit-test quality.

Sources: [discovery contracts](/Users/null/interface.ai/src/discovery/discovery-contracts.ts:19), [discovery test](/Users/null/interface.ai/test/discovery-handoff.test.ts:5), [browser tests](/Users/null/interface.ai/test/playwright-surface-adapter.test.ts:23), [package scripts](/Users/null/interface.ai/package.json:6).

### F2. Discovery does not enforce proposed-action authority

**Fact.** The discovery engine checks the current observed origin and route before asking the model. It does not check the proposed navigation destination, action type, or effect against external policy, and has no approval gate. It also accepts model completion without an independently verified goal condition. The compiler derives permitted action types from model decisions.

**Reproduced:** a scripted model proposed an `irreversible_write` submit with no approval. The fake surface executed it and discovery returned `SUCCESS`.

**Strong Inference, 98%.** The stated invariant that the model does not define authority is not yet implemented across discovery and compilation. A model acting on malicious page instructions can exploit the missing action gate; the existing replay-oriented tests do not demonstrate discovery resistance.

Sources: [discovery engine](/Users/null/interface.ai/src/discovery/discovery-engine.ts:7), [compiler](/Users/null/interface.ai/src/discovery/capability-compiler.ts:16).

### F3. Replay policy checks the source location, not the destination

**Fact.** The evaluator validates `observation.location`, action type, and an optional step-approval flag. It does not evaluate the resolved navigation value. Output extraction executes additional `read` actions outside this policy/trace path. Retries also bypass a fresh policy evaluation.

**Reproduced:** with authority limited to `https://demo.invalid`, replay executed a navigation to `https://outside.invalid/private` and returned `SUCCESS` against the fake adapter. The fake adapter does not navigate a real browser; this probe proves the unauthorized action reached the adapter.

Risk classification alone does not require approval: `humanApprovalRequired` defaults to false and the evaluator does not inspect `effect`. The assignment permits blocking, confirmation, or flagging risky actions, so effect-dependent evidence capture deserves partial credit. It does not justify the notebook's stronger approval claims.

Sources: [policy evaluator](/Users/null/interface.ai/src/policy/policy-evaluator.ts:35), [navigation materialization](/Users/null/interface.ai/src/replay/replay-engine.ts:226), [output extraction](/Users/null/interface.ai/src/replay/replay-engine.ts:308).

### F4. Compilation does not produce a reusable capability contract

**Fact.** Compilation emits empty inputs, outputs, and business outcomes; embeds discovered values as literals; converts every action decision into a step without checking whether the action succeeded; and chooses the first line of final visible text, or merely an active session, as the success checkpoint. It does not retain step preconditions or postconditions. Repeated target IDs overwrite earlier target definitions.

**Reproduced:** a successful discovery trace with one failed attempt followed by one successful action compiled into two steps. The generated contract was empty and the success condition was the generic text `Member Search`.

**Strong Inference, 98%.** The schema can represent much of the required contract, but the compiler currently creates a fixed recording with a weak success test. Adding an LLM provider alone will not deliver parameterized replay.

Source: [capability compiler](/Users/null/interface.ai/src/discovery/capability-compiler.ts:5).

### F5. Human handoff is a disconnected foundation

**Fact.** `waitForResume()` immediately returns a synthetic `demo-operator` response when nobody has responded. Neither execution engine invokes the coordinator. Replay returns a terminal intervention result and has no continuation cursor. Human actions can be supplied as records, but are not captured from a live operator surface. The coordinator observes after resuming; it does not verify a declared resume checkpoint before returning control.

**Reproduced:** intervention completed with automation ownership restored and an empty human-action list, without any human response.

**Strong Inference, 95%.** Owner flags prevent new adapter actions while paused, but do not constitute an atomic ownership protocol: already-running actions and concurrent pause/resume calls are not serialized. Same-session human control and safe continuation remain to be demonstrated.

Sources: [handoff](/Users/null/interface.ai/src/hitl/intervention.ts:10), [immediate resume](/Users/null/interface.ai/src/hitl/intervention.ts:27), [browser ownership](/Users/null/interface.ai/src/surface/playwright-surface-adapter.ts:165).

### F6. Redaction does not cover all persistence paths

**Fact.** `EvidenceRedactor` collects sensitive input values, but ignores output sensitivity declarations. It replaces sensitive values in strings, while numbers and booleans remain unchanged. Screenshots are written directly to disk without masking. Compilation can embed input values and observed text into the artifact. Discovery has no sanitized persistence pipeline.

**Reproduced:** a declared sensitive numeric input and a declared sensitive balance output remained unchanged after redaction.

This identifies a leakage path, not evidence that real customer data was exposed. The distinction matters. The assignment's prohibition concerns artifacts and logs as well as richer evidence.

Sources: [redactor](/Users/null/interface.ai/src/evidence/redactor.ts:10), [evidence store](/Users/null/interface.ai/src/evidence/evidence-store.ts:20), [screenshot writer](/Users/null/interface.ai/src/surface/playwright-surface-adapter.ts:136), [compiler](/Users/null/interface.ai/src/discovery/capability-compiler.ts:11).

### F7. Browser errors can bypass ambiguous-commit protection

**Fact.** The browser adapter converts every caught action error into recoverable `BROWSER_ACTION_FAILED`, without setting `ambiguousCommit`. Replay retries recoverable actions when configured to do so. Schema validation allows retrying risky actions when reconciliation is declared, but actual reconciliation is entered only when the adapter returns the ambiguity flag.

**Strong Inference, 98%.** A configured risky click that commits and then times out can be retried without reconciliation. The existing ambiguity tests inject the flag into the fake adapter; they do not establish that real browser failures are classified correctly.

Sources: [browser error conversion](/Users/null/interface.ai/src/surface/playwright-surface-adapter.ts:131), [retry loop](/Users/null/interface.ai/src/replay/replay-engine.ts:251), [schema retry rule](/Users/null/interface.ai/src/artifact/capability-schema.ts:230).

### F8. Replay does not enforce output contracts or all outcome semantics

**Fact.** Extraction ignores output `required` and `type`. Required outputs can disappear silently; reads can return a value of the wrong type. Observation, checkpoint, and output-resolution exceptions can escape the structured result boundary.

**Reproduced:** a required missing output returned `SUCCESS` with `{}`; a required numeric output returned `SUCCESS` with the string `$123.45`.

**Fact.** Postconditions are evaluated before post-action business outcomes. **Reproduced:** when an action produces `Member not found` while its success postcondition expects member detail, replay returns `POSTCONDITION_FAILED` instead of the declared business outcome.

Sources: [post-action ordering](/Users/null/interface.ai/src/replay/replay-engine.ts:142), [output extraction](/Users/null/interface.ai/src/replay/replay-engine.ts:308).

### F9. Validation and waiting need targeted completion

**Fact.** Cross-reference validation covers step targets and input references, but not all checkpoint/output targets or duplicate identifiers. Action-specific requirements are checked later during replay rather than consistently at artifact load time. Output sources may be empty or specify both mechanisms. Object/array output types do not describe their nested shape.

**Reproduced:** duplicate step IDs and an undeclared required output target were accepted by the artifact schema.

**Fact.** Browser target resolution uses an immediate `count()` before action auto-waiting. Checkpoints are sampled once. Browser session expiry means a closed page, not a login-expired application state. Observations expose body text, not structured control metadata, frame context, or model-facing screenshots. Discovery's timeout is checked between iterations and cannot cancel a stalled model/adapter call. Its action trace omits read `observedValue` and signals.

**Strong Inference, 95%.** Delayed controls, login redirects, iframe content, and weakly labeled interfaces remain integration risks despite the useful abstraction. Desktop implementation is optional; these limitations should be bounded and documented for the chosen browser demo.

Sources: [schema validation](/Users/null/interface.ai/src/artifact/capability-schema.ts:210), [browser observation](/Users/null/interface.ai/src/surface/playwright-surface-adapter.ts:40), [target resolution](/Users/null/interface.ai/src/surface/playwright-surface-adapter.ts:181), [checkpoint evaluation](/Users/null/interface.ai/src/replay/checkpoint-evaluator.ts:12), [discovery loop](/Users/null/interface.ai/src/discovery/discovery-engine.ts:10).

### F10. Documentation and packaging are not submission-ready

**Fact.** `/REPORT.md` is absent. The assignment requires approximately 1-3 pages under these exact headings: Architecture; Artifact schema; Determinism & error handling; Heterogeneity & multi-tenant; Escalation & handoff; Safety; Cuts.

The README has no runnable discovery/replay demo and references a nonexistent `capabilities/example.json`. It states an engine range of `>=24.21.0 <25`, while package metadata currently specifies `^24.3.0`. Environment variable names exist but no executable integration consumes them.

`ELOG.md` correctly lists missing live integration, but also claims discovery policy-decision traces that the trace union cannot represent. Its older next-steps section still requests a browser adapter already present. `notes.md` includes worthwhile requirements but several exceed the assignment's mandatory scope, including linting, fingerprints, extensive operational checks, and additional demonstration depth. Treat these as internal plans, not additional submission gates.

The `chromium` runtime package has no authored-source import; Playwright already supplies the browser automation dependency and installation path. Review whether this extra downloader is needed. The lockfile root matches current package dependencies and engine metadata. Test files are transpiled by Vitest but excluded from the TypeScript typecheck configuration. Some new modules and tests are compressed into long lines, reducing reviewability.

Sources: [README](/Users/null/interface.ai/README.md:62), [example](/Users/null/interface.ai/README.md:108), [ELOG claims](/Users/null/interface.ai/ELOG.md:18), [old roadmap](/Users/null/interface.ai/ELOG.md:349), [tenant requirements](/Users/null/interface.ai/notes.md:1205), [TypeScript config](/Users/null/interface.ai/tsconfig.json:20).

## 4. Requirement alignment and decision

**Strong Inference, 98%: retain the architecture, but do not treat this working tree as a complete submission.** The missing integrated workflow and demonstrated correctness gaps are material must-have failures. A percentage-complete score would hide those dependencies.

| Assignment requirement | Current alignment | What closes the gap |
| --- | --- | --- |
| 3.1 Goal-driven live agent | Partial foundation; required demonstration missing | Concrete model provider, informative observations, validated decisions, guarded live UI run, saved evidence |
| 3.2 Structured capability | Strong schema foundation; compiler incomplete | Successful executed flow, explicit input bindings, output extraction contract, meaningful checkpoints, saved artifact |
| 3.3 Deterministic replay | Strong component foundation; incomplete integrated correctness | Browser replay of generated artifact, enforced outputs, deliberate waits, correct business outcomes and browser error classification |
| 3.4 Safety | Partial; blocking gaps | External action/destination policy in both phases, conservative risky actions, end-to-end sanitization |
| 3.5 Evidence | Partial replay support | Linked, sanitized discovery and replay logs; artifact; failure evidence; unique run-scoped paths |
| 3.6 Human handoff | Foundation only | Explicit wait for human, same live session, action recording, verified continuation without repeating completed writes |
| 3.7 Heterogeneity and scale design | Good abstraction; write-up incomplete | Concrete explanation of legacy/desktop perception and action, tenant override precedence, compatibility checks, drift handling |
| Section 6 deliverables | Incomplete | Runnable README demo, exact REPORT headings, evidence bundle, confirmed public repository |

| Strategic choice | Benefit | Cost / trade-off | Decision |
| --- | --- | --- | --- |
| Complete one synthetic local banking workflow | Reproducible failures and human takeover; direct proof of every must-have | Must build a small real UI and avoid hard-coding model decisions | Recommended, Reasonable Hypothesis 80% |
| Use a public demo site | Less target-app code | Less control over sessions, failures, availability, and safety boundaries | Valid alternative if it supports all required scenarios |
| Add more adapters, registries, or distributed services now | More breadth | Does not close the missing core demonstration | Defer |
| Pursue 100% coverage before integration | Meets an internal numeric target | Does not prove the workflow and can preserve incorrect behavior | Prioritize behavioral regressions; then reconcile the target honestly |

## 5. Ordered next steps and acceptance gates

| Order | Work | Acceptance gate |
| --- | --- | --- |
| 1 | Fix the minimum safety boundary before a live model run: externally configured action/effect policy, destination checks, conservative writes, sanitized persistence | Disallowed destination and risky action reach the adapter zero times; sensitive canaries never reach persisted JSON, artifact text, or screenshots |
| 2 | Build one local synthetic member-search UI and a real model adapter; expose runnable discovery entry point | Natural-language goal produces a multi-step live UI run using real model decisions, bounded by steps/time; save model identity, run ID, decisions, observations, and result |
| 3 | Complete compilation and typed replay together | Saved artifact uses a member-ID input, returns a validated balance output, and verifies the selected member and terminal state; replay two different IDs with model access disabled |
| 4 | Close browser/runtime outcome gaps with focused regressions | Not-found is BUSINESS_OUTCOME; slow load waits within a bound; expired session/permission/dialog states stop deliberately; ambiguous writes execute at most once unless non-commit is proven; adapter exceptions become structured results |
| 5 | Wire intervention into an execution coordinator | Automation pauses; operator acts in the same visible page; explicit handback is required; human activity is recorded; resume checkpoint passes before continuing from the correct step |
| 6 | Save the complete demonstration bundle | `/evidence/` contains a generated artifact, genuine discovery log, deterministic replay log, exceptional replay log, sanitized richer failure evidence, and handoff evidence with matching run/session identifiers |
| 7 | Finish submission documentation and verification | README commands reproduce discovery and saved-artifact replay; REPORT uses all seven headings; current-state claims agree with code; clean setup/typecheck/tests/build and the chosen coverage policy pass |

For steps 2-3, a read-oriented lookup with search, detail, and balance extraction keeps the live model's permitted actions small. A controlled unexpected dialog can exercise human intervention. A separate simulated commit failure can validate conservative write behavior without real financial operations.

The compiler may accept a small explicit binding/output specification for this one capability. General-purpose automatic parameter inference is unnecessary, provided the actual UI flow is discovered by the LLM and the artifact's authoring boundary is documented.

Completion metrics:

- One genuine live discovery, with reviewable evidence.
- One saved capability replayed for at least two input values, with zero model calls and correct typed outputs.
- One expected business outcome and one technical failure with correct classification and useful evidence.
- One real same-session human takeover and explicit, verified handback.
- Zero unauthorized adapter actions in policy regression cases.
- Zero persisted sensitive canaries across all evidence formats.
- No repeated irreversible action after an unresolved commit failure.
- All documented validation commands have accurate, reproducible outcomes.

Risks and assumptions to monitor: model access, observation adequacy for target selection, checkpoint specificity, action effect misclassification, screenshot masking, session continuity, and retry behavior. Reassess the recommended local-target approach after the first guarded discovery run; that experiment will reveal the remaining integration work more accurately than further architecture expansion.

# Assignment Alignment Assessment

## Review basis and verdict

Reviewed September 21, 2026 against all ten pages of [Assignment A](<./Assignment A — Computer-Use Automation System.pdf>), source revision `1bf50a8`, current tests, and recorded runtime evidence. This filename follows the user's requested spelling; [PROJECT_ASSESSMENT.md](./PROJECT_ASSESSMENT.md) is the historical assessment.

**The application is not 100% aligned and is not ready for an unqualified completion claim.** The end-to-end discovery/artifact/replay thread is real. This review reproduced a sensitive-output persistence defect and identified an incomplete discovery-to-human handoff path. Submission evidence is local but untracked. These findings supersede earlier broad completion statements.

The assignment requires a thin real implementation of every core capability. It explicitly permits a single surface and design-only desktop/multi-tenant extensions. Production infrastructure and optional stretch goals are not prerequisites.

## Assumptions, constraints, and evidence standard

- Judge the assignment's text, not additional ambitions in `notes.md`, as the acceptance authority.
- Distinguish implementation, mocked transport tests, genuine provider evidence, and submission availability.
- Assess the current implementation without silently fixing it during the review. No application code changed.
- Do not infer public repository visibility, remote CI success, or submission delivery from local Git state.
- Preserve the user's existing `.gitignore` edit, which removes `/evidence/`; do not stage evidence or restore the rule.

| Tier | Meaning in this assessment | Confidence |
| --- | --- | --- |
| Fact | Direct source observation, inspected record, or executed check | 99% for reported observations; no universal correctness claim |
| Strong inference | Conclusion connecting inspected implementation to assignment intent | 90% |
| Reasonable hypothesis | Plausible risk requiring a targeted experiment | 65% |
| Speculation | Untested future benefit or behavior | No numerical confidence assigned; excluded from acceptance decisions |

Confidence values express judgment, not statistical estimates. **Incomplete Evidence:** remote publication/CI, newly rerun authenticated discovery, generalized privacy, and real-world reliability are not established by this review.

## Adversarial assessment

| Lens | Strongest support | Strongest objection / edge case | Second-order effect or unintended consequence |
| --- | --- | --- | --- |
| Systems thinking | Clean separation of model, host authority, artifact, and replay | Discovery failure closes the browser before human takeover | A good coordinator alone does not complete an end-to-end escalation path |
| First principles | Host checkpoints verify observed outcomes independently | Text becoming visible is not sufficient proof of business correctness for arbitrary applications | New workflows need reviewed, domain-specific invariants |
| Risk and failure-mode analysis | Ambiguous risky actions are reconciled or stopped | Output extraction can fail after sensitive text entered a checkpoint trace | A failure path bypasses a privacy assumption exercised on success |
| Security | Input binding and policy stay outside model control | Unclassified checkpoint strings can reach persistence when outputs are absent | Coverage and successful scans can create false confidence |
| Game theory | Model proposals have no authority to create grants | Page content can manipulate model choices among allowed actions | Allowlisting limits capability, not semantic correctness or prompt injection completely |
| Behavioral economics | Explicit live opt-in and human handback reduce accidental execution | A green suite, `SUCCESS`, or 100% coverage can anchor reviewers prematurely | Publish limitations beside results, not only in historical notes |

## Assignment traceability

Status applies to the actual requirement, not all conceivable production behavior. Source paths are relative to the repository.

| Assignment | Status | Evidence and limitation |
| --- | --- | --- |
| §2 / §3.1 goal + target | Met at library boundary; constrained demo | `DiscoveryRequest` accepts both. `run-demo.ts` supplies a fixed member-lookup goal and local URL; CLI has no arbitrary `--goal` or `--target`. |
| §3.1 real observe/decide/act | Met for demonstrated workflow | `DiscoveryEngine`, `OpenAIDiscoveryModel`, Playwright; genuine run `02def122-935d-4638-b66b-584849d5bffb` has four provider responses and three UI actions. |
| §3.1 stopping conditions | Implemented with limits | Step limit, stuck result, deadline, AbortSignal and late-model-result checks. An already-issued browser action is not transactionally cancelled by Promise.race. |
| §3.2 typed/versioned artifact | Met | Zod schema, reference validation, typed I/O, targets, checkpoints, recovery, provenance; independent saved artifact parses. |
| §3.2 robust targeting rationale | Met at design level; narrow demonstration | Ordered strategies and unique matches exist. Demo uses one CSS ID strategy per target; no proof of arbitrary legacy robustness. Discovery does not persist the successful locator strategy separately. |
| §3.3 saved-artifact replay | Met | Second-input run `282b5e47-c15a-4958-ae4d-912e129c3b56`, zero model calls; replay engine imports no model provider. CLI itself imports the provider module. |
| §3.3 checkpoints and outputs | Met for normal path | Member identity equality and visible detail/balance; policy-checked extraction and runtime output type checks. |
| §3.3 business/recoverable/hard outcomes | Met with diagnostic limits | Explicit result union, bounded recovery and uncertain-commit handling. `demo-integration.test.ts` covers invalid input, missing member, slow load, denial, expiry. Denial currently becomes generic `TARGET_RESOLUTION_FAILED`, not a dedicated permission code. |
| §3.3 unexpected dialogs | Implemented narrowly | Adapter dismisses browser dialogs; click path reports `UNEXPECTED_DIALOG`. Do not claim a general modal recovery engine or equivalent treatment for every action type. |
| §3.4 configurable allowlist/risky actions | Met for reviewed host integration | Policy intersects host ceiling, origin/route/action checks, invocation-scoped approvals; browser request guard. Direct adapter calls are not independently governed by a complete action policy. |
| §3.4 no persisted sensitive data | **Not met: reproduced defect F1** | Failed output extraction leaves a balance in `replay.json` checkpoint text. Existing successful scans do not cover this path. |
| §3.5 structured and richer evidence | Implemented; privacy gate fails | Trace plus structural DOM snapshots. Privacy-safe snapshots lose text/visual detail. Snapshot files and JSON traces follow different persistence paths. |
| §3.6 same-session replay handoff | Met for demonstrated replay | Genuine run `ae8edcd1-5ebf-4c32-b32a-417f05a797a3`: human events, explicit resume, verified readiness, no repeated prefix. Ownership transitions are code-enforced, not individually persisted events. |
| §3.6 stuck discovery takeover | **Partial: F2** | Engine returns `INTERVENTION_REQUIRED`; demo persists failure and closes browser. No discovery continuation/router connects it to live takeover. |
| §3.7 heterogeneous surfaces | Met as permitted design scope | `SurfaceAdapter`, browser/fake implementations, design in REPORT. Desktop and terminal implementations are deliberately absent. Coordinate support is bounded and does not supply visual recognition. |
| §3.7 multi-tenant design | Met as permitted design scope | REPORT defines base/version/tenant precedence, policy intersection, drift/quarantine/revalidation. Registry and merging are proposals. |
| §4 genuine discovery | Met locally | Provider IDs/model/timestamps and successful host checkpoint inspected previously; not regenerated with paid API calls during this review. |
| §5 full vertical slice | Substantial, incomplete at failure seams | Real core thread exists, but privacy and discovery escalation prevent an unqualified pass. |
| §6 README | Present, corrected with audit caveats | Installation, credentials, offline/live/replay/handoff commands. Exact demos operate the fixed local goal. |
| §6 REPORT and seven headings | Present | Seven headings match assignment. Markdown word count is not proof of a particular rendered page count. New audit caveat supersedes broad safety claims. |
| §6 `/evidence/` deliverable | Local only; submission pending | Genuine examples exist. `git ls-files evidence` is empty. Removing an ignore rule does not commit or publish evidence. |
| §8 optional stretch goals | Not required | No penalty for omitting catalog service, code generation, autonomous repair, or multi-run statistics. |
| §9 ground rules | Supported locally | Synthetic application/data, AI assistance acknowledged, no need for bank credentials. A complete Git-history secret audit was not performed. |
| §11 public repo and email | **Unverified / not delivered by this review** | Must publish the repository and email its URL as directed. The assignment says not to send a ZIP. |

## Findings and acceptance gates

### F1: Sensitive replay output can leak on failure

**Fact, 99%; release-blocking privacy failure.** Starting from the genuine saved artifact, change only the declared sensitive balance output type from `string` to `number`. The artifact remains schema-valid. The browser displays the synthetic balance, the success checkpoint captures page text, and extraction returns `INVALID_OUTPUT_TYPE` with no outputs. The bundle redactor consequently has no registered balance value for those flattened checkpoint strings.

Observed result: `FAILURE / INVALID_OUTPUT_TYPE`, outputs absent, sensitive balance present in persisted `replay.json`. Scratch reproduction: `/private/tmp/interface-audit-B9ANJR/f5a9d883-501d-49e7-b3c0-0523ef48032e/`. Only synthetic local data was used; the defect record is not included in the reviewer evidence archive.

Relevant code: [checkpoint evaluator](./src/replay/checkpoint-evaluator.ts), [replay engine](./src/replay/replay-engine.ts), [redactor](./src/evidence/redactor.ts), [bundle writer](./src/evidence/run-bundle.ts). Discovery's classified observations do not protect all replay checkpoint traces. This is an implementation gap, not a defensible privacy tradeoff.

**Repair gate:** preserve sensitive target/signal classification through checkpoint construction and failure persistence, or sanitize checkpoint diagnostics before they lose that classification. Add real-browser canary regressions for failed final checkpoints, missing/wrong-type outputs, and later-output failure after an earlier sensitive extraction. Scan every resulting file while retaining useful non-sensitive diagnostics. Then rerun the complete suite and relevant runtime cases.

### F2: Discovery intervention is detected but not routed into takeover

**Fact, 99% for control flow; strong inference, 90% for incomplete §3.6 coverage.** `run-demo.ts` writes a non-success discovery bundle, throws, and closes the browser. `options.operator` is used only in replay. Returning an intervention disposition is useful but does not expose the live stopped discovery session or resume it.

**Repair gate:** route a genuinely stopped discovery to the existing coordinator while retaining its browser, require explicit handback, verify state, and define safe continuation or documented termination. Test the full path and preserve human activity. Do not claim the successful replay handoff proves this path.

### F3: Submission artifacts are not yet in the public deliverable

**Fact, 99% locally; Incomplete Evidence remotely.** Evidence is untracked. The user's current `.gitignore` edit removes the exclusion and was preserved. Curate only required sanitized records; do not add the entire generated tree or local ZIP indiscriminately. Historical records must retain honest run/model provenance.

**Acceptance gate:** selected artifact, genuine discovery, replay, exceptional run and handoff records appear under `/evidence/` in the submitted revision; relative evidence navigation works; README matches that revision; public visibility is verified. Send the repository URL using the assignment's instructions, not the archive. No publishing or emailing was performed here.

### F4: Nonblocking limits to explain

| Finding | Classification | Consequence / next validation |
| --- | --- | --- |
| Fixed demo goal and target | Fact, 99% | Library meets input seam; add CLI flags only if needed, without treating arbitrary text as authority. |
| Generic permission-denial result | Fact, 99% | Execution stops, but diagnosis could be more precise; add reviewed denial checkpoints. |
| Simple demo selectors | Fact, 99% | Robustness beyond this app needs hostile-surface tests; schema breadth is not empirical proof. |
| Deadline while a browser action is in flight | Reasonable hypothesis, 65% for adverse behavior | Abort checks stop late proposals, not necessarily an already-issued action. Add an in-flight timeout/drain test before claiming strict cancellation. |
| History repeatedly serialized | Strong inference, 90% | Prompt volume can grow quadratically with decision count if average observations stay constant. Current 15-step demo bound limits, but does not eliminate, this cost. |
| Coverage does not measure requirement completeness | Fact demonstrated by F1 | 100% instrumented coverage coexists with a failing privacy scenario. |
| Model choice lacks comparative benchmark | Fact about supplied evidence, 99% | Verified compatibility justifies use here; no claim it is globally best. |

## Verification performed for this review

- Re-extracted the actual assignment PDF with `pdftotext`; inspected source, tests, schemas, and local evidence metadata.
- `npm run build`: passed under Node 24.21.0.
- `npm run coverage`: passed 202 tests in 16 files; statements 972/972, branches 716/716, functions 170/170, lines 768/768, all 100% configured coverage.
- Executed the real-browser F1 reproduction using the compiled current source: privacy assertion failed as described above.
- Inspected repository tracking: evidence remains untracked; existing user `.gitignore` changes preserved.
- No fresh API call, new human-handoff test, remote CI check, public-visibility check, or full secret/history audit was performed. Earlier audit-zero results remain historical, not a new npm audit claim.

## Priority and next actions

| Order | Action | Completion criterion |
| --- | --- | --- |
| 1 | Fix F1 and introduce failure-path canary regressions | No sensitive values in any persisted failure artifact; suite passes |
| 2 | Complete F2 discovery takeover | Same live session, manual action, explicit handback, verified continuation/termination |
| 3 | Curate F3 deliverables | Reviewed evidence available in submitted repository, no ZIP substitution |
| 4 | Reconcile documentation and verify final revision | README/report claims match source and evidence; publish/CI status checked |
| 5 | Rehearse [INTERVIEW.md](./INTERVIEW.md) | Explain decisions, limits, evidence, and what would change your choice |

Do not reduce these gates to a percentage score: one reproducible privacy failure defeats the absolute privacy requirement even when most other requirements pass.

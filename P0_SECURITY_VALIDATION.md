# P0 security validation

Updated: 2026-09-21. Original automated validation: 2026-09-20. Runtime: Node v24.21.0, satisfying package.json's ^24.3.0 requirement.

| Acceptance gate | Result | Evidence classification |
| --- | --- | --- |
| Sensitive invocation data absent from provider HTTP bodies | Passed | Fact, high confidence: transport-level whole-body canary tests |
| Sensitive discovery outputs absent before persistence | Passed for declared sources supported by the adapter | Fact, high confidence: success and stopped real-browser discovery tests with empty result outputs; recursive file scans |
| Automated verification and offline integration | Passed | Fact, high confidence: executed commands below |
| Genuine OpenAI discovery | Passed on 2026-09-21 | User executed the authenticated CLI; inspected evidence records four completed OpenAI responses and independently verified completion |
| Actual provider interoperability | Passed for gpt-4.1-mini-2025-04-14 | Genuine run 02def122-935d-4638-b66b-584849d5bffb, strict structured output, real browser actions, saved artifact and deterministic replay |

## Scope and design decisions

Objective: preserve goal -> discovery -> external policy/authority -> compiled capability -> deterministic replay, while separating live data, model context, in-memory traces and persisted evidence.

Assumptions: host contracts classify sensitive data accurately; adapters are trusted to report declared target values. The local demo uses ordinary CSS selectors. No API key was created, printed, written, or used. Pre-existing changes to PROJECT_ASSESSMENT.md, deletion of package-lock.json/empty.txt, and unrelated untracked files were left intact.

| Decision | Supporting argument | Opposing argument / trade-off | Edge cases and second-order effects |
| --- | --- | --- | --- |
| Metadata-only invocation DTO plus final context sanitization | Host binding needs actual values; model action selection does not | Models cannot reason about input values omitted from context | Exact-value copies in goals/history/observations are redacted too. Input names/types/presence/binding/targets/grants remain available |
| Atomic browser snapshot classifies sensitive targets | Avoids races between reading target values and free-text copies | Current classifier supports standard CSS selector strategies only | Unsupported/ambiguous classification fails closed. ARIA text is omitted from classified snapshots to avoid a later inconsistent text capture; visible text and declared targets remain |
| Two-pass whole-bundle sanitizer at the filesystem boundary | Registers sensitive targets, adapter signals, named fields and read results before redacting earlier errors/provider metadata | Exact-value redaction can also remove coincidentally matching public text | Handles nested values, object-key copies, padded/multiline text normalization, and empty discovery outputs. Missing classification refuses persistence before creating files |
| Persist discovery artifact before replay | Replay/setup failures cannot erase a successful discovery's artifact or provenance | Failed later stages may leave a partial bundle | Discovery manifest is independent; persisted artifact is reparsed with parseCapabilityArtifact |
| Retain JSON mode and strict local decision schema | Minimal change to the existing provider seam | Provider output is not guaranteed to satisfy the decision schema | Incomplete/failed responses, refusals, empty/ambiguous text, malformed JSON/schema and transport failures stop execution with safe codes |

Strong inference, high confidence: these changes close the identified direct serialization and unregistered discovery-output paths without changing grants, policy authority, host input binding, or replay's model-free execution. They do not prove privacy for undeclared data, arbitrary encodings/transformations, or an adapter that misclassifies its observations. Unsupported sensitive-output locators need an atomic classifier before enabling persistence. No speculative claim of live interoperability is made.

The Responses API contract was checked against official documentation: [Responses formats/statuses](https://developers.openai.com/api/reference/cli/resources/beta/subresources/responses), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), and [request-ID access](https://developers.openai.com/api/reference/ruby). The implementation retains text.format.json_object, a JSON instruction, string input, store:false, and bounded output tokens. Only one completed decision text is accepted. Request/response IDs, model, HTTP status and timestamps are retained; raw requests, responses, authorization headers and credentials are not provider evidence. Cancellation is propagated through fetch and body consumption; existing discovery deadlines prevent late decisions from executing actions.

## Files changed

- src/discovery/openai-discovery-model.ts: metadata-only input context, final sanitization, provider status/refusal/schema handling, sanitized error codes and provider metadata.
- src/discovery/discovery-engine.ts: requests classified sensitive-target observations and records independent completion checkpoint results.
- src/discovery/discovery-contracts.ts: checkpoint trace event.
- src/discovery/capability-compiler.ts: registers discovered sensitive values before rejecting sensitive artifact literals.
- src/evidence/redactor.ts: contract-aware two-pass sanitization, classification checks, key-copy and normalized-text redaction.
- src/evidence/run-bundle.ts: sanitizes the entire bundle before filesystem operations.
- src/evidence/evidence-store.ts: uses the same sanitizer and redacts invocation-derived filenames.
- src/surface/surface-adapter.ts: optional classified target values and observation target declarations.
- src/surface/playwright-surface-adapter.ts: atomic CSS-target/text snapshot; fail-closed classification.
- src/surface/fake-surface-adapter.ts: corresponding test-double observation contract.
- src/demo/run-demo.ts: independent discovery artifact/manifest persistence, timestamps, decision count, verified completion, normal-parser validation.
- test/p0-security.test.ts: HTTP canaries, refusal/incomplete/malformed/abort tests, real-browser success/stopped persistence canaries, recursive scans, failure-before-write and normalized-text regressions.
- test/model-and-cli.test.ts: realistic response status and stricter refusal expectations; provider metadata assertions.
- test/browser-boundary.test.ts: classification across text/form values, fallback/missing targets, ambiguity, unsupported targets and closed sessions.
- P0_SECURITY_VALIDATION.md and evidence/p0-validation/: this record and sanitized offline/test evidence.

## Verification executed

All final commands exited 0. Browser tests and demos required execution outside the filesystem/network sandbox to launch Chromium and bind the local HTTP port.

| Exact command | Final result |
| --- | --- |
| npm run typecheck | Passed |
| npm test | 189 tests passed in 16 files |
| npm run coverage | 189 tests passed; 100% statements (953/953), branches (704/704), functions (169/169), lines (752/752) |
| npm run build | Passed |
| npm run demo -- offline --port 4173 --member DEMO-001 --evidence evidence/p0-validation | SUCCESS: SUCCESS; real local UI, scripted model |
| npm run demo -- replay --artifact evidence/p0-validation/b2ae6c9d-f4e0-4dd8-aa00-43c5630e0df0/artifact.json --port 4173 --member DEMO-002 --evidence evidence/p0-validation | SUCCESS: SUCCESS; saved artifact, zero model calls |
| git diff --check | Passed |

Additional verification: a Node script recursively read every regular file under evidence/p0-validation, searched for both sensitive canaries and the two member IDs/demo balance values, and parsed all non-null artifact.json files through dist/src/artifact/load-capability.js. Result: zero occurrences and four valid artifacts. scan-summary.json records the scan. Canary success/stopped bundles were copied from the final test run only after passing a recursive scan.

Earlier unsuccessful attempts, now resolved:

- npm install --ignore-scripts --package-lock=false failed under restricted networking with ENOTFOUND. npm install --ignore-scripts --package-lock=false --fetch-retries=0 --fetch-timeout=20000 succeeded with network permission. No lockfile was restored over the user's existing deletion.
- Initial npm test failed because the sandbox denied localhost binding/Chromium launch and an existing browser mock lacked the newly used evaluate method. The adapter retained its existing no-target path, classification received dedicated mock coverage, and authorized browser tests subsequently passed.
- First npm run coverage passed all 185 tests but failed the 100% threshold (98.52% statements, 97.86% branches, 99.4% functions, 98.39% lines). Added classification/error-path tests brought every metric to 100%; no threshold was lowered.

Not executed: npm run demo -- discover --live --port 4173 --member DEMO-001. Missing environment credential/model blocks this gate. No genuine provider-backed artifact or evidence is claimed.

## Saved evidence

All paths below are beneath evidence/p0-validation/:

- b2ae6c9d-f4e0-4dd8-aa00-43c5630e0df0/: final offline discovery plus replay, artifact.json, discovery-manifest.json, discovery.json, manifest.json, replay.json and structural snapshots.
- 2f880244-5bd4-4a6d-8ec9-5de67338ff40/: separate model-free replay from disk with the second member input.
- canary-complete/: real-browser discovery with mocked OpenAI HTTP, successful host completion and parsed artifact; mock-provider-browser-test label.
- canary-stuck/: corresponding stopped discovery, sanitized errors and structural evidence; mock-provider-browser-test label.
- 0f63c9a9-f304-4c87-83b7-fe1cda3687ae/: earlier successful offline verification run.
- scan-summary.json: recursive scan and artifact-parser counts.

## Original remaining action (resolved by the genuine run below)

Configure OPENAI_API_KEY and MODEL_NAME securely in the environment, then execute the unexecuted live command with a fresh evidence directory. Accept the genuine gate only after host-verified completion, provider/model/response provenance, normal parsing of the saved artifact, and a recursive sensitive-data scan. If the provider rejects JSON mode/model configuration or exhausts the token/iteration budget, diagnose the recorded failure; do not relax policy or checkpoints to obtain success.

## Live-run troubleshooting follow-up

The user's genuine request with model `gpt-6-astra` reached OpenAI but failed with HTTP 400 before any model decision. Latest inspected evidence: evidence/live-validation/ae4e6f57-318b-4d75-b105-257e94259ef0/. The original provider implementation discarded the HTTP error body, so the rejected parameter cannot be established from that evidence. The earlier display-name attempt returned HTTP 404.

Added finite allowlists for provider error type/code/parameter metadata in openai-discovery-model.ts. Unknown strings become null; free-form messages are never persisted. run-demo.ts now exposes an ExecutionError envelope built from sanitized persisted evidence, and cli.ts prints only that envelope before propagating failure. Added regression tests for error-body canaries and safe CLI output in model-and-cli.test.ts. Request parameters and host validation were not changed speculatively.

Follow-up validation: npm run typecheck passed; npm run coverage passed all 193 tests with 100% statements/branches/functions/lines; npm run build and git diff --check passed. No authenticated retry was executed by the agent: the user's shell-exported credential is not available in the agent process. Rerun the same discover --live command in that terminal to obtain the newly retained parameter-level diagnosis. Genuine discovery success remains unverified.

### JSON-mode input correction

The next real attempt (c53873b1-055a-4053-873a-9ab109e81631) returned HTTP 400 with invalid_request_error and param=input. The request previously put its JSON instruction only in top-level instructions; input contained bare serialized workflow data. Changed input to an explicit user message with two input_text parts: a fixed instruction to return JSON and the unchanged sanitized workflow context. This addresses the documented JSON-mode context requirement and is consistent with the observed rejected parameter; the discarded free-form error message prevents proving the exact cause retrospectively.

Added a transport-level regression asserting the explicit JSON instruction in input when workflow context has no JSON keyword; whole-body canary coverage still passes. npm run typecheck, npm run coverage (194 tests, all four coverage metrics 100%), and npm run build passed. No authenticated retry was possible from the agent process. A successful real run remains an open acceptance gate.

### HTTP 429 diagnostics

The user's next live attempt (2dc1d5ab-a898-4385-bd7c-930d49ceca54) returned HTTP 429 with null diagnostic fields. Official API error documentation now distinguishes credit_balance_exhausted, organization_spend_limit_exceeded, project_spend_limit_exceeded, organization_usage_limit_exceeded and slow_down; billing errors can use type insufficient_quota. Added these finite values to the diagnostic allowlist with five regression tests. Unknown response text is still excluded. The previous raw response cannot be recovered, so this run's specific quota/rate-limit cause remains unknown.

Validation: npm run typecheck, npm run build, and npm run coverage passed; 199 tests and 100% coverage across all metrics. No live retry was executed by the agent. Check the key's owning API organization/project billing and limits before retrying; billing/spend/usage failures require account-side remediation. Reference: https://developers.openai.com/api/docs/guides/error-codes

## 2026-09-21 structured-output schema correction

The genuine gpt-4.1-mini call in run 6663413a-d219-47e3-bad8-1bdf9b16ea88 returned HTTP 200/completed but failed the local decision validator. Changed the provider seam from JSON mode to strict json_schema output with a required decision envelope and explicit nullable action arguments. Null arguments are mapped to omitted host fields; host decision validation, grants, policy and checkpoints are unchanged. Raw malformed output remains unpersisted.

The first verification attempt for that change was rejected by automatic approval review because of a usage limit. The next user run (232a30e1-cfd9-4135-91d9-23d9b1056d0e) returned invalid_json_schema. Inspection of the exact outbound body showed Zod's discriminated union generated oneOf. Replaced the provider-only discriminated union with z.union, which generates the supported nested anyOf while retaining strict object branches and the same literal kind tags.

After the previous usage-limit interval elapsed, npm run typecheck, npm run build, git diff --check and npm run coverage passed. All 202 tests passed with 100% statements, branches, functions and lines. Transport tests inspect the exact outgoing schema (object root, nested anyOf, all fields required, additionalProperties false), test null-to-host mapping, and preserve full-request/evidence canary checks. Genuine provider acceptance of the corrected schema remains unverified until the user's next authenticated run.


## Genuine discovery acceptance verified: 2026-09-21

The user executed the authenticated live command successfully. The agent independently inspected the resulting files. Run: `02def122-935d-4638-b66b-584849d5bffb`, under `evidence/live-validation/`.

- Provider: OpenAI; requested model gpt-4.1-mini; actual snapshot gpt-4.1-mini-2025-04-14.
- Four completed HTTP 200 responses with request/response IDs, producing four decisions and three successful UI actions.
- All four discovery policy decisions ALLOW; the independent member-detail success checkpoint passed.
- Discovery and its automatic deterministic replay both returned SUCCESS.
- artifact.json passes parseCapabilityArtifact and links to the genuine discovery run through provenance.discoveryRunId.
- The agent then executed `npm run demo -- replay --artifact evidence/live-validation/02def122-935d-4638-b66b-584849d5bffb/artifact.json --port 4173 --member DEMO-002 --evidence evidence/live-validation`.
- That separate replay succeeded, with provider null and modelCallsDuringReplay 0. Its evidence is `evidence/live-validation/282b5e47-c15a-4958-ae4d-912e129c3b56/`; artifact provenance remains linked to the genuine discovery.
- A recursive scan read all 16 regular files across these two successful bundles. Zero occurrences of either member ID, either demo balance, either sensitive canary, or tested API-key/Bearer-token patterns. This is a scan for specified values/patterns, not a universal claim about all possible sensitive data. Canary presence in live state was independently established by the earlier automated browser tests.

The original missing-credential/live-interoperability blocker is resolved by the user's genuine run. Earlier blocked and failed attempts above are retained as historical validation records. No authenticated call was made by the agent and no API key was copied into the repository. The current standard-CSS sensitive-target classification limitation remains.

## P0 #6 completed: runtime taxonomy (2026-09-21)

The next unfinished assessment item was #6. Items #4 (independently persisted, parsed artifact) and #5 (fresh replay with second input) were already established by the genuine run and its follow-up replay.

Both commands below were executed against the real local Playwright UI using the unchanged artifact from genuine discovery. Both exited 0 and produced the expected non-success business/runtime dispositions. CLI exit status alone is not the acceptance signal; the persisted disposition/code and trace were asserted explicitly.

```sh
npm run demo -- replay --artifact evidence/live-validation/02def122-935d-4638-b66b-584849d5bffb/artifact.json --port 4173 --member DEMO-999 --evidence evidence/runtime-taxonomy
npm run demo -- replay --artifact evidence/live-validation/02def122-935d-4638-b66b-584849d5bffb/artifact.json --port 4173 --member DEMO-001 --scenario expired --evidence evidence/runtime-taxonomy
```

| Scenario | Observed disposition/code | Stop evidence | Run ID |
| --- | --- | --- | --- |
| Member not found | BUSINESS_OUTCOME / MEMBER_NOT_FOUND | Declared missing business-outcome checkpoint passed at discovery-3 | 08c85e79-9d41-44c4-a470-4f9f9f996ddc |
| Session expiry | INTERVENTION_REQUIRED / SESSION_EXPIRED | SESSION_STATE expired at discovery-3 | 5048fd8b-6d4d-4bab-b47f-ca36d851575b |

Assertions passed for both runs: saved artifact parses and deep-equals the original capability; provenance links to genuine discovery; provider is null; modelCallsDuringReplay is zero; exactly two successful actions precede the stop; no action executes at or after the stopped step; structural stop evidence is recorded. Session expiry is explicitly injected by the existing local demo scenario, not a real banking-session failure.

A recursive scan of all 15 regular files under evidence/runtime-taxonomy, including validation.json, found zero occurrences of the tested member IDs, demo balances, input/output canaries or API-key/Bearer-token patterns. Detailed machine-readable assertions are saved in evidence/runtime-taxonomy/validation.json.

No application source changes were necessary. Builds ran successfully as part of both CLI commands. The full unit/coverage suite was not rerun for this evidence-only task; its last executed result remains 202 passing tests with 100% coverage. These two executions prove the requested business-versus-technical distinction; they do not newly establish every possible runtime exception or recovery path.

Next unfinished assessment item: #7, genuine headed same-session human takeover and explicit handback.

## Headed human-handoff validation started: 2026-09-21

Executed the documented handoff command against the saved genuine artifact. The initial sandboxed invocation exited 1 with the generic wrapper message and no proven cause; the subsequent invocation with local browser/server permissions built and reached the actual operator prompt.

```sh
npm run demo -- handoff --artifact evidence/live-validation/02def122-935d-4638-b66b-584849d5bffb/artifact.json --port 4173 --member DEMO-001 --evidence evidence/human-handoff
```

The user explicitly signaled resume. Run `eaa65b49-ab42-40b8-82a2-5fe532061d96` returned `FAILURE / EXECUTION_FAILED` with message `RESUME_CHECKPOINT_FAILED`. The trace also reports that evidence could not be captured after the page closed. The first step completed, the second step's operator-ready precondition failed, and no second-step action or successful handback was recorded. This is a rejected handback, not successful operator acceptance. The CLI exited 0 despite the failure disposition.

A fresh headed attempt is waiting for the operator to click Release session, leave the page open, and explicitly return control. Report acceptance remains pending. `REPORT.md` has been created with the seven exact assignment headings and states this limitation. No full test-suite rerun is claimed for documentation work.

### Genuine headed handoff accepted: 2026-09-21

The second execution of the same command returned `SUCCESS / SUCCESS`, exit 0. Run: `ae8edcd1-5ebf-4c32-b32a-417f05a797a3`. The user interacted with the headed browser and explicitly replied Resume; the assistant forwarded `resume` to the waiting CLI without performing the browser action.

- The first step completed once. The second step stopped at the failed `operator-ready` precondition.
- `handoff.json` records `change INPUT` and `click BUTTON` during human ownership, without values.
- After explicit handback, the trace records `HANDOFF / retry`, active session state, and the same readiness precondition passing.
- The second and third steps executed successfully; the completed first step was not repeated. Final success and output extraction passed.
- The artifact passes the normal parser and deep-equals the genuine discovery artifact. Provider is null and modelCallsDuringReplay is zero.
- Evidence references retain one adapter session ID. Human-action recording requires human ownership; the coordinator verifies automation ownership before returning. Individual ownership transitions are not separately persisted, so that part of the acceptance argument combines recorded behavior with inspected enforcement code.
- A recursive scan of 21 files across both handoff attempts and `validation.json` found zero specified member IDs, balances, canaries, or tested API-key/Bearer patterns.

Machine-readable checks: `evidence/human-handoff/validation.json`. The failed first attempt remains preserved. P0 #7 is now validated; #8 is delivered in `REPORT.md`; #9 is documented in README. Generated evidence remains gitignored as requested. Fresh-checkout reproduction and separate reviewer evidence delivery are still outstanding. No application source changed and no full test suite was rerun; builds executed with the handoff commands.

## Clean-install reproduction and review package: 2026-09-21

Exported committed revision `30181831de32b90d086a2369e67a2ee5ab6905d7` using `git archive HEAD` into `/private/tmp/interface-verify-4nvhhajs`. This is a clean committed-source export, not a remote clone; pending documentation changes were not part of the tested revision. No working-tree node_modules or .env was copied. Browser installation used the existing machine's Playwright cache.

The shell initially selected unsupported Node 26.7.0. That install was stopped and `npm ci` rerun with `/Users/null/.nvm/versions/node/v24.21.0/bin` prepended to PATH. Results under Node 24.21.0:

| Command | Result |
| --- | --- |
| `npm ci` | Passed; 122 packages installed; audit reported 3 high-severity dependency findings |
| `npx playwright install chromium` | Passed |
| `npm run typecheck` | Passed |
| `npm run coverage` | 202 tests in 16 files passed; all four configured metrics 100% |
| `npm run build` | Passed |
| `npm run demo -- offline --port 4173 --member DEMO-001 --evidence evidence/clean-validation` | SUCCESS; run ef4ca2de-f239-49da-8e7a-b110aa955a73 |
| `npm run demo -- replay --artifact /Users/null/interface.ai/evidence/live-validation/02def122-935d-4638-b66b-584849d5bffb/artifact.json --port 4173 --member DEMO-002 --evidence evidence/clean-validation` | SUCCESS; run d7fc4688-5f3a-454c-9682-4de06c9204cc; zero model calls |
| `npm audit --json` | Exit 1: chromium, extract-zip, and tmp reported high severity |

Audit findings originate in the direct npm `chromium` dependency and its dependency tree. Source and tests import Chromium from `playwright`; no import of the standalone package was found. Dependency removal/update remains a follow-up; no automatic audit fix was applied. The audit report includes GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3, GHSA-52f5-9888-hmc6, and GHSA-ph9p-34f9-6g65.

Clean-run evidence was copied unchanged into `evidence/clean-validation/`. Authenticated discovery, exceptional scenarios, and manual handoff were not rerun in the clean export; their previously inspected executions remain separate evidence. No remote CI or entirely fresh-machine browser installation is claimed.

Prepared `evidence/review-package-2026-09-21.zip` with selected genuine discovery/replay, runtime-taxonomy, both handoff attempts, clean-install run evidence, and documentation. Per-file SHA-256 hashes and package instructions are included. Generated evidence is scanned for specified synthetic IDs, balances, canaries, and credential patterns; documentation intentionally contains example commands. Original evidence is not rewritten, so historical absolute paths remain. The archive is local and gitignored, and has not been sent or uploaded.

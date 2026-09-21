# Interface.ai Computer-Use Automation

A TypeScript proof of concept for discovering computer-use workflows once, compiling them into typed capability artifacts, and replaying them deterministically without an LLM in the production execution path.

The core design principle is:

> The model may discover behavior, but it does not define authority.

Discovery can use a model to learn a workflow. Replay is instead governed by a versioned artifact, explicit policy, verified checkpoints, bounded recovery, and auditable evidence.

## What this repository implements

- A Zod-validated, portable capability artifact format
- Model-assisted workflow discovery with route and origin constraints
- Deterministic replay with no model dependency
- Ordered, artifact-defined target resolution strategies
- Preconditions, postconditions, success checks, and business outcomes
- Policy enforcement for targets, routes, action types, and human approvals
- Conservative handling of retries and ambiguous commits
- Explicit success, failure, recoverable, business-outcome, and intervention results
- Evidence capture and sensitive-value redaction
- Human-in-the-loop pause, handoff, and control restoration
- Browser support through Playwright plus an in-memory fake adapter for tests

## Architecture

```text
Goal
  -> Discovery Engine + Discovery Model
  -> Policy-constrained Surface Adapter
  -> Successful Trace
  -> Capability Compiler
  -> Validated Capability Artifact
  -> Deterministic Replay Engine
       -> Policy Evaluation
       -> Target Resolution
       -> Checkpoint Verification
       -> Action Execution
       -> Evidence Capture
       -> Explicit Result
```

The capability artifact is the boundary between discovery and production replay. It describes application compatibility, typed inputs and outputs, allowed authority, targets, steps, recovery behavior, expected outcomes, and provenance. It contains no Playwright or model-provider types.

## Safety model

The system treats observed UI content as untrusted data. Authority comes from the capability policy and invocation context, never from text encountered on screen.

Each action declares an effect:

| Effect | Meaning |
| --- | --- |
| `read` | Observes state without changing it |
| `reversible_write` | Changes state that can be safely undone |
| `irreversible_write` | May create a non-reversible external effect |
| `privileged` | Requires elevated authority or special handling |

High-risk actions receive evidence capture before and after execution. Risky retries are rejected by artifact validation unless ambiguous-commit reconciliation is explicitly required. If the system cannot prove whether an action committed, it requests intervention instead of blindly retrying.

## Requirements

- Node.js 24.3 or newer within the Node 24 release line (`^24.3.0` in `package.json`)
- npm
- Playwright Chromium for browser tests and demos
- An OpenAI API key and Responses API model ID for live discovery only

The recorded validation used Node.js 24.21.0. The project is a private ESM package using TypeScript, Zod, Playwright, and Vitest.

## Install

From the repository root, install the locked dependencies and browser runtime:

```bash
npm ci
npx playwright install chromium
```

On Linux environments needing browser system dependencies, use `npx playwright install --with-deps chromium`. Browser installation is required for the full test suite as well as the demo.

## Verify the project

```bash
npm run typecheck
npm test
npm run coverage
npm run build
```

Additional commands:

| Command | Purpose |
| --- | --- |
| `npm run test:watch` | Run tests in watch mode |
| `npm run clean` | Remove compiled output |
| `npm run demo -- ...` | Build, then execute a demo command |

Compiled JavaScript is written to `dist/`. Coverage enforces 100% statements, branches, functions, and lines for the configured source scope. Tests and offline demos do not make authenticated model calls.

The last recorded full validation on September 21, 2026 passed type checking, build, and all 202 tests through `npm run coverage`, with all four coverage metrics at 100%. The same checks also passed after a clean-source dependency installation under Node 24.21.0. The unused standalone `chromium` dependency was removed; a subsequent clean install and `npm audit` report zero vulnerabilities. Browser execution continues through Playwright. See [P0 security validation](./P0_SECURITY_VALIDATION.md) for the execution record and limitations.

## Run the demo

Each command starts and stops its own local application and browser. Run from the repository root with port 4173 available; a separate application server is unnecessary.

### Offline discovery and replay

```bash
npm run demo -- offline --port 4173 --member DEMO-001 --evidence evidence/runs
```

This uses scripted discovery, compiles an artifact, then replays it in a fresh browser context. It requires no API key and does not establish genuine LLM discovery.

### Live OpenAI discovery

Set `OPENAI_API_KEY` and `MODEL_NAME` in your shell environment or create a local, gitignored `.env` file:

```dotenv
OPENAI_API_KEY=replace-with-your-api-key
MODEL_NAME=gpt-4.1-mini
```

Use an API model ID, not a display label. `gpt-4.1-mini` is the model verified in this repository's genuine run; access depends on your API project. Keep the key out of commits and shared logs. The demo loads `.env` through Node's `--env-file-if-exists` option.

```bash
npm run demo -- discover --live \
  --port 4173 \
  --member DEMO-001 \
  --evidence evidence/live-validation
```

Both `discover` and `--live` are required to make billable model calls. Discovery uses the Responses API with strict structured output. External policy checks each decision, and the host independently verifies completion. A successful discovery saves its artifact and discovery evidence before automatic deterministic replay.

### Options

| Option | Default / behavior |
| --- | --- |
| `--member` | `DEMO-001`; `DEMO-002` is another valid synthetic member |
| `--port` | `4173`; saved artifacts remain bound to their original origin and port |
| `--evidence` | `evidence/runs`; each execution gets a separate run directory |
| `--artifact` | Required saved artifact path for `replay` and `handoff` |
| `--scenario` | `normal`; the demo also supports `slow`, `expired`, `denied`, and `handoff` |
| `--live` | Required only for `discover`; rejected for other commands |

## Minimal replay example

Replace `RUN_ID` with the directory printed by a successful discovery or offline run:

```bash
npm run demo -- replay \
  --artifact evidence/live-validation/RUN_ID/artifact.json \
  --port 4173 \
  --member DEMO-002 \
  --evidence evidence/runs
```

For offline artifacts, use `evidence/runs/RUN_ID/artifact.json`. Replay loads the saved artifact through `parseCapabilityArtifact` and makes zero model calls. It requires no API key. Invalid cross-references, undeclared inputs, and unsafe retry policies fail validation before execution.

To exercise distinct runtime outcomes, repeat the replay command with `--member DEMO-999` for `BUSINESS_OUTCOME / MEMBER_NOT_FOUND`, or add `--scenario expired` with a valid member for `INTERVENTION_REQUIRED / SESSION_EXPIRED`.

### Same-session human handoff

```bash
npm run demo -- handoff \
  --artifact evidence/live-validation/RUN_ID/artifact.json \
  --port 4173 \
  --member DEMO-001 \
  --evidence evidence/human-handoff
```

This opens a headed browser and pauses automation. In that same window, click **Release session**, then type `resume` in the terminal to return control. Any other answer cancels. The command selects the handoff scenario automatically. Automated handoff coverage and a genuine operator takeover/handback run are verified. The successful run resumed the blocked step without repeating prior actions; see the validation record.

## Evidence and validation

The CLI prints the disposition, code, and evidence directory. Inspect the persisted result rather than relying only on the process exit status: expected business outcomes and intervention results can exit with status 0.

Run bundles contain `manifest.json`, `replay.json`, the saved `artifact.json` when available, and structural snapshots. Discovery additionally records `discovery.json` and `discovery-manifest.json`, including sanitized provider provenance. Failed discovery may have no artifact or replay result.

| Completed validation | Evidence |
| --- | --- |
| Genuine OpenAI discovery and automatic replay, four completed provider calls and three UI actions | `evidence/live-validation/02def122-935d-4638-b66b-584849d5bffb/` |
| Separate saved-artifact replay with a second input and zero model calls | `evidence/live-validation/282b5e47-c15a-4958-ae4d-912e129c3b56/` |
| Member-not-found and session-expiry outcomes using the same genuine artifact | `evidence/runtime-taxonomy/validation.json` |
| Genuine same-session human takeover, explicit handback, and successful continuation | `evidence/human-handoff/validation.json` |

These are local validation records; see [P0_SECURITY_VALIDATION.md](./P0_SECURITY_VALIDATION.md) for provenance, assertions, and exact scan scope. Mocked-provider tests are recorded separately from genuine discovery. Session expiry is an injected local demo condition.

Sensitive invocation values stay host-bound; the model receives input metadata. Evidence is sanitized before persistence, and structural snapshots omit page text, values, attributes, and URLs. Sensitive-target classification currently requires supported, unambiguous standard CSS selectors and fails closed otherwise. Scans for specified values and credential patterns do not prove universal absence of sensitive data. Default `evidence/runs/` is gitignored; review custom evidence directories before sharing.

## Troubleshooting

| Symptom | Check / next step |
| --- | --- |
| Chromium executable missing or browser launch fails | Run `npx playwright install chromium`; on Linux install required system dependencies with `--with-deps`. |
| Local server cannot start | Free the chosen port. For saved replay, preserve the artifact's original port. |
| Missing model/key or generic `Demo stopped` | Check command syntax, `OPENAI_API_KEY`, `MODEL_NAME`, and the printed evidence directory. The wrapper deliberately suppresses raw errors. |
| `MODEL_HTTP_400`, parameter `input` | Use the current provider implementation, which sends an explicit user message and JSON instruction. Inspect allowlisted provider metadata. |
| `MODEL_HTTP_400`, `invalid_json_schema`, parameter `text.format.schema` | Use the corrected provider schema: object root, nested `anyOf`, strict branches, and required nullable arguments. Do not weaken host validation. |
| `MODEL_HTTP_401`, `403`, or `404` | Check the key, API project access, and exact API model ID. |
| `MODEL_HTTP_429` | Inspect recorded error code. Rate limits and exhausted quota require different remedies; check project billing/limits before retrying. Null metadata does not identify the cause. |
| `MODEL_INVALID_DECISION` | The response failed local decision validation. HTTP 200 alone does not establish discovery success; use the current structured-output implementation. |
| `ARTIFACT_ORIGIN_MISMATCH` | Replay on the origin/port used for discovery, or create a new artifact for the intended origin. |
| `BUSINESS_OUTCOME` or `INTERVENTION_REQUIRED` | Read the code and trace. These are explicit execution dispositions, not necessarily CLI failures. |

Provider free-form error messages and raw malformed decisions are intentionally excluded from persisted diagnostics. Preserve the sanitized error code and request ID when investigating. See the official [API error guide](https://developers.openai.com/api/docs/guides/error-codes) and [structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

## Execution outcomes

Replay returns structured results rather than treating every non-success state as an exception:

- `SUCCESS`: the declared success checkpoint passed and outputs were extracted
- `BUSINESS_OUTCOME`: an expected domain condition was detected, such as an unavailable item
- `RECOVERABLE`: a declared recoverable action failure exhausted its retry policy
- `INTERVENTION_REQUIRED`: automation cannot safely continue without a human
- `FAILURE`: policy, validation, checkpoint, target-resolution, or action execution failed

The trace records step transitions, session state, policy decisions, target resolution, action attempts, recovery, checkpoint evaluations, and evidence references.

## Project structure

```text
src/
  artifact/    Capability schema and validated loading
  demo/        Local synthetic application and executable CLI
  discovery/   Model-assisted discovery and capability compilation
  domain/      Shared execution contracts
  evidence/    Redaction and JSON evidence persistence
  hitl/        Human intervention and control transfer
  policy/      Runtime authority evaluation
  replay/      Deterministic execution and checkpoint evaluation
  surface/     Surface abstraction, fake adapter, and Playwright adapter
test/          Unit and end-to-end vertical-slice tests
ELOG.md        Dated implementation progress and architectural decisions
P0_SECURITY_VALIDATION.md  Security checks and genuine runtime evidence
PROJECT_ASSESSMENT.md      Assessment and remaining acceptance work
REPORT.md      Seven-section design report and implementation limits
notes.md       Engineering notebook and design rationale
```

## Current scope

This is a focused vertical slice, not a production automation service. It demonstrates the core trust boundary and execution semantics. Production deployment would still require durable orchestration, persistent artifact storage, secret management, multi-tenant isolation, richer observability, operator interfaces, and hardened browser/session infrastructure.

## Design invariants

1. Replay does not depend on an LLM or model SDK.
2. Target resolution is ordered and declared by the artifact.
3. Important state is verified before and after actions.
4. Policy remains external to model output and observed UI content.
5. Ambiguous irreversible effects are reconciled or escalated, never blindly repeated.
6. Human intervention uses explicit pause, handoff, and control restoration.

For the assignment design write-up, see [`REPORT.md`](./REPORT.md). For deeper design notes and requirement mapping, see [`notes.md`](./notes.md).

## License

See [`LICENSE`](./LICENSE).

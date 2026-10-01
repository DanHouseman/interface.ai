# Interface.ai Computer-Use Automation

Status: September 30, 2026. Commands are in [README.md](./README.md). The [evidence index](./evidence/submission/README.md) identifies live-model, scripted, human, and automated runs.

## Architecture

I split the application into discovery, policy, compilation, and replay. It runs in one TypeScript process.

```text
Goal + reviewed application specification -> model proposals -> host policy
  -> browser actions -> verified trace -> saved capability
  -> replay with new inputs -> structured result
```

The CLI accepts `--goal` and `--target synthetic-member-desk`. The GUI accepts goal text for the same local app. Unknown targets and blank or oversized goals fail before execution. The model receives a sanitized goal and reviewed controls. The host defines permissions, input bindings, outputs, and completion conditions. Goal text cannot turn this into an arbitrary-task agent.

OpenAI discovery uses Playwright to operate Chromium. The model selects actions from supplied controls. Host checkpoints verify completion, and the compiler saves the artifact before replay starts in a fresh browser context. Replay has no model dependency. The offline option follows a fixed script.

Replay separates validation, action construction, and execution. Shared value-binding and risk rules keep discovery and replay consistent. The GUI receives state through SSE and sends token-protected HTTP commands to the same execution path. It replaces each client snapshot when an update arrives.

## Artifact schema

The artifact is JSON validated with Zod. It contains versions, application metadata, typed inputs and outputs, sensitivity declarations, policy, ordered targets and actions, checkpoints, recovery rules, and discovery provenance. It has no Playwright or provider types.

Actions refer to invocation inputs by name. The parser checks references, output sources, and unsafe retries. The compiler keeps successful automated actions separate from the model transcript and rejects sensitive literals instead of redacting executable values into something different.

Target strategies have a declared order and uniqueness checks. The adapter supports selectors, accessible roles and labels, structural relationships, and explicit coordinates. The standard app uses CSS IDs. The older-style variant uses nested tables, unlabeled inputs, and clickable spans without IDs or semantic roles. Its structural targets support discovery, sensitive extraction, and replay with another input. Compatibility tags describe intended use; they do not certify compatibility.

## Determinism & error handling

Replay follows the artifact, checks policy and session state, resolves targets, executes actions, and verifies checkpoints. Waits and retries are bounded. Checkpoint reads use the effective host/artifact policy, including business-outcome and reconciliation checks. Replay never asks a model to repair a step.

Missing members and invalid identifiers are business outcomes. Expired sessions can pass to an operator, but handback stays blocked until the session is restored. Missing targets follow the declared recovery policy. A configured denial indicator produces `PERMISSION_DENIED`; an ordinary missing target produces `TARGET_RESOLUTION_FAILED`.

Unexpected dialogs remain flagged until verified handback. If a write may have committed, replay checks the resulting state before deciding whether to continue or escalate. It cannot blindly repeat an uncertain action.

Traces record policy, targeting, actions, checkpoints, and recovery. Terminal discovery results attempt a structural snapshot after the loop starts. Preflight and concurrent-run rejections do not inspect the active session. Capture failures are recorded separately from the execution result.

The saved genuine run has four completed OpenAI calls, three UI actions, successful compilation, and replay. The same artifact succeeds with another input and zero model calls. Other runs cover missing members, expiry, recovery, and handoff. These are observed cases, not a measured reliability rate across applications.

## Heterogeneity & multi-tenant

Replay uses surface interfaces for execution, checkpoints, and handoff. Playwright owns browser-specific targeting. A desktop or terminal adapter would map its controls to those contracts and reject unsupported strategies. Only Playwright and the test adapter exist today.

For tenant reuse, I would start with a vendor-family capability, apply reviewed version and tenant overrides, reject conflicts, then validate the resolved artifact. Invocation parameters supply data. Deployment policy still limits authority. Changes to targeting, checkpoints, or recovery need revalidation and a new version.

Current target and checkpoint failures expose some drift. A compatibility preflight could compare expected versions or fingerprints, quarantine mismatches, and require reviewed rediscovery. Tenant replay results could support promotion decisions. The registry, override merger, drift classifier, and promotion process remain design work.

## Escalation & handoff

Blocked discovery or replay produces an intervention request with the step, reason, observation, and evidence. The coordinator stops new actions, drains any action in progress, and transfers the same browser session to the human. The CLI waits for `resume`; the GUI provides handback controls.

Human records contain document IDs, numeric control paths, event kinds, navigation, and control keys. They exclude values, labels, URLs, element IDs, and printable keystrokes. Handback verifies readiness before automation continues. Replay resumes at the blocked step. Discovery keeps its original time and step limits. Handback cannot approve risky actions or authorize an uncertain retry.

The evidence distinguishes a real human using scripted discovery from automated handoff tests and live-model discovery. Ownership is held in memory. Operator identity is a local label and is not authenticated.

## Safety

The host controls origins, routes, actions, and approval requirements. Page text and model output cannot expand those permissions. Browser request guards also check navigation and subresources. Artifacts stay bound to their saved origin and port.

Sensitive input values stay in the host. Model context and saved evidence retain reviewed workflow text, masked values, and limited session state. Raw titles, URLs, control trees, action values, and error messages are omitted. Goal and rationale text use a restricted vocabulary. Checkpoint diagnostics record matches. Provider records contain allowlisted metadata. Structural snapshots omit page text, values, attributes, and URLs. This reduces diagnostic detail.

Tests cover undeclared personal data and encoded copies in goals, page text, and diagnostics. Sensitive classification supports CSS, accessibility, label, and structural targets. Ambiguous classification stops the run. Configuration and output sensitivity declarations still need review for each application.

Prompt injection can still influence permitted action choices. There is no dedicated adversarial evaluation, and substring-based text checkpoints can misread a condition such as `Not Ready` as `Ready`. The [README](./README.md#prompt-injection) documents these limits and the [financial-services restrictions](./README.md#financial-services-use-and-compliance). This is a synthetic-data prototype with no compliance assurance claimed.

## Cuts

I left out arbitrary-app discovery, desktop automation, tenant infrastructure, queues, distributed orchestration, durable handoff leases, and a full operator console. The browser workflow was the priority.

The README and latest ELOG entry record validation counts. Tests use scripted or mocked models. The original live-model evidence is preserved. `npm run verify:evidence` builds the project and checks hashes, artifacts, outcomes, and snapshot references. Hashes check integrity; they cannot authenticate a provider run.

The later regression bundles cover structural targeting, changed inputs, replay of the genuine artifact, and automated expiry recovery. Another application would need its own compatibility, error-state, security, and acceptance checks.

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

- Node.js 24.21 or newer in the Node 24 release line
- npm

The supported engine range is declared in `package.json` as `>=24.21.0 <25`.

## Install

```bash
npm install
```

Playwright is included as a development dependency. If you want to exercise the browser adapter against a real browser, install its browser runtime separately:

```bash
npx playwright install chromium
```

## Verify the project

```bash
npm run typecheck
npm test
npm run build
```

Additional commands:

| Command | Purpose |
| --- | --- |
| `npm run test:watch` | Run tests in watch mode |
| `npm run coverage` | Run the test suite with V8 coverage |
| `npm run clean` | Remove compiled output |

Compiled JavaScript is written to `dist/`.

## Minimal replay example

```ts
import {
  ConfigurablePolicyEvaluator,
  DeterministicReplayEngine,
  FakeSurfaceAdapter,
  parseCapabilityArtifact,
} from "./src/index.js";
import { readFile } from "node:fs/promises";

const serialized = await readFile("./capabilities/example.json", "utf8");
const artifact = parseCapabilityArtifact(JSON.parse(serialized));
const surface = new FakeSurfaceAdapter();
surface.setObservation({
  location: "https://example.test/start",
  title: "Example",
});
const engine = new DeterministicReplayEngine(
  surface,
  new ConfigurablePolicyEvaluator(),
);

const result = await engine.replay(artifact, {
  invocationId: "invocation-001",
  capabilityId: artifact.capability.id,
  capabilityVersion: artifact.capability.version,
  inputs: { accountId: "example-account" },
});

console.log(result.disposition, result.code);
```

`parseCapabilityArtifact` validates the artifact before replay. Invalid cross-references, undeclared inputs, and unsafe retry policies fail before any surface interaction occurs.

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
  discovery/   Model-assisted discovery and capability compilation
  domain/      Shared execution contracts
  evidence/    Redaction and JSON evidence persistence
  hitl/        Human intervention and control transfer
  policy/      Runtime authority evaluation
  replay/      Deterministic execution and checkpoint evaluation
  surface/     Surface abstraction, fake adapter, and Playwright adapter
test/          Unit and end-to-end vertical-slice tests
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

For deeper design notes and requirement mapping, see [`notes.md`](./notes.md).

## License

See [`LICENSE`](./LICENSE).

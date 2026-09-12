# Assignment A - Computer-Use Automation System

### Engineering Notebook 00
---
---


# Phase 1: Getting Organized

## Initial Problem Framing

### 1. Capability Acquisition and Execution

I am building a **capability acquisition and execution system**, not a browser macro.

### 2. Discovery and Compilation

The LLM discovers how to perform a task once.

That successful behavior is compiled into a typed, reviewable capability.

Production execution is then:

- Deterministic
- Policy-constrained
- Observable
- Inexpensive

### 3. Execution Phase Boundaries

The system has three primary execution phases:

1. Discovery
2. Capability representation
3. Execution

Cross-cutting trust and control boundaries apply across those phases:

- Policy and authority
- Session ownership and human control transfer
- Evidence, redaction, and observability

### 4. Replay Independence

> **Replay must NOT depend on the LLM package. If it does, the capability boundary is incorrect.**

### 5. Central Design Invariant

> **The model may discover behavior, but it does NOT define authority.**

- **Model discovers, not defines.**
- **Capability defines behavior.**
- **Policy refines permitted behavior.**
- **Checkpoints establish observed truth.**
- **Execution returns explicit outcomes.**

---

## Objective

1. Create the repository.
2. Capture engineering thoughts.
3. Establish contribution conventions.

---

## Architectural Center

The architectural center of the system is the **versioned capability artifact and deterministic replay engine**.

Discovery acquires capabilities.

Policy constrains both discovery and replay.

Surface adapters isolate interaction mechanisms.

Human intervention provides controlled escape from states automation cannot safely resolve.

The LLM is used for discovery and compilation.

> **The LLM is NOT part of the production replay control path.**

---

## Core Flow

~~~text
Goal
  -> Discovery Agent
  -> Policy Gate
  -> Surface Adapter
  -> Successful Trace
  -> Capability Compiler
  -> Versioned Capability Artifact
  -> Deterministic Replay
      -> Success
      -> Business Outcome
      -> Recoverable Condition
      -> HITL
      -> Hard Failure
~~~

---

## Primary Engineering Focus

The first implementation must prioritize a thin but real end-to-end vertical slice before optional production infrastructure.

The implementation must prioritize:

1. Capability schema
2. Deterministic replay
3. Explicit business-outcome and failure semantics
4. Safety and policy enforcement
5. Human control transfer

---

## Surface Abstraction

The artifact and replay engine must **NOT** depend directly on Playwright.

~~~typescript
interface SurfaceAdapter {
  observe(): Promise<Observation>;
  execute(action: SurfaceAction): Promise<ActionResult>;
  captureEvidence(): Promise<Evidence>;
  getSessionState(): Promise<SessionState>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}
~~~

The first adapter may target a browser.

The abstraction should remain compatible with:

- Terminal surfaces
- Desktop surfaces
- Remote surfaces

---

## Capability Artifact

The artifact is an **intermediate representation**, not a macro recording.

### Artifact Characteristics

The artifact must be:

- Typed
- Schema-validated
- Human-readable
- Diffable
- Versioned
- Portable
- Reviewable
- Independent of the execution library

### Artifact Contents

The artifact should describe:

- Input contract
- Output contract
- Steps
- Targets
- Checkpoints
- Risk and action effects
- Recovery behavior
- Expected business outcomes
- Application identity
- Provenance
- Version

---

## Deterministic Target Resolution

> **Design decision: target resolution uses ordered strategies selected by the artifact.**

The ordering below is an implementation choice intended to prefer semantic identity over increasingly brittle fallbacks. It is not prescribed by the assignment.

### Browser Resolution Order

1. Semantic or accessibility identity
2. Visible label relationship
3. Stable attribute
4. DOM selector
5. Structural relation
6. Visual or coordinate fallback

### Terminal Resolution Order

1. Screen identifier and field name
2. Field metadata
3. Row and column
4. Surrounding text fingerprint

> **Replay must not use an LLM or open-ended reasoning to choose a target.**

---

## State Verification

> **Before and after important actions, replay should verify expected state.**

Possible state inputs include:

- URL pattern
- Page title
- Visible heading
- Expected controls
- Terminal screen identifier
- Status line
- Key text regions
- Field layout

> **State fingerprints must normalize and redact sensitive values before hashing.**

---

## Security Boundary

> **Authority is external to both the model and observed application content.**

Authority and information sources include:

1. System policy
2. Capability policy
3. Invocation authorization
4. User-approved objective
5. Observed application content

The first four constrain authority. Observed application content does not.

> **Observed UI content is untrusted data. It must NEVER override policy or execution constraints.**

---

## Action Effects

Action type and action effect are separate concepts.

The following effect taxonomy is a deliberate design choice that makes the assignment's safe/reversible versus risky/irreversible distinction explicit and machine-enforceable.

~~~typescript
type ActionEffect =
  | "read"
  | "reversible_write"
  | "irreversible_write"
  | "privileged";
~~~

### Examples

| Action | Effect |
|---|---|
| Balance lookup | `read` |
| Address change | `reversible_write` |
| Transfer | `irreversible_write` |
| Bulk export | `privileged` |

> **Policy enforcement must be implemented in code, not inferred from prompt wording.**

---

## Outcome Taxonomy

The system must distinguish:

- `SUCCESS`
- `BUSINESS_OUTCOME`
- `RECOVERABLE`
- `INTERVENTION_REQUIRED`
- `FAILURE`

Failure and intervention reasons may include:

- Validation
- Permission
- Session expiration
- Transport failure
- Timeout
- Unexpected state
- Target resolution
- Policy violation
- Ambiguous commit
- Possible instruction injection

> **Expected business states must be represented as declared outcomes, not thrown as generic exceptions.**

---

## Network and Ambiguous Commit Handling

The system must treat uncertain commit state as distinct from an ordinary timeout.

### Example

~~~text
Submit irreversible action
  -> Network failure
  -> UNKNOWN_COMMIT_STATE
~~~

Replay must:

1. Inspect resulting state.
2. Reconcile the operation.
3. Retry only when proven safe.
4. Escalate when the result remains uncertain.

> **Blind retries are prohibited for potentially irreversible actions.**

---

## Human Handoff

Human intervention requires same-session ownership transfer.

~~~text
AUTOMATION
  -> PAUSED
  -> HUMAN
  -> RETURNING
  -> AUTOMATION
  -> COMPLETE
~~~

> **The initial implementation may use an in-memory state machine and mutex. The design must leave room for durable lease-based ownership later.**

---

## Scale and Production Evolution

> **The initial implementation remains single-process.**

Future production concerns may include:

- Artifact registry
- Vendor and product identity
- Version and tenant overrides
- Compatibility rules
- Replay telemetry
- Drift detection
- Approval lifecycle
- Durable workflow orchestration
- API gateway
- Service discovery
- Durable session coordination
- KMS-backed secret handling
- Artifact signing

These are documented extension points, not initial implementation requirements.

---

## Out of Scope

Do not build these in the initial implementation, but account for them architecturally:

- Kubernetes
- Kafka
- Redis
- Distributed scheduler
- Full OAuth server
- Production PKI
- Full AS/400 emulator
- Generic RDP or Citrix integration
- Production operator console
- Multi-model routing layer
- Generalized plugin framework

---
---

# Phase 2: Execution Roadmap

## Objective

Turn the condensed notes into an executable sequence of implementation milestones.

Each milestone must produce:

- A reviewable artifact
- Tests
- A commit

---

## Milestone 1: Repository Baseline

### Deliverables

- Repository structure
- TypeScript configuration
- Test runner
- Linting and formatting
- `.env.example`
- Initial README
- Condensed engineering notebook
- Basic CI workflow

### Validation

- Install succeeds.
- Type checking succeeds.
- Tests execute.
- Linting succeeds.
- CI runs on pull requests.

---

## Milestone 2: Requirements and Acceptance Criteria

### Deliverables

- Numbered requirements
- Acceptance criteria
- BDD scenarios
- Traceability convention
- Initial test matrix

### Validation

- Every core requirement has at least one acceptance criterion.
- Every acceptance criterion maps to a test or documented manual check.
- Requirements cover discovery, artifacts, replay, policy, evidence, handoff, and surfaces.

---

## Milestone 3: Capability Artifact Contract

### Deliverables

- Artifact TypeScript types
- Runtime schema validation
- Example valid artifact
- Invalid artifact fixtures
- Artifact serialization rules
- Artifact versioning fields
- Input and output contracts
- Step, target, checkpoint, policy, recovery, and outcome definitions

### Validation

- Valid artifacts parse successfully.
- Malformed artifacts fail before execution.
- Unknown or undeclared inputs are rejected.
- Unsupported action effects are rejected.
- Artifact serialization is deterministic.
- Artifact does not depend on Playwright types.

---

## Milestone 4: Surface Adapter Contract

### Deliverables

- Surface adapter interface
- Observation model
- Surface action model
- Action result model
- Session state model
- Evidence model
- Browser adapter boundary
- Test double adapter

### Validation

- Replay depends only on the adapter interface.
- A fake adapter can execute replay tests.
- Observation data is not HTML-specific.
- Session state can represent active, expired, paused, and unknown states.

---

## Milestone 5: Minimal Real Discovery Spike

### Objective

Prove the assignment's only non-mockable external path early: a genuine LLM-driven observe → decide → act run against the chosen live surface.

### Deliverables

- Discovery request containing goal, target/entry point, authorized context, and stopping conditions
- Model provider boundary
- Live surface observation
- At least one genuine model-selected UI action
- Max-step, timeout, and dead-end stopping conditions
- Structured discovery trace with concise action rationale
- Policy gate before each proposed action
- Captured evidence from the live run

### Validation

- A real model observes and interacts with the live target surface.
- The run is goal-directed rather than a hard-coded script.
- Every proposed action passes the configured allowlist and policy gate before execution.
- The run terminates on success, max steps, timeout, or dead-end.
- The resulting trace is suitable input for later capability compilation.
- The spike does not establish any dependency from deterministic replay to the model provider.

---

## Milestone 6: Deterministic Replay Engine

### Deliverables

- Artifact loading
- Input validation
- Ordered target resolution
- Precondition checks
- Action execution
- Postcondition checks
- Step progression
- Deterministic result classification
- Replay trace

### Validation

- Replay never invokes the LLM.
- Replay follows artifact-defined locator order.
- Replay stops when a checkpoint fails.
- Replay returns explicit outcomes.
- Replay rejects malformed artifacts before touching the surface.
- Replay produces a trace suitable for evidence and debugging.

---

## Milestone 7: Policy Enforcement

### Deliverables

- Explicit configurable target/domain/route/action allowlist
- Action effect classification
- Capability policy
- Invocation authorization
- Approval requirement handling
- Policy denial result
- Untrusted UI-content handling
- Adversarial instruction-injection test

### Validation

- Discovery and replay reject targets, routes, or action types outside the configured allowlist.
- Read actions can execute when authorized.
- Irreversible actions require approval.
- Privileged actions are denied without authorization.
- UI text cannot change policy.
- Policy violations are explicit results, not generic failures.

---

## Milestone 8: Outcome and Failure Semantics

### Deliverables

- Result taxonomy
- Business outcome contracts
- Recoverable condition handling
- Hard failure handling
- Intervention-required handling
- Ambiguous commit state
- Retry rules
- Reconciliation hook

### Validation

- Business outcomes are not classified as infrastructure failures.
- Recoverable conditions can be retried only when safe.
- Irreversible actions do not blindly retry after uncertain transport failure.
- Ambiguous commit state is observable.
- Failure reasons are machine-readable.

---

## Milestone 9: Evidence and Redaction

### Deliverables

- Discovery and replay execution traces
- Structured discovery action rationale
- Evidence capture interface
- Step-level evidence references
- Redaction rules
- Sensitive-value normalization
- State fingerprinting
- Evidence retention metadata

### Validation

- Both discovery and replay runs produce structured traces.
- Discovery evidence records what action was chosen and a concise rationale without coupling the capability artifact to the raw model transcript.
- Evidence is captured at required checkpoints.
- Sensitive values are redacted.
- Raw credentials and session tokens are not persisted.
- Fingerprints do not include raw PII.
- Evidence can explain why replay succeeded, stopped, or escalated.

---

## Milestone 10: Human Handoff

### Deliverables

- Intervention request contract
- Stuck/blocked-state detection for discovery and replay
- Session ownership state machine
- Pause and resume behavior
- Human takeover of the same live session
- Return-to-automation transition
- Human-action evidence capture
- Ownership conflict handling
- Same-session test double

### Validation

- Discovery can escalate when stuck or blocked.
- Replay can escalate on an unrecoverable condition.
- Risky actions can route to human decision when policy requires it.
- Intervention requests include the goal/capability, current step, reason, current state, and evidence/screenshot reference.
- Automation can pause without destroying the active session.
- Human ownership prevents concurrent automation actions.
- Human actions during takeover are recorded as evidence.
- Automation resumes only after explicit handback.
- Session state is preserved across handoff.
- Ownership conflicts are explicit and recoverable.

---

## Milestone 11: Discovery Compilation and End-to-End Integration

### Deliverables

- Discovery interface
- Model provider boundary
- Surface observation loop
- Successful trace representation
- Capability compiler
- Policy gate before execution
- One real discovery run
- Stored compiled artifact

### Validation

- Discovery can produce a trace.
- The trace can compile into a valid artifact.
- The artifact can replay without the LLM.
- Discovery cannot bypass policy.
- Live model execution is isolated from deterministic tests.

---

## Milestone 12: Legacy Surface Demonstration

### Deliverables

- Browser-based legacy demo surface
- Stable but awkward controls
- Validation and permission states
- Slow response simulation
- Optional terminal-shaped adapter or fixture
- End-to-end scenarios

### Validation

- The same capability model works against the legacy surface.
- Locator fallback behavior is demonstrated.
- Slow responses and session expiration are tested.
- Business outcomes are distinguishable from technical failures.

---

## Milestone 13: CI, Documentation, and Report

### Deliverables

- Full CI checks
- Unit tests
- Contract tests
- Integration tests
- Playwright E2E tests
- Artifact schema validation
- Dependency audit
- `REPORT.md`
- Architecture diagram
- ADRs
- Known limitations
- Production evolution notes

### Validation

- CI is deterministic by default.
- Live discovery is manual and secret-gated.
- The report explains decisions and tradeoffs.
- The report identifies deliberate non-goals.
- Test evidence is linked to requirements.

---
---


# Phase 3: Exact Requirements and Acceptance Criteria

## Requirement Numbering

Use the following prefixes:

| Prefix | Domain |
|---|---|
| `REQ-DISC` | Discovery |
| `REQ-ART` | Capability artifacts |
| `REQ-RPL` | Deterministic replay |
| `REQ-POL` | Policy and security |
| `REQ-EVD` | Evidence and observability |
| `REQ-HITL` | Human intervention |
| `REQ-SRF` | Surface abstraction |
| `REQ-OUT` | Outcomes and failure handling |
| `REQ-OPS` | Delivery and operations |

Each requirement must have:

- A unique ID
- A concise statement
- Acceptance criteria
- At least one automated test where practical
- A documented manual validation where automation is not practical

---

# Discovery Requirements

## REQ-DISC-001: Goal-Directed Discovery

> **The system shall accept a goal plus a target application, URL, or entry point and use a discovery component to identify and execute a sequence of surface actions that may satisfy the goal.**

### Acceptance Criteria

- A discovery request contains a goal, target/entry point, authorized context, and stopping conditions.
- Stopping conditions include max steps, timeout, and dead-end detection.
- Discovery can observe the live surface before acting.
- Discovery actually interacts with the real UI through the surface adapter.
- Discovery produces an ordered trace of proposed and executed actions with concise rationale.
- Discovery stops when the goal is satisfied, max steps are reached, timeout occurs, or a dead-end is detected.
- Discovery does not directly create production authority.

## REQ-DISC-002: Discovery Policy Gate

> **The system shall evaluate proposed discovery actions against policy before execution.**

### Acceptance Criteria

- Every proposed action has an action type and effect classification.
- Disallowed actions are rejected before execution.
- Irreversible and privileged actions require explicit approval.
- Observed UI text cannot override policy.
- A policy denial is returned as a structured result.

## REQ-DISC-003: Capability Compilation

> **The system shall compile a successful discovery trace into a versioned capability artifact.**

### Acceptance Criteria

- A successful trace can produce a valid artifact.
- The artifact contains input and output contracts.
- The artifact contains ordered steps and target strategies.
- The artifact contains checkpoints and expected outcomes.
- The artifact can be stored as plain JSON.
- The compiled artifact can be replayed without the discovery component.

## REQ-DISC-004: Live Discovery Isolation

> **Live model discovery shall be isolated from deterministic replay and default CI execution.**

### Acceptance Criteria

- Replay tests do not require model credentials.
- Default CI does not invoke a live model.
- Live discovery is manually triggered.
- Live discovery credentials are loaded from environment or repository secrets.
- Live discovery output is stored as a reviewable artifact.

---

# Capability Artifact Requirements

## REQ-ART-001: Typed Artifact Schema

> **The system shall define a versioned, runtime-validated capability artifact schema.**

### Acceptance Criteria

- Valid artifacts pass runtime validation.
- Invalid artifacts fail before execution.
- The schema includes artifact identity and version.
- The schema includes application and surface identity.
- The schema includes input and output contracts.
- The schema includes ordered execution steps.
- The schema includes policy and risk metadata.
- The schema includes recovery behavior.
- The schema includes expected business outcomes.

## REQ-ART-002: Portable Representation

> **The artifact shall remain independent of the browser automation library.**

### Acceptance Criteria

- The artifact contains no Playwright-specific types.
- The artifact can be serialized to JSON.
- The artifact can be inspected and diffed without executing code.
- The replay engine consumes the artifact through a stable contract.
- A second surface adapter can consume the same artifact model.

## REQ-ART-003: Artifact Integrity

> **The system shall reject malformed, incomplete, or unsupported artifacts.**

### Acceptance Criteria

- Missing required fields are rejected.
- Unknown action effects are rejected.
- Invalid target strategies are rejected.
- Undeclared inputs are rejected.
- Unsupported artifact versions are rejected.
- Rejection occurs before surface interaction.

## REQ-ART-004: Artifact Provenance

> **The artifact shall record enough provenance to support review and compatibility decisions.**

### Acceptance Criteria

- The artifact records its source capability or discovery run.
- The artifact records application family and version where known.
- The artifact records creation metadata.
- The artifact records the compiler or schema version.
- Provenance does not persist credentials or session tokens.

---

# Replay Requirements

## REQ-RPL-001: Deterministic Replay

> **The system shall execute an approved capability artifact deterministically without invoking an LLM.**

### Acceptance Criteria

- Replay follows the artifact-defined step order.
- Replay uses artifact-defined target strategy order.
- Replay does not select actions through open-ended reasoning.
- Replay stops when a required precondition or postcondition fails.
- Replay returns a structured result.

## REQ-RPL-002: Target Resolution

> **The system shall support ordered target resolution strategies.**

### Acceptance Criteria

- Semantic or accessibility identity is attempted before weaker fallbacks when declared.
- Stable attributes can be used when declared.
- Structural relationships can be used when declared.
- Visual or coordinate fallback is explicit and policy-controlled.
- Multiple matches produce a deterministic failure or require an explicit disambiguation rule.
- Target resolution results are recorded in the execution trace.

## REQ-RPL-003: Checkpoint Verification

> **The system shall verify declared preconditions and postconditions.**

### Acceptance Criteria

- A step cannot advance when its precondition fails.
- A step cannot be marked successful when its postcondition fails.
- Checkpoint failures identify the expected and observed state.
- State verification can use surface-specific observations.
- Sensitive values are redacted before evidence or fingerprint generation.

## REQ-RPL-004: Replay Isolation

> **The replay engine shall depend on surface and policy interfaces rather than concrete browser or model implementations.**

### Acceptance Criteria

- Unit tests can run against a fake surface adapter.
- Replay tests do not require a browser for core logic.
- Replay does not import the LLM provider package.
- Browser-specific behavior is isolated in the browser adapter.

---

# Policy and Security Requirements

## REQ-POL-000: Explicit Execution Allowlist

> **The system shall enforce an explicit, configurable allowlist for both discovery and replay.**

### Acceptance Criteria

- Policy defines permitted target applications or domains.
- Policy can constrain permitted routes or application regions.
- Policy defines permitted action types.
- Every discovery action is checked against the allowlist before execution.
- Every replay action is checked against the allowlist before execution.
- An out-of-scope target, route, or action is blocked before surface interaction.
- Allowlist denial is returned as a structured, machine-readable result.

## REQ-POL-001: External Authority

> **The system shall keep authority outside the model and observed application content.**

### Acceptance Criteria

- Policy is evaluated by a dedicated policy component.
- UI content is treated as untrusted data.
- Model output cannot grant itself additional permissions.
- Application content cannot disable policy.
- Policy decisions are recorded with the execution result.

## REQ-POL-002: Action Effect Classification

> **The system shall classify actions by effect.**

### Acceptance Criteria

- Actions can be classified as `read`, `reversible_write`, `irreversible_write`, or `privileged`.
- The classification is part of the action or artifact contract.
- Missing effect classification is rejected for actions requiring it.
- Policy decisions use effect classification.
- Prompt wording is not used as the sole safety control.

## REQ-POL-003: Approval Enforcement

> **The system shall require approval for configured high-risk actions.**

### Acceptance Criteria

- Irreversible actions can be configured to require approval.
- Privileged actions can be configured to require approval.
- Missing approval prevents execution.
- Approval is associated with the invocation and capability.
- Approval state is visible in the execution trace.

## REQ-POL-004: Secret Handling

> **The system shall avoid persisting credentials, session tokens, and API keys.**

### Acceptance Criteria

- No secrets are committed to the repository.
- `.env.example` contains names but not values.
- Session tokens are excluded from artifacts and evidence.
- Credentials are excluded from logs.
- Sensitive values are redacted before persistence.

## REQ-POL-005: Adversarial UI Content

> **The system shall treat malicious instructions embedded in observed UI content as untrusted data.**

### Acceptance Criteria

- A UI message instructing the system to bypass policy does not change policy.
- The action is evaluated against the original capability and invocation policy.
- The event is recorded as observed content or a possible injection signal.
- The system does not execute the disallowed action.

---

# Outcome and Failure Requirements

## REQ-OUT-001: Explicit Result Taxonomy

> **The system shall distinguish successful execution, business outcomes, recoverable conditions, intervention, and hard failure.**

### Acceptance Criteria

- A successful operation returns `SUCCESS`.
- A valid domain result such as `MEMBER_NOT_FOUND` returns `BUSINESS_OUTCOME`.
- A retryable technical condition returns `RECOVERABLE`.
- A human-required condition returns `INTERVENTION_REQUIRED`.
- An unrecoverable condition returns `FAILURE`.
- Results include machine-readable reason or outcome codes.

## REQ-OUT-002: Business Outcome Contracts

> **The system shall declare expected business outcomes in the capability artifact.**

### Acceptance Criteria

- Expected domain outcomes are represented in the output contract.
- Business outcomes are not thrown as generic exceptions.
- Consumers can distinguish business outcomes from infrastructure failures.
- Business outcome evidence identifies the observed state supporting the result.

## REQ-OUT-003: Recoverable Conditions

> **The system shall identify conditions that may be retried safely.**

### Acceptance Criteria

- Recoverable conditions include a retry classification.
- Retry limits are explicit.
- Retry behavior is action-aware.
- Irreversible actions are not blindly retried.
- Exhausted retries produce a structured failure or intervention result.

## REQ-OUT-004: Ambiguous Commit State

> **The system shall represent uncertainty when an action may have committed but the result is unknown.**

### Acceptance Criteria

- A transport failure after an irreversible submission can produce `UNKNOWN_COMMIT_STATE`.
- The system attempts reconciliation before retrying.
- Retry is prohibited unless safety is established.
- Unresolved ambiguity produces `INTERVENTION_REQUIRED` or `FAILURE`.
- The trace records the uncertainty and reconciliation attempts.

## REQ-OUT-005: Session Expiration

> **The system shall distinguish session expiration from ordinary target or validation failure.**

### Acceptance Criteria

- Session expiration is detected from adapter state or declared signals.
- Replay returns a session-specific reason.
- Safe reauthentication or recovery can be represented.
- Credentials are not captured in evidence.
- The system does not continue acting against an invalid session.

---

# Evidence and Observability Requirements

## REQ-EVD-001: Execution Trace

> **The system shall produce a structured trace for every discovery and replay run.**

### Acceptance Criteria

- Discovery traces identify the goal, target, invocation, observations, selected actions, concise action rationale, policy decisions, and results.
- Replay traces identify the capability, version, and invocation.
- Each step records start and completion state.
- Each action records its result.
- Policy decisions are included.
- Failures and outcomes include structured codes.
- The reusable capability artifact remains decoupled from the raw model transcript.

## REQ-EVD-002: Checkpoint Evidence

> **The system shall capture evidence at declared checkpoints.**

### Acceptance Criteria

- Evidence can include normalized observations, screenshots, or adapter-specific references.
- Evidence is associated with a step or checkpoint.
- Evidence is captured before and after configured high-risk actions.
- Evidence capture failure is represented explicitly.
- Evidence does not contain raw secrets.

## REQ-EVD-003: Redaction

> **The system shall redact sensitive values before persistence.**

### Acceptance Criteria

- Configured sensitive fields are redacted.
- Credentials and session tokens are never persisted.
- PII is excluded from state fingerprints where possible.
- Redaction behavior is covered by tests.
- Redaction does not prevent useful diagnosis of control flow.

## REQ-EVD-004: State Fingerprints

> **The system may generate normalized state fingerprints for drift and checkpoint detection.**

### Acceptance Criteria

- Fingerprints are generated from normalized observations.
- Sensitive values are removed before hashing.
- The hashing algorithm is documented.
- Fingerprints are stable for equivalent normalized states.
- Fingerprints are not treated as a substitute for semantic postconditions.

---

# Human Intervention Requirements

## REQ-HITL-000: Intervention Detection and Routing

> **The system shall detect states that require human intervention and route an intervention request containing enough context for an operator to act.**

### Acceptance Criteria

- Discovery can request intervention when stuck or unable to proceed safely.
- Replay can request intervention after an unrecoverable or unresolved condition.
- Policy can require intervention before a configured risky or irreversible action.
- The intervention request identifies the run/invocation.
- The request identifies the capability or discovery goal.
- The request identifies the current step or action.
- The request contains the reason for stopping.
- The request contains normalized current state and an evidence or screenshot reference.
- The request identifies the active session and current ownership state.

## REQ-HITL-001: Same-Session Pause

> **The system shall pause automation without destroying the active session.**

### Acceptance Criteria

- A capability can declare a human intervention checkpoint.
- Automation stops before taking further actions.
- The active session remains available to the operator.
- The pause state is visible in the execution result.
- No concurrent automation action occurs while paused.

## REQ-HITL-002: Ownership Transfer

> **The system shall transfer session ownership atomically between automation and a human operator.**

### Acceptance Criteria

- Automation ownership can transition to human ownership.
- Human ownership prevents automation actions.
- Ownership conflicts are rejected.
- Return to automation requires explicit handback.
- The state machine prevents invalid transitions.

## REQ-HITL-003: Resume After Handoff

> **The system shall resume from a verified state after human intervention.**

### Acceptance Criteria

- The operator can return control explicitly.
- Replay verifies the current state before continuing.
- If the state is unexpected, replay does not continue blindly.
- The resumed trace records the handoff and verification.
- Human actions performed during takeover are recorded in the execution evidence.
- The capability can complete or escalate after handoff.

---

# Surface Requirements

## REQ-SRF-001: Surface Adapter

> **The system shall interact with external applications through a surface adapter.**

### Acceptance Criteria

- The adapter exposes observation, action, evidence, and session operations.
- Replay does not depend on browser-specific APIs.
- A fake adapter supports deterministic tests.
- The adapter can represent browser, terminal, or desktop observations.
- Adapter failures are classified explicitly.

## REQ-SRF-002: Browser Surface

> **The initial implementation shall support a browser-based surface.**

### Acceptance Criteria

- The browser adapter can observe relevant controls.
- The browser adapter can execute declared actions.
- The browser adapter can capture evidence.
- The browser adapter can report session state.
- Browser-specific selectors remain inside the adapter or artifact target data, not the replay core.

## REQ-SRF-003: Legacy Surface Behavior

> **The demonstration surface shall include stable but awkward enterprise-style behavior.**

### Acceptance Criteria

- The surface includes validation states.
- The surface can simulate slow responses.
- The surface can simulate permission denial.
- The surface can simulate session expiration.
- The surface can produce a business outcome distinct from success.
- The surface can demonstrate at least one target fallback strategy.

## REQ-SRF-004: Terminal Compatibility (Design Extension, Not Assignment-Mandated)

> **The abstraction should remain conceptually compatible with terminal-style surfaces without requiring terminal implementation in the initial submission.**

### Acceptance Criteria

- Observation is not defined solely as HTML.
- Target strategies can represent screen and field identity.
- Session state can represent terminal screen state.
- The architecture documentation explains how a terminal adapter would fit.
- A full terminal emulator is not required for the initial implementation.

---

# Heterogeneity and Multi-Tenant Design Requirements

## REQ-MT-001: Vendor-Family Capability Reuse

> **The architecture shall support reuse of a base capability across tenants running the same underlying vendor product without requiring a new recording for every tenant.**

### Acceptance Criteria

- The artifact can identify an application/vendor family independently from a tenant.
- The design can associate compatibility with an application/product version.
- A base capability can be specialized through explicit tenant or version overrides.
- Tenant-specific values are parameterized rather than embedded as raw sensitive data.
- The report explains precedence between base capability behavior and explicit overrides.

## REQ-MT-002: Compatibility and Drift

> **The architecture shall define how tenant or product-version drift is detected and handled without open-ended reasoning during deterministic replay.**

### Acceptance Criteria

- Replay can detect a mismatch between declared compatibility expectations and observed state.
- Drift produces an explicit result rather than silently changing behavior.
- The design distinguishes compatible variation from an override requirement and from re-discovery.
- The report explains how replay telemetry could inform compatibility confidence over time.
- No multi-tenant registry or distributed infrastructure is required for the initial implementation.

---

# Operations and Delivery Requirements

## REQ-OPS-001: Automated Validation

> **The repository shall run automated validation in CI.**

### Acceptance Criteria

- Type checking runs in CI.
- Linting runs in CI.
- Unit tests run in CI.
- Contract tests run in CI.
- Integration tests run in CI.
- E2E tests run in CI where practical.
- Artifact schema validation runs in CI.
- Dependency auditing runs in CI.

## REQ-OPS-002: Deterministic Default CI

> **Default CI shall not depend on live model calls.**

### Acceptance Criteria

- CI succeeds without model credentials.
- Replay and policy tests are deterministic.
- Live discovery is manually triggered.
- Live discovery failures do not make ordinary pull requests flaky.
- Live discovery output is retained for review when run.

## REQ-OPS-003: Documentation and Traceability

> **The repository shall document architecture, requirements, decisions, and known limitations.**

### Acceptance Criteria

- Requirements have stable IDs.
- Tests reference requirement IDs where practical.
- ADRs document major architectural decisions.
- `REPORT.md` explains tradeoffs and deliberate non-goals.
- The README explains how to run tests and demonstrations.
- Git history contains meaningful implementation milestones.

## REQ-OPS-004: Production Evolution Notes

> **The documentation shall explain how the single-process implementation could evolve.**

### Acceptance Criteria

- The report identifies where durable orchestration could be introduced.
- The report identifies where session leases could replace in-memory ownership.
- The report identifies where artifact registry and approval storage could be added.
- The report identifies gateway and service-discovery boundaries.
- The report distinguishes implemented behavior from future production work.

---

# Initial BDD Acceptance Scenarios

~~~gherkin
Feature: Deterministic member lookup

  Scenario: Existing member
    Given an approved member lookup capability
    And member "12345" exists
    When the capability is replayed
    Then the result should be "SUCCESS"
    And the declared member details should be returned
    And the execution trace should contain the completed checkpoints

  Scenario: Member does not exist
    Given an approved member lookup capability
    And member "99999" does not exist
    When the capability is replayed
    Then the result should be "BUSINESS_OUTCOME"
    And the outcome code should be "MEMBER_NOT_FOUND"
    And the result should not be classified as infrastructure failure

  Scenario: Malformed artifact
    Given an artifact with a missing output contract
    When replay is requested
    Then the artifact should be rejected
    And no surface action should be executed
    And the result should identify artifact validation failure

  Scenario: Policy denial
    Given a capability containing a privileged export action
    And no approval for privileged actions
    When replay is requested
    Then the action should not execute
    And the result should be "FAILURE"
    And the reason should be "POLICY_DENIED"

  Scenario: Malicious UI instruction
    Given the observed surface contains text instructing the system to bypass policy
    And the capability does not authorize the requested action
    When replay observes the text
    Then the text should be treated as untrusted content
    And the unauthorized action should not execute
    And the event should be recorded as a possible instruction injection

  Scenario: Ambiguous irreversible submission
    Given an irreversible action has been submitted
    And the network fails before the result is observed
    When replay attempts to classify the result
    Then the result should be "INTERVENTION_REQUIRED"
    And the reason should be "UNKNOWN_COMMIT_STATE"
    And the action should not be retried automatically

  Scenario: Human handoff
    Given replay reaches a declared human intervention checkpoint
    When automation pauses
    Then the active session should remain available
    And human ownership should be acquired
    And automation should be prevented from acting
    When the human hands control back
    Then replay should verify the current state before continuing
~~~

---

# Initial ADR Set

| ADR | Decision |
|---|---|
| `ADR-001` | Capability artifact as intermediate representation |
| `ADR-002` | Surface abstraction independent of Playwright |
| `ADR-003` | Ordered deterministic target resolution |
| `ADR-004` | Explicit outcome and failure taxonomy |
| `ADR-005` | External policy enforcement |
| `ADR-006` | Same-session ownership for human handoff |
| `ADR-007` | No distributed orchestrator in the initial implementation |

---

# Immediate Execution Sequence

1. Create the repository.
2. Add the condensed engineering notebook.
3. Add the initial project structure and tooling.
4. Add exact assignment requirements, acceptance criteria, and the first ADRs/BDD scenarios.
5. Implement the capability artifact contract.
6. Implement the surface adapter contract.
7. Run a minimal genuine LLM discovery spike against the chosen live surface.
8. Preserve the discovery trace and evidence.
9. Implement deterministic replay independently of the model provider.
10. Add explicit allowlist/policy enforcement and outcome semantics.
11. Add evidence/redaction and human handoff.
12. Compile the real discovery trace into the versioned capability artifact.
13. Demonstrate the full vertical slice: goal → discovery → artifact → replay → exceptional outcome → HITL.
14. Add only the tests and CI needed to make the core behavior defensible and repeatable.
15. Complete `REPORT.md`, documenting trade-offs, deliberate cuts, heterogeneity, and multi-tenant evolution.
16. Keep production-scale infrastructure as documented extension points rather than implementation work.

---

# TDD and BDD Strategy

TDD should drive **internal correctness**.

BDD should prove **assignment-level behavior**.

There is a distinction:

- A policy evaluator returning `DENY` is a **TDD concern**.
- "An irreversible action cannot execute without approval" is the **BDD/business behavior** that must be demonstrated.


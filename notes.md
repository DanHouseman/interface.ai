# Engineering notes

I started with one question: can a model learn a browser workflow, save it in a form I can review, and then get out of the execution path?

These are my design notes and acceptance targets. They include planned work. For what is implemented and tested, use [REPORT.md](./REPORT.md), [ELOG.md](./ELOG.md), and the [saved evidence](./evidence/submission/README.md). In particular, the injection scenarios below are test goals; they do not mean a dedicated adversarial evaluation has been completed.

## The design

Discovery chooses actions against reviewed controls. Host policy decides whether those actions are allowed. Checkpoints verify the result. The compiler turns successful automated actions into a versioned JSON artifact. Replay follows that artifact without asking the model what to do next.

```text
Goal + reviewed application specification
  -> discovery
  -> host policy
  -> browser action
  -> verified trace
  -> capability artifact
  -> replay with new inputs
  -> structured result
```

The main rule is simple: the model cannot grant itself authority. Page content cannot grant it authority either.

I want the artifact and replay engine to stay independent of Playwright. The surface adapter owns browser mechanics. A desktop or terminal adapter would need its own implementation and tests; an interface alone does not establish that support.

## What the artifact needs

The artifact should be typed, runtime-validated, readable, versioned, and easy to diff. It needs inputs, outputs, ordered steps, target strategies, checkpoints, policy, recovery rules, business outcomes, application identity, and provenance. It should contain workflow data that can be inspected without executing generated code.

Target fallback order belongs in the artifact. My initial preference was accessibility identity, visible labels, stable attributes, selectors, structural relationships, then explicit coordinates. The actual order is whatever the reviewed artifact declares. Replay must stop when it cannot resolve the target safely.

For a future terminal adapter, the equivalents would be screen identity, field metadata, row/column, and surrounding text. That remains design work.

## Verification and recovery

A successful click tells me an action was issued. I still need to check that the expected state appeared. Preconditions, postconditions, and final completion checks are part of the workflow.

Possible observations include location, headings, controls, status text, and layout. Any future state fingerprint must remove sensitive data before hashing. A matching hash would still need meaningful postconditions.

Action type and effect are separate:

| Effect | Example to assess |
| --- | --- |
| `read` | Balance lookup |
| `reversible_write` | A change the application can actually undo |
| `irreversible_write` | Funds transfer |
| `privileged` | Bulk export |

Those examples require application-specific review. An address change is not automatically safe just because it can be edited again.

A lost response leaves the outcome unknown. Recovery needs to inspect the declared resulting state, continue if committed, retry only if permitted and safe, or ask a human when uncertainty remains. Blind retries after a potentially irreversible action are unacceptable.

The caller needs to distinguish `SUCCESS`, `BUSINESS_OUTCOME`, `RECOVERABLE`, `INTERVENTION_REQUIRED`, and `FAILURE`. A missing member and a missing search button are different results.

## Human control

Handoff keeps the existing browser session open. Automation stops, an operator takes ownership, and explicit handback triggers readiness checks before automation resumes. The first version uses in-memory ownership. Durable leases and crash recovery would be later work.

Human actions belong in the audit record. They must not silently become automated steps in the compiled artifact.

## Build order

I planned the work around a complete browser run first. Each milestone needed something inspectable and a way to verify it.

| Milestone | Work | Check |
| --- | --- | --- |
| 1 | Repository, TypeScript, test runner, configuration, README, and CI | Install, typecheck, and tests run |
| 2 | Requirement IDs, scenarios, and test mapping | Each core requirement has a check |
| 3 | Artifact contract and parser | Valid JSON parses; unsafe or invalid artifacts fail before execution |
| 4 | Surface contract and test adapter | Replay can run without Playwright |
| 5 | Real discovery experiment | A genuine model selects and executes an action in the live browser |
| 6 | Replay | New inputs, declared target order, checkpoints, and no model calls |
| 7 | Policy | Host allowlists and approvals apply before actions; hostile text cannot change permissions |
| 8 | Outcomes and recovery | Business results stay distinct; uncertain writes reconcile before retry |
| 9 | Evidence | Traces explain the result without persisting tested secrets |
| 10 | Handoff | Same session, one owner, explicit handback, verified continuation |
| 11 | Discovery-to-replay integration | Successful trace compiles, saves, and replays in a fresh context |
| 12 | Older-style browser UI | Awkward controls, slow responses, expiry, denial, and target fallback |
| 13 | CI and report | Repeatable checks, documented decisions, and evidence references |

Live discovery needs separate credentials and an explicit request. Ordinary tests and CI should run without paid model calls. Mocked provider tests check the boundary; they cannot prove live provider interoperability.

## Work left for a production system

An artifact registry, tenant/version overrides, compatibility checks, approval storage, signed artifacts, managed secrets, durable jobs, and durable session ownership would all need separate design and validation. Replay telemetry could help identify drift, but it would not authorize automatic changes to a reviewed workflow.

I kept Kubernetes, Kafka, Redis, a full OAuth server, remote desktop integration, terminal emulation, multi-model routing, and a plugin framework outside the initial build. None was needed to prove the browser workflow.

## Requirements and checks

### Requirement IDs

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

I use these IDs in code and tests so I can trace a decision back to its requirement. Each requirement needs a test or a documented manual check. These are acceptance targets, not a claim that every case has passed.

## Discovery Requirements

### REQ-DISC-001: Goal-Directed Discovery

The system must accept a goal plus a target application, URL, or entry point and use a discovery component to identify and execute a sequence of surface actions that may satisfy the goal.

#### Checks

- A discovery request contains a goal, target/entry point, authorized context, and stopping conditions.
- Stopping conditions include max steps, timeout, and dead-end detection.
- Discovery can observe the live surface before acting.
- Discovery actually interacts with the real UI through the surface adapter.
- Discovery produces an ordered trace of proposed and executed actions with concise rationale.
- Discovery stops when the goal is satisfied, max steps are reached, timeout occurs, or a dead-end is detected.
- Discovery does not directly create production authority.

### REQ-DISC-002: Discovery Policy Gate

The system must evaluate proposed discovery actions against policy before execution.

#### Checks

- Every proposed action has an action type and effect classification.
- Disallowed actions are rejected before execution.
- Irreversible and privileged actions require explicit approval.
- Observed UI text cannot override policy.
- A policy denial is returned as a structured result.

### REQ-DISC-003: Capability Compilation

The system must compile a successful discovery trace into a versioned capability artifact.

#### Checks

- A successful trace can produce a valid artifact.
- The artifact contains input and output contracts.
- The artifact contains ordered steps and target strategies.
- The artifact contains checkpoints and expected outcomes.
- The artifact can be stored as plain JSON.
- The compiled artifact can be replayed without the discovery component.

### REQ-DISC-004: Live Discovery Isolation

Live model discovery must be isolated from deterministic replay and default CI execution.

#### Checks

- Replay tests do not require model credentials.
- Default CI does not invoke a live model.
- Live discovery is manually triggered.
- Live discovery credentials are loaded from environment or repository secrets.
- Live discovery output is stored as a reviewable artifact.

## Capability Artifact Requirements

### REQ-ART-001: Typed Artifact Schema

The system must define a versioned, runtime-validated capability artifact schema.

#### Checks

- Valid artifacts pass runtime validation.
- Invalid artifacts fail before execution.
- The schema includes artifact identity and version.
- The schema includes application and surface identity.
- The schema includes input and output contracts.
- The schema includes ordered execution steps.
- The schema includes policy and risk metadata.
- The schema includes recovery behavior.
- The schema includes expected business outcomes.

### REQ-ART-002: Portable Representation

The artifact must remain independent of the browser automation library.

#### Checks

- The artifact contains no Playwright-specific types.
- The artifact can be serialized to JSON.
- The artifact can be inspected and diffed without executing code.
- The replay engine consumes the artifact through a stable contract.
- A second surface adapter can consume the same artifact model.

### REQ-ART-003: Artifact Integrity

The system must reject malformed, incomplete, or unsupported artifacts.

#### Checks

- Missing required fields are rejected.
- Unknown action effects are rejected.
- Invalid target strategies are rejected.
- Undeclared inputs are rejected.
- Unsupported artifact versions are rejected.
- Rejection occurs before surface interaction.

### REQ-ART-004: Artifact Provenance

The artifact must record enough provenance to support review and compatibility decisions.

#### Checks

- The artifact records its source capability or discovery run.
- The artifact records application family and version where known.
- The artifact records creation metadata.
- The artifact records the compiler or schema version.
- Provenance does not persist credentials or session tokens.

## Replay Requirements

### REQ-RPL-001: Deterministic Replay

The system must execute an approved capability artifact deterministically without invoking an LLM.

#### Checks

- Replay follows the artifact-defined step order.
- Replay uses artifact-defined target strategy order.
- Replay does not select actions through open-ended reasoning.
- Replay stops when a required precondition or postcondition fails.
- Replay returns a structured result.

### REQ-RPL-002: Target Resolution

The system must support ordered target resolution strategies.

#### Checks

- Semantic or accessibility identity is attempted before weaker fallbacks when declared.
- Stable attributes can be used when declared.
- Structural relationships can be used when declared.
- Visual or coordinate fallback is explicit and policy-controlled.
- Multiple matches produce a deterministic failure or require an explicit disambiguation rule.
- Target resolution results are recorded in the execution trace.

### REQ-RPL-003: Checkpoint Verification

The system must verify declared preconditions and postconditions.

#### Checks

- A step cannot advance when its precondition fails.
- A step cannot be marked successful when its postcondition fails.
- Checkpoint failures identify the expected and observed state.
- State verification can use surface-specific observations.
- Sensitive values are redacted before evidence or fingerprint generation.

### REQ-RPL-004: Replay Isolation

The replay engine must depend on surface and policy interfaces rather than concrete browser or model implementations.

#### Checks

- Unit tests can run against a fake surface adapter.
- Replay tests do not require a browser for core logic.
- Replay does not import the LLM provider package.
- Browser-specific behavior is isolated in the browser adapter.

## Policy and Security Requirements

### REQ-POL-000: Explicit Execution Allowlist

The system must enforce an explicit, configurable allowlist for both discovery and replay.

#### Checks

- Policy defines permitted target applications or domains.
- Policy can constrain permitted routes or application regions.
- Policy defines permitted action types.
- Every discovery action is checked against the allowlist before execution.
- Every replay action is checked against the allowlist before execution.
- An out-of-scope target, route, or action is blocked before surface interaction.
- Allowlist denial is returned as a structured, machine-readable result.

### REQ-POL-001: External Authority

The system must keep authority outside the model and observed application content.

#### Checks

- Policy is evaluated by a dedicated policy component.
- UI content is treated as untrusted data.
- Model output cannot grant itself additional permissions.
- Application content cannot disable policy.
- Policy decisions are recorded with the execution result.

### REQ-POL-002: Action Effect Classification

The system must classify actions by effect.

#### Checks

- Actions can be classified as `read`, `reversible_write`, `irreversible_write`, or `privileged`.
- The classification is part of the action or artifact contract.
- Missing effect classification is rejected for actions requiring it.
- Policy decisions use effect classification.
- Prompt wording is not used as the sole safety control.

### REQ-POL-003: Approval Enforcement

The system must require approval for configured high-risk actions.

#### Checks

- Irreversible actions can be configured to require approval.
- Privileged actions can be configured to require approval.
- Missing approval prevents execution.
- Approval is associated with the invocation and capability.
- Approval state is visible in the execution trace.

### REQ-POL-004: Secret Handling

The system must avoid persisting credentials, session tokens, and API keys.

#### Checks

- No secrets are committed to the repository.
- `.env.example` contains names but not values.
- Session tokens are excluded from artifacts and evidence.
- Credentials are excluded from logs.
- Sensitive values are redacted before persistence.

### REQ-POL-005: Adversarial UI Content

The system must treat malicious instructions embedded in observed UI content as untrusted data.

#### Checks

- A UI message instructing the system to bypass policy does not change policy.
- The action is evaluated against the original capability and invocation policy.
- The event is recorded as observed content or a possible injection signal.
- The system does not execute the disallowed action.

## Outcome and Failure Requirements

### REQ-OUT-001: Explicit Result Taxonomy

The system must distinguish successful execution, business outcomes, recoverable conditions, intervention, and hard failure.

#### Checks

- A successful operation returns `SUCCESS`.
- A valid domain result such as `MEMBER_NOT_FOUND` returns `BUSINESS_OUTCOME`.
- A retryable technical condition returns `RECOVERABLE`.
- A human-required condition returns `INTERVENTION_REQUIRED`.
- An unrecoverable condition returns `FAILURE`.
- Results include machine-readable reason or outcome codes.

### REQ-OUT-002: Business Outcome Contracts

The system must declare expected business outcomes in the capability artifact.

#### Checks

- Expected domain outcomes are represented in the output contract.
- Business outcomes are not thrown as generic exceptions.
- Consumers can distinguish business outcomes from infrastructure failures.
- Business outcome evidence identifies the observed state supporting the result.

### REQ-OUT-003: Recoverable Conditions

The system must identify conditions that may be retried safely.

#### Checks

- Recoverable conditions include a retry classification.
- Retry limits are explicit.
- Retry behavior is action-aware.
- Irreversible actions are not blindly retried.
- Exhausted retries produce a structured failure or intervention result.

### REQ-OUT-004: Ambiguous Commit State

The system must represent uncertainty when an action may have committed but the result is unknown.

#### Checks

- A transport failure after an irreversible submission can produce `UNKNOWN_COMMIT_STATE`.
- The system attempts reconciliation before retrying.
- Retry is prohibited unless safety is established.
- Unresolved ambiguity produces `INTERVENTION_REQUIRED` or `FAILURE`.
- The trace records the uncertainty and reconciliation attempts.

### REQ-OUT-005: Session Expiration

The system must distinguish session expiration from ordinary target or validation failure.

#### Checks

- Session expiration is detected from adapter state or declared signals.
- Replay returns a session-specific reason.
- Safe reauthentication or recovery can be represented.
- Credentials are not captured in evidence.
- The system does not continue acting against an invalid session.

## Evidence and Observability Requirements

### REQ-EVD-001: Execution Trace

The system must produce a structured trace for every discovery and replay run.

#### Checks

- Discovery traces identify the goal, target, invocation, observations, selected actions, concise action rationale, policy decisions, and results.
- Replay traces identify the capability, version, and invocation.
- Each step records start and completion state.
- Each action records its result.
- Policy decisions are included.
- Failures and outcomes include structured codes.
- The reusable capability artifact remains decoupled from the raw model transcript.

### REQ-EVD-002: Checkpoint Evidence

The system must capture evidence at declared checkpoints.

#### Checks

- Evidence can include normalized observations, screenshots, or adapter-specific references.
- Evidence is associated with a step or checkpoint.
- Evidence is captured before and after configured high-risk actions.
- Evidence capture failure is represented explicitly.
- Evidence does not contain raw secrets.

### REQ-EVD-003: Redaction

The system must redact sensitive values before persistence.

#### Checks

- Configured sensitive fields are redacted.
- Credentials and session tokens are never persisted.
- PII is excluded from state fingerprints where possible.
- Redaction behavior is covered by tests.
- Redaction does not prevent useful diagnosis of control flow.

### REQ-EVD-004: State Fingerprints

The system may generate normalized state fingerprints for drift and checkpoint detection.

#### Checks

- Fingerprints are generated from normalized observations.
- Sensitive values are removed before hashing.
- The hashing algorithm is documented.
- Fingerprints are stable for equivalent normalized states.
- Fingerprints are not treated as a substitute for semantic postconditions.

## Human Intervention Requirements

### REQ-HITL-000: Intervention Detection and Routing

The system must detect states that require human intervention and route an intervention request containing enough context for an operator to act.

#### Checks

- Discovery can request intervention when stuck or unable to proceed safely.
- Replay can request intervention after an unrecoverable or unresolved condition.
- Policy can require intervention before a configured risky or irreversible action.
- The intervention request identifies the run/invocation.
- The request identifies the capability or discovery goal.
- The request identifies the current step or action.
- The request contains the reason for stopping.
- The request contains normalized current state and an evidence or screenshot reference.
- The request identifies the active session and current ownership state.

### REQ-HITL-001: Same-Session Pause

The system must pause automation without destroying the active session.

#### Checks

- A capability can declare a human intervention checkpoint.
- Automation stops before taking further actions.
- The active session remains available to the operator.
- The pause state is visible in the execution result.
- No concurrent automation action occurs while paused.

### REQ-HITL-002: Ownership Transfer

The system must transfer session ownership atomically between automation and a human operator.

#### Checks

- Automation ownership can transition to human ownership.
- Human ownership prevents automation actions.
- Ownership conflicts are rejected.
- Return to automation requires explicit handback.
- The state machine prevents invalid transitions.

### REQ-HITL-003: Resume After Handoff

The system must resume from a verified state after human intervention.

#### Checks

- The operator can return control explicitly.
- Replay verifies the current state before continuing.
- If the state is unexpected, replay does not continue blindly.
- The resumed trace records the handoff and verification.
- Human actions performed during takeover are recorded in the execution evidence.
- The capability can complete or escalate after handoff.

## Surface Requirements

### REQ-SRF-001: Surface Adapter

The system must interact with external applications through a surface adapter.

#### Checks

- The adapter exposes observation, action, evidence, and session operations.
- Replay does not depend on browser-specific APIs.
- A fake adapter supports deterministic tests.
- The adapter can represent browser, terminal, or desktop observations.
- Adapter failures are classified explicitly.

### REQ-SRF-002: Browser Surface

The initial implementation must support a browser-based surface.

#### Checks

- The browser adapter can observe relevant controls.
- The browser adapter can execute declared actions.
- The browser adapter can capture evidence.
- The browser adapter can report session state.
- Browser-specific selectors remain inside the adapter or artifact target data, not the replay core.

### REQ-SRF-003: Legacy Surface Behavior

The demonstration surface must include stable but awkward enterprise-style behavior.

#### Checks

- The surface includes validation states.
- The surface can simulate slow responses.
- The surface can simulate permission denial.
- The surface can simulate session expiration.
- The surface can produce a business outcome distinct from success.
- The surface can demonstrate at least one target fallback strategy.

### REQ-SRF-004: Terminal Compatibility (Design Extension, Not Assignment-Mandated)

The abstraction should remain conceptually compatible with terminal-style surfaces without requiring terminal implementation in the initial submission.

#### Checks

- Observation is not defined solely as HTML.
- Target strategies can represent screen and field identity.
- Session state can represent terminal screen state.
- The architecture documentation explains how a terminal adapter would fit.
- A full terminal emulator is not required for the initial implementation.

## Heterogeneity and Multi-Tenant Design Requirements

### REQ-MT-001: Vendor-Family Capability Reuse

The architecture must support reuse of a base capability across tenants running the same underlying vendor product without requiring a new recording for every tenant.

#### Checks

- The artifact can identify an application/vendor family independently from a tenant.
- The design can associate compatibility with an application/product version.
- A base capability can be specialized through explicit tenant or version overrides.
- Tenant-specific values are parameterized rather than embedded as raw sensitive data.
- The report explains precedence between base capability behavior and explicit overrides.

### REQ-MT-002: Compatibility and Drift

The architecture must define how tenant or product-version drift is detected and handled without open-ended reasoning during deterministic replay.

#### Checks

- Replay can detect a mismatch between declared compatibility expectations and observed state.
- Drift produces an explicit result rather than silently changing behavior.
- The design distinguishes compatible variation from an override requirement and from re-discovery.
- The report explains how replay telemetry could inform compatibility confidence over time.
- No multi-tenant registry or distributed infrastructure is required for the initial implementation.

## Operations and Delivery Requirements

### REQ-OPS-001: Automated Validation

The repository must run automated validation in CI.

#### Checks

- Type checking runs in CI.
- Linting runs in CI.
- Unit tests run in CI.
- Contract tests run in CI.
- Integration tests run in CI.
- E2E tests run in CI where practical.
- Artifact schema validation runs in CI.
- Dependency auditing runs in CI.

### REQ-OPS-002: Deterministic Default CI

Default CI must not depend on live model calls.

#### Checks

- CI succeeds without model credentials.
- Replay and policy tests are deterministic.
- Live discovery is manually triggered.
- Live discovery failures do not make ordinary pull requests flaky.
- Live discovery output is retained for review when run.

### REQ-OPS-003: Documentation and Traceability

The repository must document architecture, requirements, decisions, and known limitations.

#### Checks

- Requirements have stable IDs.
- Tests reference requirement IDs where practical.
- ADRs document major architectural decisions.
- `REPORT.md` explains tradeoffs and deliberate non-goals.
- The README explains how to run tests and demonstrations.
- Git history contains meaningful implementation milestones.

### REQ-OPS-004: Production Evolution Notes

The documentation must explain how the single-process implementation could evolve.

#### Checks

- The report identifies where durable orchestration could be introduced.
- The report identifies where session leases could replace in-memory ownership.
- The report identifies where artifact registry and approval storage could be added.
- The report identifies gateway and service-discovery boundaries.
- The report distinguishes implemented behavior from future production work.

## Scenarios to verify

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

## Decision record IDs

| ADR | Decision |
|---|---|
| `ADR-001` | Capability artifact as intermediate representation |
| `ADR-002` | Surface abstraction independent of Playwright |
| `ADR-003` | Ordered deterministic target resolution |
| `ADR-004` | Explicit outcome and failure taxonomy |
| `ADR-005` | External policy enforcement |
| `ADR-006` | Same-session ownership for human handoff |
| `ADR-007` | No distributed orchestrator in the initial implementation |

## Testing approach

Unit tests check contracts and decisions. Browser tests check that those decisions hold against real page state. Live-model runs and actual human handoff need separate evidence.

For example, a policy unit test should return `DENY`. The browser check should establish that the forbidden action never happened. Both matter. Coverage tells me which code ran; it does not tell me whether I asked the right questions.

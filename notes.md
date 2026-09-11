# **Assignment A - Computer-Use Automation System.pdf**
## Engineering Notebook 00

### Initial Problem Framing

#### 1. I am building a capability acquisition and execution system, not a browser macro.
#### 2. The LLM discovers how to perform a task once. 
   - That successful behavior is compiled into a typed, reviewable capability. 
   - Production execution is then
   - deterministic, 
   - policy-constrained, 
   - observable, and 
   - inexpensive.

#### 3. The system has three hard boundaries:
   - Discovery
   - Capability representation
   - Execution

#### 4. **Replay must NOT depend on the LLM package.** 
     If it does, the capability boundary is incorrect.

#### 5. **The central design invariant is:**        
- The model may discover behavior, but it does NOT define authority.   
     #### (MODEL DISCOVERS NOT DEFINES)
- The capability defines repeatable behavior,
     #### (CAPABILITY DEFINES BEHAVIOR)
- Policy defines permitted behavior,
     #### (POLICY REFINES BEHAVIOR)
- Checkpoints establish observed truth, and
     #### (CHECKPOINTS ESTABLISH TRUETH)
- execution returns explicit outcomes. 
    #### (EXECUTION RETURNS OUTCOME)


#
# Phase 1: GETTING ORGANIZED

### Objective
1. Create the repository
2. capture engineering thoughts, 
3. establish contribution conventions, 


### Product Boundary

The product is a versioned capability artifact and its deterministic replay engine.

The LLM is used for discovery and compilation. 
It is NOT part of the production replay control path.


### Core Flow:
Goal -> Discovery Agent -> Policy Gate -> Surface Adapter \
-> Successful Trace -> Capability Compiler -> Versioned Capability Artifact \
-> Deterministic Replay \
  -> Success \
  -> Business Outcome \
  -> Recoverable Condition \
  -> HITL \
  -> ard Failure  

## PRIMARY ENGINEERING FOCUS:

### The first implementation must prioritize:

1. Capability schema
2. Deterministic replay
3. Explicit business-outcome and failure semantics
4. Safety and policy enforcement
5. Human control transfer

### Surface Abstraction

The artifact and replay engine must **NOT** depend directly on Playwright.

``` TypeScript
interface SurfaceAdapter {
  observe(): Promise<Observation>;
  execute(action: SurfaceAction): Promise<ActionResult>;
  captureEvidence(): Promise<Evidence>;
  getSessionState(): Promise<SessionState>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}
```

The first adapter may target a browser. 
The abstraction must remain compatible with terminal, desktop, and remote surfaces?

### Capability Artifact

#### The artifact is an intermediate representation, not a macro recording.

### It must be:

* Typed
* Schema-validated
* Human-readable
* Diffable
* Versioned
* Portable
* Reviewable
* Independent of the execution library

### It should describe:

* Input contract
* Output contract
* Steps
* Targets
* Checkpoints
* Risk and action effects
* Recovery behavior
* Expected business outcomes
* Application identity
* Provenance
* Version

## Deterministic Target Resolution

``` Target resolution uses ordered strategies selected by the artifact. ```

### Browser order:

1. Semantic or accessibility identity
2. Visible label relationship
3. Stable attribute
4. DOM selector
5. Structural relation
6. Visual or coordinate fallback

### Terminal order:

1. Screen identifier and field name
2. Field metadata
3. Row and column
4. Surrounding text fingerprint

``` Replay must not use an LLM or open-ended reasoning to choose a target.```

## State Verification

```Before and after important actions, replay should verify expected state.```

### Possible state inputs include:

* URL pattern
* Page title
* Visible heading
* Expected controls
* Terminal screen identifier
* Status line
* Key text regions
* Field layout

``` State fingerprints must normalize and redact sensitive values before hashing. ```

## Security Boundary

``` Authority is external to both the model and observed application content. ```

#### System policy
#### Capability policy
#### Invocation authorization
#### User-approved objective
#### Observed application content

``` Observed UI content is untrusted data.  It must _NEVER_ override policy or execution constraints.```


## Action Effects

### Action type and action effect are separate concepts.

```
type ActionEffect = "read | "reversible_write" | "irreversible_write" | "privileged";
```

## Examples:

* Balance lookup: read
* Address change: reversible_write
* Transfer: irreversible_write
* Bulk export: privileged

``` Policy enforcement must be implemented in code, not inferred from prompt wording. ```

## Outcome Taxonomy

### The system must distinguish:

#### SUCCESS
#### BUSINESS_OUTCOME
#### RECOVERABLE
#### INTERVENTION_REQUIRED
#### FAILURE

## Failure and intervention reasons may include:

* Validation
* Permission
* Session expiration
* Transport failure
* Timeout
* Unexpected state
* Target resolution
* Policy violation
* Ambiguous commit
* Possible instruction injection

#### Expected business states must be represented as declared outcomes, not thrown as generic exceptions.

Network and Ambiguous Commit Handling

The system must treat uncertain commit state as distinct from ordinary timeout.

## Example:

- Submit irreversible action
- Network failure
- UNKNOWN_COMMIT_STATE

## Replay must:

1. Inspect resulting state
2. Reconcile the operation
3. Retry only when proven safe
4. Escalate when the result remains uncertain

``` Blind retries are prohibited for potentially irreversible actions. ```

## Human Handoff

### Human intervention requires same-session ownership transfer.

1. AUTOMATION
2. PAUSED
3. HUMAN
4. RETURNING
5. AUTOMATION
6. COMPLETE

``` The initial implementation may use an in-memory state machine and mutex. The design must leave room for durable lease-based ownership later. ``` 

## Scale and Production Evolution

``` The initial implementation remains single-process. ```

## Future production concerns may include:

* Artifact registry
* Vendor and product identity
* Version and tenant overrides
* Compatibility rules
* Replay telemetry
* Drift detection
* Approval lifecycle
* Durable workflow orchestration
* API gateway
* Service discovery
* Durable session coordination
* KMS-backed secret handling
* Artifact signing

## These are documented extension points, not initial implementation requirements.

### Out of scope.

#### Don't build but think about this architecturally.

* Kubernetes
* Kafka
* Redis
* A distributed scheduler
* A full OAuth server
* Production PKI
* A full AS/400 emulator
* Generic RDP or Citrix integration
* A production operator console
* A multi-model routing layer
* A generalized plugin framework

# Phase 2: Execution Roadmap

### Objective

Turn the condensed notes into an executable sequence of implementation milestones. Each milestone must produce a reviewable artifact, tests, and a commit.

## Milestone 1: Repository Baseline

### Deliverables:

* Repository structure
* TypeScript configuration
* Test runner
* Linting and formatting
* .env.example
* Initial README
* Condensed engineering notebook
* Basic CI workflow

### Validation:

* Install succeeds
* Type checking succeeds
* Tests execute
* Linting succeeds
* CI runs on pull requests


## Milestone 2: Requirements and Acceptance Criteria

### Deliverables:

* Numbered requirements
* Acceptance criteria
* BDD scenarios
* Traceability convention
* Initial test matrix

### Validation:

* Every core requirement has at least one acceptance criterion
* Every acceptance criterion maps to a test or documented manual check
* Requirements cover discovery, artifacts, replay, policy, evidence, handoff, and surfaces


## Milestone 3: Capability Artifact Contract

### Deliverables:

* Artifact TypeScript types
* Runtime schema validation
* Example valid artifact
* Invalid artifact fixtures
* Artifact serialization rules
* Artifact versioning fields
* Input and output contracts
* Step, target, checkpoint, policy, recovery, and outcome definitions

### Validation:

* Valid artifacts parse successfully
* Malformed artifacts fail before execution
* Unknown or undeclared inputs are rejected
* Unsupported action effects are rejected
* Artifact serialization is deterministic
* Artifact does not depend on Playwright types

## Milestone 4: Surface Adapter Contract

### Deliverables:

* Surface adapter interface
* Observation model
* Surface action model
* Action result model
* Session state model
* Evidence model
* Browser adapter boundary
* Test double adapter

### Validation:

* Replay depends only on the adapter interface
* A fake adapter can execute replay tests
* Observation data is not HTML-specific
* Session state can represent active, expired, paused, and unknown states

## Milestone 5: Deterministic Replay Engine

### Deliverables:

* Artifact loading
* Input validation
* Ordered target resolution
* Precondition checks
* Action execution
* Postcondition checks
* Step progression
* Deterministic result classification
* Replay trace

### Validation:

* Replay never invokes the LLM
* Replay follows artifact-defined locator order
* Replay stops when a checkpoint fails
* Replay returns explicit outcomes
* Replay rejects malformed artifacts before touching the surface
* Replay produces a trace suitable for evidence and debugging

## Milestone 6: Policy Enforcement

### Deliverables:

* Action effect classification
* Capability policy
* Invocation authorization
* Approval requirement handling
* Policy denial result
* Untrusted UI-content handling
* Adversarial instruction-injection test

### Validation:

* Read actions can execute when authorized
* Irreversible actions require approval
* Privileged actions are denied without authorization
* UI text cannot change policy
* Policy violations are explicit results, not generic failures

## Milestone 7: Outcome and Failure Semantics

### Deliverables:

* Result taxonomy
* Business outcome contracts
* Recoverable condition handling
* Hard failure handling
* Intervention-required handling
* Ambiguous commit state
* Retry rules
* Reconciliation hook

### Validation:

* Business outcomes are not classified as infrastructure failures
* Recoverable conditions can be retried only when safe
* Irreversible actions do not blindly retry after uncertain transport failure
* Ambiguous commit state is observable
* Failure reasons are machine-readable

## Milestone 8: Evidence and Redaction

### Deliverables:

* Evidence capture interface
* Step-level evidence references
* Redaction rules
* Sensitive-value normalization
* State fingerprinting
* Evidence retention metadata

### Validation:

* Evidence is captured at required checkpoints
* Sensitive values are redacted
* Raw credentials and session tokens are not persisted
* Fingerprints do not include raw PII
* Evidence can explain why replay succeeded, stopped, or escalated

## Milestone 9: Human Handoff

### Deliverables:

* Session ownership state machine
* Pause and resume behavior
* Human takeover
* Return-to-automation transition
* Ownership conflict handling
* Same-session test double

### Validation:

* Automation can pause at a declared checkpoint
* Human ownership prevents concurrent automation actions
* Automation resumes only after explicit handback
* Session state is preserved across handoff
* Ownership conflicts are explicit and recoverable


## Milestone 10: Discovery and Compilation

### Deliverables:

* Discovery interface
* Model provider boundary
* Surface observation loop
* Successful trace representation
* Capability compiler
* Policy gate before execution
* One real discovery run
* Stored compiled artifact

### Validation:

* Discovery can produce a trace
* The trace can compile into a valid artifact
* The artifact can replay without the LLM
* Discovery cannot bypass policy
* Live model execution is isolated from deterministic tests

## Milestone 11: Legacy Surface Demonstration

### Deliverables:

* Browser-based legacy demo surface
* Stable but awkward controls
* Validation and permission states
* Slow response simulation
* Optional terminal-shaped adapter or fixture
* End-to-end scenarios

### Validation:

* The same capability model works against the legacy surface
* Locator fallback behavior is demonstrated
* Slow responses and session expiration are tested
* Business outcomes are distinguishable from technical failures

## Milestone 12: CI, Documentation, and Report

### Deliverables:

* Full CI checks
* Unit tests
* Contract tests
* Integration tests
* Playwright E2E tests
* Artifact schema validation
* Dependency audit
* REPORT.md
* Architecture diagram
* ADRs
* Known limitations
* Production evolution notes

### Validation:

* CI is deterministic by default
* Live discovery is manual and secret-gated
* The report explains decisions and tradeoffs
* The report identifies deliberate non-goals
* Test evidence is linked to requirements
# Implementation Progress

## 09/12/2026 Completed

### Requirements

-   `REQ-RPL-001...004`
-   `REQ-OUT-002/003`
-   `REQ-EVD-001/002`
-   `REQ-POL-000...003`

### Tests

-   `test/replay-policy.test.ts`

## 09/11/2026 Completed

### Requirements

-   `REQ-ART-001...004`
-   `REQ-POL-000`
-   `REQ-RPL-002...004`
-   `REQ-OUT-003/004`
-   `REQ-HITL-001...003`



# Current Scope

This implementation establishes the load bearing contracts needed before
deeper model or browser SDK integration:

1.  A typed, runtime validated capability artifact.
2.  A surface abstraction that deterministic replay can depend on
    without importing Playwright or an LLM provider.
3.  A deterministic replay engine operating against the
    `SurfaceAdapter`.
4.  An explicit policy boundary controlling what replay is authorized to
    execute.

The implementation does **not** yet include the real Playwright browser
adapter or LLM driven discovery.



# Run

``` bash
npm install
npm test
npm run typecheck
npm run build
```



# Design Invariants

-   Discovery may use an LLM. Deterministic replay may not.
-   Artifact validation occurs before surface interaction.
-   Policy authority is external to model and UI content.
-   Target fallback order is declared by the artifact.
-   Risky actions cannot be blindly retried after an ambiguous commit.
-   Surface and session ownership are explicit so same session HITL can
    be implemented without changing replay's abstraction.
-   Policy determines what may happen.
-   Replay determines what happens next.
-   `SurfaceAdapter` determines how it happens.



# Requirement Traceability in Code

Production code and tests use concise comments such as:

`Plan: Milestone 3 | REQ-ART-001`

These comments connect implementation decisions directly to `notes.md`.
They identify the primary requirements demonstrated by an architectural
boundary or test without attempting to replace the requirements matrix.

### Current coverage:

| Area | Plan / requirements | Implementation |
|---|---|---|
| Capability contract | Milestone 3; `REQ-ART-001..004` | `src/artifact/*`, `test/capability-schema.test.ts` |
| Explicit allowlist metadata | Milestone 7; `REQ-POL-000` | `capability-schema.ts` |
| Ordered target strategies | Milestones 3/6; `REQ-RPL-002` | `capability-schema.ts`, `surface-adapter.ts` |
| Checkpoint representation | Milestones 3/6; `REQ-RPL-003` | `capability-schema.ts` |
| Recovery / ambiguous commit safety | Milestone 8; `REQ-OUT-003/004` | schema refinement + tests |
| Surface abstraction | Milestone 4; `REQ-SRF-001`, `REQ-RPL-004` | `surface-adapter.ts` |
| Same-session ownership seam | Milestone 10; `REQ-HITL-001..003` | fake adapter + tests |

As implementation expands, new code and tests should cite the relevant
requirement IDs at the architectural boundary or behavior being proven
rather than commenting every statement.



# Current Implementation Slice

## Milestone 6: Deterministic Replay Engine

### Implemented

-   `DeterministicReplayEngine` with no model or provider dependency
    (`REQ-RPL-001`, `REQ-RPL-004`)
-   Artifact defined target resolution through `SurfaceAdapter`
    (`REQ-RPL-002`)
-   Invocation and input validation before surface execution
    (`REQ-RPL-001`)
-   Precondition, postcondition, and final success checkpoint
    verification (`REQ-RPL-003`)
-   Bounded artifact defined retry behavior (`REQ-OUT-003` seam)
-   Explicit ambiguous commit escalation (`REQ-OUT-004` seam)
-   Declared business outcome detection (`REQ-OUT-002` seam)
-   Structured replay trace and failure evidence references
    (`REQ-EVD-001/002` seam)


## Milestone 7: Policy Enforcement

### Implemented

-   Explicit domain and target allowlist (`REQ-POL-000`)
-   Explicit route allowlist with deterministic wildcard matching
    (`REQ-POL-000`)
-   Action type allowlist (`REQ-POL-000`)
-   Policy as an authority boundary independent from observed UI content
    (`REQ-POL-001`)
-   Invocation scoped explicit step approval (`REQ-POL-003`)
-   Structured policy decisions recorded in replay trace (`REQ-POL-001`)

Tests in `test/replay-policy.test.ts` are annotated with the milestone
and requirement IDs demonstrated by each behavior.



# Next Implementation

1.  Complete Milestone 8 outcome and recovery behavior.
2.  Complete Milestone 9 evidence generation and persistence.
3.  Implement the minimal real browser `SurfaceAdapter`.
4.  Run the genuine LLM driven discovery spike against a live surface.
5.  Compile the successful discovery run into a reusable capability
    artifact.
6.  Replay that artifact without an LLM and preserve the required
    evidence.



# Architecture Tradeoffs and Decisions

## One More Time Without the Oops

No major gotchas this time. Most of the focus was on architecture
tradeoffs and deciding where responsibility should live.

I need to keep reminding myself that **deterministic does not mean
simplistic**. Discovery gets to reason. Replay gets to execute what was
learned. If replay starts making open ended decisions, then I have
effectively moved discovery back into production and broken the primary
boundary.

## 1. Policy Execution vs. Policy Decision

Could have policy evaluate an action and execute it when allowed. Less
plumbing. Fewer calls between components.

I don't like the ownership ambiguity this creates though. Now both
policy and replay are capable of changing application state.

Chose to keep policy **decision only**.

1.  Policy decides what **may happen**.
2.  Replay decides what happens **next**.
3.  `SurfaceAdapter` determines **how it happens**.

Policy answers:

-   `ALLOW`
-   `DENY`
-   `REQUIRE_APPROVAL`

Replay owns execution state and determines what happens next.
`SurfaceAdapter` performs the actual interaction.

One execution state machine. Much easier to reason about who has
authority versus who has mechanism.



## 2. Intelligent Target Resolution vs. Deterministic Target Resolution

It would be easy to let the model help when a selector fails. Probably
makes the demo look more resilient too.

The problem is that replay is no longer really deterministic. The same
artifact plus the same observed state could result in different actions
depending on what the model decides.

Chose ordered locator strategies stored in the artifact instead.
Accessibility and semantic identity first, followed by progressively
weaker fallbacks.

The artifact gets larger, but that is probably where this complexity
belongs.

1.  Discovery figures out how to find something.
2.  Capability records what it learned.
3.  Replay should not rediscover it.

### Possible Later Extension

Bounded LLM recovery after deterministic resolution is exhausted.

Important distinction though. That would be an explicit recovery mode,
not normal replay behavior.



## 3. Generic Retry vs. Action Aware Recovery

Normal automation instinct is to retry on timeout or network failure.
Fine for some reads. Potentially disastrous for writes.

If I submit something and lose the response, I do not necessarily have a
failed operation. I have an operation whose outcome I don't know.

``` text
submit
  -> connection failure
  -> ???
```

That `???` deserves its own state.

Chose:

``` text
UNKNOWN_COMMIT_STATE
```

Recovery becomes:

``` text
UNKNOWN_COMMIT_STATE
  -> reconcile
      -> proven committed
          -> continue

      -> proven not committed
          -> retry if permitted and safe

      -> still ambiguous
          -> HITL
```

This creates more states and makes recovery more complicated, but
duplicating a financial transaction because `retry: 3` seemed reasonable
would be a much worse design.



## 4. Playwright Replay Engine vs. SurfaceAdapter

Direct Playwright implementation would absolutely be faster right now.
Could probably remove a meaningful amount of interface and type code.

But then DOM and browser assumptions start leaking into replay,
capability definitions, tests, and eventually discovery.

The requirement specifically tells me the real environment is not
necessarily a nice browser DOM.

**Chose the adapter.**

Replay should understand:

``` text
observe -> resolve -> act -> verify
```

It should not inherently understand:

``` text
page -> locator -> click
```

Playwright is an implementation of the surface boundary, not the
architecture.

Costs abstraction now. Saves redesign if the next surface is an ugly
frameset, accessibility driven application, desktop UI, terminal,
Citrix, or something else entirely.

Need to avoid overengineering this abstraction though. I only need the
seam right now, not five adapters proving that the seam exists.



## 5. Exceptions vs. Explicit Outcomes

Initially tempting to have replay either return success or throw.

Doesn't model the domain correctly.

`"member not found"` is not an infrastructure failure. Neither is a
validation response necessarily.

The caller needs to know the difference between:

> The capability successfully determined that this member does not
> exist.

and:

> The automation couldn't find the member search button.

So use an explicit result taxonomy:

-   `SUCCESS`
-   `BUSINESS_OUTCOME`
-   `RECOVERABLE`
-   `INTERVENTION_REQUIRED`
-   `FAILURE`

More contract surface, but much better semantics.

It also gives the calling agent something machine readable instead of
forcing it to interpret exception strings.



## 6. Checkpoint Verification vs. Trusting Successful Actions

A click succeeding tells me almost nothing except that a click was
issued.

It does not prove:

-   Navigation occurred.
-   Data was saved.
-   The expected member loaded.
-   The application accepted the operation.
-   The resulting application state is what I expected.

Chose explicit preconditions, postconditions, and checkpoints even
though this adds observations and therefore execution time.

State transitions need evidence.

Otherwise I am building a macro that assumes its own actions worked.



## 7. Global Approval vs. Invocation Scoped Approval

Could mark a capability `"approved"` and allow its risky actions
indefinitely.

Simpler.

Too broad.

Approval should correspond to the actual invocation and action being
authorized.

Chose invocation scoped approval so approval cannot accidentally become
permanent authority attached to the capability itself.

### Potential Future Concern: Approval TOCTOU

If application state materially changes between approval and execution,
is the approval still valid?

Don't need to solve this completely now, but it is worth keeping the
approval context tied to:

``` text
invocation
  + capability
  + action
  + relevant observed state
```

That gives us somewhere to enforce stronger approval semantics later
without changing the fundamental architecture.



## 8. General Theme Emerging

Move intelligence toward **discovery**.

Move authority toward **explicit policy**.

Move reusable knowledge into the **capability artifact**.

Keep **replay boring**.

Boring is good here.

Production execution should be predictable enough that when something
goes wrong I can identify the exact step, policy decision, target
strategy, observed state, and resulting outcome without asking an LLM
what it thinks happened.

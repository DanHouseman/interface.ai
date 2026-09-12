## 09/11/2026 Completed:

* REQ-ART-001...004
* REQ-POL-000
* REQ-RPL-002...004
* REQ-OUT-003/004
* REQ-HITL-001...003

## Run

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Design invariants

- Discovery may use an LLM; deterministic replay may not.
- Artifact validation occurs before surface interaction.
- Policy authority is external to model/UI content.
- Target fallback order is declared by the artifact.
- Risky actions cannot be blindly retried after an ambiguous commit.
- Surface/session ownership is explicit so same-session HITL can be implemented without changing replay's abstraction.

## Next implementation:

1. Policy evaluator with explicit target/domain/route/action allowlist.
2. Deterministic replay state machine against `SurfaceAdapter`.
3. Minimal real browser adapter and LLM discovery spike.


## Requirement traceability in code

Production code and tests use concise comments such as `Plan: Milestone 3 | REQ-ART-001` to connect implementation decisions to `notes.md`. The comments identify the primary requirement(s) a boundary or test demonstrates; they are intentionally not exhaustive substitutes for the requirements matrix.

Current coverage:

| Area | Plan / requirements | Implementation |
|---|---|---|
| Capability contract | Milestone 3; `REQ-ART-001..004` | `src/artifact/*`, `test/capability-schema.test.ts` |
| Explicit allowlist metadata | Milestone 7; `REQ-POL-000` | `capability-schema.ts` |
| Ordered target strategies | Milestones 3/6; `REQ-RPL-002` | `capability-schema.ts`, `surface-adapter.ts` |
| Checkpoint representation | Milestones 3/6; `REQ-RPL-003` | `capability-schema.ts` |
| Recovery / ambiguous commit safety | Milestone 8; `REQ-OUT-003/004` | schema refinement + tests |
| Surface abstraction | Milestone 4; `REQ-SRF-001`, `REQ-RPL-004` | `surface-adapter.ts` |
| Same-session ownership seam | Milestone 10; `REQ-HITL-001..003` | fake adapter + tests |

As implementation expands, new code/tests should cite the relevant requirement IDs at the architectural boundary or behavior being proven, rather than commenting every statement. But this is a good start and should indicate an idea into how I think and work.

## One more time without the Oops

This is my section on notes and things I've learned or recalled the hard way during this exercise. 
I had put JsonValue as an export symbo; in both capability-schema.ts and domain/contracts.ts. Because of this TypeScript could not determine which JsonValue the package
should expose - yeah, that seems like a DUH thing, but it isn't because the tests still passed as tests are written in isolation. This is a good example of where TDD doesnt always expose runtime bugs. TypeCheck discovered this.

The solution: JsonValue is a general domain primitive, so it should have one canonical definition and I put that in domain/contracts.ts.
This may change and this is why I review my notes!

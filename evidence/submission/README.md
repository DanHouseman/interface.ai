# Curated submission evidence

These review copies satisfy the assignment's `/evidence/` location. Only this curated directory is selected for Git tracking; generated runs and the old reviewer ZIP remain excluded. A public push and submission email are separate steps.

| Directory | Evidence | Model / operator |
| --- | --- | --- |
| [genuine-discovery](./genuine-discovery/) | Genuine discovery, independent capability, automatic replay | OpenAI gpt-4.1-mini snapshot; four completed calls |
| [second-input-replay](./second-input-replay/) | Same capability with another member input | Zero model calls |
| [current-replay](./current-replay/) | Original genuine artifact under the fixed implementation | Zero model calls |
| [not-found](./not-found/) | MEMBER_NOT_FOUND business outcome | Zero model calls |
| [expired-session](./expired-session/) | Injected SESSION_EXPIRED intervention | Zero model calls |
| [replay-handoff](./replay-handoff/) | Same-session replay takeover and continuation | Automated operator callback; not a human acceptance run |
| [rejected-handback](./rejected-handback/) | Closed-page handback rejected | Automated negative test; not success |
| [discovery-handoff](./discovery-handoff/) | Discovery takeover, continuation, compilation and replay | Offline scripted discovery with a genuine human click and explicit handback |
| [privacy-regression](./privacy-regression/) | Wrong-type output fails without leaking its value | Modified output contract; expected INVALID_OUTPUT_TYPE |

The genuine source run is `cd70493f-ed42-4aa5-85e6-245d19b81f30`. Discovery handoff is separately labeled and is not a new LLM interoperability claim. The privacy-regression artifact changes one output type; other saved-artifact replay cases retain the original capability unchanged.

## Verify from a checkout

```sh
npm ci
npm run verify:evidence
```

The command uses the normal artifact parser. It checks checksums, artifact equality where required, provider provenance fields, outcome codes, handoff continuation, snapshot references, and specified sensitive values/credential patterns. It makes no model calls and opens no browser. These checks do not prove universal absence of secrets or independently authenticate provider execution.

## Provenance and portability

Snapshot paths are relative to their run directory. [PROVENANCE.json](./PROVENANCE.json) records original local source paths, original SHA-256 values, and normalization details. Some historical trace paths contained `[REDACTED]` instead of the session UUID. A reference was repaired only when directory and sequence uniquely identified one existing snapshot; no snapshot content was invented. Original run IDs, provider metadata, outcomes, and local source files remain unchanged.

[SHA256SUMS.json](./SHA256SUMS.json) covers every included file except itself. It detects changes, not authenticity. The source snapshots are structural and omit page text and values.

Use `evidence/submission/genuine-discovery/artifact.json` with port 4173 for a stable included replay example. The assignment requests a public repository URL, not a ZIP.

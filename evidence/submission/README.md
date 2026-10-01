# Submission evidence

Saved runs for the assignment. This is the only evidence directory tracked in Git. The table identifies which runs used a model, a script, a human, or an automated operator.

| Directory | What it shows | Model / operator |
| --- | --- | --- |
| [genuine-discovery](./genuine-discovery/) | Live discovery, saved capability, and automatic replay | OpenAI gpt-4.1-mini snapshot; four completed calls |
| [second-input-replay](./second-input-replay/) | Same capability with a different member input | Zero model calls |
| [current-replay](./current-replay/) | Original live-run artifact replayed after earlier fixes | Zero model calls |
| [not-found](./not-found/) | `MEMBER_NOT_FOUND` business outcome | Zero model calls |
| [expired-session](./expired-session/) | Injected expiry produces `SESSION_EXPIRED` | Zero model calls |
| [replay-handoff](./replay-handoff/) | Takeover and continuation in the same session | Automated operator |
| [rejected-handback](./rejected-handback/) | Handback fails after the browser closes | Automated negative test |
| [discovery-handoff](./discovery-handoff/) | Discovery pauses, a human acts, then discovery and replay complete | Scripted discovery; real human click and explicit handback |
| [legacy-discovery](./legacy-discovery/) | Structural targeting on the table-based surface, followed by replay | Scripted discovery; real Chromium |
| [legacy-second-input](./legacy-second-input/) | Same legacy artifact with a new input and a slow response | Zero model calls |
| [gap-current-replay](./gap-current-replay/) | Original live-run artifact replayed after the assignment-review fixes | Zero model calls |
| [expired-session-restored](./expired-session-restored/) | Expired-session takeover and continuation without repeated steps | Automated operator |
| [privacy-regression](./privacy-regression/) | Output type mismatch returns `INVALID_OUTPUT_TYPE` without persisting the sensitive value | Modified output contract |

The genuine OpenAI run is `cd70493f-ed42-4aa5-85e6-245d19b81f30`. The discovery handoff used a scripted model and a real human. These are separate runs. The automated handoff cases do not establish human acceptance.

The privacy regression deliberately changes one output type. The legacy runs use their own structural-targeting artifact. Standard saved-artifact replay cases retain the original capability.

## Verify

From the repository root:

```sh
npm ci
npm run verify:evidence
```

The verifier checks:

- File checksums and artifact schemas.
- Artifact equality where the same capability should have been reused.
- Provider metadata and expected result codes.
- Handoff continuation without repeated prefix actions.
- Snapshot references and portability.
- Specified sensitive values and credential patterns.

It opens no browser and makes no model calls. Passing these checks establishes consistency and file integrity. It does not independently authenticate the provider run or prove the absence of every possible secret.

The four later regression bundles contain `validation.json` with their fixture and operator details. Historical genuine-provider evidence is unchanged.

## Provenance

Snapshot paths are relative to each run directory. [PROVENANCE.json](./PROVENANCE.json) records the original source paths, hashes, and path-normalization changes for the historical bundles.

Some older traces had `[REDACTED]` in place of the session UUID in snapshot paths. Those references were repaired only when the directory and sequence identified exactly one existing snapshot. Snapshot contents, run IDs, provider metadata, outcomes, and original source files were preserved.

[SHA256SUMS.json](./SHA256SUMS.json) covers every included file except itself. Structural snapshots omit page text and values.

## Replay the included artifact

```sh
npm run demo -- replay \
  --artifact evidence/submission/genuine-discovery/artifact.json \
  --port 4173 \
  --member DEMO-002
```

The artifact is bound to port 4173. See the [main README](../../README.md) for setup, live discovery, other outcomes, and manual takeover.

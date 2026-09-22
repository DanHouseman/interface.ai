import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCapabilityArtifact } from '../dist/src/artifact/load-capability.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../evidence/submission');
const read = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
async function list(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    assert(!entry.isSymbolicLink(), 'Evidence must not contain symlinks');
    const path = join(directory, entry.name);
    return entry.isDirectory() ? list(path) : [path];
  }))).flat();
}
const hashes = await read('SHA256SUMS.json');
const files = (await list(root)).filter(path => relative(root, path) !== 'SHA256SUMS.json');
assert.deepEqual(files.map(path => relative(root, path)).sort(), Object.keys(hashes).sort(), 'Checksum inventory mismatch');
const forbidden = ['DEMO-001', 'DEMO-002', 'DEMO-999', '$123.45', '$678.90', 'SENSITIVE_MEMBER_CANARY_7F31A9', 'SENSITIVE_BALANCE_CANARY_91C2EF'];
let artifacts = 0;
for (const path of files) {
  const bytes = await readFile(path);
  const name = relative(root, path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hashes[name], `Checksum mismatch: ${name}`);
  if (!name.endsWith('.json')) continue;
  const text = bytes.toString('utf8');
  assert(!forbidden.some(value => text.includes(value)), `Sensitive sample value: ${name}`);
  assert(!/sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{10,}/.test(text), `Credential pattern: ${name}`);
  const value = JSON.parse(text);
  if (name.endsWith('/artifact.json')) { parseCapabilityArtifact(value); artifacts++; }
  const runRoot = join(root, name.split('/')[0]);
  async function references(node) {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (key === 'path' && typeof child === 'string') {
        assert(!isAbsolute(child), `Nonportable evidence reference: ${name}`);
        const target = resolve(runRoot, child);
        assert(!relative(runRoot, target).startsWith('..'), `Escaping evidence reference: ${name}`);
        await access(target);
      } else await references(child);
    }
  }
  await references(value);
}
const genuine = await read('genuine-discovery/discovery-manifest.json');
assert.equal(genuine.discoveryMode, 'live-model');
assert.equal(genuine.provider.provider, 'openai');
assert.equal(genuine.verifiedCompletion, true);
assert.equal(genuine.provider.calls.length, genuine.decisionCount);
assert(genuine.provider.calls.every(call => call.httpStatus === 200 && call.status === 'completed' && call.requestId && call.responseId));
const original = parseCapabilityArtifact(await read('genuine-discovery/artifact.json'));
assert.equal(original.provenance.discoveryRunId, genuine.runId);
for (const name of ['second-input-replay', 'current-replay', 'not-found', 'expired-session', 'replay-handoff', 'rejected-handback']) {
  const manifest = await read(`${name}/manifest.json`);
  assert.equal(manifest.provider, null);
  assert.equal(manifest.modelCallsDuringReplay, 0);
  assert.deepEqual(parseCapabilityArtifact(await read(`${name}/artifact.json`)), original);
}
for (const name of ['genuine-discovery', 'second-input-replay', 'current-replay', 'replay-handoff', 'discovery-handoff']) {
  assert.equal((await read(`${name}/replay.json`)).disposition, 'SUCCESS');
}
assert.equal((await read('not-found/replay.json')).code, 'MEMBER_NOT_FOUND');
assert.equal((await read('expired-session/replay.json')).code, 'SESSION_EXPIRED');
assert.equal((await read('rejected-handback/replay.json')).disposition, 'FAILURE');
assert.equal((await read('privacy-regression/replay.json')).code, 'INVALID_OUTPUT_TYPE');
const discovery = await read('discovery-handoff/discovery.json');
assert.equal((await read('discovery-handoff/discovery-manifest.json')).discoveryMode, 'offline-scripted-fixture');
assert(discovery.trace.some(event => event.kind === 'HANDOFF' && event.decision === 'continue'));
assert.equal(discovery.trace.filter(event => event.kind === 'ACTION' && event.capabilityStep.action.type === 'type').length, 1);
const handoff = await read('discovery-handoff/discovery-handoff.json');
assert.deepEqual(handoff.map(event => event.phase), ['paused', 'handback', 'resumed']);
assert.equal(handoff[0].owner, 'human');
assert.equal(handoff[2].owner, 'automation');
assert.equal(handoff[2].verified, true);
assert(handoff[1].actions.some(action => action.description === 'click BUTTON'));
console.log(`Submission evidence verified: ${files.length} hashed files, ${artifacts} parsed artifacts, zero tested sensitive matches; all referenced snapshots resolve.`);

import { createServer, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, access } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { chromium } from 'playwright';
import { z } from 'zod';
import { runDemo, type DemoOptions } from '../demo/run-demo.js';
import type { DiscoveryModel } from '../discovery/discovery-contracts.js';
import { ScriptedDemoModel } from '../demo/scripted-model.js';
import { OpenAIDiscoveryModel } from '../discovery/openai-discovery-model.js';
import { parseCapabilityArtifact } from '../artifact/load-capability.js';
import { ExecutionError } from '../runtime/errors.js';
import { StateStream } from './state-stream.js';

const invocation = z.object({
  application: z.literal('synthetic-member-desk'), goal: z.string().trim().min(1).max(2000),
  mode: z.enum(['offline', 'discover', 'replay', 'handoff']),
  memberId: z.string().regex(/^DEMO-\d{3}$/),
  port: z.number().int().min(1024).max(65535),
  scenario: z.enum(['normal', 'slow', 'expired', 'denied', 'handoff', 'discovery-handoff']),
  headed: z.boolean(), slowMoMs: z.number().int().min(0).max(5000),
  artifactId: z.string().optional(), liveConsent: z.boolean().default(false),
}).strict();
type Entry = { id: string; name: string; path: string; port: number; steps: number; inputs: unknown; created: string };
type Run = { id: string; mode: string; status: string; phase: string; started: string; ended?: string; modelCalls: number; modelCallsDuringReplay: number; events: { time: string; message: string }[]; code?: string; disposition?: string; directory?: string; handoff?: { id: string; reason: string } };
type Active = { run: Run; abort: AbortController; settle?: (resume: boolean) => void };
export async function startGui(options: { port?: number; root?: string; execute?: typeof runDemo; environment?: NodeJS.ProcessEnv } = {}) {
  const root = resolve(options.root ?? process.cwd());
  const execute = options.execute ?? runDemo;
  const env = options.environment ?? process.env;
  let key = env.OPENAI_API_KEY ?? '', modelName = env.MODEL_NAME ?? '';
  const token = randomUUID();
  const runs: Run[] = [];
  let active: Active | undefined;
  const stream = new StateStream();
  let library = new Map<string, Entry>();
  let browserInstalled = false;
  const snapshot = () => ({ token, setup: { browserInstalled, credentialsConfigured: Boolean(key && modelName), modelName, node: process.version }, capabilities: [...library.values()].map(({ path: _path, ...entry }) => entry), runs });
  const publish = () => stream.publish(snapshot());
  // Serialize explicit refreshes so an older scan cannot overwrite a newer one.
  let refreshPending = Promise.resolve();
  function refreshLibrary(): Promise<void> {
    refreshPending = refreshPending.then(async () => {
      library = await scan(join(root, 'evidence'));
      browserInstalled = await access(chromium.executablePath()).then(() => true, () => false);
    });
    return refreshPending;
  }
  async function scan(directory: string, depth = 0, library = new Map<string, Entry>()): Promise<Map<string, Entry>> {
    if (depth > 4) return library;
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path, depth + 1, library);
      if (!entry.isFile() || entry.name !== 'artifact.json') continue;
      try {
        const artifact = parseCapabilityArtifact(JSON.parse(await readFile(path, 'utf8')));
        const targets = artifact.policy.permittedTargets;
        const url = new URL(targets[0]!);
        if (artifact.application.family !== 'synthetic-member-desk' || artifact.capability.id !== 'member.lookup' || targets.length !== 1 || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port) continue;
        const id = relative(root, path);
        library.set(id, { id, path, name: artifact.capability.name, port: Number(url.port), steps: artifact.steps.length, inputs: artifact.contract.inputs, created: id.split('/').at(-2)! });
      } catch { /* Invalid/unsupported artifacts are never selectable. */ }
    }
    return library;
  }
  const event = (run: Run, message: string) => { run.phase = message; run.events.push({ time: new Date().toISOString(), message }); publish(); };
  async function body(req: IncomingMessage) {
    let text = '';
    for await (const part of req) { text += part; if (Buffer.byteLength(text) > 16384) throw new Error('REQUEST_TOO_LARGE'); }
    return JSON.parse(text);
  }
  const server = createServer(async (req, res) => {
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') { json(403, { error: 'LOCAL_ORIGIN_REQUIRED' }); return; }
    const path = String(req.url);
    try {
      if (req.method === 'GET' && ['/', '/panel.js', '/panel.css'].includes(path)) {
        const file = path === '/' ? 'index.html' : path!.slice(1);
        const content = await readFile(join(root, 'src/gui', file));
        res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript' : 'text/css', 'Cache-Control': 'no-store' }); res.end(content); return;
      }
      if (req.method === 'GET' && (path === '/api/state' || path === '/api/events')) {
        await refreshLibrary();
        if (path === '/api/events') stream.subscribe(res, snapshot());
        else json(200, snapshot());
        return;
      }
      if (req.method !== 'POST') { json(404, { error: 'NOT_FOUND' }); return; }
      if (req.headers['x-gui-token'] !== token || req.headers['content-type'] !== 'application/json') { json(403, { error: 'SESSION_TOKEN_REQUIRED' }); return; }
      const input = await body(req);
      if (path === '/api/setup') {
        if (active) { json(409, { error: 'RUN_ACTIVE' }); return; }
        const parsed = z.object({ apiKey: z.string().max(512), model: z.string().trim().min(1).max(128) }).strict().parse(input);
        if (parsed.apiKey) key = parsed.apiKey;
        modelName = parsed.model; publish(); json(200, { ok: true }); return;
      }
      if (path === '/api/control') {
        const control = z.object({ runId: z.string(), action: z.enum(['resume', 'cancel']), handoffId: z.string().optional() }).strict().parse(input);
        if (!active || active.run.id !== control.runId) { json(409, { error: 'RUN_NOT_ACTIVE' }); return; }
        if (control.action === 'cancel') { active.run.status = 'cancelling'; active.abort.abort(); active.settle?.(false); }
        else {
          if (!active.settle || active.run.handoff?.id !== control.handoffId) { json(409, { error: 'HANDOFF_NOT_PENDING' }); return; }
          active.settle(true);
        }
        publish(); json(200, { ok: true }); return;
      }
      if (path !== '/api/run') { json(404, { error: 'NOT_FOUND' }); return; }
      if (input.application !== 'synthetic-member-desk') { json(400, { error: 'UNSUPPORTED_TARGET_OR_GOAL', message: 'Only Synthetic Member Desk is supported. Goals use the member-lookup contract; arbitrary URLs and desktop applications cannot be attached.' }); return; }
      const parsed = invocation.parse(input);
      if (active) { json(409, { error: 'RUN_ACTIVE' }); return; }
      const saved = parsed.mode === 'replay' || parsed.mode === 'handoff';
      const library = await scan(join(root, 'evidence'));
      if (active) { json(409, { error: 'RUN_ACTIVE' }); return; }
      const entry = parsed.artifactId ? library.get(parsed.artifactId) : undefined;
      if (saved && !entry) { json(400, { error: 'SAVED_CAPABILITY_REQUIRED' }); return; }
      if (parsed.mode === 'discover' && (!key || !modelName || !parsed.liveConsent)) { json(400, { error: 'LIVE_SETUP_AND_CONSENT_REQUIRED' }); return; }
      const run: Run = { id: randomUUID(), mode: parsed.mode, status: 'running', phase: 'Starting', started: new Date().toISOString(), modelCalls: 0, modelCallsDuringReplay: 0, events: [] };
      const current: Active = { run, abort: new AbortController() };
      active = current; runs.unshift(run); if (runs.length > 100) runs.pop();
      const config: DemoOptions = {
        goal: parsed.goal, target: parsed.application,
        directory: join(root, 'evidence/gui'), memberId: parsed.memberId, port: saved ? entry!.port : parsed.port,
        scenario: parsed.mode === 'handoff' ? 'handoff' : parsed.scenario, live: parsed.mode === 'discover',
        headless: !parsed.headed, slowMoMs: parsed.slowMoMs, signal: current.abort.signal,
        onProgress: phase => event(run, phase),
        operator: async (_page, request, signal) => {
          if (current.abort.signal.aborted || signal?.aborted) throw new Error('CANCELLED');
          run.status = 'paused'; run.handoff = { id: request.id, reason: request.reason }; event(run, 'Human control: resolve the block in the same application window, then return control.');
          await new Promise<void>((resolve, reject) => {
            const cancel = () => finish(false);
            const timer = setTimeout(cancel, 300000);
            const finish = (resume: boolean) => {
              clearTimeout(timer); signal?.removeEventListener('abort', cancel); current.abort.signal.removeEventListener('abort', cancel);
              delete current.settle; delete run.handoff;
              if (resume) { run.status = 'running'; event(run, 'Verifying handback in the same session'); resolve(); }
              else reject(new Error('INTERVENTION_CANCELLED'));
            };
            current.settle = finish;
            signal?.addEventListener('abort', cancel, { once: true }); current.abort.signal.addEventListener('abort', cancel, { once: true });
          });
        },
        ...(saved ? { artifactPath: entry!.path } : {}),
      };
      // There is deliberately no model construction or model dependency on saved replay.
      if (!saved) {
        const model: DiscoveryModel = parsed.mode === 'discover' ? new OpenAIDiscoveryModel(key, modelName) : new ScriptedDemoModel();
        Object.assign(config, { model: { decide: async (...args: Parameters<typeof model.decide>) => { if (parsed.mode === 'discover') { run.modelCalls++; publish(); } return model.decide(...args); }, metadata: () => model.metadata?.() ?? {} } });
      }
      event(run, saved ? 'Saved capability selected; model disabled' : parsed.mode === 'discover' ? 'Live discovery authorized' : 'Offline scripted discovery; no model API calls');
      json(202, { runId: run.id });
      void execute(config).then(completed => {
        run.directory = relative(root, completed.directory); run.code = completed.result.code; run.disposition = completed.result.disposition;
        run.status = current.abort.signal.aborted ? 'cancelled' : 'completed'; event(run, `${completed.result.disposition}: ${completed.result.code}`);
      }).catch(error => {
        run.status = current.abort.signal.aborted ? 'cancelled' : 'failed';
        run.code = error instanceof ExecutionError ? error.code : 'RUN_FAILED';
        event(run, run.status === 'cancelled' ? 'Cancelled; browser session closed' : `${run.code}: Check setup, application port and saved evidence.`);
      }).finally(async () => {
        run.ended = new Date().toISOString(); delete run.handoff; active = undefined;
        publish();
        await refreshLibrary(); publish();
      });
    } catch { json(400, { error: 'INVALID_REQUEST', message: 'Check the fields and try again.' }); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 4310, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: async () => { stream.close(); active?.abort.abort(); active?.settle?.(false); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

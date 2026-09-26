import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium, type Page } from 'playwright';
import { mkdtemp, cp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, Server } from 'node:net';
import { request } from 'node:http';
import { startGui } from '../src/gui/server.js';
import { runDemo, type DemoOptions } from '../src/demo/run-demo.js';
import { OpenAIDiscoveryModel } from '../src/discovery/openai-discovery-model.js';
import type { CapabilityArtifact } from '../src/artifact/capability-schema.js';
import type { InterventionRequest } from '../src/hitl/intervention.js';
import type { ReplayResult } from '../src/replay/replay-contracts.js';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.restoreAllMocks(); vi.resetModules(); vi.unstubAllEnvs(); });
async function freePort() { const server = createServer(); await new Promise<void>(r => server.listen(0,'127.0.0.1',r)); const port = (server.address() as {port:number}).port; await new Promise<void>(r => server.close(() => r())); return port; }
async function setup(execute?: typeof runDemo, environment:NodeJS.ProcessEnv = {}) {
  const root = await mkdtemp(join(tmpdir(), 'interface-gui-')); cleanups.push(() => rm(root,{recursive:true,force:true}));
  await cp('src/gui', join(root,'src/gui'), { recursive:true });
  const gui = await startGui({ root, port:0, environment, ...(execute ? {execute}: {}) }); cleanups.push(gui.close);
  const state = async () => (await fetch(gui.url+'/api/state')).json();
  const token = (await state()).token as string;
  const post = (path:string, body:unknown, headers:Record<string,string> = {}) => fetch(gui.url+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Gui-Token':token,...headers},body:JSON.stringify(body)});
  return { root, gui, state, post };
}
const input = { application:'synthetic-member-desk', goal:'Find the supplied member and read the savings balance', mode:'offline',memberId:'DEMO-001',port:4173,scenario:'normal',headed:false,slowMoMs:0 };
const successResult: ReplayResult = { disposition:'SUCCESS', code:'SUCCESS', message:'Success', trace:[] };
const completed = (directory:string) => ({ directory, result:successResult, artifact:{} as CapabilityArtifact });
const interventionRequest: InterventionRequest = {
  id:'handoff', invocationId:'invocation', capabilityId:'member.lookup', reason:'blocked',
  observation:{ surfaceKind:'browser', timestamp:new Date(0).toISOString(), signals:{} },
  evidence:{ id:'evidence', kind:'trace', metadata:{} },
};

describe('local control panel', () => {
  it('pushes state without polling, reconnects after restart, and closes streams on navigation', async () => {
    let finish!: () => void;
    let progress!: (phase: string) => void;
    const execute: typeof runDemo = async options => {
      progress = options.onProgress!;
      await new Promise<void>(resolve => { finish = resolve; });
      return completed(process.cwd());
    };
    const { gui, root, post } = await setup(execute);
    const browser = await chromium.launch({ headless: true }); cleanups.push(() => browser.close());
    const page = await browser.newPage();
    const calls: string[] = [];
    const errors: string[] = [];
    page.on('request', request => calls.push(new URL(request.url()).pathname));
    page.on('pageerror', error => errors.push(error.message));
    // The browser must never use the snapshot endpoint, even after mutations.
    await page.route('**/api/state', route => route.abort());
    await page.clock.install();
    await page.goto(gui.url);
    await page.waitForFunction(() => document.querySelector('#connection')?.textContent?.includes('Connected'));
    await page.clock.fastForward(10000);
    expect(calls.filter(path => path === '/api/events')).toHaveLength(1);
    expect(calls.filter(path => path === '/api/state')).toHaveLength(0);
    await post('setup', { apiKey: 'sse-secret', model: 'push-model' });
    await page.waitForFunction(() => document.querySelector('#setup-status')?.textContent?.includes('Live discovery configured'));
    expect(await page.locator('#model').inputValue()).toBe('push-model');
    const { runId } = await (await post('run', input)).json();
    progress('Progress delivered by server push');
    await page.waitForFunction(() => document.querySelector('#phase')?.textContent === 'Progress delivered by server push');
    await page.locator('#cancel').click();
    await page.waitForFunction(() => document.querySelector('#run-status')?.textContent === 'cancelling');
    finish();
    await page.waitForFunction(() => document.querySelector('#run-status')?.textContent === 'cancelled');
    expect(runId).toBeTruthy();
    expect(calls.filter(path => path === '/api/state')).toHaveLength(0);
    await page.clock.resume();
    await gui.close();
    await page.waitForFunction(() => document.querySelector('#connection')?.textContent?.includes('Disconnected'));
    await page.locator('#mode').selectOption('replay');
    expect(await page.locator('#start').isDisabled()).toBe(true);
    expect(await page.locator('#resume').isDisabled()).toBe(true);
    expect(await page.locator('#cancel').isDisabled()).toBe(true);
    const restarted = await startGui({ root, port: Number(new URL(gui.url).port), execute, environment: {} });
    cleanups.push(restarted.close);
    await page.waitForFunction(() => document.querySelector('#connection')?.textContent?.includes('Connected'));
    expect(await page.locator('#history').textContent()).toContain('Your runs will appear here');
    expect(await page.locator('#run-status').textContent()).toBe('Idle');
    // Commands use the new launcher's token after automatic reconnection.
    await page.locator('#setup-status').locator('..').locator('summary').click();
    await page.locator('#model').fill('restarted-model');
    await page.locator('#setup button').click();
    await page.waitForFunction(() => document.querySelector('#setup-saved')?.textContent?.includes('Saved'));
    expect(await page.locator('#error').isVisible()).toBe(false);
    // Manual refresh loads artifacts added outside this launcher, using a fresh stream.
    await mkdir(join(root, 'evidence/imported'), { recursive: true });
    await cp('evidence/submission/genuine-discovery/artifact.json', join(root, 'evidence/imported/artifact.json'));
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.querySelectorAll('#artifact option').length === 1);
    expect(calls.filter(path => path === '/api/state')).toHaveLength(0);
    expect(errors).toEqual([]);
    await page.goto('about:blank');
    await restarted.close();
  }, 30000);

  it('rejects unsupported targets, unsafe requests, missing artifacts and unconsented live calls before execution', async () => {
    const execute = vi.fn<typeof runDemo>(); const {gui,post,state} = await setup(execute);
    expect((await fetch(gui.url+'/')).headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    for (const path of ['/panel.js','/panel.css']) expect((await fetch(gui.url+path)).status).toBe(200);
    expect((await fetch(gui.url+'/missing')).status).toBe(404);
    expect((await fetch(gui.url+'/api/state',{headers:{Origin:'https://evil.invalid'}})).status).toBe(403);
    expect((await fetch(gui.url+'/api/events',{headers:{Origin:'https://evil.invalid'}})).status).toBe(403);
    expect((await fetch(gui.url+'/api/events',{headers:{'Sec-Fetch-Site':'cross-site'}})).status).toBe(403);
    expect(await new Promise<number | undefined>(resolve => { const req=request(gui.url+'/api/state',{headers:{Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.end(); })).toBe(403);
    expect((await post('run',input,{'X-Gui-Token':'wrong'})).status).toBe(403);
    expect((await post('run',{...input,application:'https://example.com'})).status).toBe(400);
    expect(await (await post('run',{...input,goal:'   '})).json()).toMatchObject({error:'INVALID_REQUEST'});
    expect((await post('run',{...input,memberId:'secret'})).status).toBe(400);
    expect((await post('run',{...input,mode:'replay',artifactId:'../../etc/passwd'})).status).toBe(400);
    expect((await post('run',{...input,mode:'discover'})).status).toBe(400);
    expect((await post('setup',{apiKey:'fake-key',model:'fake-model'})).status).toBe(200);
    expect(JSON.stringify(await state())).not.toContain('fake-key');
    expect((await post('run',{...input,mode:'discover',liveConsent:false})).status).toBe(400);
    expect((await post('control',{runId:'absent',action:'resume'})).status).toBe(409);
    expect((await post('unknown',{})).status).toBe(404);
    expect(execute).not.toHaveBeenCalled();
  });

  it('completes discovery, new-input replay and same-session handoff through HTML without file editing or model calls', async () => {
    const model = vi.spyOn(OpenAIDiscoveryModel.prototype,'decide').mockRejectedValue(new Error('MODEL_MUST_NOT_RUN'));
    let applicationPage: Page | undefined;
    const configurations: DemoOptions[] = [];
    const execute: typeof runDemo = options => {
      configurations.push(options);
      return runDemo({...options, headless:true, operator:async (page,request,signal) => { applicationPage=page; await options.operator!(page,request,signal); }});
    };
    const {gui,state,post,root} = await setup(execute);
      await mkdir(join(root,'evidence/deep/a/b/c/d/e'), { recursive:true });
      await mkdir(join(root,'evidence/bad'), { recursive:true });
      await writeFile(join(root,'evidence/bad/artifact.json'), '{');
    const browser = await chromium.launch({headless:true}); cleanups.push(() => browser.close());
    const page = await browser.newPage(); const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(gui.url); await page.waitForFunction(() => document.querySelector('#connection')?.textContent?.includes('Connected'));
    await page.locator('#application').selectOption('unsupported'); expect(await page.locator('#start').isDisabled()).toBe(true); expect(await page.locator('#unsupported').isVisible()).toBe(true);
    await page.locator('#application').selectOption('synthetic-member-desk');
    await page.locator('#run-form details summary').click();
    await page.locator('#port').fill(String(await freePort())); await page.locator('#slow').fill('0'); await page.locator('#headed').uncheck();
    await page.locator('#goal').fill('Look up the supplied member and return the savings balance');
    await page.locator('#start').click();
    await expect.poll(async () => (await state()).runs[0]?.status,{timeout:20000}).toBe('completed');
    await expect.poll(async () => (await state()).capabilities.length).toBe(1);
    await page.locator('#mode').selectOption('replay'); await page.locator('#member').fill('DEMO-002');
    await expect.poll(() => page.locator('#start').isEnabled()).toBe(true); await page.locator('#start').click();
    await expect.poll(async () => (await state()).runs[0]?.mode,{timeout:5000}).toBe('replay');
    await expect.poll(async () => (await state()).runs[0]?.status,{timeout:20000}).toBe('completed');
    const replay = (await state()).runs[0]; expect(replay.disposition).toBe('SUCCESS');
    const manifest = JSON.parse(await readFile(join(root,replay.directory,'manifest.json'),'utf8')); expect(manifest.modelCallsDuringReplay).toBe(0);
    expect(configurations[0]!.goal).toBe('Look up the supplied member and return the savings balance');
    expect(configurations[0]!.target).toBe('synthetic-member-desk');
    expect(configurations[1]!.model).toBeUndefined(); expect(configurations[1]!.memberId).toBe('DEMO-002');
    await page.locator('#mode').selectOption('handoff'); await expect.poll(() => page.locator('#start').isEnabled()).toBe(true); await page.locator('#start').click();
    await expect.poll(async () => (await state()).runs[0]?.status,{timeout:20000}).toBe('paused');
    const paused = (await state()).runs[0];
    expect((await post('control',{runId:paused.id,action:'resume',handoffId:'stale'})).status).toBe(409);
    expect((await post('run',input)).status).toBe(409);
    await applicationPage!.locator('#unblock').click();
    await page.locator('#resume').click();
    await expect.poll(async () => (await state()).runs[0]?.status,{timeout:20000}).toBe('completed');
    const handedBack = (await state()).runs[0]; expect(handedBack.disposition).toBe('SUCCESS');
    const handoff = JSON.parse(await readFile(join(root,handedBack.directory,'handoff.json'),'utf8'));
    expect(handoff.map((x:{phase:string})=>x.phase)).toEqual(['paused','handback','resumed']);
    expect(model).not.toHaveBeenCalled(); expect(errors).toEqual([]);
    await page.setViewportSize({width:390,height:844}); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  },60000);

  it('handles active setup, invalid bodies, cross-site fetches, model metadata and failed run reporting', async () => {
    let failRun!: () => void;
    const execute = vi.fn<typeof runDemo>(async options => {
      options.onProgress?.('Executing test run');
      expect(options.model?.metadata?.()).toEqual({});
      await new Promise<void>(resolve => { failRun = resolve; });
      throw new Error('boom');
    });
    const {gui,post,state} = await setup(execute);
    const port = await freePort();
    expect((await fetch(gui.url+'/api/state',{headers:{'Sec-Fetch-Site':'cross-site'}})).status).toBe(403);
    expect((await post('setup',{apiKey:'',model:'fixture-model'})).status).toBe(200);
    expect((await state()).setup.credentialsConfigured).toBe(false);
    expect((await post('run',{...input,port})).status).toBe(202);
    await expect.poll(async () => (await state()).runs[0]?.status,{timeout:5000}).toBe('running');
    expect((await post('setup',{apiKey:'new-key',model:'other-model'})).status).toBe(409);
    expect((await post('run',{...input,port})).status).toBe(409);
    failRun();
    await expect.poll(async () => (await state()).runs[0]?.status,{timeout:5000}).toBe('failed');
    const failed = (await state()).runs[0];
    expect(failed.code).toBe('RUN_FAILED');
    expect(failed.phase).toContain('RUN_FAILED: Check setup');
    expect((await post('run','x'.repeat(17000))).status).toBe(400);
    expect((await fetch(gui.url+'/api/run',{method:'POST',headers:{'Content-Type':'application/json','X-Gui-Token':(await state()).token},body:'{'})).status).toBe(400);
    expect(execute).toHaveBeenCalledTimes(1);
  },10000);

  it('covers artifact filtering, browser setup failure, live model wrapping and active races', async () => {
    const missingBrowser = vi.spyOn(chromium,'executablePath').mockReturnValue('/missing-chromium-for-gui-test');
    const {root: scanRoot, state: scanState} = await setup();
    expect((await scanState()).setup.browserInstalled).toBe(false);
    missingBrowser.mockRestore();
    const unsupported = JSON.parse(await readFile('evidence/submission/genuine-discovery/artifact.json','utf8'));
    unsupported.application.family = 'other-app';
    await mkdir(join(scanRoot,'evidence/unsupported'), { recursive:true });
    await writeFile(join(scanRoot,'evidence/unsupported/artifact.json'), JSON.stringify(unsupported));
    expect((await scanState()).capabilities).toEqual([]);

    let finishRace!: () => void;
    const raceExecute = vi.fn<typeof runDemo>(async () => { await new Promise<void>(resolve => { finishRace = resolve; }); return completed(scanRoot); });
    const {post: racePost, state: raceState} = await setup(raceExecute);
    const port = await freePort();
    const race = await Promise.all([racePost('run',{...input,port}), racePost('run',{...input,port})]);
    expect(race.map(response => response.status).sort()).toEqual([202,409]);
    finishRace();
    await expect.poll(async () => (await raceState()).runs[0]?.status,{timeout:5000}).toBe('completed');

    const decide = vi.spyOn(OpenAIDiscoveryModel.prototype,'decide').mockResolvedValue({ kind:'complete', rationale:'done' });
    const liveExecute = vi.fn<typeof runDemo>(async options => {
      expect(options.live).toBe(true);
      expect(options.model?.metadata?.()).toMatchObject({ provider:'openai', model:'gpt-test' });
      await options.model!.decide({} as never);
      return completed(scanRoot);
    });
    const {post: livePost, state: liveState} = await setup(liveExecute,{OPENAI_API_KEY:'key',MODEL_NAME:'gpt-test'});
    expect((await livePost('run',{...input,mode:'discover',liveConsent:true,port:await freePort()})).status).toBe(202);
    await expect.poll(async () => (await liveState()).runs[0]?.status,{timeout:5000}).toBe('completed');
    expect((await liveState()).runs[0].modelCalls).toBe(1);
    expect(decide).toHaveBeenCalledOnce();
  },15000);

  it('trims run history, reports completed cancellations and rejects aborted operator callbacks', async () => {
    const trimExecute = vi.fn<typeof runDemo>(async () => completed(process.cwd()));
    const {post,state} = await setup(trimExecute);
    const port = await freePort();
    for (let index = 0; index < 101; index++) {
      expect((await post('run',{...input,port})).status).toBe(202);
      await expect.poll(async () => (await state()).runs[0]?.status,{timeout:5000}).toBe('completed');
    }
    expect((await state()).runs).toHaveLength(100);

    let finishCancelled!: () => void;
    const cancelExecute = vi.fn<typeof runDemo>(async () => { await new Promise<void>(resolve => { finishCancelled = resolve; }); return completed(process.cwd()); });
    const {post: cancelPost, state: cancelState} = await setup(cancelExecute);
    expect((await cancelPost('run',{...input,port:await freePort()})).status).toBe(202);
    await expect.poll(async () => (await cancelState()).runs[0]?.status,{timeout:5000}).toBe('running');
    const cancelling = (await cancelState()).runs[0];
    expect((await cancelPost('control',{runId:cancelling.id,action:'cancel'})).status).toBe(200);
    finishCancelled();
    await expect.poll(async () => (await cancelState()).runs[0]?.status,{timeout:5000}).toBe('cancelled');

    const abortExecute = vi.fn<typeof runDemo>(async options => {
      const controller = new AbortController(); controller.abort();
      await expect(options.operator!({} as Page,interventionRequest,controller.signal)).rejects.toThrow('CANCELLED');
      return completed(process.cwd());
    });
    const {post: abortPost, state: abortState} = await setup(abortExecute);
    expect((await abortPost('run',{...input,port:await freePort()})).status).toBe(202);
    await expect.poll(async () => (await abortState()).runs[0]?.status,{timeout:5000}).toBe('completed');
  },30000);

  it('uses startGui defaults without requiring caller-supplied root, environment or port', async () => {
    const cwdGui = await startGui({ port:0, execute:async () => completed(process.cwd()) });
    cleanups.push(cwdGui.close);
    expect((await fetch(cwdGui.url+'/api/state')).status).toBe(200);
    // Verify the default argument without competing with an actual running GUI.
    const originalListen = Server.prototype.listen;
    const listen = vi.spyOn(Server.prototype, 'listen').mockImplementation(function(this: Server, ...args: unknown[]) {
      if (args[0] === 4310) args[0] = 0;
      return Reflect.apply(originalListen, this, args) as Server;
    } as typeof originalListen);
    const defaultPortGui = await startGui({ root:process.cwd(), execute:async () => completed(process.cwd()), environment:{} });
    cleanups.push(defaultPortGui.close);
    expect(listen).toHaveBeenCalledWith(4310, '127.0.0.1', expect.any(Function));
    expect((await fetch(defaultPortGui.url+'/api/state')).status).toBe(200);
  });

  it('starts, stops and validates the launcher entrypoint', async () => {
    const originalExitCode = process.exitCode;
    const start = vi.fn();
    const close = vi.fn(async () => {});
    start.mockResolvedValue({ url:'http://127.0.0.1:4321', close });
    vi.doMock('../src/gui/server.js', () => ({ startGui:start }));
    const log = vi.spyOn(console,'log').mockImplementation(() => {});
    const error = vi.spyOn(console,'error').mockImplementation(() => {});
    const exit = vi.spyOn(process,'exit').mockImplementation((() => undefined) as (code?: string | number | null | undefined) => never);
    const handlers = new Map<string | symbol, NodeJS.SignalsListener>();
    const once = vi.spyOn(process,'once').mockImplementation(((event:string | symbol, listener:NodeJS.SignalsListener) => { handlers.set(event, listener); return process; }) as typeof process.once);
    delete process.env.GUI_PORT;
    await import(/* @vite-ignore */ `../src/gui/launcher.js?default=${Date.now()}`);
    expect(start).toHaveBeenCalledWith({ port:4310 });
    vi.resetModules();
    vi.stubEnv('GUI_PORT','4321');
    await import(/* @vite-ignore */ `../src/gui/launcher.js?ok=${Date.now()}`);
    expect(start).toHaveBeenCalledWith({ port:4321 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('http://127.0.0.1:4321'));
    handlers.get('SIGINT')?.('SIGINT');
    handlers.get('SIGTERM')?.('SIGTERM');
    await expect.poll(() => close.mock.calls.length).toBe(2);
    expect(exit).toHaveBeenCalledWith(0);
    vi.resetModules(); vi.doMock('../src/gui/server.js', () => ({ startGui:start.mockRejectedValueOnce(new Error('busy')) }));
    vi.stubEnv('GUI_PORT','4322'); process.exitCode = undefined;
    await import(/* @vite-ignore */ `../src/gui/launcher.js?fail=${Date.now()}`);
    await expect.poll(() => process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith('Control panel could not start. Check GUI_PORT is available.');
    vi.resetModules(); vi.stubEnv('GUI_PORT','bad');
    await expect(import(/* @vite-ignore */ `../src/gui/launcher.js?bad=${Date.now()}`)).rejects.toThrow('GUI_PORT must be between 1024 and 65535');
    process.exitCode = originalExitCode;
    once.mockRestore(); exit.mockRestore(); log.mockRestore(); error.mockRestore();
  });

  it('closes a browser on abort even when the abort close already failed', async () => {
    vi.resetModules();
    const browser = { close:vi.fn().mockRejectedValueOnce(new Error('already closed')).mockResolvedValueOnce(undefined) };
    const app = { close:vi.fn(async () => {}), url:'http://127.0.0.1:4173/' };
    vi.doMock('playwright', () => ({ chromium:{ launch:vi.fn(async () => browser) } }));
    vi.doMock('../src/demo/target-app.js', () => ({ startDemoApp:vi.fn(async () => app) }));
    const { runDemo: isolatedRunDemo } = await import('../src/demo/run-demo.js');
    const signal = { aborted:false, throwIfAborted:vi.fn(), addEventListener:vi.fn((_event:string, listener:() => void) => listener()), removeEventListener:vi.fn() } as unknown as AbortSignal;
    await expect(isolatedRunDemo({ directory:await mkdtemp(join(tmpdir(),'interface-run-demo-')), memberId:'DEMO-001', port:4173, scenario:'normal', live:false, signal })).rejects.toThrow('DISCOVERY_MODEL_REQUIRED');
    await Promise.resolve(); await Promise.resolve();
    expect(browser.close).toHaveBeenCalledTimes(2);
    expect(app.close).toHaveBeenCalledOnce();
    browser.close.mockClear().mockResolvedValue(undefined);
    const alreadyAborted = { aborted:true, throwIfAborted:vi.fn(), addEventListener:vi.fn(), removeEventListener:vi.fn() } as unknown as AbortSignal;
    await expect(isolatedRunDemo({ directory:await mkdtemp(join(tmpdir(),'interface-run-demo-')), memberId:'DEMO-001', port:4173, scenario:'normal', live:false, signal:alreadyAborted })).rejects.toThrow('DISCOVERY_MODEL_REQUIRED');
    expect(browser.close).toHaveBeenCalledTimes(2);
  });

  it('cancels a paused run and rejects premature resume without bypassing handback checks', async () => {
    const {post,state} = await setup(options => runDemo({...options,headless:true}));
    const port = await freePort();
    await post('run',{...input,port,scenario:'discovery-handoff'});
    await expect.poll(async () => (await state()).runs[0]?.status,{timeout:15000}).toBe('paused');
    const paused=(await state()).runs[0];
    expect((await post('control',{runId:paused.id,action:'cancel'})).status).toBe(200);
    await expect.poll(async () => (await state()).runs[0]?.status,{timeout:15000}).toBe('cancelled');
    await post('run',{...input,port,scenario:'discovery-handoff'});
    await expect.poll(async () => (await state()).runs[0]?.status,{timeout:15000}).toBe('paused');
    const next=(await state()).runs[0];
    await post('control',{runId:next.id,action:'resume',handoffId:next.handoff.id});
    await expect.poll(async () => (await state()).runs[0]?.status,{timeout:15000}).toBe('failed');
    expect((await state()).runs[0].code).toBe('DEMO_DISCOVERY_FAILED');
  },60000);
});

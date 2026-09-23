import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { OpenAIDiscoveryModel } from "../discovery/openai-discovery-model.js";
import { ScriptedDemoModel } from "./scripted-model.js";
import { runDemo, type DemoOptions } from "./run-demo.js";
import { ExecutionError } from "../runtime/errors.js";

export interface CliIO { readonly log: (message: string) => void; readonly ask: (message: string, signal?: AbortSignal) => Promise<string>; }

const usage = `Usage:
  npm run demo -- offline [--headed] [--slow-mo 300]
  npm run demo -- discover --live [--operator] [--headed]
  npm run demo -- replay --artifact PATH [--headed] [--slow-mo 300]
  npm run demo -- handoff --artifact PATH

All modes accept --port 4173 --member DEMO-001 --evidence DIRECTORY.
Offline/discover/replay are headless by default; --headed shows Chromium.
Handoff and --operator always open a visible browser. Leave it open for handback.
Use --scenario discovery-handoff with offline/discover --operator to test takeover.
OPENAI_API_KEY and MODEL_NAME are required for live discovery. Offline/replay need neither.`;

// Milestone 13 | Assignment §6 | REQ-OPS-002/003
// Live billing requires BOTH 'discover' and '--live'. No test/default command can
// accidentally spend model credits, even when an API key is present in the environment.
export async function main(args: string[], environment: NodeJS.ProcessEnv = process.env, execute = runDemo, io: CliIO = terminalIO()): Promise<void> {
  try { await runCli(args, environment, execute, io); }
  catch (error) {
    if (error instanceof ExecutionError && ["DEMO_DISCOVERY_FAILED", "DEMO_CONFIGURATION", "ARTIFACT_READ_FAILED", "ARTIFACT_INVALID", "ARTIFACT_ORIGIN_MISMATCH", "DEMO_SERVER_UNAVAILABLE", "BROWSER_LAUNCH_FAILED"].includes(error.code)) io.log(`${error.code}: ${error.message}`);
    throw error;
  }
}
async function runCli(args: string[], environment: NodeJS.ProcessEnv, execute: typeof runDemo, io: CliIO): Promise<void> {
  if (args.length === 0 || args.includes("--help")) { io.log(usage); return; }
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    headed: { type: "boolean", default: false }, "slow-mo": { type: "string", default: "0" },
    operator: { type: "boolean", default: false },
    live: { type: "boolean", default: false }, artifact: { type: "string" }, member: { type: "string", default: "DEMO-001" },
    port: { type: "string", default: "4173" }, scenario: { type: "string", default: "normal" }, evidence: { type: "string", default: "evidence/runs" },
  } });
  const command = positionals[0];
  if (!["offline", "discover", "replay", "handoff"].includes(command ?? "")) throw new ExecutionError("DEMO_CONFIGURATION", usage);
  if (command === "discover" && !values.live) throw new ExecutionError("DEMO_CONFIGURATION", "Live discovery requires --live; it uses your model API credits.");
  if (command !== "discover" && values.live) throw new ExecutionError("DEMO_CONFIGURATION", "--live is only valid with discover.");
  if ((command === "replay" || command === "handoff") && !values.artifact) throw new ExecutionError("DEMO_CONFIGURATION", "Saved-artifact replay requires --artifact PATH.");
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ExecutionError("DEMO_CONFIGURATION", "Port must be between 1 and 65535.");
  const slowMoMs = Number(values["slow-mo"]);
  if (!Number.isFinite(slowMoMs) || slowMoMs < 0 || slowMoMs > 5000) throw new ExecutionError("DEMO_CONFIGURATION", "--slow-mo must be between 0 and 5000 milliseconds.");
  if (command === "discover" && (!environment.OPENAI_API_KEY || !environment.MODEL_NAME)) throw new ExecutionError("DEMO_CONFIGURATION", "OPENAI_API_KEY and MODEL_NAME are required for live discovery.");
  let options: DemoOptions = { directory: values.evidence, memberId: values.member, port, scenario: values.scenario, live: command === "discover", slowMoMs, ...(values.headed ? { headless: false } : {}) };
  if (command === "offline") options = { ...options, model: new ScriptedDemoModel() };
  if (command === "discover") options = { ...options, model: new OpenAIDiscoveryModel(environment.OPENAI_API_KEY!, environment.MODEL_NAME!) };
  if (command === "replay" || command === "handoff") options = { ...options, artifactPath: values.artifact! };
  if (command === "handoff") options = { ...options, scenario: "handoff" };
  if (command === "handoff" || values.operator) options = { ...options, operator: async (_page, request, signal) => {
    const answer = await io.ask(`Automation is paused (${request.reason}). In the SAME browser window resolve the block (click Release session if shown). Leave the window open. Type resume to hand control back: `, signal);
    if (answer !== "resume") throw new Error("INTERVENTION_CANCELLED");
  } };
  const completed = await execute(options);
  io.log(`${completed.result.disposition}: ${completed.result.code}\nEvidence: ${completed.directory}`);
}
function terminalIO(): CliIO {
  return { log: (message) => console.log(message), ask: async (message, signal) => {
    const terminal = createInterface({ input: stdin, output: stdout });
    try { return await terminal.question(message, { signal }); } finally { terminal.close(); }
  } };
}

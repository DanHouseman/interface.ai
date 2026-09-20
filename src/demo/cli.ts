import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { OpenAIDiscoveryModel } from "../discovery/openai-discovery-model.js";
import { ScriptedDemoModel } from "./scripted-model.js";
import { runDemo, type DemoOptions } from "./run-demo.js";

export interface CliIO { readonly log: (message: string) => void; readonly ask: (message: string) => Promise<string>; }

// Milestone 13 | Assignment §6 | REQ-OPS-002/003
// Live billing requires BOTH 'discover' and '--live'. No test/default command can
// accidentally spend model credits, even when an API key is present in the environment.
export async function main(args: string[], environment: NodeJS.ProcessEnv = process.env, execute = runDemo, io: CliIO = terminalIO()): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    live: { type: "boolean", default: false }, artifact: { type: "string" }, member: { type: "string", default: "DEMO-001" },
    port: { type: "string", default: "4173" }, scenario: { type: "string", default: "normal" }, evidence: { type: "string", default: "evidence/runs" },
  } });
  const command = positionals[0];
  if (!["offline", "discover", "replay", "handoff"].includes(command ?? "")) throw new Error("Usage: demo offline | discover --live | replay --artifact PATH | handoff --artifact PATH");
  if (command === "discover" && !values.live) throw new Error("Live discovery requires --live; it uses your model API credits.");
  if (command !== "discover" && values.live) throw new Error("--live is only valid with discover.");
  if ((command === "replay" || command === "handoff") && !values.artifact) throw new Error("Saved-artifact replay requires --artifact PATH.");
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535.");
  let options: DemoOptions = { directory: values.evidence, memberId: values.member, port, scenario: values.scenario, live: command === "discover" };
  if (command === "offline") options = { ...options, model: new ScriptedDemoModel() };
  if (command === "discover") options = { ...options, model: new OpenAIDiscoveryModel(environment.OPENAI_API_KEY ?? "", environment.MODEL_NAME ?? "") };
  if (command === "replay" || command === "handoff") options = { ...options, artifactPath: values.artifact! };
  if (command === "handoff") options = { ...options, scenario: "handoff", operator: async () => {
    const answer = await io.ask("Automation is paused. In the SAME browser window click Release session. Type resume to hand control back: ");
    if (answer !== "resume") throw new Error("INTERVENTION_CANCELLED");
  } };
  const completed = await execute(options);
  io.log(`${completed.result.disposition}: ${completed.result.code}\nEvidence: ${completed.directory}`);
}
function terminalIO(): CliIO {
  return { log: (message) => console.log(message), ask: async (message) => {
    const terminal = createInterface({ input: stdin, output: stdout });
    try { return await terminal.question(message); } finally { terminal.close(); }
  } };
}

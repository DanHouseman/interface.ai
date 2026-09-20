import { ExecutionError } from "./errors.js";

// Milestone 5 | Assignment §3.1 | REQ-DISC-001
// A stalled model call cannot extend the run budget. Abort reaches the provider;
// the caller must stop issuing actions after rejection and preserve the same session.
export async function withDeadline<T>(ms: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ExecutionError("DISCOVERY_TIMEOUT", "Discovery exceeded its time limit."));
    }, ms);
  });
  try { return await Promise.race([operation(controller.signal), timeout]); }
  finally { clearTimeout(timer!); }
}

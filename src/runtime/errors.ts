// Milestone 8 | Assignment §3.3 | REQ-OUT-001
// Stable codes cross orchestration boundaries; raw adapter/provider errors are not logged.
export class ExecutionError extends Error {
  public constructor(public readonly code: string, message: string) { super(message); }
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

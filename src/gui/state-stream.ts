import type { ServerResponse } from 'node:http';

// Full snapshots let slow clients skip intermediate updates without losing state.
// Keep only one pending snapshot per client while Node's response buffer drains.
export class StateStream {
  private readonly clients = new Map<ServerResponse, (frame: string) => void>();
  private closed = false;

  public subscribe(response: ServerResponse, snapshot: unknown): void {
    if (this.closed || response.destroyed) { response.destroy(); return; }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    let blocked = false;
    let pending: string | undefined;
    const send = (frame: string) => {
      if (blocked) { pending = frame; return; }
      blocked = !response.write(frame);
    };
    const drain = () => {
      blocked = false;
      if (pending !== undefined) {
        const frame = pending;
        pending = undefined;
        send(frame);
      }
    };
    response.on('drain', drain);
    response.once('close', () => {
      this.clients.delete(response);
      response.off('drain', drain);
    });
    this.clients.set(response, send);
    send(this.frame(snapshot));
  }

  public publish(snapshot: unknown): void {
    const frame = this.frame(snapshot);
    for (const send of this.clients.values()) send(frame);
  }

  public close(): void {
    this.closed = true;
    for (const response of this.clients.keys()) response.destroy();
    this.clients.clear();
  }

  private frame(snapshot: unknown): string {
    return `event: state\ndata: ${JSON.stringify(snapshot)}\n\n`;
  }
}

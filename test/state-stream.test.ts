import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { StateStream } from '../src/gui/state-stream.js';

function response() {
  const socket = Object.assign(new EventEmitter(), {
    destroyed: false,
    writeHead: vi.fn(),
    write: vi.fn((_frame: string) => true),
    destroy: vi.fn(() => { socket.destroyed = true; socket.emit('close'); }),
  });
  return { socket, response: socket as unknown as ServerResponse };
}

describe('state stream lifecycle', () => {
  it('sends framed snapshots to all subscribers and removes disconnected clients', () => {
    const stream = new StateStream();
    const first = response(), second = response();
    stream.subscribe(first.response, { phase: 'initial' });
    stream.subscribe(second.response, { phase: 'initial' });
    expect(first.socket.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'text/event-stream' }));
    stream.publish({ phase: 'changed\nwith a newline' });
    expect(first.socket.write).toHaveBeenLastCalledWith('event: state\ndata: {"phase":"changed\\nwith a newline"}\n\n');
    expect(second.socket.write).toHaveBeenCalledTimes(2);
    first.socket.destroy();
    expect(first.socket.listenerCount('drain')).toBe(0);
    stream.publish({ phase: 'latest' });
    expect(first.socket.write).toHaveBeenCalledTimes(2);
    expect(second.socket.write).toHaveBeenCalledTimes(3);
    stream.close();
    expect(second.socket.destroyed).toBe(true);
    stream.publish({ phase: 'after shutdown' });
    expect(second.socket.write).toHaveBeenCalledTimes(3);
  });

  it('coalesces updates while a slow client is blocked without delaying another client', () => {
    const stream = new StateStream();
    const slow = response(), fast = response();
    slow.socket.write.mockReturnValueOnce(false);
    stream.subscribe(slow.response, { phase: 'initial' });
    stream.subscribe(fast.response, { phase: 'initial' });
    for (let index = 0; index < 100; index++) stream.publish({ index });
    expect(slow.socket.write).toHaveBeenCalledTimes(1);
    expect(fast.socket.write).toHaveBeenCalledTimes(101);
    slow.socket.emit('drain');
    expect(slow.socket.write).toHaveBeenCalledTimes(2);
    expect(slow.socket.write).toHaveBeenLastCalledWith('event: state\ndata: {"index":99}\n\n');
    slow.socket.emit('drain');
    expect(slow.socket.write).toHaveBeenCalledTimes(2);
    stream.close();
  });

  it('rejects subscriptions after shutdown or a disconnect during initial state loading', () => {
    const stream = new StateStream();
    const disconnected = response();
    disconnected.socket.destroy();
    stream.subscribe(disconnected.response, {});
    expect(disconnected.socket.writeHead).not.toHaveBeenCalled();
    stream.close();
    const late = response();
    stream.subscribe(late.response, {});
    expect(late.socket.destroyed).toBe(true);
    expect(late.socket.writeHead).not.toHaveBeenCalled();
  });
});

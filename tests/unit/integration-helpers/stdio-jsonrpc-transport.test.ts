import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import { EventEmitter } from 'events';
import { StdioJsonRpcTransport } from '../../integration/helpers/stdio-jsonrpc-transport.js';

/**
 * OMN-181 — unit coverage for the extracted stdio JSON-RPC correlation core.
 * Pins the OMN-146 regression guard (route by id, not first-line-wins) without
 * needing a live `node dist/index.js` child — the whole point of this test.
 */

interface FakeChild extends EventEmitter {
  stdout: PassThrough;
  stdin: PassThrough;
  killed: boolean;
  kill: (signal?: string) => void;
  writes: string[];
}

function makeFakeChild(): FakeChild {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const writes: string[] = [];
  const child = new EventEmitter() as FakeChild;
  child.stdout = stdout;
  child.stdin = stdin;
  child.killed = false;
  child.writes = writes;
  // Capture writes instead of letting them vanish into a PassThrough with no reader.
  const realWrite = stdin.write.bind(stdin);
  stdin.write = ((chunk: any, ...rest: any[]) => {
    writes.push(String(chunk));
    return realWrite(chunk, ...(rest as []));
  }) as typeof stdin.write;
  child.kill = vi.fn((signal?: string) => {
    child.killed = true;
    process.nextTick(() => child.emit('exit', null, signal ?? 'SIGTERM'));
  });
  return child;
}

function sendLine(child: FakeChild, obj: unknown): void {
  child.stdout.write(JSON.stringify(obj) + '\n');
}

describe('StdioJsonRpcTransport', () => {
  let child: FakeChild;
  let transport: StdioJsonRpcTransport;

  beforeEach(() => {
    child = makeFakeChild();
    transport = new StdioJsonRpcTransport({
      spawnFn: (() => child) as unknown as typeof import('child_process').spawn,
    });
    transport.start();
  });

  it('routes interleaved responses to the request with the matching id (OMN-146 guard)', async () => {
    const idA = transport.nextId();
    const idB = transport.nextId();

    const pA = transport.sendRequest({ jsonrpc: '2.0', id: idA, method: 'tools/call' });
    const pB = transport.sendRequest({ jsonrpc: '2.0', id: idB, method: 'tools/call' });

    // Respond out of order: B's answer arrives first.
    sendLine(child, { jsonrpc: '2.0', id: idB, result: { who: 'B' } });
    sendLine(child, { jsonrpc: '2.0', id: idA, result: { who: 'A' } });

    const [a, b] = await Promise.all([pA, pB]);
    expect(a.result.who).toBe('A');
    expect(b.result.who).toBe('B');
  });

  it('rejects with a timeout error for the right id and cleans up its pendingRequests entry', async () => {
    vi.useFakeTimers();
    try {
      const id = transport.nextId();
      const promise = transport.sendRequest({ jsonrpc: '2.0', id, method: 'slow' }, 50);
      const assertion = expect(promise).rejects.toThrow(`Request ${id} timed out after 50ms`);
      await vi.advanceTimersByTimeAsync(60);
      await assertion;

      // A late-arriving response for the timed-out id must not throw or resolve anything
      // (its pendingRequests entry should already be gone).
      expect(() => sendLine(child, { jsonrpc: '2.0', id, result: {} })).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sendNotification writes a line with no id and creates no pendingRequests entry', () => {
    transport.sendNotification('notifications/initialized');
    expect(child.writes).toHaveLength(1);
    const parsed = JSON.parse(child.writes[0]);
    expect(parsed).toEqual({ jsonrpc: '2.0', method: 'notifications/initialized' });

    // Sending a response keyed to some arbitrary id must not resolve anything
    // (there's nothing pending), and must not throw.
    expect(() => sendLine(child, { jsonrpc: '2.0', id: 999, result: {} })).not.toThrow();
  });

  it('close() clears outstanding timers and rejects in-flight requests', async () => {
    const id = transport.nextId();
    const promise = transport.sendRequest({ jsonrpc: '2.0', id, method: 'tools/call' });
    const assertion = expect(promise).rejects.toThrow();

    await transport.close({ graceful: false });
    await assertion;

    // No dangling timer should fire after close (would throw an unhandled rejection
    // in a real run if the entry wasn't cleaned up before close tore things down).
  });

  it('close({ graceful: true }) rejects in-flight requests instead of leaving them dangling when the child already died', async () => {
    const id = transport.nextId();
    const promise = transport.sendRequest({ jsonrpc: '2.0', id, method: 'tools/call' });
    const assertion = expect(promise).rejects.toThrow('transport closed with request in flight');

    child.killed = true;
    await transport.close({ graceful: true });
    await assertion;
  });

  it('rejectAllPending rejects every in-flight request with the supplied error', async () => {
    const id1 = transport.nextId();
    const id2 = transport.nextId();
    const p1 = transport.sendRequest({ jsonrpc: '2.0', id: id1, method: 'a' });
    const p2 = transport.sendRequest({ jsonrpc: '2.0', id: id2, method: 'b' });

    transport.rejectAllPending(new Error('boom'));

    await expect(p1).rejects.toThrow('boom');
    await expect(p2).rejects.toThrow('boom');
  });

  it('ignores non-JSON and non-JSON-RPC lines instead of throwing', () => {
    expect(() => child.stdout.write('some log line\n')).not.toThrow();
    expect(() => sendLine(child, { not: 'jsonrpc' })).not.toThrow();
    expect(() => sendLine(child, { jsonrpc: '2.0', id: 'not-a-number', result: {} })).not.toThrow();
  });
});

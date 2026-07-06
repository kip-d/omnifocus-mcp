import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'stream';
import { EventEmitter } from 'events';
import { MCPTester } from '../../support/claude-code-mcp.js';

/**
 * OMN-234 — unit coverage for MCPTester composing StdioJsonRpcTransport
 * (rather than carrying its own `pendingRequests` copy). Mirrors the
 * FakeChild pattern from `stdio-jsonrpc-transport.test.ts`, exercised
 * through MCPTester's own public API (`sendRequest`/`nextId`).
 */

interface FakeChild extends EventEmitter {
  stdout: PassThrough;
  stdin: PassThrough;
  stderr: PassThrough;
  killed: boolean;
  exitCode: number | null;
  signalCode: string | null;
  kill: (signal?: string) => void;
}

function makeFakeChild(): FakeChild {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const stderr = new PassThrough();
  const child = new EventEmitter() as FakeChild;
  child.stdout = stdout;
  child.stdin = stdin;
  child.stderr = stderr;
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn((signal?: string) => {
    child.killed = true;
    process.nextTick(() => {
      child.signalCode = signal ?? 'SIGTERM';
      child.emit('exit', null, child.signalCode);
    });
  });
  return child;
}

function sendLine(child: FakeChild, obj: unknown): void {
  child.stdout.write(JSON.stringify(obj) + '\n');
}

describe('MCPTester (composed over StdioJsonRpcTransport)', () => {
  it('routes interleaved responses to the request with the matching id through sendRequest/nextId', async () => {
    const child = makeFakeChild();
    const tester = new MCPTester({ spawnFn: (() => child) as any });

    vi.useFakeTimers();
    try {
      const startPromise = tester.start();
      await vi.advanceTimersByTimeAsync(500);
      await startPromise;
    } finally {
      vi.useRealTimers();
    }

    const idA = tester.nextId();
    const idB = tester.nextId();

    const pA = tester.sendRequest({ jsonrpc: '2.0', id: idA, method: 'tools/call' });
    const pB = tester.sendRequest({ jsonrpc: '2.0', id: idB, method: 'tools/call' });

    // Respond out of order: B's answer arrives first.
    sendLine(child, { jsonrpc: '2.0', id: idB, result: { who: 'B' } });
    sendLine(child, { jsonrpc: '2.0', id: idA, result: { who: 'A' } });

    const [a, b] = await Promise.all([pA, pB]);
    expect(a.result.who).toBe('A');
    expect(b.result.who).toBe('B');

    await tester.cleanup();
  });

  it('resolves a response for request id 0 (the old `if (response.id && ...)` truthy check dropped this)', async () => {
    const child = makeFakeChild();
    const tester = new MCPTester({ spawnFn: (() => child) as any });

    vi.useFakeTimers();
    try {
      const startPromise = tester.start();
      await vi.advanceTimersByTimeAsync(500);
      await startPromise;
    } finally {
      vi.useRealTimers();
    }

    // nextId() starts at 1 in MCPTester's normal flow, so drive id 0 directly
    // to pin the id-0 regression the migration fixes.
    const promise = tester.sendRequest({ jsonrpc: '2.0', id: 0, method: 'tools/call' });
    sendLine(child, { jsonrpc: '2.0', id: 0, result: { ok: true } });

    const response = await promise;
    expect(response.result.ok).toBe(true);

    await tester.cleanup();
  });
});

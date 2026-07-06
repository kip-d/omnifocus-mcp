import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'stream';
import { EventEmitter } from 'events';
import { GherkinTestRunner } from '../../support/gherkin-test-runner.js';

/**
 * OMN-234 — unit coverage for GherkinTestRunner composing
 * StdioJsonRpcTransport (rather than carrying its own `pendingRequests`
 * copy). Mirrors the FakeChild pattern from
 * `stdio-jsonrpc-transport.test.ts`, exercised through the runner's own
 * public API (`sendRequest`/`nextId`) — does not drive `start()`/`initialize()`
 * (those require a real MCP handshake response) or a real child process.
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

describe('GherkinTestRunner (composed over StdioJsonRpcTransport)', () => {
  /** Drives `start()` (which performs the real `initialize()` MCP handshake) to completion by answering its id-1 request, using only the runner's public API. */
  async function startRunner(child: FakeChild): Promise<GherkinTestRunner> {
    const runner = new GherkinTestRunner({ spawnFn: (() => child) as any });
    const startPromise = runner.start();
    sendLine(child, { jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'fake', version: '0' } } });
    await startPromise;
    return runner;
  }

  it('routes interleaved responses to the request with the matching id through sendRequest/nextId', async () => {
    const child = makeFakeChild();
    const runner = await startRunner(child);

    const idA = runner.nextId();
    const idB = runner.nextId();

    const pA = runner.sendRequest({ jsonrpc: '2.0', id: idA, method: 'tools/call' });
    const pB = runner.sendRequest({ jsonrpc: '2.0', id: idB, method: 'tools/call' });

    // Respond out of order: B's answer arrives first.
    sendLine(child, { jsonrpc: '2.0', id: idB, result: { who: 'B' } });
    sendLine(child, { jsonrpc: '2.0', id: idA, result: { who: 'A' } });

    const [a, b] = await Promise.all([pA, pB]);
    expect(a.result.who).toBe('A');
    expect(b.result.who).toBe('B');

    await runner.cleanup();
  });

  it('resolves a response for request id 0 (the old `if (response.id && ...)` truthy check dropped this)', async () => {
    const child = makeFakeChild();
    const runner = await startRunner(child);

    const promise = runner.sendRequest({ jsonrpc: '2.0', id: 0, method: 'tools/call' });
    sendLine(child, { jsonrpc: '2.0', id: 0, result: { ok: true } });

    const response = await promise;
    expect(response.result.ok).toBe(true);

    await runner.cleanup();
  });
});

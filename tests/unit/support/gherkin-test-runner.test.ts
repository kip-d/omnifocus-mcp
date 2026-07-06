import { describe, it, expect } from 'vitest';
import { GherkinTestRunner } from '../../support/gherkin-test-runner.js';
import { makeFakeChild, sendLine, type FakeChild } from '../helpers/fake-child.js';

/**
 * OMN-234 — unit coverage for GherkinTestRunner composing
 * StdioJsonRpcTransport (rather than carrying its own `pendingRequests`
 * copy). Mirrors the FakeChild pattern from
 * `stdio-jsonrpc-transport.test.ts`, exercised through the runner's own
 * public API (`sendRequest`/`nextId`) — does not drive `start()`/`initialize()`
 * (those require a real MCP handshake response) or a real child process.
 */

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

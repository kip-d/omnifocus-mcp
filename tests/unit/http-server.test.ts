import { describe, it, expect, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { HttpServerManager } from '../../src/http-server.js';
import type { SessionManager } from '../../src/session-manager.js';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

// OMN-347: a POST carrying an unknown/expired mcp-session-id used to get a
// brand-new session (full Server + tools + connect), which then answered 400
// "Server not initialized" instead of the 404 that tells a client to
// re-initialize, and leaked a session per request. These drive the real
// HTTP routing on an ephemeral port against a stub SessionManager.

type Stub = {
  sessions: Map<string, unknown>;
  createSession: ReturnType<typeof vi.fn>;
  getSession: (id: string) => unknown;
  updateSessionActivity: ReturnType<typeof vi.fn>;
  validateAuthToken: () => boolean;
  getSessionCount: () => number;
};

function stubSessionManager(): Stub {
  const sessions = new Map<string, unknown>();
  const stub: Stub = {
    sessions,
    createSession: vi.fn(async (sessionId: string) => {
      const session = {
        sessionId,
        transport: {
          handleRequest: vi.fn(async (_req: unknown, res: import('node:http').ServerResponse) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{}');
          }),
        },
      };
      sessions.set(sessionId, session);
      return session;
    }),
    getSession: (id: string) => sessions.get(id),
    updateSessionActivity: vi.fn(),
    validateAuthToken: () => true,
    getSessionCount: () => sessions.size,
  };
  return stub;
}

let manager: HttpServerManager | undefined;

afterEach(async () => {
  await manager?.stop();
  manager = undefined;
});

async function startWith(stub: Stub): Promise<string> {
  manager = new HttpServerManager(stub as unknown as SessionManager, 0, '127.0.0.1');
  await manager.start();
  const { port } = (manager as unknown as { httpServer: { address(): AddressInfo } }).httpServer.address();
  return `http://127.0.0.1:${port}/mcp`;
}

const toolsCall = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'system', arguments: {} } };
const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
};

async function post(url: string, body: unknown, sessionId?: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('HttpServerManager POST /mcp session routing (OMN-347)', () => {
  it('an unknown session id gets 404 and creates no session', async () => {
    const stub = stubSessionManager();
    const url = await startWith(stub);

    const res = await post(url, toolsCall, 'expired-session-id');

    expect(res.status).toBe(404);
    expect(stub.createSession).not.toHaveBeenCalled();
    expect(stub.getSessionCount()).toBe(0);
  });

  it('a non-initialize request without a session id gets 400 and creates no session', async () => {
    const stub = stubSessionManager();
    const url = await startWith(stub);

    const res = await post(url, toolsCall);

    expect(res.status).toBe(400);
    expect(stub.createSession).not.toHaveBeenCalled();
  });

  it('an initialize request without a session id creates a session', async () => {
    const stub = stubSessionManager();
    const url = await startWith(stub);

    const res = await post(url, initialize);

    expect(res.status).toBe(200);
    expect(stub.createSession).toHaveBeenCalledTimes(1);
    expect(stub.getSessionCount()).toBe(1);
  });

  it('a JSON-RPC batch containing initialize also creates a session', async () => {
    const stub = stubSessionManager();
    const url = await startWith(stub);

    const res = await post(url, [initialize]);

    expect(res.status).toBe(200);
    expect(stub.createSession).toHaveBeenCalledTimes(1);
  });

  it('a known session id routes to that session without creating another', async () => {
    const stub = stubSessionManager();
    const url = await startWith(stub);
    await stub.createSession('live-session');
    stub.createSession.mockClear();

    const res = await post(url, toolsCall, 'live-session');

    expect(res.status).toBe(200);
    expect(stub.createSession).not.toHaveBeenCalled();
  });
});

/**
 * OMN-146 — shared spawn/initialize/JSON-RPC scaffolding for the live
 * `tools/unified/*.test.ts` integration suites.
 *
 * `create-paths`, `update-paths`, `complete-delete-paths`, and `tag-paths`
 * (OMN-138 / OMN-128 slice 6) each carried a byte-identical copy of this
 * quartet — `sendRequestTo` / `callToolOn` / `initializeServer` plus a
 * module-local `nextId`. Clone fidelity was deliberate while the OMN-138
 * suites were being established; with four copies the rule-of-three threshold
 * is well past, so the scaffolding lives here, beside `sandbox-manager`.
 *
 * ── The id-matching wrinkle, FIXED (not merely documented) ──────────────────
 * The cloned `sendRequestTo` resolved on the FIRST JSON-RPC `result` line it
 * saw, WITHOUT matching the response `id` to the request `id`. That is correct
 * only under strictly-sequential callers (exactly one request in flight); fire
 * two un-awaited requests and request A could resolve with request B's reply.
 * OMN-146 closes the latent footgun the canonical way (mirrors
 * `mcp-test-client.ts`): one persistent `readline` listener feeds a
 * `pendingRequests` Map keyed by request id, so every response routes to its
 * own request. Under the existing sequential callers the behavior is identical.
 *
 * ── OMN-181 ──────────────────────────────────────────────────────────────
 * The stdio spawn + readline id-router + `pendingRequests` core described
 * above is now `StdioJsonRpcTransport` (`./stdio-jsonrpc-transport.ts`),
 * shared with `mcp-test-client.ts` — this class composes it rather than
 * carrying its own copy. What stays HERE (deliberately not shared):
 * `protocolVersion: '2025-06-18'`, the guarded/unguarded env policy below,
 * throwing (not returning an envelope) on a tool error, and the
 * exit-triggered `rejectAllPending` (registered onto `transport.child`,
 * since the transport itself doesn't impose that policy).
 *
 * ── Guard env (OMN-46 / OMN-77) ─────────────────────────────────────────────
 * The guard-relevant env is set EXPLICITLY, not inherited. The pre-extraction
 * guarded server passed no env and relied on the child inheriting NODE_ENV=test
 * (vitest) and SANDBOX_GUARD_ENABLED (a side-effect of importing
 * `sandbox-manager` in the parent). That was safe only because all four callers
 * imported sandbox-manager — but as a shared primitive a future caller might
 * not, and would then spawn a guarded server with the in-server write guard
 * silently absent. So `start()` sets NODE_ENV=test + SANDBOX_GUARD_ENABLED=true
 * + OMNIFOCUS_MCP_DISABLE_FAILURE_LOG=1 outright (identical to the values that
 * were inherited today; this is the hard-won lesson already encoded in
 * `mcp-test-client.ts`). `start({ guarded: false })` instead REMOVES
 * SANDBOX_GUARD_ENABLED and runs NODE_ENV=development, reproducing
 * create-paths's loud-not-found probe child: the script-level not-found guard
 * is masked by the sandbox guard's pre-flight on a guarded server, so the probe
 * needs an unguarded one. DISABLE_FAILURE_LOG keeps those deliberate failures
 * out of the real failure log on either path.
 *
 * NOT a unit gate: every consumer mutates the real OmniFocus DB and runs only
 * under `npm run test:integration`.
 */
import type { ChildProcess, SpawnOptions } from 'child_process';
import { StdioJsonRpcTransport, DEFAULT_TIMEOUT_MS } from './stdio-jsonrpc-transport.js';
// OMN-263 review: was a second, independently-computed copy of this path
// (via __dirname) — consolidated so the spawn path and shared-server.ts's
// process-identity check can never drift apart. See server-path.ts.
import { SERVER_PATH } from './server-path.js';

export interface StartOptions {
  /**
   * `true` (default): the in-server write guard fires (NODE_ENV=test +
   * SANDBOX_GUARD_ENABLED=true). `false`: an unguarded child (NODE_ENV=development,
   * no SANDBOX_GUARD_ENABLED) for the loud-not-found probes whose script-level
   * guard is masked by the sandbox guard's pre-flight.
   */
  guarded?: boolean;
}

/**
 * One spawned MCP server (`node dist/index.js`) over stdio, with id-correlated
 * JSON-RPC. Construct via `UnifiedTestServer.start()` (spawns + initializes);
 * `kill()` when done (also drains in-flight requests and closes the reader).
 */
export class UnifiedTestServer {
  private readonly transport: StdioJsonRpcTransport;

  private constructor(transport: StdioJsonRpcTransport) {
    this.transport = transport;
    // If the child dies with requests still in flight, fail them fast with a
    // clear cause instead of letting each hang to the timeout. This policy is
    // specific to UnifiedTestServer (MCPTestClient does not register it) so
    // it's hooked here via the transport's exposed `child`, not baked into
    // the shared transport itself.
    transport.child.once('exit', (code, signal) =>
      transport.rejectAllPending(
        new Error(`Server process exited (code=${code}, signal=${signal}) with requests in flight`),
      ),
    );
  }

  /** The spawned child process, exposed for callers that need stderr/exit hooks. */
  get proc(): ChildProcess {
    return this.transport.child;
  }

  /** Spawn a server and complete the MCP `initialize` handshake. */
  static async start(options: StartOptions = {}): Promise<UnifiedTestServer> {
    const guarded = options.guarded ?? true;
    const env: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: guarded ? 'test' : 'development',
      OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: '1',
    };
    if (guarded) {
      env.SANDBOX_GUARD_ENABLED = 'true';
    } else {
      delete env.SANDBOX_GUARD_ENABLED;
    }
    const spawnOptions: SpawnOptions = { stdio: ['pipe', 'pipe', 'pipe'], env };
    const transport = new StdioJsonRpcTransport({ serverPath: SERVER_PATH, spawnOptions });
    transport.start();
    const server = new UnifiedTestServer(transport);
    try {
      await server.initialize();
    } catch (err) {
      // Don't leak the spawned child if the handshake never completes.
      server.kill();
      throw err;
    }
    return server;
  }

  /** Send a raw JSON-RPC request (id pre-assigned) and resolve with its `result` — throws on an `error` frame. */
  private async send(request: { id: number; [k: string]: unknown }, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
    const response = await this.transport.sendRequest(request, timeoutMs);
    if ('error' in response) {
      throw new Error(`MCP error: ${JSON.stringify(response.error)}`);
    }
    return response.result;
  }

  private async initialize(): Promise<void> {
    await this.send({
      jsonrpc: '2.0',
      id: this.transport.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });
  }

  /** Call an MCP tool and return the parsed envelope (the JSON in `content[0].text`). */
  async callTool(name: string, args: unknown): Promise<any> {
    const result = await this.send({
      jsonrpc: '2.0',
      id: this.transport.nextId(),
      method: 'tools/call',
      params: { name, arguments: args },
    });
    const content = (result as { content?: Array<{ text?: string }> } | null)?.content;
    if (!Array.isArray(content) || typeof content[0]?.text !== 'string') {
      throw new Error(`Unexpected tools/call result shape: ${JSON.stringify(result)?.slice(0, 300)}`);
    }
    return JSON.parse(content[0].text);
  }

  /** Terminate the child process and tear down: reject in-flight requests, close the reader. */
  kill(): void {
    void this.transport.close({ graceful: false });
  }
}

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
import { spawn, ChildProcess, type SpawnOptions } from 'child_process';
import { createInterface, type Interface } from 'readline';
import path from 'path';

/** Resolve `dist/index.js` from this helper's location (tests/integration/helpers → repo root). */
const SERVER_PATH = path.join(__dirname, '../../../dist/index.js');

const DEFAULT_TIMEOUT_MS = 120_000;

export interface StartOptions {
  /**
   * `true` (default): the in-server write guard fires (NODE_ENV=test +
   * SANDBOX_GUARD_ENABLED=true). `false`: an unguarded child (NODE_ENV=development,
   * no SANDBOX_GUARD_ENABLED) for the loud-not-found probes whose script-level
   * guard is masked by the sandbox guard's pre-flight.
   */
  guarded?: boolean;
}

interface PendingRequest {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * One spawned MCP server (`node dist/index.js`) over stdio, with id-correlated
 * JSON-RPC. Construct via `UnifiedTestServer.start()` (spawns + initializes);
 * `kill()` when done (also drains in-flight requests and closes the reader).
 */
export class UnifiedTestServer {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly rl: Interface;

  private constructor(readonly proc: ChildProcess) {
    if (!proc.stdout || !proc.stdin) {
      throw new Error('Server process is missing stdout/stdin pipes');
    }
    this.rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
    this.rl.on('line', (line: string) => this.handleLine(line));
    // If the child dies with requests still in flight, fail them fast with a
    // clear cause instead of letting each hang to the timeout.
    proc.once('exit', (code, signal) =>
      this.rejectAllPending(
        new Error(`Server process exited (code=${code}, signal=${signal}) with requests in flight`),
      ),
    );
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
    const proc = spawn('node', [SERVER_PATH], spawnOptions);
    const server = new UnifiedTestServer(proc);
    try {
      await server.initialize();
    } catch (err) {
      // Don't leak the spawned child if the handshake never completes.
      server.kill();
      throw err;
    }
    return server;
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return; // skip log/diagnostic lines
    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return; // partial / non-JSON line — ignore
    }
    if (parsed.jsonrpc !== '2.0' || typeof parsed.id !== 'number') return;
    // Settle only on a well-formed result/error frame; a frame carrying neither
    // key is left for the timeout (don't resolve a request with `undefined`).
    const isError = 'error' in parsed;
    if (!isError && !('result' in parsed)) return;
    const entry = this.pending.get(parsed.id);
    if (!entry) return; // notification or already-settled id
    this.pending.delete(parsed.id);
    clearTimeout(entry.timer);
    if (isError) {
      entry.reject(new Error(`MCP error: ${JSON.stringify(parsed.error)}`));
    } else {
      entry.resolve(parsed.result);
    }
  }

  /** Send a raw JSON-RPC request (id pre-assigned) and resolve with its `result`. */
  private send(request: { id: number; [k: string]: unknown }, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.proc.stdin) {
        reject(new Error('Server stdin not available'));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Request ${request.id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  private async initialize(): Promise<void> {
    await this.send({
      jsonrpc: '2.0',
      id: this.nextId++,
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
      id: this.nextId++,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    const content = (result as { content?: Array<{ text?: string }> } | null)?.content;
    if (!Array.isArray(content) || typeof content[0]?.text !== 'string') {
      throw new Error(`Unexpected tools/call result shape: ${JSON.stringify(result)?.slice(0, 300)}`);
    }
    return JSON.parse(content[0].text);
  }

  private rejectAllPending(error: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  /** Terminate the child process and tear down: reject in-flight requests, close the reader. */
  kill(): void {
    this.rejectAllPending(new Error('Server killed before request completed'));
    this.rl.close();
    this.proc.kill();
  }
}

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
 * own request. Under the existing sequential callers the behavior is identical;
 * the extraction is just the moment to converge on the safe shape instead of
 * copying the wrinkle a fifth time.
 *
 * ── Guard env (OMN-46) ──────────────────────────────────────────────────────
 * The default (guarded) server inherits the parent's env — vitest sets
 * NODE_ENV=test and importing `sandbox-manager` sets SANDBOX_GUARD_ENABLED, so
 * the in-server write guards fire. This intentionally preserves the suites'
 * pre-extraction behavior (which relied on that inheritance). `start({ guarded:
 * false })` reproduces `create-paths`'s loud-not-found probe environment: a
 * fresh child with NODE_ENV=development and SANDBOX_GUARD_ENABLED removed, so
 * the script-level not-found guard is reachable (the guard's pre-flight masks
 * it on a guarded server). DISABLE_FAILURE_LOG keeps those deliberate failures
 * out of the real failure log.
 *
 * NOT a unit gate: every consumer mutates the real OmniFocus DB and runs only
 * under `npm run test:integration`.
 */
import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';

/** Resolve `dist/index.js` from this helper's location (tests/integration/helpers → repo root). */
const SERVER_PATH = path.join(__dirname, '../../../dist/index.js');

const DEFAULT_TIMEOUT_MS = 120_000;

export interface StartOptions {
  /**
   * `true` (default): inherit the parent env (NODE_ENV=test +
   * SANDBOX_GUARD_ENABLED from the sandbox-manager import) so the write guards
   * fire. `false`: spawn an unguarded child (NODE_ENV=development, no
   * SANDBOX_GUARD_ENABLED) for the loud-not-found probes whose script-level
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
 * `kill()` when done.
 */
export class UnifiedTestServer {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  private constructor(readonly proc: ChildProcess) {
    if (!proc.stdout || !proc.stdin) {
      throw new Error('Server process is missing stdout/stdin pipes');
    }
    const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
    rl.on('line', (line: string) => this.handleLine(line));
  }

  /** Spawn a server and complete the MCP `initialize` handshake. */
  static async start(options: StartOptions = {}): Promise<UnifiedTestServer> {
    const guarded = options.guarded ?? true;
    const spawnOptions: Parameters<typeof spawn>[2] = { stdio: ['pipe', 'pipe', 'pipe'] };
    if (!guarded) {
      const env: Record<string, string | undefined> = {
        ...process.env,
        NODE_ENV: 'development',
        OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: '1',
      };
      delete env.SANDBOX_GUARD_ENABLED;
      spawnOptions.env = env;
    }
    const proc = spawn('node', [SERVER_PATH], spawnOptions);
    const server = new UnifiedTestServer(proc);
    await server.initialize();
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
    const entry = this.pending.get(parsed.id);
    if (!entry) return; // notification or already-settled id
    this.pending.delete(parsed.id);
    clearTimeout(entry.timer);
    if ('error' in parsed) {
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
    const content = (result as { content: Array<{ text: string }> }).content;
    return JSON.parse(content[0].text);
  }

  /** Terminate the child process. */
  kill(): void {
    this.proc.kill();
  }
}

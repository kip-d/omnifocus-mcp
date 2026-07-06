/**
 * OMN-181 — the shared stdio JSON-RPC id-correlation core, extracted from
 * `MCPTestClient` (the canonical copy) and `UnifiedTestServer` (OMN-146,
 * cloned from MCPTestClient — its header documents the clone).
 *
 * This primitive owns ONLY: process spawn lifecycle, the single persistent
 * `readline` → id router, the `pendingRequests` map, `sendRequest`,
 * `sendNotification`, `nextId`, and close/kill. Everything client-specific —
 * `protocolVersion`, env policy, whether `notifications/initialized` is sent,
 * and throw-vs-return-envelope on tool errors — stays in the composing
 * client. See the governing spec:
 * `Technical/specs/OMN-181-unify-jsonrpc-id-correlation-core.md` (Obsidian).
 *
 * ── Router canonicalization ──────────────────────────────────────────────
 * The two prior copies filtered response lines slightly differently:
 * `MCPTestClient` just `JSON.parse`'d every line and swallowed parse errors;
 * `UnifiedTestServer` (OMN-146) additionally required a leading `{`, a
 * `jsonrpc: '2.0'` tag, a *numeric* `id`, and a `result` or `error` key
 * before matching against `pendingRequests` — the OMN-146 fix for the
 * resolve-on-first-line footgun, "made canonical" per the governing spec.
 * This transport uses the UnifiedTestServer filtering unconditionally (the
 * spec explicitly calls this out as the fix becoming canonical, not a fresh
 * unification decision). One incidental consequence: `MCPTestClient`'s old
 * `if (response.id && ...)` check was falsy for `id === 0`, silently
 * dropping a response for request id 0; the canonical `typeof id ===
 * 'number'` check fixes that latent bug for both callers.
 *
 * ── Envelope resolution: NOT owned here ──────────────────────────────────
 * `sendRequest` always RESOLVES with the full parsed response (`result` or
 * `error` present) — it never auto-rejects on an `error` frame. Whether a
 * caller throws on `.error` (as `UnifiedTestServer.send()` does) or hands
 * the raw envelope to the caller (as `MCPTestClient.sendRequest` does) is
 * client-specific policy the spec says this primitive must not own.
 *
 * ── close() vs kill(): two different shutdown policies, both preserved ──
 * `MCPTestClient.stop()` was: end stdin, wait up to 5s for a graceful exit,
 * else SIGTERM, then SIGKILL after another 2s — and it never proactively
 * rejected in-flight requests (they just rode out to their own timeout).
 * `UnifiedTestServer.kill()` was: proactively reject all pending requests,
 * close the reader, `proc.kill()` immediately, synchronously, no waiting —
 * plus an `exit` listener registered at construction time that rejects any
 * still-pending requests if the child dies unexpectedly mid-flight.
 * `close({ graceful: true })` (default, used by `MCPTestClient`) reproduces
 * the first; `close({ graceful: false })` (used by `UnifiedTestServer.kill`)
 * reproduces the second. The exit-triggered auto-reject is NOT baked into
 * this primitive — it's policy, not core plumbing — so `UnifiedTestServer`
 * registers it itself via the exposed `child`.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import { createInterface, type Interface } from 'readline';

export interface StdioJsonRpcTransportOptions {
  /** Path to the server entrypoint, e.g. `node <serverPath>`. */
  serverPath?: string;
  /** Passed through to `child_process.spawn`. Defaults to `{ stdio: ['pipe','pipe','pipe'] }`. */
  spawnOptions?: SpawnOptions;
  /**
   * Test seam only: substitute for `child_process.spawn`. Defaults to the
   * real `spawn`. Lets unit tests feed the transport a fake duplex instead
   * of spawning a real `node` process.
   */
  spawnFn?: typeof spawn;
}

interface PendingEntry {
  resolve: (response: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const DEFAULT_TIMEOUT_MS = 120_000;

export class StdioJsonRpcTransport {
  private messageId = 0;
  private readonly pending = new Map<number, PendingEntry>();
  private rl: Interface | null = null;
  private _child: ChildProcess | null = null;
  private readonly spawnFn: typeof spawn;

  constructor(private readonly options: StdioJsonRpcTransportOptions = {}) {
    this.spawnFn = options.spawnFn ?? spawn;
  }

  /** The spawned child process. Exposed so a client can attach its own hooks (e.g. an `exit` listener). */
  get child(): ChildProcess {
    if (!this._child) {
      throw new Error('StdioJsonRpcTransport: not started — call start() first');
    }
    return this._child;
  }

  /** Spawn the child and attach the single persistent id-routing readline listener. */
  start(): void {
    if (!this.options.serverPath && !this.options.spawnFn) {
      throw new Error('StdioJsonRpcTransport: serverPath is required unless spawnFn is supplied');
    }
    const spawnOptions: SpawnOptions = this.options.spawnOptions ?? { stdio: ['pipe', 'pipe', 'pipe'] };
    this._child = this.options.serverPath
      ? this.spawnFn('node', [this.options.serverPath], spawnOptions)
      : this.spawnFn('node', [], spawnOptions);

    if (!this._child.stdout || !this._child.stdin) {
      throw new Error('StdioJsonRpcTransport: server process is missing stdout/stdin pipes');
    }
    this.rl = createInterface({ input: this._child.stdout, crlfDelay: Infinity });
    this.rl.on('line', (line: string) => this.handleLine(line));
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
    const isError = 'error' in parsed;
    if (!isError && !('result' in parsed)) return;
    const entry = this.pending.get(parsed.id);
    if (!entry) return; // notification, log frame, or already-settled/timed-out id
    this.pending.delete(parsed.id);
    clearTimeout(entry.timer);
    entry.resolve(parsed); // full envelope — error-vs-result policy lives in the caller
  }

  /** `++counter`, shared by both request ids and (for callers that want it) notification bookkeeping. */
  nextId(): number {
    return ++this.messageId;
  }

  /** Send a JSON-RPC request (id pre-assigned by the caller via `nextId()`) and resolve with the full response envelope. */
  sendRequest(request: { id: number; [k: string]: unknown }, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this._child?.stdin) {
        reject(new Error('StdioJsonRpcTransport: server stdin not available'));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Request ${request.id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
      this._child.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  /** Fire a JSON-RPC notification (no id, no pendingRequests entry, no response expected). */
  sendNotification(method: string, params?: unknown): void {
    if (!this._child?.stdin) {
      throw new Error('StdioJsonRpcTransport: server stdin not available');
    }
    const notification: Record<string, unknown> = { jsonrpc: '2.0', method };
    if (params !== undefined) notification.params = params;
    this._child.stdin.write(JSON.stringify(notification) + '\n');
  }

  /** Reject every in-flight request with `error`, clearing their timers. Public so a composing client can hook it to its own policy (e.g. an `exit` listener). */
  rejectAllPending(error: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  /**
   * Graceful shutdown (default, `MCPTestClient` policy): end stdin, wait up
   * to 5s for the child to exit on its own, else SIGTERM, then SIGKILL after
   * another 2s. Does NOT proactively reject in-flight requests while the
   * child is still alive — except if the child has ALREADY died before
   * `close()` was called, in which case pending requests are rejected
   * immediately rather than left to ride out their own timeout.
   *
   * `close({ graceful: false })` (`UnifiedTestServer` policy): proactively
   * reject all pending requests, close the reader, and kill the child
   * immediately and synchronously — no waiting.
   */
  async close(opts: { graceful?: boolean } = {}): Promise<void> {
    const graceful = opts.graceful ?? true;

    if (!graceful) {
      this.rejectAllPending(new Error('Server killed before request completed'));
      this.rl?.close();
      this._child?.kill();
      return;
    }

    if (!this._child || this._child.killed) {
      this.rejectAllPending(new Error('transport closed with request in flight'));
      this.rl?.close();
      return;
    }

    try {
      this._child.stdin?.end();
    } catch {
      // Ignore errors during stdin close
    }

    await new Promise<void>((resolve) => {
      const gracefulTimeout = setTimeout(() => {
        if (this._child && !this._child.killed) {
          this._child.kill('SIGTERM');
          setTimeout(() => {
            if (this._child && !this._child.killed) {
              this._child.kill('SIGKILL');
            }
            resolve();
          }, 2000);
        } else {
          resolve();
        }
      }, 5000);

      this._child!.once('exit', () => {
        clearTimeout(gracefulTimeout);
        resolve();
      });
    });

    this.rl?.close();
  }
}

#!/usr/bin/env npx tsx
/**
 * verify-deploy.ts — standalone MCP verify driver (OMN-271; hardened in
 * OMN-275, corrects PR #230; supersedes verify-deploy.mjs and
 * test-single-tool-proper.js).
 *
 * Drives an omnifocus-mcp server build over raw JSON-RPC/stdio when no live MCP
 * connection exists (background jobs, post-redeploy checks, worktree builds).
 *
 * Why not `echo | node dist/index.js`: a one-shot pipe EOFs stdin immediately
 * and silently drops the last in-flight response. This driver keeps stdin open
 * and correlates responses by JSON-RPC id via the shared
 * `StdioJsonRpcTransport` (OMN-181) — which, unlike MCPTestClient, targets ANY
 * server artifact by path (prod checkout, a worktree build). The transport
 * also supplies the OMN-146 malformed-frame filtering and, via the exit
 * listener below, fail-fast when the server crashes mid-request (the .mjs
 * predecessor rode out its full timeout instead).
 *
 * Usage:
 *   npx tsx scripts/verify-deploy.ts <path>/dist/index.js
 *     Deploy verify: one `system {operation:"version"}` probe. Pass criteria
 *     (check the output yourself, or --expect-build): buildId matches the
 *     expected commit AND stale === false.
 *
 *   npx tsx scripts/verify-deploy.ts <path>/dist/index.js --expect-build <sha>
 *     Same probe, but exits 1 unless buildId startsWith <sha> AND !stale.
 *
 *   npx tsx scripts/verify-deploy.ts <path>/dist/index.js [--timeout <ms>] <tool> ['<argsJSON>']
 *     Version probe, then one tool call (full init handshake, like Claude
 *     Desktop). Exits 1 on RPC error/timeout or a success:false envelope.
 *
 * --timeout <ms> applies per RPC. The default stays generous for the
 * post-redeploy cache-warm case; dev-smoke call sites (test-quick.sh,
 * test-comprehensive.sh) pass a short value so a dialog-wedged OmniFocus
 * fails the loop in seconds, not minutes.
 *
 * Server stderr is captured and replayed on failure only — success output
 * stays clean for shell parsing, but a crash no longer discards the server's
 * own diagnostics.
 *
 * Multi-call warm sessions: for ad-hoc acceptance checks, add more
 * `await call(...)` lines before the finally block — the server stays up for
 * the whole script.
 */
import { pathToFileURL } from 'node:url';
import { StdioJsonRpcTransport } from '../tests/integration/helpers/stdio-jsonrpc-transport.js';

export const DEFAULT_RPC_TIMEOUT_MS = 180_000;
const STDERR_TAIL_LIMIT = 64 * 1024;

export class UsageError extends Error {}

export interface VerifyDeployArgs {
  server: string;
  expectBuild: string | null;
  timeoutMs: number;
  toolName: string | undefined;
  toolArgsJson: string | undefined;
}

export function parseArgs(argv: string[]): VerifyDeployArgs {
  const [server, ...rest] = argv;
  if (!server) {
    throw new UsageError(
      'Usage: npx tsx scripts/verify-deploy.ts <server dist/index.js> [--expect-build <sha>] [--timeout <ms>] [tool [argsJSON]]',
    );
  }
  let expectBuild: string | null = null;
  let timeoutMs = DEFAULT_RPC_TIMEOUT_MS;
  let i = 0;
  while (i < rest.length && rest[i].startsWith('--')) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === '--expect-build') {
      if (!value || value.startsWith('--')) {
        throw new UsageError('--expect-build requires a commit sha argument');
      }
      expectBuild = value;
    } else if (flag === '--timeout') {
      const parsed = Number(value);
      if (!value || value.startsWith('--') || !Number.isFinite(parsed) || parsed <= 0) {
        throw new UsageError('--timeout requires a positive millisecond value');
      }
      timeoutMs = parsed;
    } else {
      throw new UsageError(`Unknown flag: ${flag}`);
    }
    i += 2;
  }
  const [toolName, toolArgsJson] = rest.slice(i);
  return { server, expectBuild, timeoutMs, toolName, toolArgsJson };
}

async function main(): Promise<void> {
  let parsedArgs: VerifyDeployArgs;
  try {
    parsedArgs = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  const { server, expectBuild, timeoutMs, toolName, toolArgsJson } = parsedArgs;

  const transport = new StdioJsonRpcTransport({ serverPath: server });
  try {
    transport.start();
  } catch (e) {
    console.error('VERIFY FAILED: could not spawn server:', (e as Error).message);
    process.exit(1);
  }

  // Failure-only stderr replay: keep a bounded tail so a crash surfaces the
  // server's own diagnostics without polluting success output.
  let stderrTail = '';
  transport.child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_LIMIT);
  });
  transport.child.on('error', (e) => {
    transport.rejectAllPending(new Error(`could not spawn server: ${e.message}`));
  });
  // Fail fast on unexpected server death instead of riding out the timeout.
  // Harmless on graceful shutdown: nothing is in flight by then.
  transport.child.once('exit', (code, signal) => {
    transport.rejectAllPending(new Error(`server exited unexpectedly (code ${code}, signal ${signal})`));
  });

  const rpc = (method: string, params: unknown): Promise<any> =>
    transport.sendRequest({ jsonrpc: '2.0', id: transport.nextId(), method, params }, timeoutMs);

  async function call(name: string, callArgs: unknown): Promise<{ ms: number; parsed: any }> {
    const t0 = Date.now();
    const res = await rpc('tools/call', { name, arguments: callArgs });
    if (res.error) throw new Error(`${name}: JSON-RPC error: ${JSON.stringify(res.error)}`);
    const text = res.result?.content?.[0]?.text;
    return { ms: Date.now() - t0, parsed: text ? JSON.parse(text) : res };
  }

  try {
    const init = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'verify-deploy', version: '1.0.0' },
    });
    if (init.error) throw new Error(`initialize: JSON-RPC error: ${JSON.stringify(init.error)}`);
    transport.sendNotification('notifications/initialized', {});

    const v = await call('system', { operation: 'version' });
    const vd = v.parsed.data ?? v.parsed;
    const buildId = vd.build?.buildId ?? vd.buildId;
    const stale = vd.build?.stale ?? vd.stale;
    console.log(JSON.stringify({ probe: 'version', buildId, stale, version: vd.version, wall_ms: v.ms }, null, 2));

    if (expectBuild !== null) {
      const pass = typeof buildId === 'string' && buildId.startsWith(expectBuild) && stale === false;
      console.log(JSON.stringify({ probe: 'expect-build', expected: expectBuild, pass }, null, 2));
      if (!pass) process.exitCode = 1;
    }

    if (toolName) {
      const toolArgs = toolArgsJson ? JSON.parse(toolArgsJson) : {};
      const { ms, parsed } = await call(toolName, toolArgs);
      console.log(JSON.stringify({ tool: toolName, wall_ms: ms, success: parsed.success, response: parsed }, null, 2));
      if (parsed.success === false) process.exitCode = 1;
    }
  } catch (e) {
    console.error('VERIFY FAILED:', (e as Error).message);
    if (stderrTail.trim()) {
      console.error('--- server stderr (tail) ---');
      console.error(stderrTail.trimEnd());
    }
    process.exitCode = 1;
  } finally {
    await transport.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

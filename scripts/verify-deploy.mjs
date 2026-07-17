#!/usr/bin/env node
/**
 * verify-deploy.mjs — standalone MCP verify driver (OMN-271, promoted from the
 * OMN-269 deploy-verification driver; supersedes test-single-tool-proper.js).
 *
 * Drives an omnifocus-mcp server build over raw JSON-RPC/stdio when no live MCP
 * connection exists (background jobs, post-redeploy checks, worktree builds).
 *
 * Why not `echo | node dist/index.js`: a one-shot pipe EOFs stdin immediately
 * and silently drops the last in-flight response. This driver keeps stdin open
 * and correlates responses by JSON-RPC id — the MCPTestClient pattern without
 * the test-harness dependency, and unlike MCPTestClient it targets ANY server
 * artifact by path (prod checkout, a worktree build).
 *
 * Usage:
 *   node scripts/verify-deploy.mjs <path>/dist/index.js
 *     Deploy verify: one `system {operation:"version"}` probe. Pass criteria
 *     (check the output yourself, or --expect-build): buildId matches the
 *     expected commit AND stale === false.
 *
 *   node scripts/verify-deploy.mjs <path>/dist/index.js --expect-build <sha>
 *     Same probe, but exits 1 unless buildId startsWith <sha> AND !stale.
 *
 *   node scripts/verify-deploy.mjs <path>/dist/index.js <tool> ['<argsJSON>']
 *     Version probe, then one tool call (full init handshake, like Claude
 *     Desktop). Exits 1 on RPC error/timeout or a success:false envelope.
 *
 * Multi-call warm sessions: for ad-hoc acceptance checks, add more
 * `await call(...)` lines before the finally block — the server stays up for
 * the whole script.
 */
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const SERVER = args[0];
if (!SERVER) {
  console.error('Usage: node scripts/verify-deploy.mjs <server dist/index.js> [--expect-build <sha>] [tool [argsJSON]]');
  process.exit(1);
}
let expectBuild = null;
let rest = args.slice(1);
if (rest[0] === '--expect-build') {
  expectBuild = rest[1];
  rest = rest.slice(2);
}
const [toolName, toolArgsJson] = rest;

const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', () => {});
child.on('error', (e) => {
  console.error('VERIFY FAILED: could not spawn server:', e.message);
  process.exit(1);
});

let buf = '';
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      // Non-JSON stdout lines are server logs; ignore.
    }
  }
});

let nextId = 1;
function rpc(method, params, timeoutMs = 180000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(t);
      resolve(msg);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

async function call(name, callArgs) {
  const t0 = Date.now();
  const res = await rpc('tools/call', { name, arguments: callArgs });
  if (res.error) throw new Error(`${name}: JSON-RPC error: ${JSON.stringify(res.error)}`);
  const text = res.result?.content?.[0]?.text;
  return { ms: Date.now() - t0, parsed: text ? JSON.parse(text) : res };
}

try {
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'verify-deploy', version: '1.0.0' },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');

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
  console.error('VERIFY FAILED:', e.message);
  process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => child.kill(), 3000).unref();
}

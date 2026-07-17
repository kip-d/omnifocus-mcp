/**
 * OMN-275 — arg parsing for scripts/verify-deploy.ts (corrects PR #230).
 *
 * Pins the two contract points the review confirmed as defects in the .mjs
 * predecessor: `--expect-build` with a missing sha silently became
 * `startsWith(undefined)` (misleading pass:false instead of a usage error),
 * and the 180s per-RPC timeout had no override for dev-smoke call sites.
 */
import { describe, it, expect } from 'vitest';
import { parseArgs, UsageError, DEFAULT_RPC_TIMEOUT_MS } from '../../../scripts/verify-deploy.js';

describe('verify-deploy parseArgs', () => {
  it('parses the bare probe form', () => {
    expect(parseArgs(['dist/index.js'])).toEqual({
      server: 'dist/index.js',
      expectBuild: null,
      timeoutMs: DEFAULT_RPC_TIMEOUT_MS,
      toolName: undefined,
      toolArgsJson: undefined,
    });
  });

  it('parses --expect-build with a sha', () => {
    expect(parseArgs(['dist/index.js', '--expect-build', 'abc1234']).expectBuild).toBe('abc1234');
  });

  it('rejects --expect-build with a missing sha as a usage error', () => {
    expect(() => parseArgs(['dist/index.js', '--expect-build'])).toThrow(UsageError);
    expect(() => parseArgs(['dist/index.js', '--expect-build'])).toThrow(/--expect-build requires/);
  });

  it('rejects --expect-build whose value is another flag', () => {
    expect(() => parseArgs(['dist/index.js', '--expect-build', '--timeout'])).toThrow(UsageError);
  });

  it('parses --timeout in milliseconds', () => {
    expect(parseArgs(['dist/index.js', '--timeout', '30000']).timeoutMs).toBe(30000);
  });

  it('rejects a non-numeric or non-positive --timeout', () => {
    expect(() => parseArgs(['dist/index.js', '--timeout', 'fast'])).toThrow(UsageError);
    expect(() => parseArgs(['dist/index.js', '--timeout', '0'])).toThrow(UsageError);
    expect(() => parseArgs(['dist/index.js', '--timeout'])).toThrow(UsageError);
  });

  it('accepts flags in either order plus a tool call', () => {
    const parsed = parseArgs([
      'dist/index.js',
      '--timeout',
      '30000',
      '--expect-build',
      'abc1234',
      'system',
      '{"operation":"version"}',
    ]);
    expect(parsed).toEqual({
      server: 'dist/index.js',
      expectBuild: 'abc1234',
      timeoutMs: 30000,
      toolName: 'system',
      toolArgsJson: '{"operation":"version"}',
    });
  });

  it('rejects a missing server path', () => {
    expect(() => parseArgs([])).toThrow(UsageError);
  });

  it('rejects an unknown flag instead of treating it as a tool name', () => {
    expect(() => parseArgs(['dist/index.js', '--expect-buidl', 'abc'])).toThrow(UsageError);
  });
});

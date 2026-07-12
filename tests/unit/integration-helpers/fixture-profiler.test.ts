/**
 * Unit tests for the fixture-profiler integration helper (OMN-186 Phase 1).
 *
 * The profiler's job: when FIXTURE_PROFILE=1, time fixture-machinery calls
 * (sandbox setup, fullCleanup, shared-server access) and append one JSON line
 * per call to a log file, so a profiled run can locate where the ~400-490s
 * non-test-body wall overhead actually goes. When the flag is off it must be
 * a pure pass-through — zero behavior change on normal runs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { profileFixture, fixtureProfilingEnabled } from '../../../tests/integration/helpers/fixture-profiler.js';
import { clearGlobalSlot } from '../../../tests/integration/helpers/global-singleton.js';

let logDir: string;
let logPath: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  logDir = mkdtempSync(join(tmpdir(), 'fixture-profiler-test-'));
  logPath = join(logDir, 'profile.jsonl');
  savedEnv.FIXTURE_PROFILE = process.env.FIXTURE_PROFILE;
  savedEnv.FIXTURE_PROFILE_LOG = process.env.FIXTURE_PROFILE_LOG;
  process.env.FIXTURE_PROFILE_LOG = logPath;
});

afterEach(() => {
  for (const key of ['FIXTURE_PROFILE', 'FIXTURE_PROFILE_LOG'] as const) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  rmSync(logDir, { recursive: true, force: true });
});

function readEntries(): Array<Record<string, unknown>> {
  return readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('fixtureProfilingEnabled', () => {
  it('is false when FIXTURE_PROFILE is unset', () => {
    delete process.env.FIXTURE_PROFILE;
    expect(fixtureProfilingEnabled()).toBe(false);
  });

  it('is true when FIXTURE_PROFILE=1', () => {
    process.env.FIXTURE_PROFILE = '1';
    expect(fixtureProfilingEnabled()).toBe(true);
  });

  it('is false when FIXTURE_PROFILE=0', () => {
    process.env.FIXTURE_PROFILE = '0';
    expect(fixtureProfilingEnabled()).toBe(false);
  });
});

describe('profileFixture', () => {
  it('runs the wrapped fn and returns its value without logging when disabled', async () => {
    delete process.env.FIXTURE_PROFILE;
    const result = await profileFixture('beforeAll', 'ensureSandboxFolder', () => Promise.resolve(42));
    expect(result).toBe(42);
    expect(existsSync(logPath)).toBe(false);
  });

  it('appends one JSON line with file/hook/op/ms when enabled', async () => {
    process.env.FIXTURE_PROFILE = '1';
    const result = await profileFixture('afterAll', 'fullCleanup', async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'done';
    });
    expect(result).toBe('done');

    const entries = readEntries();
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.hook).toBe('afterAll');
    expect(entry.op).toBe('fullCleanup');
    expect(typeof entry.file).toBe('string');
    expect(typeof entry.ms).toBe('number');
    expect(entry.ms as number).toBeGreaterThanOrEqual(5);
  });

  it('appends across calls (one line per call)', async () => {
    process.env.FIXTURE_PROFILE = '1';
    await profileFixture('beforeAll', 'getSharedClient', () => Promise.resolve(1));
    await profileFixture('afterAll', 'fullCleanup', () => Promise.resolve(2));

    const entries = readEntries();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.op)).toEqual(['getSharedClient', 'fullCleanup']);
  });

  it('still records the duration and rethrows when the wrapped fn fails', async () => {
    process.env.FIXTURE_PROFILE = '1';
    await expect(
      profileFixture('afterAll', 'fullCleanup', () => Promise.reject(new Error('cleanup exploded'))),
    ).rejects.toThrow('cleanup exploded');

    const entries = readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].op).toBe('fullCleanup');
    expect(entries[0].failed).toBe(true);
    expect(typeof entries[0].ms).toBe('number');
  });

  it('never breaks the wrapped fn when the log path is unwritable, but warns once', async () => {
    process.env.FIXTURE_PROFILE = '1';
    // point at a path whose parent is a FILE so mkdir/append must fail
    process.env.FIXTURE_PROFILE_LOG = join(logPath, 'child.jsonl');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { writeFileSync } = await import('fs');
      writeFileSync(logPath, 'occupied');
      const first = await profileFixture('beforeAll', 'ensureSandboxFolder', () => Promise.resolve('ok'));
      expect(first).toBe('ok');
      // second failing write must NOT warn again (warn-once)
      const second = await profileFixture('beforeAll', 'ensureSandboxFolder', () => Promise.resolve('ok2'));
      expect(second).toBe('ok2');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('[fixture-profiler]');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('remembers warnedWriteFailure across a module reset (OMN-261 review: same vitest per-file isolation bug fixed elsewhere)', async () => {
    // warnedWriteFailure/logDirEnsured used to be plain module-scope `let`
    // bindings — the exact pattern OMN-261 diagnosed and fixed for
    // shared-server.ts, left unconverted here. vi.resetModules() simulates
    // vitest's per-file module-registry reset; the warn-once guard must
    // still hold across the reset-reimported module instance, proving this
    // state now lives on globalThis rather than resetting per file.
    process.env.FIXTURE_PROFILE = '1';
    process.env.FIXTURE_PROFILE_LOG = join(logPath, 'child.jsonl'); // parent is a FILE, so every write fails
    const { writeFileSync } = await import('fs');
    writeFileSync(logPath, 'occupied');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset the shared globalThis slot — an earlier test in this same file
    // ("warns once") already flipped warnedWriteFailure to true there, and
    // (unlike module-scope `let`) that state now outlives this test's own
    // vi.resetModules() call below, so it must be cleared explicitly first.
    clearGlobalSlot('fixture-profiler-state');

    try {
      const mod1 = await import('../../../tests/integration/helpers/fixture-profiler.js');
      await mod1.profileFixture('beforeAll', 'first', () => Promise.resolve('a'));
      expect(warnSpy).toHaveBeenCalledTimes(1);

      vi.resetModules();
      const mod2 = await import('../../../tests/integration/helpers/fixture-profiler.js');
      await mod2.profileFixture('beforeAll', 'second', () => Promise.resolve('b'));

      // Still 1, not 2 — the reset-reimported module instance saw
      // warnedWriteFailure already true via the shared globalThis slot.
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

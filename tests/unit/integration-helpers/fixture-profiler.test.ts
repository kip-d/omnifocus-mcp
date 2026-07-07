/**
 * Unit tests for the fixture-profiler integration helper (OMN-186 Phase 1).
 *
 * The profiler's job: when FIXTURE_PROFILE=1, time fixture-machinery calls
 * (sandbox setup, fullCleanup, shared-server access) and append one JSON line
 * per call to a log file, so a profiled run can locate where the ~400-490s
 * non-test-body wall overhead actually goes. When the flag is off it must be
 * a pure pass-through — zero behavior change on normal runs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { profileFixture, fixtureProfilingEnabled } from '../../../tests/integration/helpers/fixture-profiler.js';

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

  it('never breaks the wrapped fn when the log path is unwritable', async () => {
    process.env.FIXTURE_PROFILE = '1';
    process.env.FIXTURE_PROFILE_LOG = join(logDir, 'no-such-dir', 'nested', 'profile.jsonl');
    // mkdir of the parent is expected; point at a path whose parent is a FILE to force a write failure
    process.env.FIXTURE_PROFILE_LOG = join(logPath, 'child.jsonl');
    await profileFixture('beforeAll', 'ensureSandboxFolder', async () => {
      // create logPath as a regular file so the nested path cannot be created
      const { writeFileSync } = await import('fs');
      writeFileSync(logPath, 'occupied');
      return 'ok';
    }).then((result) => expect(result).toBe('ok'));
  });
});

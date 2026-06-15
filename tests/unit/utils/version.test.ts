import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LoadedBuild } from '../../../src/utils/build-info.js';

// Control the loaded build per test.
vi.mock('../../../src/utils/build-info.js', () => ({
  readLoadedBuild: vi.fn(),
  DEV_SENTINEL: {
    hash: 'dev-unstamped',
    branch: 'unknown',
    commitDate: 'unknown',
    commitMessage: 'unknown',
    dirty: false,
    timestamp: 'unknown',
    buildId: 'dev-unstamped',
  },
}));

// Control request-time git (checkout hash + dev fallback git).
vi.mock('child_process', () => ({ execSync: vi.fn() }));

import { readLoadedBuild } from '../../../src/utils/build-info.js';
import { execSync } from 'child_process';
import { getVersionInfo } from '../../../src/utils/version.js';

const STAMPED: LoadedBuild = {
  hash: 'abc1234',
  branch: 'main',
  commitDate: '2026-06-15 10:00:00 -0400',
  commitMessage: 'feat: x',
  dirty: false,
  timestamp: '2026-06-15T14:00:00.000Z',
  buildId: 'abc1234',
};

// Route execSync by the git subcommand so we can simulate checkout hash + dev git.
function gitMock(map: Record<string, string>, fail = false) {
  vi.mocked(execSync).mockImplementation((cmd: string) => {
    if (fail) throw new Error('not a git repo');
    for (const [needle, out] of Object.entries(map)) if (cmd.includes(needle)) return out as never;
    return '' as never;
  });
}

beforeEach(() => vi.clearAllMocks());

describe('getVersionInfo staleness', () => {
  it('stamped build, checkout matches → not stale, no warning', () => {
    vi.mocked(readLoadedBuild).mockReturnValue(STAMPED);
    gitMock({ 'rev-parse --short HEAD': 'abc1234' });
    const v = getVersionInfo();
    expect(v.build.buildId).toBe('abc1234');
    expect(v.checkout.hash).toBe('abc1234');
    expect(v.stale).toBe(false);
    expect(v.warning).toBeUndefined();
  });

  it('stamped build, checkout differs → stale with warning', () => {
    vi.mocked(readLoadedBuild).mockReturnValue(STAMPED);
    gitMock({ 'rev-parse --short HEAD': 'def5678' });
    const v = getVersionInfo();
    expect(v.stale).toBe(true);
    expect(v.warning).toContain('abc1234');
    expect(v.warning).toContain('def5678');
    expect(v.warning).toContain('restart');
  });

  it('dev sentinel → buildId dev-unstamped, never stale', () => {
    vi.mocked(readLoadedBuild).mockReturnValue({ ...STAMPED, hash: 'dev-unstamped', buildId: 'dev-unstamped' });
    gitMock({ 'rev-parse --short HEAD': 'anything', 'abbrev-ref': 'feature', '%ci': 'date', '%s': 'msg' });
    const v = getVersionInfo();
    expect(v.build.buildId).toBe('dev-unstamped');
    expect(v.stale).toBe(false);
  });

  it('checkout git failure → checkout unknown, not stale', () => {
    vi.mocked(readLoadedBuild).mockReturnValue(STAMPED);
    gitMock({}, true);
    const v = getVersionInfo();
    expect(v.checkout.hash).toBe('unknown');
    expect(v.stale).toBe(false);
  });

  it('unknown stamp (build-time git failed) → not stale even if checkout is known', () => {
    vi.mocked(readLoadedBuild).mockReturnValue({ ...STAMPED, hash: 'unknown', buildId: 'unknown' });
    gitMock({ 'rev-parse --short HEAD': 'abc1234' });
    const v = getVersionInfo();
    expect(v.stale).toBe(false);
    expect(v.warning).toBeUndefined();
  });

  it('always reports process uptime + startedAt', () => {
    vi.mocked(readLoadedBuild).mockReturnValue(STAMPED);
    gitMock({ 'rev-parse --short HEAD': 'abc1234' });
    const v = getVersionInfo();
    expect(typeof v.process.uptimeSeconds).toBe('number');
    expect(typeof v.process.startedAt).toBe('string');
  });
});

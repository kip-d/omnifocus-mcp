import { describe, it, expect, vi, beforeEach } from 'vitest';

// Path-aware fs mock: only intercept build-info.json; defer everything else to real fs.
let buildInfoExists = true;
let buildInfoRaw = '';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn((p: string) => (String(p).endsWith('build-info.json') ? buildInfoExists : actual.existsSync(p))),
    readFileSync: vi.fn((p: string, enc?: unknown) =>
      String(p).endsWith('build-info.json') ? buildInfoRaw : (actual.readFileSync as any)(p, enc),
    ),
  };
});

import { readLoadedBuild, __resetBuildInfoCacheForTests, DEV_SENTINEL } from '../../../src/utils/build-info.js';

beforeEach(() => {
  __resetBuildInfoCacheForTests();
  buildInfoExists = true;
  buildInfoRaw = '';
});

describe('readLoadedBuild', () => {
  it('reads a stamped build-info.json and derives a clean buildId', () => {
    buildInfoRaw = JSON.stringify({
      hash: 'abc1234',
      branch: 'main',
      commitDate: '2026-06-15 10:00:00 -0400',
      commitMessage: 'feat: x',
      dirty: false,
      timestamp: '2026-06-15T14:00:00.000Z',
    });
    const b = readLoadedBuild();
    expect(b.hash).toBe('abc1234');
    expect(b.buildId).toBe('abc1234');
    expect(b.dirty).toBe(false);
    expect(b.timestamp).toBe('2026-06-15T14:00:00.000Z');
  });

  it('appends -dirty to buildId when the stamp is dirty', () => {
    buildInfoRaw = JSON.stringify({ hash: 'abc1234', dirty: true });
    expect(readLoadedBuild().buildId).toBe('abc1234-dirty');
  });

  it('returns the dev sentinel when build-info.json is missing', () => {
    buildInfoExists = false;
    expect(readLoadedBuild()).toEqual(DEV_SENTINEL);
  });

  it('returns the dev sentinel when build-info.json is unparseable', () => {
    buildInfoRaw = '{ not json';
    expect(readLoadedBuild()).toEqual(DEV_SENTINEL);
  });

  it('memoizes: a second call does not re-read the file', () => {
    buildInfoRaw = JSON.stringify({ hash: 'first' });
    expect(readLoadedBuild().hash).toBe('first');
    buildInfoRaw = JSON.stringify({ hash: 'second' }); // changed on disk
    expect(readLoadedBuild().hash).toBe('first'); // still cached
  });
});

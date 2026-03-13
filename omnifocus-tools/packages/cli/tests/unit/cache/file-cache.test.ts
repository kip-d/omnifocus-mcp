import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:fs — module-level store shared between mock and tests
// ---------------------------------------------------------------------------

const store = new Map<string, string>();

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  existsSync: vi.fn((p: string) => store.has(p)),
  readFileSync: vi.fn((p: string) => {
    const data = store.get(p);
    if (data === undefined) throw new Error(`ENOENT: ${p}`);
    return data;
  }),
  writeFileSync: vi.fn((p: string, data: string) => {
    store.set(p, data);
  }),
  unlinkSync: vi.fn((p: string) => {
    store.delete(p);
  }),
  readdirSync: vi.fn(() => {
    const files: string[] = [];
    for (const key of store.keys()) {
      const parts = key.split('/');
      files.push(parts[parts.length - 1]);
    }
    return files;
  }),
}));

import * as fs from 'node:fs';
import { CACHE_TTLS, FileCache } from '../../../src/cache/file-cache.js';

const mockedFs = vi.mocked(fs);

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-01T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// FileCache
// ---------------------------------------------------------------------------

describe('FileCache', () => {
  it('creates cacheDir on construction', () => {
    new FileCache('/tmp/test-cache');
    expect(mockedFs.mkdirSync).toHaveBeenCalledWith('/tmp/test-cache', { recursive: true });
  });

  // -- get ------------------------------------------------------------------

  describe('get', () => {
    it('returns null for cache miss (file does not exist)', () => {
      const cache = new FileCache('/tmp/test-cache');
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('returns cached value within TTL', () => {
      const cache = new FileCache('/tmp/test-cache');
      const payload = { items: [1, 2, 3] };
      cache.set('mykey', payload, 60_000);

      const result = cache.get<typeof payload>('mykey');
      expect(result).toEqual(payload);
    });

    it('returns null for expired entry', () => {
      const cache = new FileCache('/tmp/test-cache');
      cache.set('mykey', { x: 1 }, 60_000);

      // Advance past TTL
      vi.advanceTimersByTime(61_000);

      expect(cache.get('mykey')).toBeNull();
    });
  });

  // -- set ------------------------------------------------------------------

  describe('set', () => {
    it('writes entry with correct expiry', () => {
      const cache = new FileCache('/tmp/test-cache');
      const now = Date.now();
      cache.set('testkey', { value: 42 }, 300_000);

      const filePath = '/tmp/test-cache/testkey.json';
      const raw = store.get(filePath);
      expect(raw).toBeDefined();

      const entry = JSON.parse(raw!);
      expect(entry.data).toEqual({ value: 42 });
      expect(entry.expires).toBe(now + 300_000);
    });
  });

  // -- clear ----------------------------------------------------------------

  describe('clear', () => {
    it('deletes all cached entries', () => {
      const cache = new FileCache('/tmp/test-cache');
      cache.set('a', 1, 60_000);
      cache.set('b', 2, 60_000);

      // existsSync needs to return true for the cacheDir path too
      mockedFs.existsSync.mockImplementation((p: unknown) => {
        if (p === '/tmp/test-cache') return true;
        return store.has(p as string);
      });

      cache.clear();
      expect(mockedFs.unlinkSync).toHaveBeenCalled();
    });
  });

  // -- key sanitization -----------------------------------------------------

  describe('key sanitization', () => {
    it('sanitizes keys with special characters', () => {
      const cache = new FileCache('/tmp/test-cache');
      cache.set('my/special:key!', { data: true }, 60_000);

      // Should be retrievable with the same key
      const result = cache.get<{ data: boolean }>('my/special:key!');
      expect(result).toEqual({ data: true });
    });
  });
});

// ---------------------------------------------------------------------------
// CACHE_TTLS
// ---------------------------------------------------------------------------

describe('CACHE_TTLS', () => {
  it('projects = 5 minutes', () => {
    expect(CACHE_TTLS.projects).toBe(5 * 60 * 1000);
  });

  it('tags = 10 minutes', () => {
    expect(CACHE_TTLS.tags).toBe(10 * 60 * 1000);
  });

  it('folders = 10 minutes', () => {
    expect(CACHE_TTLS.folders).toBe(10 * 60 * 1000);
  });

  it('analytics = 1 hour', () => {
    expect(CACHE_TTLS.analytics).toBe(60 * 60 * 1000);
  });

  it('does not include tasks (always fresh)', () => {
    expect('tasks' in CACHE_TTLS).toBe(false);
  });
});

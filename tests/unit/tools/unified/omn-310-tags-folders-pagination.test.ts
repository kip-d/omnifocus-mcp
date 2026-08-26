/**
 * OMN-310: tags/folders queries silently ignored `limit` AND `offset`.
 *
 * Scouting past the ticket (which named only offset) showed the deeper hole:
 * handleTagQuery never passed limit at all (the script enumerates every tag)
 * and handleFolderQuery hardcoded limit:100 regardless of compiled.limit —
 * while BaseQuerySchema advertises limit (1-500) and offset for every query
 * type. Both paths also capped BEFORE sorting (the memory §5 trap), so an
 * honored in-loop limit would return an arbitrary subset, sorted.
 *
 * Fix shape (mirrors the tasks sorted path and OMN-309):
 *   collect ALL matches → sort → slice(offset, offset + limit)
 * Defaults preserve existing behavior: tags uncapped, folders limit 100.
 * Cache keys gain limit/offset; responses surface metadata.offset and follow
 * the OMN-154 R2 truncation rule (truncated iff offset + returned < population).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { buildFilteredFoldersScript } from '../../../../src/contracts/ast/script-builder.js';
import { buildTagsScript } from '../../../../src/contracts/ast/tag-script-builder.js';
import type { ScriptResult } from '../../../../src/omnifocus/script-result-types.js';

vi.mock('../../../../src/cache/CacheManager');
vi.mock('../../../../src/omnifocus/OmniAutomation');

// ─── Builder layer (layer 5) ─────────────────────────────────────────────

describe('OMN-310: buildFilteredFoldersScript pagination', () => {
  it('slices AFTER the sort instead of capping during iteration', () => {
    const result = buildFilteredFoldersScript({ limit: 5, offset: 10 });

    // Post-sort slice present…
    expect(result.script).toMatch(/\.slice\(10,\s*10\s*\+\s*5\)/);
    // …and the pre-sort in-loop cap is gone (the §5 arbitrary-subset trap).
    expect(result.script).not.toMatch(/count >= limit/);
  });

  it('countOnly (limit 0) skips per-folder projection entirely, not just the sort (review r4)', () => {
    const countOnly = buildFilteredFoldersScript({ limit: 0 });
    // The loop counts matches and bails — no path/depth walk, no folderObj.
    expect(countOnly.script).not.toContain('const path = getFolderPath(folder)');
    expect(countOnly.script).not.toContain('results.sort(');

    // Normal queries still project.
    const normal = buildFilteredFoldersScript({ limit: 5 });
    expect(normal.script).toContain('const path = getFolderPath(folder)');
  });

  it('defaults to limit 100 / offset 0 when not specified', () => {
    const result = buildFilteredFoldersScript({});
    expect(result.script).toMatch(/\.slice\(0,\s*0\s*\+\s*100\)/);
  });
});

describe('OMN-310: buildTagsScript (basic mode) pagination', () => {
  it('slices after the name sort in the wrapper when limit/offset are set', () => {
    const result = buildTagsScript({ mode: 'basic', limit: 5, offset: 10 } as Parameters<typeof buildTagsScript>[0]);

    expect(result.script).toMatch(/\.slice\(10,\s*10\s*\+\s*5\)/);
  });

  it('emits no slice when limit and offset are absent (uncapped browse unchanged)', () => {
    const result = buildTagsScript({ mode: 'basic' });
    expect(result.script).not.toContain('.slice(');
  });
});

// ─── Handler layer (layers 3 + 7 + 8) ────────────────────────────────────

describe('OMN-310: handler threading for tags and folders', () => {
  let tool: OmniFocusReadTool;
  let execJsonSpy: ReturnType<typeof vi.fn>;
  let mockCache: CacheManager;

  const tagsScriptSuccess = {
    success: true,
    data: {
      ok: true,
      v: 'ast',
      items: [
        { id: 't4', name: 'Delta', parentId: null },
        { id: 't5', name: 'Echo', parentId: null },
      ],
      summary: { total: 2, total_matched: 5 },
    },
  } satisfies ScriptResult;

  const foldersScriptSuccess = {
    success: true,
    data: {
      success: true,
      folders: [
        { id: 'f4', name: 'Fourth', status: 'active', depth: 0, path: 'Fourth' },
        { id: 'f5', name: 'Fifth', status: 'active', depth: 0, path: 'Fifth' },
      ],
      metadata: { returned_count: 2, total_available: 5 },
    },
  } satisfies ScriptResult;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      invalidate: vi.fn(),
    } as unknown as CacheManager;

    tool = new OmniFocusReadTool(mockCache);
    execJsonSpy = vi.fn();
    vi.spyOn(tool as any, 'execJson').mockImplementation(execJsonSpy);
  });

  it('tags: threads limit/offset into the script and the cache key', async () => {
    execJsonSpy.mockResolvedValue(tagsScriptSuccess);

    await tool.execute({ query: { type: 'tags', limit: 2, offset: 3 } });

    const script = execJsonSpy.mock.calls[0][0] as string;
    expect(script).toMatch(/\.slice\(3,\s*3\s*\+\s*2\)/);

    const cacheKey = (mockCache.get as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(cacheKey).toContain('limit:2');
    expect(cacheKey).toContain('offset:3');
  });

  it('tags: surfaces metadata.offset and applies offset-aware truncation', async () => {
    execJsonSpy.mockResolvedValue(tagsScriptSuccess);

    // population 5, offset 3, returned 2 → final page: not truncated
    const result = (await tool.execute({ query: { type: 'tags', limit: 2, offset: 3 } })) as any;

    expect(result.success).toBe(true);
    expect(result.metadata.offset).toBe(3);
    expect(result.metadata.total_count).toBe(5);
    expect(result.metadata.truncated).toBeUndefined();
  });

  it('tags: an unpaginated browse keeps its original cache key (no invalidation churn)', async () => {
    execJsonSpy.mockResolvedValue(tagsScriptSuccess);

    await tool.execute({ query: { type: 'tags' } });

    const cacheKey = (mockCache.get as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(cacheKey).toBe('list:name:true:false:false:true:false');
  });

  it('folders: threads limit/offset into the script and the cache key', async () => {
    execJsonSpy.mockResolvedValue(foldersScriptSuccess);

    await tool.execute({ query: { type: 'folders', limit: 2, offset: 3 } });

    const script = execJsonSpy.mock.calls[0][0] as string;
    expect(script).toMatch(/\.slice\(3,\s*3\s*\+\s*2\)/);

    const cacheKey = (mockCache.get as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(cacheKey).toContain('limit:2');
    expect(cacheKey).toContain('offset:3');
  });

  it('folders: surfaces metadata.offset and applies offset-aware truncation', async () => {
    execJsonSpy.mockResolvedValue(foldersScriptSuccess);

    // population 5, offset 3, returned 2 → final page: not truncated
    const result = (await tool.execute({ query: { type: 'folders', limit: 2, offset: 3 } })) as any;

    expect(result.success).toBe(true);
    expect(result.metadata.offset).toBe(3);
    expect(result.metadata.total_count).toBe(5);
    expect(result.metadata.truncated).toBeUndefined();
  });

  it('folders: an unpaginated browse keeps its original cache key (no invalidation churn)', async () => {
    execJsonSpy.mockResolvedValue(foldersScriptSuccess);

    await tool.execute({ query: { type: 'folders' } });

    const cacheKey = (mockCache.get as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(cacheKey).toBe('folders_list_basic');
  });

  it('tags: metadata carries total_count only — the legacy near-duplicate `total` is gone (review r2)', async () => {
    execJsonSpy.mockResolvedValue(tagsScriptSuccess);

    const result = (await tool.execute({ query: { type: 'tags', limit: 2, offset: 3 } })) as any;

    // OMN-154 doctrine: total_count is the single truthful population field.
    // Pre-fix, metadata.total reported the PAGE size beside total_count's
    // population — two near-identical names with different numbers.
    expect(result.metadata.total_count).toBe(5);
    expect('total' in result.metadata).toBe(false);
  });

  it('tags: a cache hit reports fresh timestamp/query_time, not the cache-write values (review r2)', async () => {
    execJsonSpy.mockResolvedValue(tagsScriptSuccess);
    (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      success: true,
      data: { items: [] },
      metadata: { timestamp: '2000-01-01T00:00:00.000Z', query_time_ms: 9999, from_cache: false },
    });

    const result = (await tool.execute({ query: { type: 'tags' } })) as any;

    expect(result.metadata.from_cache).toBe(true);
    expect(result.metadata.timestamp).not.toBe('2000-01-01T00:00:00.000Z');
    expect(result.metadata.query_time_ms).toBeLessThan(9999);
  });

  it('folders: countOnly (limit 0) emits no sort call — nothing observable to order (review r2)', async () => {
    execJsonSpy.mockResolvedValue(foldersScriptSuccess);

    await tool.execute({ query: { type: 'folders', countOnly: true } });

    const script = execJsonSpy.mock.calls[0][0] as string;
    expect(script).not.toContain('results.sort(');
  });

  it('explicit offset:0 (tags) and limit:100 (folders) key as the unpaginated browse (review r2)', async () => {
    execJsonSpy.mockResolvedValue(tagsScriptSuccess);
    await tool.execute({ query: { type: 'tags', offset: 0 } });
    const tagKey = (mockCache.get as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(tagKey).toBe('list:name:true:false:false:true:false');

    vi.clearAllMocks();
    (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(null);
    execJsonSpy.mockResolvedValue(foldersScriptSuccess);
    await tool.execute({ query: { type: 'folders', limit: 100, offset: 0 } });
    const folderKey = (mockCache.get as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(folderKey).toBe('folders_list_basic');
  });

  it('folders: a non-final page IS marked truncated', async () => {
    execJsonSpy.mockResolvedValue(foldersScriptSuccess);

    // population 5, offset 0, returned 2 → 0 + 2 < 5 → truncated
    const result = (await tool.execute({ query: { type: 'folders', limit: 2, offset: 0 } })) as any;

    expect(result.metadata.truncated).toBe(true);
  });
});

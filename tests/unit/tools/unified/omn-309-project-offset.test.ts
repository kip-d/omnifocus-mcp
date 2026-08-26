/**
 * OMN-309: projects queries silently ignored `offset`.
 *
 * The schema advertises offset for every query type and the tool description
 * says "paginate with offset" on truncation, but handleProjectQuery dropped it
 * at three layers:
 *   - layer 5: buildFilteredProjectsScript had no offset option at all
 *   - layer 3: the handler never read compiled.offset
 *   - layer 8: the cache key omitted offset, so page 2 served page 1 from cache
 *
 * Mirrors the buildFilteredTasksScript offset tests in
 * tests/unit/contracts/ast/script-builder.test.ts (text assertions on the
 * generated script) plus handler-level threading via the execJson spy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { buildFilteredProjectsScript } from '../../../../src/contracts/ast/script-builder.js';
import type { ScriptResult } from '../../../../src/omnifocus/script-result-types.js';

vi.mock('../../../../src/cache/CacheManager');
vi.mock('../../../../src/omnifocus/OmniAutomation');

describe('OMN-309: buildFilteredProjectsScript offset pagination (layer 5)', () => {
  it('skips first N matched projects when offset is specified', () => {
    const result = buildFilteredProjectsScript({}, { offset: 10, limit: 25 });

    expect(result.script).toContain('const offset = 10');
    expect(result.script).toMatch(/skipped\s*<\s*offset/);
  });

  it('emits no offset machinery when offset is 0 or absent', () => {
    const zero = buildFilteredProjectsScript({}, { offset: 0, limit: 25 });
    const absent = buildFilteredProjectsScript({}, { limit: 25 });

    for (const result of [zero, absent]) {
      expect(result.script).not.toContain('const offset');
      expect(result.script).not.toMatch(/skipped\s*<\s*offset/);
    }
  });
});

describe('OMN-309: handleProjectQuery offset threading', () => {
  let tool: OmniFocusReadTool;
  let execJsonSpy: ReturnType<typeof vi.fn>;
  let mockCache: CacheManager;

  const emptyScriptSuccess = {
    success: true,
    data: { projects: [], metadata: { total_available: 0 } },
  } satisfies ScriptResult;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      invalidate: vi.fn(),
    } as unknown as CacheManager;

    tool = new OmniFocusReadTool(mockCache);
    execJsonSpy = vi.fn().mockResolvedValue(emptyScriptSuccess);
    vi.spyOn(tool as any, 'execJson').mockImplementation(execJsonSpy);
  });

  it('passes offset through to the generated script (layer 3 → 5)', async () => {
    await tool.execute({ query: { type: 'projects', offset: 10, limit: 5 } });

    expect(execJsonSpy).toHaveBeenCalledTimes(1);
    const script = execJsonSpy.mock.calls[0][0] as string;
    expect(script).toContain('const offset = 10');
  });

  it('does not mark the final page truncated (offset + returned == population)', async () => {
    execJsonSpy.mockResolvedValueOnce({
      success: true,
      data: {
        projects: [
          { id: 'p4', name: 'Fourth', status: 'active' },
          { id: 'p5', name: 'Fifth', status: 'active' },
        ],
        metadata: { total_available: 5, total_matched: 5 },
      },
    } satisfies ScriptResult);

    const result = (await tool.execute({ query: { type: 'projects', offset: 3, limit: 25 } })) as any;

    expect(result.success).toBe(true);
    expect(result.metadata.total_count).toBe(5);
    expect(result.metadata.returned_count).toBe(2);
    // OMN-154 R2: truncated iff offset + returned < population — 3 + 2 = 5 is the last page
    expect(result.metadata.truncated).toBeUndefined();
  });

  it('includes offset in the cache key so pages cache separately (layer 8)', async () => {
    await tool.execute({ query: { type: 'projects', offset: 10, limit: 5 } });
    await tool.execute({ query: { type: 'projects', offset: 20, limit: 5 } });

    const getKeys = (mockCache.get as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1] as string);
    expect(getKeys).toHaveLength(2);
    expect(getKeys[0]).toContain('"offset":10');
    expect(getKeys[1]).toContain('"offset":20');
    expect(getKeys[0]).not.toBe(getKeys[1]);
  });
});

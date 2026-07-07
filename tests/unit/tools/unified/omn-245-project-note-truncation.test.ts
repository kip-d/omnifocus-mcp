/**
 * OMN-245: wire noteTruncateLength through project LIST reads.
 *
 * PR #194 (OMN-242) added the noteTruncated-flag truncation branch to
 * generateProjectFieldProjection, but no project call site passed
 * noteTruncateLength — the branch (and the advertised flag) was unreachable.
 * These tests pin the wiring at the handler seam, mirroring the task path:
 * list without details → truncate at NOTE_TRUNCATE_LENGTH; details:true and
 * id-lookup → full note. Cache keys must not share entries across the two
 * truncation states.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OmniFocusReadTool , projectFieldsOnResult } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { NOTE_TRUNCATE_LENGTH } from '../../../../src/contracts/ast/script-builder.js';

function createMockCache(): CacheManager & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    invalidateForTaskChange: vi.fn(),
    invalidateProject: vi.fn(),
    invalidateTag: vi.fn(),
    invalidateTaskQueries: vi.fn(),
    clear: vi.fn(),
  } as unknown as CacheManager & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
}

describe('OMN-245: project list note truncation wiring', () => {
  let tool: OmniFocusReadTool;
  let mockCache: ReturnType<typeof createMockCache>;
  let execJsonSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCache = createMockCache();
    tool = new OmniFocusReadTool(mockCache);
    execJsonSpy = vi.fn().mockResolvedValue({
      success: true,
      data: { projects: [], metadata: { total_matched: 0 } },
    });
    vi.spyOn(tool as unknown as { execJson: unknown }, 'execJson' as never).mockImplementation(execJsonSpy as never);
  });

  async function runProjectsQuery(extra: Record<string, unknown> = {}): Promise<string> {
    const result = (await tool.execute({
      query: { type: 'projects', filters: { status: 'active' }, ...extra },
    })) as unknown;
    void result;
    expect(execJsonSpy).toHaveBeenCalled();
    return String(execJsonSpy.mock.calls[0][0]);
  }

  it('list WITHOUT details: generated script contains the truncation branch + noteTruncated flag', async () => {
    const script = await runProjectsQuery();
    expect(script).toContain('noteTruncated: true');
    expect(script).toContain(`n.length > ${NOTE_TRUNCATE_LENGTH}`);
  });

  it('list WITH details:true: generated script returns the full note, no truncation branch', async () => {
    const script = await runProjectsQuery({ details: true });
    expect(script).not.toContain('noteTruncated');
    // The OmniJS body is JSON-stringified into the JXA wrapper, so quotes are
    // escaped — match the projection quote-agnostically.
    expect(script).toMatch(/note: project\.note \|\| /);
  });

  it('id-lookup path never truncates (targeted fetch → full note)', async () => {
    execJsonSpy.mockResolvedValue({
      success: true,
      data: { id: 'proj-1', name: 'P', note: 'x'.repeat(500) },
    });
    await tool.execute({ query: { type: 'projects', filters: { id: 'proj-1' } } });
    const script = String(execJsonSpy.mock.calls[0][0]);
    expect(script).not.toContain('noteTruncated');
  });

  it('cache key differs between details:false and details:true list queries', async () => {
    await runProjectsQuery();
    const keyWithout = String(mockCache.get.mock.calls.at(-1)?.[1]);
    execJsonSpy.mockClear();
    mockCache.get.mockClear();
    await runProjectsQuery({ details: true });
    const keyWith = String(mockCache.get.mock.calls.at(-1)?.[1]);
    expect(keyWithout).not.toBe(keyWith);
  });
});

describe('OMN-245: post-hoc projection carries the noteTruncated marker (live-verify finding)', () => {
  const envelope = (row: Record<string, unknown>) => ({
    success: true,
    data: { projects: [{ id: 'p1', name: 'P', note: 'x'.repeat(200) + '...', noteTruncated: true, ...row }] },
  });

  it('keeps noteTruncated when note is among the projected fields', () => {
    const out = projectFieldsOnResult(envelope({}), ['id', 'name', 'note']) as {
      data: { projects: Array<Record<string, unknown>> };
    };
    expect(out.data.projects[0].noteTruncated).toBe(true);
  });

  it('drops noteTruncated when note is NOT projected (marker rides the note)', () => {
    const out = projectFieldsOnResult(envelope({}), ['id', 'name']) as {
      data: { projects: Array<Record<string, unknown>> };
    };
    expect(out.data.projects[0]).not.toHaveProperty('noteTruncated');
    expect(out.data.projects[0]).not.toHaveProperty('note');
  });

  it('does not invent the marker for full notes', () => {
    const out = projectFieldsOnResult({ success: true, data: { projects: [{ id: 'p1', name: 'P', note: 'short' }] } }, [
      'id',
      'note',
    ]) as { data: { projects: Array<Record<string, unknown>> } };
    expect(out.data.projects[0]).not.toHaveProperty('noteTruncated');
  });
});

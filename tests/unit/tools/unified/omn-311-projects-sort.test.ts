/**
 * OMN-311: projects queries silently accepted-and-dropped `sort`.
 *
 * `sort` lives on BaseQuerySchema and compiles onto every CompiledQuery
 * variant, but only the tasks pipeline consumed it — handleProjectQuery
 * never read compiled.sort, so { type: "projects", sort: [...] } returned
 * default DB-iteration order with no error. Same accept-and-drop class as
 * OMN-309 (projects offset) and OMN-310 (tags/folders limit/offset).
 *
 * This slice makes `sort` honest everywhere:
 *  - projects: implemented in-script — collect all matches with sort values
 *    read from the RAW project object (immune to the OMN-305 trap where a
 *    sort key absent from `fields` silently no-ops), sort, then
 *    slice(offset, offset + limit)
 *  - task-only sort fields (added/modified/estimatedMinutes) on projects:
 *    rejected with guidance naming the supported fields
 *  - tags/folders: `sort` rejected with guidance (always name/path-sorted
 *    by design) instead of silently ignored
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { buildFilteredProjectsScript } from '../../../../src/contracts/ast/script-builder.js';
import { ReadSchema } from '../../../../src/tools/unified/schemas/read-schema.js';
import type { ScriptResult } from '../../../../src/omnifocus/script-result-types.js';
import { recoverInnerProgram } from '../../../utils/recover-bridge-program.js';

vi.mock('../../../../src/cache/CacheManager');
vi.mock('../../../../src/omnifocus/OmniAutomation');

// ─── Schema layer (layer 1): honest acceptance and rejection ─────────────

describe('OMN-311: ReadSchema sort-field honesty', () => {
  const parse = (query: Record<string, unknown>) => ReadSchema.safeParse({ query });

  it('accepts supported project sort fields', () => {
    const result = parse({
      type: 'projects',
      sort: [
        { field: 'name', direction: 'asc' },
        { field: 'dueDate', direction: 'desc' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects task-only sort fields on projects with guidance', () => {
    for (const field of ['added', 'modified', 'estimatedMinutes']) {
      const result = parse({ type: 'projects', sort: [{ field, direction: 'asc' }] });
      expect(result.success).toBe(false);
      const message = JSON.stringify(result.success ? {} : result.error.issues);
      expect(message).toContain(field);
      expect(message).toContain('name'); // guidance names the supported fields
    }
  });

  it('treats sort: [] as absent on every query type (review r2: defensive-client parity)', () => {
    // An empty sort array is a common templated/defensive pattern meaning
    // "no sort criteria" — it must parse everywhere, matching how projects
    // already treated it (zero entries → zero issues).
    for (const type of ['projects', 'tags', 'folders', 'perspectives']) {
      const result = parse({ type, sort: [] });
      expect(result.success).toBe(true);
    }
  });

  it('rejects sort on tags and folders queries with guidance', () => {
    for (const type of ['tags', 'folders']) {
      const result = parse({ type, sort: [{ field: 'name', direction: 'desc' }] });
      expect(result.success).toBe(false);
      const message = JSON.stringify(result.success ? {} : result.error.issues);
      expect(message).toMatch(/sorted/i); // "always name/path-sorted"
    }
  });
});

// ─── Builder layer (layer 5) ─────────────────────────────────────────────

describe('OMN-311: buildFilteredProjectsScript in-script sort', () => {
  it('collects sort values, sorts, then slices offset/limit after the sort', () => {
    const result = buildFilteredProjectsScript(
      {},
      { sort: [{ field: 'name', direction: 'asc' }], limit: 5, offset: 2 },
    );

    expect(result.script).toContain('entries.sort(');
    expect(result.script).toMatch(/\.slice\(2,\s*2\s*\+\s*5\)/);
  });

  it('reads sort values from the RAW project object — immune to the OMN-305 fields trap', () => {
    // dueDate deliberately NOT in fields; the comparator must still see it.
    const result = buildFilteredProjectsScript(
      {},
      { sort: [{ field: 'dueDate', direction: 'asc' }], fields: ['id'], limit: 25 },
    );

    expect(result.script).toContain('project.dueDate');
  });

  it('emits direction handling for desc', () => {
    const result = buildFilteredProjectsScript({}, { sort: [{ field: 'flagged', direction: 'desc' }], limit: 25 });
    // The program crosses the bridge JSON-stringified — assert on the recovered inner source.
    expect(recoverInnerProgram(result.script)).toContain('"desc"');
  });

  it('defers row projection and enrichment until AFTER the slice (review: no full-population materialization)', () => {
    const result = buildFilteredProjectsScript(
      {},
      { sort: [{ field: 'name', direction: 'asc' }], includeStats: true, performanceMode: 'normal', limit: 25 },
    );
    const inner = recoverInnerProgram(result.script);

    // The loop collects only {sort values, project ref}; the projection and the
    // per-project stats/taskCounts enrichment run after entries.sort + slice,
    // so a limit:25 page never pays enrichment for 2,000 matches.
    const sortIdx = inner.indexOf('entries.sort(');
    const projectionIdx = inner.indexOf('id: project.id.primaryKey');
    const statsIdx = inner.indexOf('proj.taskCounts');
    expect(sortIdx).toBeGreaterThanOrEqual(0);
    expect(projectionIdx).toBeGreaterThan(sortIdx);
    expect(statsIdx).toBeGreaterThan(sortIdx);
  });

  it('string sort values compare with localeCompare, matching the tasks comparator', () => {
    const result = buildFilteredProjectsScript({}, { sort: [{ field: 'name', direction: 'asc' }], limit: 25 });
    expect(recoverInnerProgram(result.script)).toContain('localeCompare');
  });

  it('without sort, keeps the existing unsorted emission (no entries machinery)', () => {
    const result = buildFilteredProjectsScript({}, { limit: 25, offset: 10 });
    expect(result.script).not.toContain('entries.sort(');
    // OMN-309 offset machinery still present on the unsorted path
    expect(result.script).toContain('const offset = 10');
  });
});

// ─── Handler layer (layers 3 + 7 + 8) ────────────────────────────────────

describe('OMN-311: handleProjectQuery sort threading', () => {
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

  it('threads sort into the generated script and the cache key', async () => {
    await tool.execute({
      query: { type: 'projects', sort: [{ field: 'name', direction: 'desc' }], limit: 5 },
    });

    const script = execJsonSpy.mock.calls[0][0] as string;
    expect(script).toContain('entries.sort(');

    const cacheKey = (mockCache.get as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(cacheKey).toContain('name');
    expect(cacheKey).toContain('desc');
  });

  it('surfaces metadata.sort_applied on sorted queries and omits it otherwise', async () => {
    const sorted = (await tool.execute({
      query: { type: 'projects', sort: [{ field: 'name', direction: 'asc' }], limit: 5 },
    })) as any;
    expect(sorted.metadata.sort_applied).toBe(true);

    const unsorted = (await tool.execute({ query: { type: 'projects', limit: 5 } })) as any;
    expect(unsorted.metadata.sort_applied).toBeUndefined();
  });
});

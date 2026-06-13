import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { QueryCompiler } from '../../../../../src/tools/unified/compilers/QueryCompiler.js';
import { isNormalizedFilter } from '../../../../../src/contracts/filters.js';
import type { ReadInput } from '../../../../../src/tools/unified/schemas/read-schema.js';

describe('QueryCompiler', () => {
  const compiler = new QueryCompiler();

  describe('compile()', () => {
    it('should compile simple tasks query to mode and filters', () => {
      const input: ReadInput = {
        query: {
          type: 'tasks',
          filters: {
            status: 'active',
            project: null,
          },
          limit: 25,
        },
      };

      const compiled = compiler.compile(input);

      expect(compiled.type).toBe('tasks');
      expect(compiled.mode).toBe('all');
      // Filters are transformed: status: 'active' -> completed: false
      expect(compiled.filters.completed).toBe(false);
      // project: null -> inInbox: true
      expect(compiled.filters.inInbox).toBe(true);
      expect(compiled.limit).toBe(25);
    });

    it('OMN-115: threads query-level fastSearch onto the compiled filter', () => {
      const input: ReadInput = {
        query: {
          type: 'tasks',
          mode: 'search',
          filters: { text: { contains: 'review' } },
          fastSearch: true,
        },
      };

      const compiled = compiler.compile(input);

      expect(compiled.fastSearch).toBe(true);
      // Must also reach the filter object so the AST search builder emits name-only.
      expect(compiled.filters.fastSearch).toBe(true);
    });

    it('OMN-115: omits fastSearch from the filter when not requested', () => {
      const input: ReadInput = {
        query: {
          type: 'tasks',
          mode: 'search',
          filters: { text: { contains: 'review' } },
        },
      };

      const compiled = compiler.compile(input);

      expect(compiled.filters.fastSearch).toBeUndefined();
    });

    it('OMN-114: passes parentTaskId filter through to the compiled filter', () => {
      const input: ReadInput = {
        query: {
          type: 'tasks',
          filters: { parentTaskId: 'abc123' },
        },
      };

      const compiled = compiler.compile(input);

      expect(compiled.filters.parentTaskId).toBe('abc123');
    });

    it('should compile smart_suggest mode', () => {
      const input: ReadInput = {
        query: {
          type: 'tasks',
          mode: 'smart_suggest',
          limit: 10,
        },
      };

      const compiled = compiler.compile(input);

      expect(compiled.type).toBe('tasks');
      expect(compiled.mode).toBe('smart_suggest');
      expect(compiled.limit).toBe(10);
    });

    it('should compile tag filters', () => {
      const input: ReadInput = {
        query: {
          type: 'tasks',
          filters: {
            tags: { any: ['work', 'urgent'] },
          },
        },
      };

      const compiled = compiler.compile(input);

      // Tags are transformed: { any: [...] } -> tags: [...], tagsOperator: 'OR'
      expect(compiled.filters.tags).toEqual(['work', 'urgent']);
      expect(compiled.filters.tagsOperator).toBe('OR');
    });
  });

  describe('transformFilters', () => {
    describe('status transformation', () => {
      it('transforms status: completed to completed: true', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ status: 'completed' });
        expect(result.completed).toBe(true);
      });

      it('transforms status: active to completed: false', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ status: 'active' });
        expect(result.completed).toBe(false);
      });

      it('leaves completed undefined when status not specified', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({});
        expect(result.completed).toBeUndefined();
      });

      it('transforms status: dropped to completed: undefined (passthrough)', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ status: 'dropped' });
        // dropped is a separate status, not completion-related
        expect(result.completed).toBeUndefined();
      });
    });

    describe('tag transformation', () => {
      it('transforms tags.any to tags + tagsOperator: OR', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          tags: { any: ['urgent', 'home'] },
        });
        expect(result.tags).toEqual(['urgent', 'home']);
        expect(result.tagsOperator).toBe('OR');
      });

      it('transforms tags.all to tags + tagsOperator: AND', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          tags: { all: ['work', 'priority'] },
        });
        expect(result.tags).toEqual(['work', 'priority']);
        expect(result.tagsOperator).toBe('AND');
      });

      it('transforms tags.none to tags + tagsOperator: NOT_IN', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          tags: { none: ['waiting'] },
        });
        expect(result.tags).toEqual(['waiting']);
        expect(result.tagsOperator).toBe('NOT_IN');
      });

      // OMN-162: {tags:{}} now throws — the tags key is present but has no
      // populated sub-keys, which compiles to no conditions (match-all hazard).
      // Callers must use a populated tags filter or omit the key entirely.
      it('rejects empty tags object as base filter (OMN-162 — was silently skipped, now throws)', () => {
        const compiler = new QueryCompiler();
        expect(() => compiler.transformFilters({ tags: {} })).toThrow(z.ZodError);
      });
    });

    describe('date transformation', () => {
      it('transforms dueDate.before to dueBefore', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          dueDate: { before: '2025-12-31' },
        });
        expect(result.dueBefore).toBe('2025-12-31');
      });

      it('transforms dueDate.after to dueAfter', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          dueDate: { after: '2025-01-01' },
        });
        expect(result.dueAfter).toBe('2025-01-01');
      });

      it('transforms dueDate.between to dueAfter + dueBefore + operator', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          dueDate: { between: ['2025-01-01', '2025-01-31'] },
        });
        expect(result.dueAfter).toBe('2025-01-01');
        expect(result.dueBefore).toBe('2025-01-31');
        expect(result.dueDateOperator).toBe('BETWEEN');
      });

      it('transforms deferDate.before to deferBefore', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          deferDate: { before: '2025-06-01' },
        });
        expect(result.deferBefore).toBe('2025-06-01');
      });

      it('transforms plannedDate.before to plannedBefore', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          plannedDate: { before: '2026-02-01' },
        });
        expect(result.plannedBefore).toBe('2026-02-01');
      });

      it('transforms plannedDate.after to plannedAfter', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          plannedDate: { after: '2026-01-15' },
        });
        expect(result.plannedAfter).toBe('2026-01-15');
      });

      it('transforms plannedDate.between to plannedAfter + plannedBefore + operator', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          plannedDate: { between: ['2026-01-01', '2026-01-31'] },
        });
        expect(result.plannedAfter).toBe('2026-01-01');
        expect(result.plannedBefore).toBe('2026-01-31');
        expect(result.plannedDateOperator).toBe('BETWEEN');
      });
    });

    describe('text transformation', () => {
      it('transforms text.contains to text + textOperator: CONTAINS', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          text: { contains: 'search term' },
        });
        expect(result.text).toBe('search term');
        expect(result.textOperator).toBe('CONTAINS');
      });

      it('transforms text.matches to text + textOperator: MATCHES', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          text: { matches: 'exact' },
        });
        expect(result.text).toBe('exact');
        expect(result.textOperator).toBe('MATCHES');
      });
    });

    describe('boolean passthrough', () => {
      it('passes through flagged', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ flagged: true });
        expect(result.flagged).toBe(true);
      });

      it('passes through available', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ available: true });
        expect(result.available).toBe(true);
      });

      it('passes through blocked', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ blocked: false });
        expect(result.blocked).toBe(false);
      });
    });

    // OMN-48: `added` date filter previously had no handler in transformDates,
    // silently dropping the filter and returning unfiltered results.
    describe('added date filter (OMN-48)', () => {
      it('added: { after } sets addedAfter', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ added: { after: '2024-01-01' } });
        expect(result.addedAfter).toBe('2024-01-01');
      });

      it('added: { before } sets addedBefore', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ added: { before: '2024-12-31' } });
        expect(result.addedBefore).toBe('2024-12-31');
      });

      it('added: { between: [a, b] } sets both bounds and BETWEEN operator', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ added: { between: ['2024-01-01', '2024-12-31'] } });
        expect(result.addedAfter).toBe('2024-01-01');
        expect(result.addedBefore).toBe('2024-12-31');
        expect(result.addedDateOperator).toBe('BETWEEN');
      });
    });

    // OMN-49: estimatedMinutes filter previously had no compiler handler — the
    // schema accepted it but the filter was silently dropped, so users querying
    // for "tasks under 30 minutes" got unfiltered results.
    describe('estimatedMinutes filter (OMN-49)', () => {
      it('estimatedMinutes: { equals: N } sets estimatedMinutesEquals', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ estimatedMinutes: { equals: 30 } });
        expect(result.estimatedMinutesEquals).toBe(30);
      });

      it('estimatedMinutes: { lessThan: N } sets estimatedMinutesLessThan', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ estimatedMinutes: { lessThan: 30 } });
        expect(result.estimatedMinutesLessThan).toBe(30);
      });

      it('estimatedMinutes: { greaterThan: N } sets estimatedMinutesGreaterThan', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ estimatedMinutes: { greaterThan: 60 } });
        expect(result.estimatedMinutesGreaterThan).toBe(60);
      });

      it('estimatedMinutes: { between: [a, b] } sets both bounds', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ estimatedMinutes: { between: [10, 30] } });
        expect(result.estimatedMinutesGreaterThan).toBe(10);
        expect(result.estimatedMinutesLessThan).toBe(30);
      });
    });

    // OMN-50: status: 'dropped' previously only set projectStatus (no task effect).
    // Each task-level status value must produce a task-filter property the AST builder uses.
    describe('status filter task-level effects (OMN-50)', () => {
      it('status: "active" sets completed: false', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ status: 'active' });
        expect(result.completed).toBe(false);
      });

      it('status: "completed" sets completed: true', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ status: 'completed' });
        expect(result.completed).toBe(true);
      });

      it('status: "dropped" sets dropped: true (OMN-50 fix)', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ status: 'dropped' });
        expect(result.dropped).toBe(true);
      });
    });

    describe('project/inbox transformation', () => {
      it('transforms project: null to inInbox: true', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ project: null });
        expect(result.inInbox).toBe(true);
      });

      it('transforms project ID to projectId', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ project: 'abc123' });
        expect(result.projectId).toBe('abc123');
      });

      // OMN-43: explicit projectId filter key for unambiguous, fast project-scoped queries.
      it('passes explicit projectId through to result.projectId', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ projectId: 'h1Y_Mpkz5fL' });
        expect(result.projectId).toBe('h1Y_Mpkz5fL');
      });

      it('explicit projectId takes precedence over project string', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ projectId: 'real-id', project: 'name-fallback' });
        expect(result.projectId).toBe('real-id');
      });

      it('explicit projectId does not turn on inInbox', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ projectId: 'h1Y_Mpkz5fL' });
        expect(result.inInbox).toBeUndefined();
      });
    });

    describe('logical operator handling', () => {
      it('transforms OR branches into orBranches array', () => {
        const compiler = new QueryCompiler();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = compiler.transformFilters({
          OR: [{ status: 'active' }, { flagged: true }],
        });

        // Should NOT warn — OR is now supported
        expect(warnSpy).not.toHaveBeenCalled();
        // Should produce orBranches with each branch independently transformed
        expect(result.orBranches).toEqual([{ completed: false, projectStatus: ['active'] }, { flagged: true }]);

        warnSpy.mockRestore();
      });

      it('flattens AND operator by merging conditions', () => {
        const compiler = new QueryCompiler();

        const result = compiler.transformFilters({
          AND: [{ status: 'active' }, { flagged: true }],
        });

        expect(result.completed).toBe(false);
        expect(result.flagged).toBe(true);
      });

      it('transforms simple NOT status to inverse', () => {
        const compiler = new QueryCompiler();

        const result = compiler.transformFilters({
          NOT: { status: 'completed' },
        });

        expect(result.completed).toBe(false);
      });
    });
  });

  describe('compile() integration', () => {
    it('transforms complex filter through compile()', () => {
      const compiler = new QueryCompiler();
      const result = compiler.compile({
        query: {
          type: 'tasks',
          filters: {
            status: 'active',
            tags: { any: ['urgent', 'home'] },
            dueDate: { before: '2025-12-31' },
            flagged: true,
          },
          limit: 10,
        },
      });

      expect(result.filters.completed).toBe(false);
      expect(result.filters.tags).toEqual(['urgent', 'home']);
      expect(result.filters.tagsOperator).toBe('OR');
      expect(result.filters.dueBefore).toBe('2025-12-31');
      expect(result.filters.flagged).toBe(true);
      expect(result.limit).toBe(10);
    });

    it('passes offset through for pagination', () => {
      const compiler = new QueryCompiler();
      const result = compiler.compile({
        query: {
          type: 'tasks',
          mode: 'all',
          limit: 100,
          offset: 200,
        },
      });

      expect(result.limit).toBe(100);
      expect(result.offset).toBe(200);
    });
  });

  describe('compile() with discriminated union types', () => {
    it('should compile task query with mode and countOnly', () => {
      const input: ReadInput = {
        query: { type: 'tasks', mode: 'flagged', countOnly: true },
      };
      const compiled = compiler.compile(input);
      expect(compiled.type).toBe('tasks');
      expect(compiled.mode).toBe('flagged');
      expect(compiled.countOnly).toBe(true);
    });

    it('should compile project query without task-specific fields', () => {
      const input: ReadInput = {
        query: { type: 'projects', fields: ['id', 'name', 'status'] },
      };
      const compiled = compiler.compile(input);
      expect(compiled.type).toBe('projects');
      expect(compiled.fields).toEqual(['id', 'name', 'status']);
      expect(compiled.mode).toBeUndefined();
      expect(compiled.countOnly).toBeUndefined();
    });

    it('should compile export query with export params', () => {
      const input: ReadInput = {
        query: { type: 'export', exportType: 'tasks', format: 'json' },
      };
      const compiled = compiler.compile(input);
      expect(compiled.type).toBe('export');
      expect(compiled.exportType).toBe('tasks');
      expect(compiled.format).toBe('json');
    });

    it('should compile tag query with only shared params', () => {
      const input: ReadInput = {
        query: { type: 'tags' },
      };
      const compiled = compiler.compile(input);
      expect(compiled.type).toBe('tags');
      expect(compiled.mode).toBeUndefined();
    });
  });

  describe('compile() normalization', () => {
    it('returns NormalizedTaskFilter from compile()', () => {
      const compiler = new QueryCompiler();
      const result = compiler.compile({
        query: {
          type: 'tasks',
          filters: { status: 'active' },
        },
      });

      expect(isNormalizedFilter(result.filters)).toBe(true);
    });

    it('converts includeCompleted to completed via normalization', () => {
      const compiler = new QueryCompiler();
      // transformFilters produces a raw TaskFilter; compile() normalizes it
      const result = compiler.compile({
        query: {
          type: 'tasks',
          filters: {},
        },
      });

      // Even with empty filters, the result should be normalized
      expect(isNormalizedFilter(result.filters)).toBe(true);
    });

    it('defaults tagsOperator when tags present but operator missing', () => {
      const compiler = new QueryCompiler();
      const result = compiler.compile({
        query: {
          type: 'tasks',
          filters: { tags: { all: ['work'] } },
        },
      });

      // tags.all already sets tagsOperator to AND in transformFilters,
      // but normalizeFilter also defaults it — result should be AND
      expect(result.filters.tagsOperator).toBe('AND');
    });

    it('defaults textOperator to CONTAINS when text present but operator missing', () => {
      const compiler = new QueryCompiler();
      const result = compiler.compile({
        query: {
          type: 'tasks',
          filters: { text: { contains: 'hello' } },
        },
      });

      // transformFilters sets textOperator to CONTAINS, normalization confirms it
      expect(result.filters.textOperator).toBe('CONTAINS');
    });
  });

  describe('unknown property validation safety net (Bug 1)', () => {
    it('does not warn on known filter properties', () => {
      const compiler = new QueryCompiler();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      compiler.transformFilters({ flagged: true, status: 'active' });

      // Should not have any warning about unknown properties
      const unknownPropWarnings = warnSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('Unknown filter properties'),
      );
      expect(unknownPropWarnings).toHaveLength(0);

      warnSpy.mockRestore();
    });

    it('does not warn for completionDate filter properties', () => {
      const compiler = new QueryCompiler();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      compiler.transformFilters({ completionDate: { before: '2025-12-31' } });

      const unknownPropWarnings = warnSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('Unknown filter properties'),
      );
      expect(unknownPropWarnings).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });

  describe('completionDate transformation (Bug 3)', () => {
    it('transforms completionDate.before to completionBefore', () => {
      const compiler = new QueryCompiler();
      const result = compiler.transformFilters({ completionDate: { before: '2025-12-31' } });
      expect(result.completionBefore).toBe('2025-12-31');
    });

    it('transforms completionDate.after to completionAfter', () => {
      const compiler = new QueryCompiler();
      const result = compiler.transformFilters({ completionDate: { after: '2025-01-01' } });
      expect(result.completionAfter).toBe('2025-01-01');
    });

    it('transforms completionDate.between to completionAfter + completionBefore + BETWEEN operator', () => {
      const compiler = new QueryCompiler();
      const result = compiler.transformFilters({
        completionDate: { between: ['2025-01-01', '2025-06-30'] },
      });
      expect(result.completionAfter).toBe('2025-01-01');
      expect(result.completionBefore).toBe('2025-06-30');
      expect(result.completionDateOperator).toBe('BETWEEN');
    });
  });

  // OMN-72: direct `completed` boolean passes through to TaskFilter.completed,
  // the same internal field `status: active|completed` already targets.
  describe('completed passthrough (OMN-72)', () => {
    it('passes completed: false through to result.completed', () => {
      const result = compiler.transformFilters({ completed: false });
      expect(result.completed).toBe(false);
    });

    it('passes completed: true through to result.completed', () => {
      const result = compiler.transformFilters({ completed: true });
      expect(result.completed).toBe(true);
    });

    it('explicit completed overrides status-derived completion', () => {
      // status:'active' would set completed:false; explicit completed:true wins.
      const result = compiler.transformFilters({ status: 'active', completed: true });
      expect(result.completed).toBe(true);
    });

    it('leaves completed undefined when neither completed nor status given', () => {
      const result = compiler.transformFilters({ flagged: true });
      expect(result.completed).toBeUndefined();
    });
  });

  // OMN-33: characterization tests for QueryCompiler branches previously
  // exercised only incidentally. Pure-function, no mocks beyond console.warn
  // spies. Each sub-describe locks in *current* behavior — these are coverage
  // gaps, not bug fixes.
  describe('coverage gaps (OMN-33)', () => {
    describe('deferDate transformation', () => {
      it('maps deferDate.after to deferAfter (only)', () => {
        const result = compiler.transformFilters({ deferDate: { after: '2026-01-01' } });
        expect(result.deferAfter).toBe('2026-01-01');
        expect(result.deferBefore).toBeUndefined();
      });

      it('maps deferDate.between to deferAfter + deferBefore with NO operator field', () => {
        // Intentional asymmetry per QueryCompiler dateFieldDefs: `deferDate` has
        // no `operatorKey` (unlike dueDate/plannedDate/completionDate/added),
        // so BETWEEN does NOT set a `deferDateOperator`. The downstream defer
        // pipeline doesn't consume one. Lock this in.
        const result = compiler.transformFilters({ deferDate: { between: ['2026-01-01', '2026-12-31'] } });
        expect(result.deferAfter).toBe('2026-01-01');
        expect(result.deferBefore).toBe('2026-12-31');
        expect((result as Record<string, unknown>).deferDateOperator).toBeUndefined();
      });
    });

    describe("status: 'on_hold'", () => {
      it('OMN-166: throws ZodError (was silently mapping to projectStatus only — now rejected with steering)', () => {
        // on_hold is a project status; tasks/export path must reject it, not silently match-all
        expect(() => compiler.transformFilters({ status: 'on_hold' })).toThrow(z.ZodError);
      });
    });

    describe('status active/completed: projectStatus side-effect', () => {
      it("status: 'active' sets BOTH completed:false AND projectStatus:['active']", () => {
        const result = compiler.transformFilters({ status: 'active' });
        expect(result.completed).toBe(false);
        expect(result.projectStatus).toEqual(['active']);
      });

      it("status: 'completed' sets BOTH completed:true AND projectStatus:['done']", () => {
        const result = compiler.transformFilters({ status: 'completed' });
        expect(result.completed).toBe(true);
        expect(result.projectStatus).toEqual(['done']);
      });
    });

    // OMN-131: unsupported NOT payloads used to warn + return {} — an EMPTY
    // filter, i.e. match-everything. Silent wrong results are worse than an
    // error, so they now throw a validation error with actionable
    // alternatives instead.
    describe('NOT operator — unsupported payloads reject loudly (OMN-131)', () => {
      it('NOT: { flagged: true } throws, naming flagged: false as the alternative', () => {
        expect(() => compiler.transformFilters({ NOT: { flagged: true } })).toThrowError(/flagged: false/);
      });

      it('NOT with a date filter throws a validation error', () => {
        expect(() => compiler.transformFilters({ NOT: { dueDate: { before: '2026-12-31' } } })).toThrowError(/NOT/);
      });

      it('NOT with a tag filter throws, naming tags: { none } as the alternative', () => {
        expect(() => compiler.transformFilters({ NOT: { tags: { any: ['@home'] } } })).toThrowError(/none/);
      });

      it('the thrown error is a ZodError (surfaces as VALIDATION_ERROR / InvalidParams)', () => {
        try {
          compiler.transformFilters({ NOT: { tags: { any: ['@home'] } } });
          expect.unreachable('should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(z.ZodError);
          const issue = (e as z.ZodError).issues[0];
          expect(issue.path).toEqual(['query', 'filters', 'NOT']);
        }
      });

      it('multi-key NOT throws even when status is present (no silent key drop)', () => {
        // Previously NOT:{status:'completed', flagged:true} took the status
        // special-case and silently DROPPED the flagged key.
        expect(() => compiler.transformFilters({ NOT: { status: 'completed', flagged: true } })).toThrowError(/NOT/);
      });

      it('empty NOT: {} throws instead of silently matching everything', () => {
        expect(() => compiler.transformFilters({ NOT: {} })).toThrowError(/NOT/);
      });

      it("NOT: { status: 'dropped' } throws (only completed/active invert cleanly)", () => {
        expect(() => compiler.transformFilters({ NOT: { status: 'dropped' } })).toThrowError(/NOT/);
      });

      it("NOT: { status: 'active' } still inverts to completed:true (no warn, no throw)", () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = compiler.transformFilters({ NOT: { status: 'active' } });
        expect(result.completed).toBe(true);
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });

    describe('OR: [] rejects (OMN-151; was match-all)', () => {
      it('throws a validation error instead of compiling to {}', () => {
        expect(() => compiler.transformFilters({ OR: [] })).toThrowError(z.ZodError);
      });
    });

    // OMN-142: `name` must compile to a name-scoped filter, never the legacy
    // `search` field — `search` matches note content too, and that over-match
    // collaterally deleted a real user task on 2026-06-09.
    describe('name filter transformation (OMN-142)', () => {
      it('name.contains compiles to name + CONTAINS, not search', () => {
        const result = compiler.transformFilters({ name: { contains: 'Quarterly' } });
        expect(result.name).toBe('Quarterly');
        expect(result.nameOperator).toBe('CONTAINS');
        expect(result.search).toBeUndefined();
      });

      it('name.matches compiles to name + MATCHES (regex no longer degrades to substring)', () => {
        const result = compiler.transformFilters({ name: { matches: 'Review.*' } });
        expect(result.name).toBe('Review.*');
        expect(result.nameOperator).toBe('MATCHES');
        expect(result.search).toBeUndefined();
      });

      it('name and text filters coexist — neither silently drops the other', () => {
        const result = compiler.transformFilters({
          name: { contains: 'Alpha' },
          text: { contains: 'Beta' },
        });
        expect(result.name).toBe('Alpha');
        expect(result.text).toBe('Beta');
      });
    });

    describe('id and folder passthrough', () => {
      it('input.id is passed through as result.id', () => {
        const result = compiler.transformFilters({ id: 'task-xyz' });
        expect(result.id).toBe('task-xyz');
      });

      // OMN-162: folder is now rejected on tasks queries — was previously silently
      // mapping to result.folder or result.folderTopLevel (both inert on tasks,
      // returning all tasks). The old tests are updated to assert the new contract.
      it('input.folder throws ZodError on tasks path (OMN-162 — was silently inert)', () => {
        expect(() => compiler.transformFilters({ folder: 'Work' })).toThrow(z.ZodError);
      });

      it('input.folder: null throws ZodError on tasks path (OMN-162 — was silently inert)', () => {
        expect(() => compiler.transformFilters({ folder: null } as never)).toThrow(z.ZodError);
      });
    });

    describe('logical-operator compile honesty (OMN-151)', () => {
      // V1: siblings beside operators merge (AND semantics), never drop
      it('merges sibling keys beside NOT (V1)', () => {
        const result = compiler.transformFilters({ flagged: true, NOT: { status: 'completed' } });
        expect(result).toEqual({ flagged: true, completed: false });
      });

      it('merges sibling keys beside AND (V1)', () => {
        const result = compiler.transformFilters({ flagged: true, AND: [{ status: 'active' }] });
        expect(result).toEqual({ flagged: true, completed: false, projectStatus: ['active'] });
      });

      it('keeps sibling keys beside OR as base keys alongside orBranches (V1)', () => {
        const result = compiler.transformFilters({
          flagged: true,
          OR: [{ name: { contains: 'a' } }, { name: { contains: 'b' } }],
        });
        expect(result.flagged).toBe(true);
        expect(result.orBranches).toHaveLength(2);
      });

      // V4: AND and OR together both apply
      it('applies AND and OR together — AND keys merge, OR becomes orBranches (V4)', () => {
        const result = compiler.transformFilters({
          AND: [{ flagged: true }],
          OR: [{ status: 'active' }, { status: 'completed' }],
        });
        expect(result.flagged).toBe(true);
        expect(result.orBranches).toHaveLength(2);
      });

      // V2: AND conflicts reject loudly
      it('rejects conflicting status across AND conditions (V2)', () => {
        expect(() => compiler.transformFilters({ AND: [{ status: 'active' }, { status: 'completed' }] })).toThrowError(
          z.ZodError,
        );
      });

      it('rejects two different name conditions under AND (unrepresentable)', () => {
        expect(() =>
          compiler.transformFilters({ AND: [{ name: { contains: 'a' } }, { name: { contains: 'b' } }] }),
        ).toThrowError(z.ZodError);
      });

      it('allows complementary date bounds across AND conditions (different internal keys)', () => {
        const result = compiler.transformFilters({
          AND: [{ dueDate: { after: '2026-01-01' } }, { dueDate: { before: '2026-02-01' } }],
        });
        expect(result.dueAfter).toBe('2026-01-01');
        expect(result.dueBefore).toBe('2026-02-01');
      });

      it('rejects base-vs-NOT contradiction: completed:true with NOT completed (cross-source)', () => {
        expect(() => compiler.transformFilters({ completed: true, NOT: { status: 'completed' } })).toThrowError(
          z.ZodError,
        );
      });

      it('OMN-72 intra-filter precedence still applies WITHIN one flat filter', () => {
        // status active + completed true in ONE flat filter: completed overrides — no conflict
        const result = compiler.transformFilters({ status: 'active', completed: true });
        expect(result.completed).toBe(true);
        expect(result.projectStatus).toEqual(['active']);
      });

      // V3 + empty AND: reject, never match-all
      it('rejects OR: [] (V3 — was match-all)', () => {
        expect(() => compiler.transformFilters({ OR: [] })).toThrowError(z.ZodError);
      });

      it('rejects AND: [] (was match-all via vacuous truth)', () => {
        expect(() => compiler.transformFilters({ AND: [] })).toThrowError(z.ZodError);
      });

      // OMN-131 contract preserved
      it('NOT non-status payloads still hard-reject (OMN-131 unchanged)', () => {
        expect(() => compiler.transformFilters({ NOT: { flagged: true } })).toThrowError(z.ZodError);
      });

      it('plain single-operator behavior unchanged: OR alone produces only orBranches', () => {
        const result = compiler.transformFilters({ OR: [{ flagged: true }, { inInbox: true }] });
        expect(result).toEqual({ orBranches: [{ flagged: true }, { inInbox: true }] });
      });

      it('tasks: {completed:false, status:"dropped"} remains ACCEPTED (returns dropped semantics, no reject)', () => {
        const result = compiler.transformFilters({ status: 'dropped', completed: false });
        expect(result.dropped).toBe(true);
        expect(result.completed).toBe(false);
      });

      // Part B: empty AND/OR branch rejection (spec §3.1 "Empty conditions")
      it('rejects OR: [{}] — empty branch would match everything', () => {
        expect(() => compiler.transformFilters({ OR: [{}] })).toThrowError(z.ZodError);
      });

      it('rejects AND: [{}] — empty AND item yields match-all', () => {
        expect(() => compiler.transformFilters({ AND: [{}] })).toThrowError(z.ZodError);
      });

      it('rejects OR: [{flagged:true}, {}] — names the empty index (1)', () => {
        try {
          compiler.transformFilters({ OR: [{ flagged: true }, {}] });
          expect.unreachable('should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(z.ZodError);
          const issue = (e as z.ZodError).issues[0];
          // Should reference the second branch (index 1)
          expect(issue.message).toContain('OR[1]');
        }
      });

      it('rejects OR: [{tags: {any: []}}] — tags any:[] transforms to nothing (no usable conditions)', () => {
        expect(() => compiler.transformFilters({ OR: [{ tags: { any: [] } }] })).toThrowError(z.ZodError);
      });

      it('top-level bare {} filter stays valid (intentional bare browse, not an OR/AND item)', () => {
        expect(() => compiler.transformFilters({})).not.toThrow();
      });
    });

    describe('compile() export passthrough', () => {
      it('echoes exportType / format / outputDirectory / includeCompleted; mode is undefined for non-tasks', () => {
        const compiled = compiler.compile({
          query: {
            type: 'export',
            exportType: 'tasks',
            format: 'csv',
            outputDirectory: './test-export-out',
            includeCompleted: false,
          },
        });
        expect(compiled.type).toBe('export');
        expect(compiled.exportType).toBe('tasks');
        expect(compiled.format).toBe('csv');
        expect(compiled.outputDirectory).toBe('./test-export-out');
        expect(compiled.includeCompleted).toBe(false);
        // mode is task-only (OMN-74); export queries get undefined
        expect(compiled.mode).toBeUndefined();
      });

      it('echoes exportFields array', () => {
        const compiled = compiler.compile({
          query: { type: 'export', exportType: 'tasks', exportFields: ['id', 'name', 'dueDate'] },
        });
        expect(compiled.exportFields).toEqual(['id', 'name', 'dueDate']);
      });

      it('echoes includeStats for project export', () => {
        const compiled = compiler.compile({
          query: { type: 'export', exportType: 'projects', includeStats: true },
        });
        expect(compiled.includeStats).toBe(true);
      });
    });
  });

  // OMN-162: filters.folder must reject on tasks/export queries (was silently inert — returned ALL tasks)
  describe('OMN-162: folder rejects on tasks/export queries', () => {
    it('base: tasks query with filters {folder:"Work"} throws ZodError with full steering message', () => {
      try {
        compiler.compile({ query: { type: 'tasks', filters: { folder: 'Work' } } });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(z.ZodError);
        const message = (e as z.ZodError).issues[0].message;
        expect(message).toMatch(/not supported on tasks or export/);
        expect(message).toMatch(/filters\.folder/);
        expect(message).toMatch(/projectId/);
      }
    });

    it('base null shape: filters {folder: null} rejects with same message', () => {
      try {
        compiler.compile({ query: { type: 'tasks', filters: { folder: null } } } as never);
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(z.ZodError);
        expect((e as z.ZodError).issues[0].message).toMatch(/not supported on tasks or export/);
      }
    });

    it('AND item: filters {AND: [{folder: "Work"}]} throws; path includes AND,0', () => {
      try {
        compiler.compile({ query: { type: 'tasks', filters: { AND: [{ folder: 'Work' }] } } } as never);
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(z.ZodError);
        const issue = (e as z.ZodError).issues[0];
        expect(issue.path).toEqual(['query', 'filters', 'AND', 0]);
      }
    });

    it('OR branch: filters {OR: [{folder: "Work"}, {flagged: true}]} throws; path includes OR,0', () => {
      try {
        compiler.compile({
          query: { type: 'tasks', filters: { OR: [{ folder: 'Work' }, { flagged: true }] } },
        } as never);
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(z.ZodError);
        const issue = (e as z.ZodError).issues[0];
        expect(issue.path).toEqual(['query', 'filters', 'OR', 0]);
      }
    });

    it('export type: {type:"export", filters:{folder:"Work"}} throws (shared path)', () => {
      expect(() =>
        compiler.compile({ query: { type: 'export', exportType: 'tasks', filters: { folder: 'Work' } } } as never),
      ).toThrow(z.ZodError);
    });

    it('control: filters {flagged: true} does NOT throw', () => {
      expect(() => compiler.compile({ query: { type: 'tasks', filters: { flagged: true } } })).not.toThrow();
    });

    it('projects regression: {type:"projects", filters:{folder:"Work"}} still maps folder to folderName (does NOT throw)', () => {
      const compiled = compiler.compile({
        query: { type: 'projects', filters: { folder: 'Work' } },
      } as never);
      // OMN-161 S1: ProjectFilter now lives on compiled.filters (no projectFilter side-channel)
      expect(compiled.type).toBe('projects');
      expect((compiled.filters as Record<string, unknown>).folderName).toBe('Work');
    });
  });

  describe('compile() projects branch (OMN-156 C-lite / OMN-161 S1)', () => {
    it('projects: typed ProjectFilter lands on compiled.filters (no projectFilter side-channel)', () => {
      const compiled = compiler.compile({
        query: { type: 'projects', filters: { flagged: true, status: 'active' } },
      } as never);
      // OMN-161 S1: ProjectFilter is now compiled.filters; projectFilter side-channel removed
      expect(compiled.type).toBe('projects');
      expect((compiled.filters as Record<string, unknown>).flagged).toBe(true);
      expect((compiled.filters as Record<string, unknown>).status).toEqual(['active']);
      // projectFilter no longer exists on CompiledQuery
      expect((compiled as any).projectFilter).toBeUndefined();
    });
    it('throws from compile() for OR on projects (reaches BaseTool as VALIDATION_ERROR)', () => {
      expect(() =>
        compiler.compile({ query: { type: 'projects', filters: { OR: [{ name: { contains: 'a' } }] } } } as never),
      ).toThrowError(z.ZodError);
    });
    it('tasks queries have NormalizedTaskFilter on compiled.filters (not ProjectFilter shape)', () => {
      const compiled = compiler.compile({ query: { type: 'tasks', filters: { flagged: true } } } as never);
      // Verify type discriminant
      expect(compiled.type).toBe('tasks');
      expect((compiled.filters as Record<string, unknown>).flagged).toBe(true);
      // projectFilter never existed on the union — structural check
      expect((compiled as any).projectFilter).toBeUndefined();
    });
  });

  // OMN-162: match-all compile guard — filters that compile to literal(true) reject
  describe('OMN-162: match-all compile guard (literal(true) hazard)', () => {
    // Import the exported helper directly for unit-level assertions
    it('compilesToMatchAll({folder:"X"}) === true — synthetic inert key (TaskFilter type still has folder even though input-level rejection precedes this path)', async () => {
      const { compilesToMatchAll } = await import('../../../../../src/tools/unified/compilers/QueryCompiler.js');
      // folder is in the TaskFilter type but has no AST builder entry → literal(true)
      expect(compilesToMatchAll({ folder: 'X' } as import('../../../../../src/contracts/filters.js').TaskFilter)).toBe(
        true,
      );
    });

    it('compilesToMatchAll({flagged: true}) === false — flagged produces a real condition', async () => {
      const { compilesToMatchAll } = await import('../../../../../src/tools/unified/compilers/QueryCompiler.js');
      expect(compilesToMatchAll({ flagged: true })).toBe(false);
    });

    it('compilesToMatchAll({}) === true — empty filter matches everything (CALLERS gate on key count; this is intentional for bare browse)', async () => {
      const { compilesToMatchAll } = await import('../../../../../src/tools/unified/compilers/QueryCompiler.js');
      // {} is a valid bare browse; the guard fires only when the INPUT had ≥1
      // non-operator key but those keys compiled away (e.g. tags:{any:[]}).
      expect(compilesToMatchAll({})).toBe(true);
    });

    // BASE SITE: live bug today — tags:{any:[]} is accepted by schema but transformTags
    // skips empty arrays, so the transformed base has zero conditions → literal(true).
    it('BASE SITE FIRES (live bug): tasks query with filters {tags:{any:[]}} throws ZodError matching /contains no executable conditions/', () => {
      try {
        compiler.compile({ query: { type: 'tasks', filters: { tags: { any: [] } } } });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(z.ZodError);
        const issue = (e as z.ZodError).issues[0];
        expect(issue.message).toMatch(/contains no executable conditions/);
        expect(issue.path).toEqual(['query', 'filters']);
      }
    });

    // Boundary: {flagged:true, tags:{any:[]}} does NOT throw — flagged produces a real
    // condition (the guard is whole-filter, not per-key; per-key is OMN-161 territory).
    it('boundary: filters {flagged:true, tags:{any:[]}} does NOT throw — sibling produces conditions', () => {
      expect(() =>
        compiler.compile({ query: { type: 'tasks', filters: { flagged: true, tags: { any: [] } } } }),
      ).not.toThrow();
    });

    // Browse controls: bare {} and absent filters must not throw
    it('browse: filters {} does NOT throw', () => {
      expect(() => compiler.compile({ query: { type: 'tasks', filters: {} } })).not.toThrow();
    });

    it('browse: absent filters does NOT throw', () => {
      expect(() => compiler.compile({ query: { type: 'tasks' } })).not.toThrow();
    });

    // Invariant non-firing sweep: one minimal filter per supported key family,
    // as (a) base filters and (b) a single OR branch paired with {flagged:true}.
    // None should throw. This confirms the guard fires only when all conditions compile away.
    describe('invariant non-firing sweep — no supported filter throws', () => {
      const supportedFilters: Array<[string, Record<string, unknown>]> = [
        ['id', { id: 'x' }],
        ['status:active', { status: 'active' }],
        ['completed:false', { completed: false }],
        ['tags any', { tags: { any: ['x'] } }],
        ['project', { project: 'P' }],
        ['projectId', { projectId: 'p1' }],
        ['parentTaskId', { parentTaskId: 't1' }],
        ['dueDate before', { dueDate: { before: '2026-01-01' } }],
        ['deferDate after', { deferDate: { after: '2026-01-01' } }],
        ['plannedDate before', { plannedDate: { before: '2026-01-01' } }],
        ['completionDate after', { completionDate: { after: '2020-01-01' } }],
        ['added after', { added: { after: '2020-01-01' } }],
        ['flagged', { flagged: true }],
        ['blocked', { blocked: false }],
        ['available', { available: true }],
        ['inInbox', { inInbox: true }],
        ['text contains', { text: { contains: 'x' } }],
        ['name contains', { name: { contains: 'x' } }],
        ['estimatedMinutes lessThan', { estimatedMinutes: { lessThan: 30 } }],
      ];

      for (const [label, filter] of supportedFilters) {
        it(`(a) base: ${label} does not throw`, () => {
          expect(() => compiler.compile({ query: { type: 'tasks', filters: filter as never } })).not.toThrow();
        });

        it(`(b) OR branch: ${label} paired with {flagged:true} does not throw`, () => {
          expect(() =>
            compiler.compile({
              query: {
                type: 'tasks',
                filters: { OR: [filter as never, { flagged: true }] },
              },
            }),
          ).not.toThrow();
        });
      }
    });
  });

  // OMN-166: status:'on_hold' must reject on tasks/export queries (was silently inert — returned ALL tasks)
  describe('OMN-166: status on_hold rejects on tasks/export queries', () => {
    it('base: tasks query with filters {status:"on_hold"} throws ZodError with full steering message', () => {
      try {
        compiler.compile({ query: { type: 'tasks', filters: { status: 'on_hold' } } } as never);
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(z.ZodError);
        const issue = (e as z.ZodError).issues[0];
        expect(issue.message).toMatch(/not supported on tasks or export/);
        expect(issue.message).toMatch(/on-hold is a project status/);
        expect(issue.message).toMatch(/projectId/);
        expect(issue.path).toEqual(['query', 'filters', 'status']);
      }
    });

    it('OR branch: filters {OR: [{status:"on_hold"}, {flagged: true}]} throws (was silent match-all widening)', () => {
      expect(() =>
        compiler.compile({
          query: { type: 'tasks', filters: { OR: [{ status: 'on_hold' }, { flagged: true }] } },
        } as never),
      ).toThrow(z.ZodError);
    });

    it('export type: {type:"export", filters:{status:"on_hold"}} throws', () => {
      expect(() =>
        compiler.compile({ query: { type: 'export', exportType: 'tasks', filters: { status: 'on_hold' } } } as never),
      ).toThrow(z.ZodError);
    });

    it('control: status "active" compiles without throwing (completed:false)', () => {
      const compiled = compiler.compile({ query: { type: 'tasks', filters: { status: 'active' } } } as never);
      expect(compiled.filters.completed).toBe(false);
    });

    it('control: status "completed" compiles without throwing (completed:true)', () => {
      const compiled = compiler.compile({ query: { type: 'tasks', filters: { status: 'completed' } } } as never);
      expect(compiled.filters.completed).toBe(true);
    });

    it('control: status "dropped" compiles without throwing (dropped:true)', () => {
      const compiled = compiler.compile({ query: { type: 'tasks', filters: { status: 'dropped' } } } as never);
      expect(compiled.filters.dropped).toBe(true);
    });

    it('projects regression: {type:"projects", filters:{status:"on_hold"}} does NOT throw and maps to onHold', () => {
      const compiled = compiler.compile({
        query: { type: 'projects', filters: { status: 'on_hold' } },
      } as never);
      // OMN-161 S1: ProjectFilter now lives on compiled.filters (no projectFilter side-channel)
      expect(compiled.type).toBe('projects');
      expect((compiled.filters as Record<string, unknown>).status).toEqual(['onHold']);
    });
  });

  // OMN-161 F5: on_hold rejection path must be origin-aware
  describe('OMN-161 F5: origin-aware on_hold rejection path', () => {
    it('on_hold inside an OR branch reports the branch-qualified path (OMN-161 F5)', () => {
      const c = new QueryCompiler();
      try {
        c.transformFilters({ OR: [{ flagged: true }, { status: 'on_hold' }] } as any);
        throw new Error('did not throw');
      } catch (e) {
        expect(e).toBeInstanceOf(z.ZodError);
        expect((e as z.ZodError).issues[0].path).toEqual(['query', 'filters', 'OR', 1, 'status']);
      }
    });
    it('on_hold at top level still reports filters.status (OMN-161 F5)', () => {
      const c = new QueryCompiler();
      try {
        c.transformFilters({ status: 'on_hold' } as any);
        throw new Error('no throw');
      } catch (e) {
        expect((e as z.ZodError).issues[0].path).toEqual(['query', 'filters', 'status']);
      }
    });
  });
});

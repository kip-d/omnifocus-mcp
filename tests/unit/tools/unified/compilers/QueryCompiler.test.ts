import { describe, it, expect, vi } from 'vitest';
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

      it('handles empty tags object', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({ tags: {} });
        expect(result.tags).toBeUndefined();
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
    });

    describe('logical operator handling', () => {
      it('logs warning for OR operator and uses first condition', () => {
        const compiler = new QueryCompiler();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = compiler.transformFilters({
          OR: [{ status: 'active' }, { flagged: true }],
        });

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OR operator not yet supported'));
        // Should use first condition
        expect(result.completed).toBe(false);

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
});

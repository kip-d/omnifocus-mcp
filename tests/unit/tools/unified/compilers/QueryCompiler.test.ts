import { describe, it, expect, vi } from 'vitest';
import { QueryCompiler } from '../../../../../src/tools/unified/compilers/QueryCompiler.js';
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
      }
    };

    const compiled = compiler.compile(input);

    expect(compiled.type).toBe('tasks');
    expect(compiled.mode).toBe('all');
    expect(compiled.filters.status).toBe('active');
    expect(compiled.filters.project).toBe(null);
    expect(compiled.limit).toBe(25);
  });

  it('should compile smart_suggest mode', () => {
    const input: ReadInput = {
      query: {
        type: 'tasks',
        mode: 'smart_suggest',
        limit: 10,
      }
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
        }
      }
    };

    const compiled = compiler.compile(input);

    expect(compiled.filters.tags).toEqual({ any: ['work', 'urgent'] });
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
          tags: { any: ['urgent', 'home'] }
        });
        expect(result.tags).toEqual(['urgent', 'home']);
        expect(result.tagsOperator).toBe('OR');
      });

      it('transforms tags.all to tags + tagsOperator: AND', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          tags: { all: ['work', 'priority'] }
        });
        expect(result.tags).toEqual(['work', 'priority']);
        expect(result.tagsOperator).toBe('AND');
      });

      it('transforms tags.none to tags + tagsOperator: NOT_IN', () => {
        const compiler = new QueryCompiler();
        const result = compiler.transformFilters({
          tags: { none: ['waiting'] }
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
  });
});

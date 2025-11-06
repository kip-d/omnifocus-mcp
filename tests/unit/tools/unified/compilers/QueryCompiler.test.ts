import { describe, it, expect } from 'vitest';
import { QueryCompiler } from '../../../../../src/tools/unified/compilers/QueryCompiler.js';
import type { ReadInput } from '../../../../../src/tools/unified/schemas/read-schema.js';

describe('QueryCompiler', () => {
  const compiler = new QueryCompiler();

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

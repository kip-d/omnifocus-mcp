import { describe, it, expect } from 'vitest';
import { MutationCompiler } from '../../../../../src/tools/unified/compilers/MutationCompiler.js';
import type { WriteInput } from '../../../../../src/tools/unified/schemas/write-schema.js';

describe('MutationCompiler', () => {
  const compiler = new MutationCompiler();

  it('should compile create mutation', () => {
    const input: WriteInput = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Test task',
          tags: ['work'],
          dueDate: '2025-01-15',
        }
      }
    };

    const compiled = compiler.compile(input);

    expect(compiled.operation).toBe('create');
    expect(compiled.target).toBe('task');
    expect(compiled.data?.name).toBe('Test task');
    expect(compiled.data?.tags).toEqual(['work']);
  });

  it('should compile update mutation', () => {
    const input: WriteInput = {
      mutation: {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: {
          flagged: true,
          addTags: ['urgent']
        }
      }
    };

    const compiled = compiler.compile(input);

    expect(compiled.operation).toBe('update');
    expect(compiled.taskId).toBe('task-123');
    expect(compiled.changes?.flagged).toBe(true);
  });
});

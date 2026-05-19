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
        },
      },
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
          addTags: ['urgent'],
        },
      },
    };

    const compiled = compiler.compile(input);

    expect(compiled.operation).toBe('update');
    expect(compiled.taskId).toBe('task-123');
    expect(compiled.changes?.flagged).toBe(true);
  });

  it('should compile create_folder mutation', () => {
    const input: WriteInput = {
      mutation: {
        operation: 'create_folder' as const,
        data: {
          name: 'Home',
          parentFolder: 'Personal',
        },
      },
    };

    const compiled = compiler.compile(input);

    expect(compiled.operation).toBe('create_folder');
    if (compiled.operation === 'create_folder') {
      expect(compiled.data.name).toBe('Home');
      expect(compiled.data.parentFolder).toBe('Personal');
    }
  });

  it('should compile create_folder without parentFolder', () => {
    const input: WriteInput = {
      mutation: {
        operation: 'create_folder' as const,
        data: {
          name: 'Top Level Folder',
        },
      },
    };

    const compiled = compiler.compile(input);

    expect(compiled.operation).toBe('create_folder');
    if (compiled.operation === 'create_folder') {
      expect(compiled.data.name).toBe('Top Level Folder');
      expect(compiled.data.parentFolder).toBeUndefined();
    }
  });

  // OMN-71: target_id is an accepted alias for id on delete. The compiler
  // normalizes it so downstream handlers see the same taskId/projectId.
  describe('delete target_id alias (OMN-71)', () => {
    it('maps target_id to taskId for a task delete', () => {
      const input: WriteInput = {
        mutation: { operation: 'delete', target: 'task', target_id: 'task-abc' },
      };
      const compiled = compiler.compile(input);
      expect(compiled.operation).toBe('delete');
      if (compiled.operation === 'delete') {
        expect(compiled.taskId).toBe('task-abc');
        expect(compiled.projectId).toBeUndefined();
      }
    });

    it('maps target_id to projectId for a project delete', () => {
      const input: WriteInput = {
        mutation: { operation: 'delete', target: 'project', target_id: 'proj-xyz' },
      };
      const compiled = compiler.compile(input);
      if (compiled.operation === 'delete') {
        expect(compiled.projectId).toBe('proj-xyz');
        expect(compiled.taskId).toBeUndefined();
      }
    });

    it('still maps legacy id for back-compat', () => {
      const input: WriteInput = {
        mutation: { operation: 'delete', target: 'task', id: 'legacy-id' },
      };
      const compiled = compiler.compile(input);
      if (compiled.operation === 'delete') {
        expect(compiled.taskId).toBe('legacy-id');
      }
    });
  });
});

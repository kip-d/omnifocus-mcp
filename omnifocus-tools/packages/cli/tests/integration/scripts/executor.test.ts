import { describe, it, expect } from 'vitest';
import { ScriptBuilder } from '../../../src/scripts/script-builder.js';
import { ScriptExecutor } from '../../../src/scripts/executor.js';

// Task listing iterates ALL flattenedTasks() to apply filters, which is slow
// on large databases. Use generous timeouts for task-related tests.
const TASK_TIMEOUT = 120_000;

describe('ScriptExecutor integration', () => {
  it(
    'can list tasks from OmniFocus',
    async () => {
      const script = ScriptBuilder.listTasks({ limit: 5 });
      const result = await ScriptExecutor.execute<{ tasks: unknown[] }>(script);
      expect(result).toHaveProperty('tasks');
      expect(Array.isArray(result.tasks)).toBe(true);
    },
    TASK_TIMEOUT,
  );

  it('can list projects from OmniFocus', async () => {
    const script = ScriptBuilder.listProjects({});
    const result = await ScriptExecutor.execute<{ projects: unknown[] }>(script);
    expect(result).toHaveProperty('projects');
    expect(Array.isArray(result.projects)).toBe(true);
  }, 30_000);

  it('can list tags from OmniFocus', async () => {
    const script = ScriptBuilder.listTags();
    const result = await ScriptExecutor.execute<{ tags: unknown[] }>(script);
    expect(result).toHaveProperty('tags');
    expect(Array.isArray(result.tags)).toBe(true);
  }, 30_000);

  it('can list folders from OmniFocus', async () => {
    const script = ScriptBuilder.listFolders();
    const result = await ScriptExecutor.execute<{ folders: unknown[] }>(script);
    expect(result).toHaveProperty('folders');
    expect(Array.isArray(result.folders)).toBe(true);
  }, 30_000);

  it(
    'returns typed task objects with expected fields',
    async () => {
      const script = ScriptBuilder.listTasks({ limit: 1 });
      const result = await ScriptExecutor.execute<{ tasks: Record<string, unknown>[]; total: number }>(script);
      expect(result).toHaveProperty('total');
      expect(typeof result.total).toBe('number');

      if (result.tasks.length > 0) {
        const task = result.tasks[0];
        expect(task).toHaveProperty('id');
        expect(task).toHaveProperty('name');
        expect(typeof task.id).toBe('string');
        expect(typeof task.name).toBe('string');
      }
    },
    TASK_TIMEOUT,
  );
});

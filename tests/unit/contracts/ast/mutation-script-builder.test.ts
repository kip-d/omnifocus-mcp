import { describe, it, expect } from 'vitest';
import {
  buildCreateTaskScript,
  buildCreateProjectScript,
  buildUpdateTaskScript,
  buildUpdateProjectScript,
  buildCompleteScript,
  buildDeleteScript,
  buildBatchScript,
  buildBulkDeleteScript,
  type GeneratedMutationScript,
} from '../../../../src/contracts/ast/mutation-script-builder.js';

describe('buildCreateTaskScript', () => {
  it('generates valid JXA script for basic task creation', async () => {
    const result = await buildCreateTaskScript({
      name: 'Test Task',
    });

    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('Test Task');
    expect(result.operation).toBe('create');
    expect(result.target).toBe('task');
  });

  it('includes note in task creation', async () => {
    const result = await buildCreateTaskScript({
      name: 'Task with Note',
      note: 'This is a detailed note',
    });

    expect(result.script).toContain('This is a detailed note');
  });

  it('includes flagged status', async () => {
    const result = await buildCreateTaskScript({
      name: 'Flagged Task',
      flagged: true,
    });

    // Check the JSON-embedded data contains flagged:true
    expect(result.script).toContain('"flagged":true');
  });

  it('includes due date', async () => {
    const result = await buildCreateTaskScript({
      name: 'Task with Due Date',
      dueDate: '2025-12-31',
    });

    expect(result.script).toContain('2025-12-31');
    expect(result.script).toContain('dueDate');
  });

  it('includes defer date', async () => {
    const result = await buildCreateTaskScript({
      name: 'Deferred Task',
      deferDate: '2025-12-01 08:00',
    });

    expect(result.script).toContain('2025-12-01');
    expect(result.script).toContain('deferDate');
  });

  it('includes estimated minutes', async () => {
    const result = await buildCreateTaskScript({
      name: 'Estimated Task',
      estimatedMinutes: 45,
    });

    expect(result.script).toContain('estimatedMinutes');
    expect(result.script).toContain('45');
  });

  it('includes tags array', async () => {
    const result = await buildCreateTaskScript({
      name: 'Tagged Task',
      tags: ['work', 'urgent'],
    });

    expect(result.script).toContain('tags');
    expect(result.script).toContain('work');
    expect(result.script).toContain('urgent');
  });

  it('includes resolveOrCreateTagByPath for tag assignment', async () => {
    const result = await buildCreateTaskScript({
      name: 'Task with Nested Tags',
      tags: ['Work : Projects : Active'],
    });
    expect(result.script).toContain('resolveOrCreateTagByPath');
  });

  it('includes project assignment', async () => {
    const result = await buildCreateTaskScript({
      name: 'Project Task',
      project: 'Work Project',
    });

    expect(result.script).toContain('projectId');
    expect(result.script).toContain('Work Project');
  });

  it('handles null project (inbox)', async () => {
    const result = await buildCreateTaskScript({
      name: 'Inbox Task',
      project: null,
    });

    expect(result.script).toContain('inboxTasks');
  });

  it('includes parent task ID for subtasks', async () => {
    const result = await buildCreateTaskScript({
      name: 'Subtask',
      parentTaskId: 'parent-123',
    });

    expect(result.script).toContain('parentTaskId');
    expect(result.script).toContain('parent-123');
  });

  it('includes repetition rule', async () => {
    const result = await buildCreateTaskScript({
      name: 'Recurring Task',
      repetitionRule: {
        frequency: 'weekly',
        interval: 1,
        daysOfWeek: [1, 3, 5],
      },
    });

    expect(result.script).toContain('repeatRule');
    expect(result.script).toContain('weekly');
  });

  it('escapes special characters in name', async () => {
    const result = await buildCreateTaskScript({
      name: 'Task with \'quotes\' and "double quotes"',
    });

    // Should not break script structure
    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('quotes');
  });

  it('returns IIFE structure', async () => {
    const result = await buildCreateTaskScript({ name: 'Test' });

    expect(result.script).toMatch(/^\s*\(\s*\(\s*\)\s*=>\s*\{/);
    expect(result.script).toMatch(/\}\s*\)\s*\(\s*\)\s*;?\s*$/);
  });

  it('includes error handling', async () => {
    const result = await buildCreateTaskScript({ name: 'Test' });

    expect(result.script).toContain('try {');
    expect(result.script).toContain('catch');
  });

  it('returns JSON stringified response', async () => {
    const result = await buildCreateTaskScript({ name: 'Test' });

    expect(result.script).toContain('JSON.stringify');
  });
});

describe('buildCreateProjectScript', () => {
  it('generates valid script for project creation', () => {
    const result = buildCreateProjectScript({
      name: 'Test Project',
    });

    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('Test Project');
    expect(result.operation).toBe('create');
    expect(result.target).toBe('project');
  });

  it('includes sequential flag', () => {
    const result = buildCreateProjectScript({
      name: 'Sequential Project',
      sequential: true,
    });

    expect(result.script).toContain('sequential');
    expect(result.script).toContain('true');
  });

  it('includes folder assignment', () => {
    const result = buildCreateProjectScript({
      name: 'Folder Project',
      folder: 'Work Folder',
    });

    expect(result.script).toContain('folder');
    expect(result.script).toContain('Work Folder');
  });

  it('includes status', () => {
    const result = buildCreateProjectScript({
      name: 'On Hold Project',
      status: 'on_hold',
    });

    expect(result.script).toContain('status');
    expect(result.script).toContain('on_hold');
  });

  it('includes review interval', () => {
    const result = buildCreateProjectScript({
      name: 'Reviewed Project',
      reviewInterval: 7,
    });

    expect(result.script).toContain('reviewInterval');
    expect(result.script).toContain('7');
  });
});

describe('buildUpdateTaskScript', () => {
  it('generates valid script for task update', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      name: 'Updated Name',
    });

    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('task-123');
    expect(result.script).toContain('Updated Name');
    expect(result.operation).toBe('update');
    expect(result.target).toBe('task');
  });

  it('handles flagged update', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      flagged: true,
    });

    expect(result.script).toContain('flagged');
    expect(result.script).toContain('true');
  });

  it('handles tag replacement', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      tags: ['new-tag-1', 'new-tag-2'],
    });

    expect(result.script).toContain('tags');
    expect(result.script).toContain('new-tag-1');
  });

  it('handles addTags operation', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      addTags: ['additional-tag'],
    });

    expect(result.script).toContain('addTags');
    expect(result.script).toContain('additional-tag');
  });

  it('handles removeTags operation', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      removeTags: ['unwanted-tag'],
    });

    expect(result.script).toContain('removeTags');
    expect(result.script).toContain('unwanted-tag');
  });

  it('handles clearDueDate flag', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      clearDueDate: true,
    });

    expect(result.script).toContain('clearDueDate');
  });

  it('handles project change', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      project: 'new-project-id',
    });

    expect(result.script).toContain('project');
    expect(result.script).toContain('new-project-id');
  });

  it('handles move to inbox (project: null)', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      project: null,
    });

    expect(result.script).toContain('inbox');
  });

  it('handles parentTaskId update using parentTask.ending for subtask relationship', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      parentTaskId: 'parent-456',
    });

    expect(result.script).toContain('parent-456');
    expect(result.script).toContain('parentTask.ending');
  });

  it('handles parentTaskId: null to unparent using .beginning', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      parentTaskId: null,
    });

    expect(result.script).toContain('.beginning');
  });

  it('includes resolveOrCreateTagByPath for tag update', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      tags: ['Errands : Downtown'],
    });
    expect(result.script).toContain('resolveOrCreateTagByPath');
  });

  it('includes resolveTagByPath for removeTags (no creation)', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      removeTags: ['Errands : Downtown'],
    });
    expect(result.script).toContain('resolveTagByPath');
  });
});

describe('buildUpdateProjectScript', () => {
  it('generates valid script for project update', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      name: 'Updated Project',
    });

    expect(result.script).toContain('project-123');
    expect(result.script).toContain('Updated Project');
    expect(result.operation).toBe('update');
    expect(result.target).toBe('project');
  });

  it('handles status change', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      status: 'completed',
    });

    expect(result.script).toContain('status');
    expect(result.script).toContain('completed');
  });

  it('handles folder change', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      folder: 'New Folder',
    });

    expect(result.script).toContain('folder');
    expect(result.script).toContain('New Folder');
  });

  it('handles folder change to null (move to root)', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      folder: null,
    });

    expect(result.script).toContain('moveSections');
    expect(result.script).toContain('library.beginning');
  });

  it('generates moveSections call for folder change', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      folder: 'Development',
    });

    expect(result.script).toContain('moveSections');
    expect(result.script).toContain('Development');
  });
});

describe('buildCompleteScript', () => {
  it('generates valid script for task completion', async () => {
    const result = await buildCompleteScript('task', 'task-123');

    expect(result.script).toContain('task-123');
    expect(result.script).toContain('complete');
    expect(result.operation).toBe('complete');
    expect(result.target).toBe('task');
  });

  it('generates valid script for project completion', async () => {
    const result = await buildCompleteScript('project', 'project-123');

    expect(result.script).toContain('project-123');
    expect(result.operation).toBe('complete');
    expect(result.target).toBe('project');
  });

  it('handles custom completion date', async () => {
    const result = await buildCompleteScript('task', 'task-123', '2025-11-24');

    expect(result.script).toContain('2025-11-24');
    expect(result.script).toContain('completionDate');
  });

  it('includes markComplete call', async () => {
    const result = await buildCompleteScript('task', 'task-123');

    expect(result.script).toContain('markComplete');
  });

  it('does not hardcode completed: true in outer return for projects', async () => {
    const result = await buildCompleteScript('project', 'project-123');

    // The outer script should return the bridge result directly (like buildDeleteScript),
    // not construct a new object with hardcoded completed: true.
    // The correct pattern is: return JSON.stringify(result)
    expect(result.script).toContain('return JSON.stringify(result)');
  });

  it('checks result.success before reporting completion for projects', async () => {
    const result = await buildCompleteScript('project', 'project-123');

    // Like buildDeleteScript, should check result.success and return error if not successful
    expect(result.script).toContain('result.success');
  });

  it('passes completionDate to markComplete for projects', async () => {
    const result = await buildCompleteScript('project', 'project-123', '2025-11-24');

    // markComplete should receive the completion date inside the bridge script
    expect(result.script).toContain('markComplete');
    expect(result.script).toContain('2025-11-24');
  });

  it('uses OmniJS bridge for project lookup by id.primaryKey', async () => {
    const result = await buildCompleteScript('project', 'project-123');

    // Should use id.primaryKey for lookup (correct for both tasks and projects)
    expect(result.script).toContain('id.primaryKey');
    expect(result.script).toContain('flattenedProjects');
  });
});

describe('buildDeleteScript', () => {
  it('generates valid script for task deletion', async () => {
    const result = await buildDeleteScript('task', 'task-123');

    expect(result.script).toContain('task-123');
    expect(result.operation).toBe('delete');
    expect(result.target).toBe('task');
  });

  it('generates valid script for project deletion', async () => {
    const result = await buildDeleteScript('project', 'project-123');

    expect(result.script).toContain('project-123');
    expect(result.operation).toBe('delete');
    expect(result.target).toBe('project');
  });

  it('calls delete method', async () => {
    const result = await buildDeleteScript('task', 'task-123');

    // Should use OmniFocus delete/remove API
    expect(result.script).toMatch(/delete|remove/);
  });
});

describe('buildBatchScript', () => {
  it('generates valid script for batch creates', () => {
    const result = buildBatchScript('task', [
      { operation: 'create', target: 'task', data: { name: 'Task 1' } },
      { operation: 'create', target: 'task', data: { name: 'Task 2' } },
    ]);

    expect(result.script).toContain('Task 1');
    expect(result.script).toContain('Task 2');
    expect(result.operation).toBe('batch');
    expect(result.target).toBe('task');
  });

  it('generates valid script for batch updates', () => {
    const result = buildBatchScript('task', [
      { operation: 'update', target: 'task', id: 'task-1', changes: { flagged: true } },
      { operation: 'update', target: 'task', id: 'task-2', changes: { flagged: false } },
    ]);

    expect(result.script).toContain('task-1');
    expect(result.script).toContain('task-2');
  });

  it('handles mixed operations', () => {
    const result = buildBatchScript('task', [
      { operation: 'create', target: 'task', data: { name: 'New Task' } },
      { operation: 'update', target: 'task', id: 'task-1', changes: { name: 'Updated' } },
    ]);

    expect(result.script).toContain('New Task');
    expect(result.script).toContain('Updated');
  });

  it('supports tempId for parent references', () => {
    const result = buildBatchScript(
      'task',
      [
        { operation: 'create', target: 'task', data: { name: 'Parent' }, tempId: 'temp-1' },
        { operation: 'create', target: 'task', data: { name: 'Child' }, parentTempId: 'temp-1' },
      ],
      { createSequentially: true },
    );

    expect(result.script).toContain('temp-1');
    expect(result.script).toContain('Parent');
    expect(result.script).toContain('Child');
  });

  it('respects createSequentially option', () => {
    const result = buildBatchScript('task', [{ operation: 'create', target: 'task', data: { name: 'Task' } }], {
      createSequentially: true,
    });

    expect(result.script).toContain('sequential');
  });

  it('returns tempId mapping in metadata', () => {
    const result = buildBatchScript(
      'task',
      [{ operation: 'create', target: 'task', data: { name: 'Task' }, tempId: 'temp-1' }],
      { returnMapping: true },
    );

    expect(result.script).toContain('tempIdMapping');
  });
});

describe('buildBulkDeleteScript', () => {
  it('generates valid script for bulk task deletion', async () => {
    const result = await buildBulkDeleteScript('task', ['task-1', 'task-2', 'task-3']);

    expect(result.script).toContain('task-1');
    expect(result.script).toContain('task-2');
    expect(result.script).toContain('task-3');
    expect(result.operation).toBe('bulk_delete');
    expect(result.target).toBe('task');
  });

  it('generates valid script for bulk project deletion', async () => {
    const result = await buildBulkDeleteScript('project', ['proj-1', 'proj-2']);

    expect(result.script).toContain('proj-1');
    expect(result.script).toContain('proj-2');
    expect(result.target).toBe('project');
  });

  it('iterates through IDs', async () => {
    const result = await buildBulkDeleteScript('task', ['id-1', 'id-2']);

    expect(result.script).toMatch(/forEach|for.*\(|map/);
  });

  it('returns count of deleted items', async () => {
    const result = await buildBulkDeleteScript('task', ['id-1', 'id-2']);

    expect(result.script).toContain('deletedCount');
  });
});

describe('script structure consistency', () => {
  it('all scripts return GeneratedMutationScript interface', async () => {
    const scripts: GeneratedMutationScript[] = await Promise.all([
      buildCreateTaskScript({ name: 'Test' }),
      Promise.resolve(buildCreateProjectScript({ name: 'Test' })),
      buildUpdateTaskScript('id', { name: 'Test' }),
      buildUpdateProjectScript('id', { name: 'Test' }),
      buildCompleteScript('task', 'id'),
      buildDeleteScript('task', 'id'),
      Promise.resolve(buildBatchScript('task', [])),
      buildBulkDeleteScript('task', ['id']),
    ]);

    scripts.forEach((result) => {
      expect(result).toHaveProperty('script');
      expect(result).toHaveProperty('operation');
      expect(result).toHaveProperty('target');
      expect(typeof result.script).toBe('string');
    });
  });

  it('all scripts are valid JavaScript (can be parsed)', async () => {
    const scripts = [
      (await buildCreateTaskScript({ name: 'Test' })).script,
      (await buildCompleteScript('task', 'id')).script,
      (await buildDeleteScript('task', 'id')).script,
    ];

    scripts.forEach((script) => {
      // Basic syntax check - should not throw
      expect(() => {
        // Check if it's syntactically valid by wrapping in Function
        // Note: This doesn't execute the script, just parses it
        new Function(script);
      }).not.toThrow();
    });
  });
});

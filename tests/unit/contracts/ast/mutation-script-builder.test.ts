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
  it('generates valid JXA script for basic task creation', () => {
    const result = buildCreateTaskScript({
      name: 'Test Task',
    });

    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('Test Task');
    expect(result.operation).toBe('create');
    expect(result.target).toBe('task');
  });

  it('includes note in task creation', () => {
    const result = buildCreateTaskScript({
      name: 'Task with Note',
      note: 'This is a detailed note',
    });

    expect(result.script).toContain('This is a detailed note');
  });

  it('includes flagged status', () => {
    const result = buildCreateTaskScript({
      name: 'Flagged Task',
      flagged: true,
    });

    // Check the JSON-embedded data contains flagged:true
    expect(result.script).toContain('"flagged":true');
  });

  it('includes due date', () => {
    const result = buildCreateTaskScript({
      name: 'Task with Due Date',
      dueDate: '2025-12-31',
    });

    expect(result.script).toContain('2025-12-31');
    expect(result.script).toContain('dueDate');
  });

  it('includes defer date', () => {
    const result = buildCreateTaskScript({
      name: 'Deferred Task',
      deferDate: '2025-12-01 08:00',
    });

    expect(result.script).toContain('2025-12-01');
    expect(result.script).toContain('deferDate');
  });

  it('includes estimated minutes', () => {
    const result = buildCreateTaskScript({
      name: 'Estimated Task',
      estimatedMinutes: 45,
    });

    expect(result.script).toContain('estimatedMinutes');
    expect(result.script).toContain('45');
  });

  it('includes tags array', () => {
    const result = buildCreateTaskScript({
      name: 'Tagged Task',
      tags: ['work', 'urgent'],
    });

    expect(result.script).toContain('tags');
    expect(result.script).toContain('work');
    expect(result.script).toContain('urgent');
  });

  it('includes project assignment', () => {
    const result = buildCreateTaskScript({
      name: 'Project Task',
      project: 'Work Project',
    });

    expect(result.script).toContain('projectId');
    expect(result.script).toContain('Work Project');
  });

  it('handles null project (inbox)', () => {
    const result = buildCreateTaskScript({
      name: 'Inbox Task',
      project: null,
    });

    expect(result.script).toContain('inboxTasks');
  });

  it('includes parent task ID for subtasks', () => {
    const result = buildCreateTaskScript({
      name: 'Subtask',
      parentTaskId: 'parent-123',
    });

    expect(result.script).toContain('parentTaskId');
    expect(result.script).toContain('parent-123');
  });

  it('includes repetition rule', () => {
    const result = buildCreateTaskScript({
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

  it('escapes special characters in name', () => {
    const result = buildCreateTaskScript({
      name: "Task with 'quotes' and \"double quotes\"",
    });

    // Should not break script structure
    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('quotes');
  });

  it('returns IIFE structure', () => {
    const result = buildCreateTaskScript({ name: 'Test' });

    expect(result.script).toMatch(/^\s*\(\s*\(\s*\)\s*=>\s*\{/);
    expect(result.script).toMatch(/\}\s*\)\s*\(\s*\)\s*;?\s*$/);
  });

  it('includes error handling', () => {
    const result = buildCreateTaskScript({ name: 'Test' });

    expect(result.script).toContain('try {');
    expect(result.script).toContain('catch');
  });

  it('returns JSON stringified response', () => {
    const result = buildCreateTaskScript({ name: 'Test' });

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
  it('generates valid script for task update', () => {
    const result = buildUpdateTaskScript('task-123', {
      name: 'Updated Name',
    });

    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('task-123');
    expect(result.script).toContain('Updated Name');
    expect(result.operation).toBe('update');
    expect(result.target).toBe('task');
  });

  it('handles flagged update', () => {
    const result = buildUpdateTaskScript('task-123', {
      flagged: true,
    });

    expect(result.script).toContain('flagged');
    expect(result.script).toContain('true');
  });

  it('handles tag replacement', () => {
    const result = buildUpdateTaskScript('task-123', {
      tags: ['new-tag-1', 'new-tag-2'],
    });

    expect(result.script).toContain('tags');
    expect(result.script).toContain('new-tag-1');
  });

  it('handles addTags operation', () => {
    const result = buildUpdateTaskScript('task-123', {
      addTags: ['additional-tag'],
    });

    expect(result.script).toContain('addTags');
    expect(result.script).toContain('additional-tag');
  });

  it('handles removeTags operation', () => {
    const result = buildUpdateTaskScript('task-123', {
      removeTags: ['unwanted-tag'],
    });

    expect(result.script).toContain('removeTags');
    expect(result.script).toContain('unwanted-tag');
  });

  it('handles clearDueDate flag', () => {
    const result = buildUpdateTaskScript('task-123', {
      clearDueDate: true,
    });

    expect(result.script).toContain('clearDueDate');
  });

  it('handles project change', () => {
    const result = buildUpdateTaskScript('task-123', {
      project: 'new-project-id',
    });

    expect(result.script).toContain('project');
    expect(result.script).toContain('new-project-id');
  });

  it('handles move to inbox (project: null)', () => {
    const result = buildUpdateTaskScript('task-123', {
      project: null,
    });

    expect(result.script).toContain('inbox');
  });
});

describe('buildUpdateProjectScript', () => {
  it('generates valid script for project update', () => {
    const result = buildUpdateProjectScript('project-123', {
      name: 'Updated Project',
    });

    expect(result.script).toContain('project-123');
    expect(result.script).toContain('Updated Project');
    expect(result.operation).toBe('update');
    expect(result.target).toBe('project');
  });

  it('handles status change', () => {
    const result = buildUpdateProjectScript('project-123', {
      status: 'completed',
    });

    expect(result.script).toContain('status');
    expect(result.script).toContain('completed');
  });

  it('handles folder change', () => {
    const result = buildUpdateProjectScript('project-123', {
      folder: 'New Folder',
    });

    expect(result.script).toContain('folder');
    expect(result.script).toContain('New Folder');
  });
});

describe('buildCompleteScript', () => {
  it('generates valid script for task completion', () => {
    const result = buildCompleteScript('task', 'task-123');

    expect(result.script).toContain('task-123');
    expect(result.script).toContain('complete');
    expect(result.operation).toBe('complete');
    expect(result.target).toBe('task');
  });

  it('generates valid script for project completion', () => {
    const result = buildCompleteScript('project', 'project-123');

    expect(result.script).toContain('project-123');
    expect(result.operation).toBe('complete');
    expect(result.target).toBe('project');
  });

  it('handles custom completion date', () => {
    const result = buildCompleteScript('task', 'task-123', '2025-11-24');

    expect(result.script).toContain('2025-11-24');
    expect(result.script).toContain('completionDate');
  });

  it('includes markComplete call', () => {
    const result = buildCompleteScript('task', 'task-123');

    expect(result.script).toContain('markComplete');
  });
});

describe('buildDeleteScript', () => {
  it('generates valid script for task deletion', () => {
    const result = buildDeleteScript('task', 'task-123');

    expect(result.script).toContain('task-123');
    expect(result.operation).toBe('delete');
    expect(result.target).toBe('task');
  });

  it('generates valid script for project deletion', () => {
    const result = buildDeleteScript('project', 'project-123');

    expect(result.script).toContain('project-123');
    expect(result.operation).toBe('delete');
    expect(result.target).toBe('project');
  });

  it('calls delete method', () => {
    const result = buildDeleteScript('task', 'task-123');

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
      { createSequentially: true }
    );

    expect(result.script).toContain('temp-1');
    expect(result.script).toContain('Parent');
    expect(result.script).toContain('Child');
  });

  it('respects createSequentially option', () => {
    const result = buildBatchScript(
      'task',
      [{ operation: 'create', target: 'task', data: { name: 'Task' } }],
      { createSequentially: true }
    );

    expect(result.script).toContain('sequential');
  });

  it('returns tempId mapping in metadata', () => {
    const result = buildBatchScript(
      'task',
      [{ operation: 'create', target: 'task', data: { name: 'Task' }, tempId: 'temp-1' }],
      { returnMapping: true }
    );

    expect(result.script).toContain('tempIdMapping');
  });
});

describe('buildBulkDeleteScript', () => {
  it('generates valid script for bulk task deletion', () => {
    const result = buildBulkDeleteScript('task', ['task-1', 'task-2', 'task-3']);

    expect(result.script).toContain('task-1');
    expect(result.script).toContain('task-2');
    expect(result.script).toContain('task-3');
    expect(result.operation).toBe('bulk_delete');
    expect(result.target).toBe('task');
  });

  it('generates valid script for bulk project deletion', () => {
    const result = buildBulkDeleteScript('project', ['proj-1', 'proj-2']);

    expect(result.script).toContain('proj-1');
    expect(result.script).toContain('proj-2');
    expect(result.target).toBe('project');
  });

  it('iterates through IDs', () => {
    const result = buildBulkDeleteScript('task', ['id-1', 'id-2']);

    expect(result.script).toMatch(/forEach|for.*\(|map/);
  });

  it('returns count of deleted items', () => {
    const result = buildBulkDeleteScript('task', ['id-1', 'id-2']);

    expect(result.script).toContain('deletedCount');
  });
});

describe('script structure consistency', () => {
  it('all scripts return GeneratedMutationScript interface', () => {
    const scripts: GeneratedMutationScript[] = [
      buildCreateTaskScript({ name: 'Test' }),
      buildCreateProjectScript({ name: 'Test' }),
      buildUpdateTaskScript('id', { name: 'Test' }),
      buildUpdateProjectScript('id', { name: 'Test' }),
      buildCompleteScript('task', 'id'),
      buildDeleteScript('task', 'id'),
      buildBatchScript('task', []),
      buildBulkDeleteScript('task', ['id']),
    ];

    scripts.forEach((result) => {
      expect(result).toHaveProperty('script');
      expect(result).toHaveProperty('operation');
      expect(result).toHaveProperty('target');
      expect(typeof result.script).toBe('string');
    });
  });

  it('all scripts are valid JavaScript (can be parsed)', () => {
    const scripts = [
      buildCreateTaskScript({ name: 'Test' }).script,
      buildCompleteScript('task', 'id').script,
      buildDeleteScript('task', 'id').script,
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

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  V3EnvelopeSuccessSchema,
  astEnvelopeSchema,
  listResultSchema,
  CountResultSchema,
  ExportResultSchema,
  reviewSuccessSchema,
  TaskWriteResultSchema,
  CompleteResultSchema,
  DeleteResultSchema,
  BulkDeleteResultSchema,
  ProjectWriteResultSchema,
  FolderCreateResultSchema,
  BatchCreateResultSchema,
  TagMutationResultSchema,
  SlimmedDataSchema,
  RecurringPatternsSchema,
  ProjectByIdSchema,
  FolderListSchema,
} from '../../../src/omnifocus/script-response-schemas.js';

// Backward-compatible aliases — schemas moved here from OmniFocusReadTool.ts (Task 7 carry-forward)
const PROJECT_BY_ID_SCHEMA = ProjectByIdSchema;
const FOLDER_LIST_SCHEMA = FolderListSchema;

// ---------------------------------------------------------------------------
// V3EnvelopeSuccessSchema
// ---------------------------------------------------------------------------

describe('V3EnvelopeSuccessSchema', () => {
  it('(a) accepts a representative success payload', () => {
    const result = V3EnvelopeSuccessSchema.safeParse({ ok: true, v: '3', data: [1, 2, 3] });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing discriminating key ok', () => {
    const result = V3EnvelopeSuccessSchema.safeParse({ v: '3', data: [] });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload where ok is false (not literal true)', () => {
    const result = V3EnvelopeSuccessSchema.safeParse({ ok: false, v: '3', data: [] });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key (e.g. error key from hybrid payload)', () => {
    const result = V3EnvelopeSuccessSchema.safeParse({ ok: true, v: '3', data: [], error: 'aborted' });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: any unknown extra top-level key', () => {
    const result = V3EnvelopeSuccessSchema.safeParse({ ok: true, v: '3', data: [], unexpected: true });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// astEnvelopeSchema
// ---------------------------------------------------------------------------

describe('astEnvelopeSchema', () => {
  describe('with itemsKey = "items" (tag scripts)', () => {
    const schema = astEnvelopeSchema('items');

    it('(a) accepts representative tag-list success payload', () => {
      const result = schema.safeParse({
        ok: true,
        v: 'ast',
        items: ['Work', 'Personal'],
        summary: { total: 2 },
      });
      expect(result.success).toBe(true);
    });

    it('(a) accepts payload with optional metadata key', () => {
      const result = schema.safeParse({
        ok: true,
        v: 'ast',
        items: [],
        summary: {},
        metadata: { query_time_ms: 5 },
      });
      expect(result.success).toBe(true);
    });

    it('(a) accepts minimal payload (no optional keys)', () => {
      const result = schema.safeParse({ ok: true, v: 'ast', items: [] });
      expect(result.success).toBe(true);
    });

    it('(b) rejects payload missing discriminating key ok', () => {
      const result = schema.safeParse({ v: 'ast', items: [] });
      expect(result.success).toBe(false);
    });

    it('(b) rejects payload where v is not literal "ast"', () => {
      const result = schema.safeParse({ ok: true, v: '3', items: [] });
      expect(result.success).toBe(false);
    });

    it('(c) rejects closed-world: extra top-level key', () => {
      const result = schema.safeParse({ ok: true, v: 'ast', items: [], error: 'aborted' });
      expect(result.success).toBe(false);
    });
  });

  describe('with itemsKey = "tasks" (recurring analysis script)', () => {
    const schema = astEnvelopeSchema('tasks');

    it('(a) accepts representative recurring-analysis success payload', () => {
      const result = schema.safeParse({
        ok: true,
        v: 'ast',
        tasks: [{ name: 'Daily review' }],
        summary: { total: 1 },
        metadata: { query_time_ms: 12, optimization: 'ast_recurring_builder' },
      });
      expect(result.success).toBe(true);
    });

    it('(b) rejects payload missing the tasks key', () => {
      const result = schema.safeParse({ ok: true, v: 'ast' });
      expect(result.success).toBe(false);
    });

    it('(c) rejects closed-world: extra top-level key', () => {
      const result = schema.safeParse({ ok: true, v: 'ast', tasks: [], error: 'aborted' });
      expect(result.success).toBe(false);
    });

    // (d) variant: items-keyed schema does not accept tasks-keyed payload
    it('(d) items schema rejects tasks-keyed payload', () => {
      const itemsSchema = astEnvelopeSchema('items');
      const result = itemsSchema.safeParse({ ok: true, v: 'ast', tasks: [] });
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// listResultSchema
// ---------------------------------------------------------------------------

describe('listResultSchema', () => {
  describe('single itemKey', () => {
    const schema = listResultSchema(['tasks'], { metadata: true });

    it('(a) accepts tasks array with metadata', () => {
      const result = schema.safeParse({ tasks: [{ id: 'abc' }], metadata: { total: 1 } });
      expect(result.success).toBe(true);
    });

    it('(a) accepts tasks array without optional metadata', () => {
      const result = schema.safeParse({ tasks: [] });
      expect(result.success).toBe(true);
    });

    it('(b) rejects payload missing the tasks key', () => {
      const result = schema.safeParse({ items: [] });
      expect(result.success).toBe(false);
    });

    it('(c) rejects closed-world: extra top-level key', () => {
      const result = schema.safeParse({ tasks: [], error: 'aborted' });
      expect(result.success).toBe(false);
    });
  });

  describe('multiple itemKeys (union)', () => {
    const schema = listResultSchema(['tasks', 'items']);

    it('(d) accepts tasks-keyed variant', () => {
      const result = schema.safeParse({ tasks: [] });
      expect(result.success).toBe(true);
    });

    it('(d) accepts items-keyed variant', () => {
      const result = schema.safeParse({ items: [] });
      expect(result.success).toBe(true);
    });

    it('(b) rejects payload with neither key', () => {
      const result = schema.safeParse({ data: [] });
      expect(result.success).toBe(false);
    });

    it('(c) rejects closed-world: extra top-level key on items variant', () => {
      const result = schema.safeParse({ items: [], error: 'aborted' });
      expect(result.success).toBe(false);
    });
  });

  describe('with extras', () => {
    const schema = listResultSchema(['tasks'], { extras: { filter_description: z.string().optional() } });

    it('(a) accepts payload with extras key', () => {
      const result = schema.safeParse({ tasks: [], filter_description: 'inbox' });
      expect(result.success).toBe(true);
    });

    it('(c) rejects unknown key not in extras', () => {
      const result = schema.safeParse({ tasks: [], unknown_field: true });
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// CountResultSchema
// ---------------------------------------------------------------------------

describe('CountResultSchema', () => {
  it('(a) accepts minimal count payload (count only)', () => {
    const result = CountResultSchema.safeParse({ count: 42 });
    expect(result.success).toBe(true);
  });

  it('(a) accepts full task_count_omnijs wire payload', () => {
    const result = CountResultSchema.safeParse({
      count: 17,
      filters_applied: { status: 'active' },
      query_time_ms: 120,
      optimization: 'omnijs_count_no_tags',
      filter_description: 'active tasks',
      scanned: 500,
      total_tasks: 1200,
      limited: false,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts payload with warning + limited:true (scan limit hit)', () => {
    const result = CountResultSchema.safeParse({
      count: 10000,
      filters_applied: null,
      query_time_ms: 5000,
      optimization: 'omnijs_count_no_tags',
      filter_description: 'all',
      scanned: 10000,
      total_tasks: 50000,
      limited: true,
      warning: 'Count may be incomplete due to scan limit',
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing the count key', () => {
    const result = CountResultSchema.safeParse({ filters_applied: {}, query_time_ms: 5 });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key', () => {
    const result = CountResultSchema.safeParse({ count: 5, error: 'aborted' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ExportResultSchema
// ---------------------------------------------------------------------------

describe('ExportResultSchema', () => {
  it('(a) accepts minimal export payload (csv — no limited/message/debug)', () => {
    const result = ExportResultSchema.safeParse({
      format: 'csv',
      data: 'id,name\n',
      count: 0,
      duration: 45,
      message: 'No tasks found matching the filter criteria',
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts markdown export (no limited/message/debug)', () => {
    const result = ExportResultSchema.safeParse({
      format: 'markdown',
      data: '# OmniFocus Tasks Export\n',
      count: 5,
      duration: 60,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts json task export with limited + debug + message', () => {
    const result = ExportResultSchema.safeParse({
      format: 'json',
      data: [{ id: 'abc', name: 'Task' }],
      count: 1,
      duration: 80,
      limited: false,
      debug: { totalTasksProcessed: 1, maxTasksAllowed: 1000 },
      message: undefined,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts json project export with debug (no limited/message)', () => {
    const result = ExportResultSchema.safeParse({
      format: 'json',
      data: [{ id: 'p1', name: 'Project' }],
      count: 1,
      duration: 55,
      debug: { totalProjectsProcessed: 1, includeStats: false },
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing format', () => {
    const result = ExportResultSchema.safeParse({ data: [], count: 0, duration: 10 });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing count', () => {
    const result = ExportResultSchema.safeParse({ format: 'json', data: [], duration: 10 });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key', () => {
    const result = ExportResultSchema.safeParse({
      format: 'json',
      data: [],
      count: 0,
      duration: 10,
      error: 'aborted',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reviewSuccessSchema
// ---------------------------------------------------------------------------

describe('reviewSuccessSchema', () => {
  it('(a) accepts a representative review success payload', () => {
    const schema = reviewSuccessSchema({ items: z.array(z.unknown()), count: z.number() });
    const result = schema.safeParse({ success: true, items: [{ id: 'p1' }], count: 1 });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing discriminating key success', () => {
    const schema = reviewSuccessSchema({ items: z.array(z.unknown()) });
    const result = schema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload where success is false (not literal true)', () => {
    const schema = reviewSuccessSchema({ items: z.array(z.unknown()) });
    const result = schema.safeParse({ success: false, items: [] });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key', () => {
    const schema = reviewSuccessSchema({ items: z.array(z.unknown()) });
    const result = schema.safeParse({ success: true, items: [], error: 'aborted' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TaskWriteResultSchema
// ---------------------------------------------------------------------------

describe('TaskWriteResultSchema', () => {
  it('(a) accepts full create-task envelope', () => {
    const result = TaskWriteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      note: '',
      flagged: false,
      dueDate: null,
      deferDate: null,
      plannedDate: null,
      estimatedMinutes: null,
      tags: [],
      project: null,
      inInbox: true,
      warnings: [],
      created: true,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts minimal update-task envelope (fewer keys than create)', () => {
    const result = TaskWriteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      flagged: false,
      updated: true,
      warnings: [],
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing both created and updated discriminators', () => {
    const result = TaskWriteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      flagged: false,
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing taskId', () => {
    const result = TaskWriteResultSchema.safeParse({
      name: 'Buy milk',
      flagged: false,
      created: true,
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key', () => {
    const result = TaskWriteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      flagged: false,
      created: true,
      error: 'aborted',
    });
    expect(result.success).toBe(false);
  });

  it('(d) rejects created: false (must be literal true if present)', () => {
    const result = TaskWriteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Task',
      flagged: false,
      created: false,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CompleteResultSchema
// ---------------------------------------------------------------------------

describe('CompleteResultSchema', () => {
  it('(a) accepts task-complete envelope', () => {
    const result = CompleteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      completed: true,
      completionDate: '2026-06-11T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts project-complete envelope', () => {
    const result = CompleteResultSchema.safeParse({
      projectId: 'p123',
      name: 'My Project',
      completed: true,
      completionDate: null,
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing discriminating key completed', () => {
    const result = CompleteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      completionDate: null,
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload where completed is false (not literal true)', () => {
    const result = CompleteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      completed: false,
      completionDate: null,
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing both taskId and projectId', () => {
    const result = CompleteResultSchema.safeParse({
      name: 'Buy milk',
      completed: true,
      completionDate: null,
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key', () => {
    const result = CompleteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      completed: true,
      completionDate: null,
      error: 'aborted',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DeleteResultSchema
// ---------------------------------------------------------------------------

describe('DeleteResultSchema', () => {
  it('(a) accepts task-delete envelope', () => {
    const result = DeleteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      deleted: true,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts project-delete envelope', () => {
    const result = DeleteResultSchema.safeParse({
      projectId: 'p123',
      name: 'My Project',
      deleted: true,
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing discriminating key deleted', () => {
    const result = DeleteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload where deleted is false (not literal true)', () => {
    const result = DeleteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      deleted: false,
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing both taskId and projectId', () => {
    const result = DeleteResultSchema.safeParse({
      name: 'Buy milk',
      deleted: true,
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key', () => {
    const result = DeleteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      deleted: true,
      error: 'aborted',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BulkDeleteResultSchema
// ---------------------------------------------------------------------------

describe('BulkDeleteResultSchema', () => {
  it('(a) accepts full bulk-delete envelope with errors', () => {
    const result = BulkDeleteResultSchema.safeParse({
      deleted: [{ id: 'abc', name: 'Task 1' }],
      errors: [{ taskId: 'xyz', error: 'Task not found' }],
      message: 'Deleted 1 of 2 tasks',
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts bulk-delete envelope with no errors (all deleted)', () => {
    const result = BulkDeleteResultSchema.safeParse({
      deleted: [{ id: 'abc', name: 'Task 1' }, { id: 'def', name: 'Task 2' }],
      errors: [],
      message: 'Deleted 2 of 2 tasks',
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing deleted key', () => {
    const result = BulkDeleteResultSchema.safeParse({
      errors: [],
      message: 'Deleted 0 of 0 tasks',
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing errors key', () => {
    const result = BulkDeleteResultSchema.safeParse({
      deleted: [],
      message: 'Deleted 0 of 0 tasks',
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing message key', () => {
    const result = BulkDeleteResultSchema.safeParse({
      deleted: [],
      errors: [],
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key', () => {
    const result = BulkDeleteResultSchema.safeParse({
      deleted: [],
      errors: [],
      message: 'Deleted 0 of 0 tasks',
      error: 'something',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProjectWriteResultSchema
// ---------------------------------------------------------------------------

describe('ProjectWriteResultSchema', () => {
  it('(a) accepts full project-create envelope', () => {
    const result = ProjectWriteResultSchema.safeParse({
      projectId: 'p123',
      name: 'New Project',
      note: '',
      flagged: false,
      sequential: false,
      dueDate: null,
      deferDate: null,
      plannedDate: null,
      folder: null,
      tags: [],
      warnings: [],
      created: true,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts project-update envelope (fewer keys than create)', () => {
    const result = ProjectWriteResultSchema.safeParse({
      projectId: 'p123',
      name: 'Updated Project',
      flagged: true,
      status: 'active',
      updated: true,
      warnings: [],
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing both created and updated discriminators', () => {
    const result = ProjectWriteResultSchema.safeParse({
      projectId: 'p123',
      name: 'Project',
      flagged: false,
      status: 'active',
      warnings: [],
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing projectId', () => {
    const result = ProjectWriteResultSchema.safeParse({
      name: 'Project',
      flagged: false,
      created: true,
      warnings: [],
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key on create variant', () => {
    const result = ProjectWriteResultSchema.safeParse({
      projectId: 'p123',
      name: 'Project',
      note: '',
      flagged: false,
      sequential: false,
      dueDate: null,
      deferDate: null,
      plannedDate: null,
      folder: null,
      tags: [],
      warnings: [],
      created: true,
      error: 'aborted',
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key on update variant', () => {
    const result = ProjectWriteResultSchema.safeParse({
      projectId: 'p123',
      name: 'Project',
      flagged: false,
      status: 'active',
      updated: true,
      warnings: [],
      error: 'aborted',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FolderCreateResultSchema
// ---------------------------------------------------------------------------

describe('FolderCreateResultSchema', () => {
  it('(a) accepts folder-create envelope with parent', () => {
    const result = FolderCreateResultSchema.safeParse({
      folderId: 'f123',
      name: 'My Folder',
      parentFolder: 'Parent',
      warnings: [],
      created: true,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts folder-create envelope without parent (null)', () => {
    const result = FolderCreateResultSchema.safeParse({
      folderId: 'f123',
      name: 'Top Level Folder',
      parentFolder: null,
      warnings: [],
      created: true,
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing discriminating key created', () => {
    const result = FolderCreateResultSchema.safeParse({
      folderId: 'f123',
      name: 'My Folder',
      parentFolder: null,
      warnings: [],
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload where created is false', () => {
    const result = FolderCreateResultSchema.safeParse({
      folderId: 'f123',
      name: 'My Folder',
      parentFolder: null,
      warnings: [],
      created: false,
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing folderId', () => {
    const result = FolderCreateResultSchema.safeParse({
      name: 'My Folder',
      parentFolder: null,
      warnings: [],
      created: true,
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key', () => {
    const result = FolderCreateResultSchema.safeParse({
      folderId: 'f123',
      name: 'My Folder',
      parentFolder: null,
      warnings: [],
      created: true,
      error: 'aborted',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BatchCreateResultSchema
// ---------------------------------------------------------------------------

describe('BatchCreateResultSchema', () => {
  it('(a) accepts batch-create envelope with results array', () => {
    const result = BatchCreateResultSchema.safeParse({
      results: [
        { tempId: 't1', taskId: 'abc', success: true },
        { tempId: 't2', taskId: null, success: false, error: 'Not found' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts empty results array', () => {
    const result = BatchCreateResultSchema.safeParse({ results: [] });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing the results key', () => {
    const result = BatchCreateResultSchema.safeParse({ data: [] });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key', () => {
    const result = BatchCreateResultSchema.safeParse({
      results: [],
      error: 'aborted',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TagMutationResultSchema
// ---------------------------------------------------------------------------

describe('TagMutationResultSchema', () => {
  it('(a) accepts tag-created (flat) envelope', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'created',
      tagName: 'Work',
      tagId: 'tid1',
      parentTagName: null,
      parentTagId: null,
      message: "Tag 'Work' created successfully",
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts tag-created (path) envelope', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'created',
      tagName: 'Work',
      tagId: 'tid1',
      path: 'Context : Work',
      createdSegments: ['Work'],
      message: "Created 1 tag(s) in path 'Context : Work'",
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts tag-renamed envelope', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'renamed',
      oldName: 'Work',
      newName: 'Career',
      message: "Tag renamed from 'Work' to 'Career'",
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts tag-deleted envelope', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'deleted',
      tagName: 'Work',
      message: "Tag 'Work' deleted successfully.",
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts tag-merged envelope', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'merged',
      sourceTag: 'OldTag',
      targetTag: 'NewTag',
      tasksMerged: 5,
      message: "Merged 'OldTag' into 'NewTag'. 5 tasks updated.",
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts tag-merged_with_warning envelope', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'merged_with_warning',
      sourceTag: 'OldTag',
      targetTag: 'NewTag',
      tasksMerged: 3,
      warning: 'Tags were merged but source tag could not be deleted: ...',
      message: 'Merged 3 tasks but could not delete source tag',
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts tag-nested envelope', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'nested',
      tagName: 'Work',
      parentTagName: 'Context',
      parentTagId: 'pid1',
      message: "Tag 'Work' nested under 'Context'",
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts tag-unparented envelope', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'unparented',
      tagName: 'Work',
      message: "Tag 'Work' moved to root level",
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts tag-reparented envelope (with new parent)', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'reparented',
      tagName: 'Work',
      newParentTagName: 'NewContext',
      newParentTagId: 'npid1',
      message: "Tag 'Work' moved under 'NewContext'",
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts tag-reparented envelope (to root, no parent keys)', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'reparented',
      tagName: 'Work',
      message: "Tag 'Work' moved to root level",
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing action discriminator', () => {
    const result = TagMutationResultSchema.safeParse({
      tagName: 'Work',
      message: 'something',
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload with unknown action value', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'exploded',
      tagName: 'Work',
      message: 'something',
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra top-level key on deleted variant', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'deleted',
      tagName: 'Work',
      message: "Tag 'Work' deleted successfully.",
      error: 'aborted',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PROJECT_BY_ID_SCHEMA (read-tool local constant, exported for coverage)
// Source: buildProjectByIdScript → {projects, count, mode, targetId}
// ---------------------------------------------------------------------------

describe('PROJECT_BY_ID_SCHEMA', () => {
  it('(a) accepts representative project id-lookup payload', () => {
    const result = PROJECT_BY_ID_SCHEMA.safeParse({
      projects: [{ id: 'abc123', name: 'My Project' }],
      count: 1,
      mode: 'id_lookup',
      targetId: 'abc123',
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts empty projects array', () => {
    const result = PROJECT_BY_ID_SCHEMA.safeParse({
      projects: [],
      count: 0,
      mode: 'id_lookup',
      targetId: 'notfound',
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing projects key', () => {
    const result = PROJECT_BY_ID_SCHEMA.safeParse({
      count: 0,
      mode: 'id_lookup',
      targetId: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing count key', () => {
    const result = PROJECT_BY_ID_SCHEMA.safeParse({
      projects: [],
      mode: 'id_lookup',
      targetId: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: unexpected extra top-level key', () => {
    const result = PROJECT_BY_ID_SCHEMA.safeParse({
      projects: [],
      count: 0,
      mode: 'id_lookup',
      targetId: 'abc',
      error: 'something went wrong',
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: metadata key not part of this shape', () => {
    const result = PROJECT_BY_ID_SCHEMA.safeParse({
      projects: [],
      count: 0,
      mode: 'id_lookup',
      targetId: 'abc',
      metadata: { total_available: 5 },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FOLDER_LIST_SCHEMA (read-tool local constant, exported for coverage)
// Source: buildFilteredFoldersScript → {success: true, folders, metadata?}
// ---------------------------------------------------------------------------

describe('FOLDER_LIST_SCHEMA', () => {
  it('(a) accepts representative folder list payload', () => {
    const result = FOLDER_LIST_SCHEMA.safeParse({
      success: true,
      folders: [{ id: 'f1', name: 'Work', path: 'Work', depth: 0, status: 'active' }],
      metadata: { returned_count: 1, total_available: 3 },
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts payload without optional metadata key', () => {
    const result = FOLDER_LIST_SCHEMA.safeParse({
      success: true,
      folders: [],
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload where success is false (not literal true)', () => {
    const result = FOLDER_LIST_SCHEMA.safeParse({
      success: false,
      folders: [],
      metadata: {},
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing success key', () => {
    const result = FOLDER_LIST_SCHEMA.safeParse({
      folders: [],
      metadata: {},
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing folders key', () => {
    const result = FOLDER_LIST_SCHEMA.safeParse({
      success: true,
      metadata: {},
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: unexpected extra top-level key (hybrid payload)', () => {
    const result = FOLDER_LIST_SCHEMA.safeParse({
      success: true,
      folders: [],
      metadata: {},
      error: 'iteration aborted',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SlimmedDataSchema
// Source: fetchSlimmedData inline JXA script → return JSON.stringify({tasks, projects, tags})
// ---------------------------------------------------------------------------

describe('SlimmedDataSchema', () => {
  it('(a) accepts representative slimmed-data payload', () => {
    const result = SlimmedDataSchema.safeParse({
      tasks: [{ id: 't1', name: 'Buy milk' }],
      projects: [{ id: 'p1', name: 'Errands' }],
      tags: [{ id: 'tag1', name: 'home' }],
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts empty arrays for all keys', () => {
    const result = SlimmedDataSchema.safeParse({ tasks: [], projects: [], tags: [] });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing tasks key', () => {
    const result = SlimmedDataSchema.safeParse({ projects: [], tags: [] });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing projects key', () => {
    const result = SlimmedDataSchema.safeParse({ tasks: [], tags: [] });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing tags key', () => {
    const result = SlimmedDataSchema.safeParse({ tasks: [], projects: [] });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: unexpected extra top-level key', () => {
    const result = SlimmedDataSchema.safeParse({
      tasks: [],
      projects: [],
      tags: [],
      error: 'iteration aborted at item 50',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RecurringPatternsSchema
// Source: GET_RECURRING_PATTERNS_SCRIPT → JSON.stringify({...parsed, duration, debug})
// where parsed = {totalRecurring, patterns, byProject, mostCommon}
// ---------------------------------------------------------------------------

describe('RecurringPatternsSchema', () => {
  it('(a) accepts representative recurring-patterns payload', () => {
    const result = RecurringPatternsSchema.safeParse({
      totalRecurring: 12,
      patterns: [{ pattern: 'days_1', unit: 'days', steps: 1, count: 5 }],
      byProject: [{ project: 'Work', recurringCount: 3 }],
      mostCommon: { pattern: 'days_1', count: 5 },
      duration: 2300,
      debug: { optimizationUsed: 'OmniJS bridge' },
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts payload where mostCommon is null (no patterns found)', () => {
    const result = RecurringPatternsSchema.safeParse({
      totalRecurring: 0,
      patterns: [],
      byProject: [],
      mostCommon: null,
      duration: 100,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts payload without optional debug key', () => {
    const result = RecurringPatternsSchema.safeParse({
      totalRecurring: 3,
      patterns: [],
      byProject: [],
      mostCommon: null,
      duration: 50,
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload missing totalRecurring key', () => {
    const result = RecurringPatternsSchema.safeParse({
      patterns: [],
      byProject: [],
      mostCommon: null,
      duration: 0,
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing patterns key', () => {
    const result = RecurringPatternsSchema.safeParse({
      totalRecurring: 0,
      byProject: [],
      mostCommon: null,
      duration: 0,
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: unexpected extra top-level key', () => {
    const result = RecurringPatternsSchema.safeParse({
      totalRecurring: 5,
      patterns: [],
      byProject: [],
      mostCommon: null,
      duration: 100,
      error: 'iteration error at item 3',
    });
    expect(result.success).toBe(false);
  });
});

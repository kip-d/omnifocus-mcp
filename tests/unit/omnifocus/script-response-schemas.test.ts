import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  V3EnvelopeSuccessSchema,
  v3EnvelopeSchema,
  astEnvelopeSchema,
  listResultSchema,
  CountResultSchema,
  ExportResultSchema,
  ExportTasksResultSchema,
  ExportProjectsResultSchema,
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
  TaskRowSchema,
  ProjectRowSchema,
  TaskListMetadataSchema,
  ProjectListMetadataSchema,
  RecurringTaskRowSchema,
  RecurringTasksSummarySchema,
  RecurringTasksMetadataSchema,
  PerspectiveItemSchema,
  PerspectiveSummarySchema,
  PRODUCTIVITY_STATS_V3_SCHEMA,
  TASK_VELOCITY_V3_SCHEMA,
  OVERDUE_ANALYSIS_V3_SCHEMA,
  WORKFLOW_ANALYSIS_V3_SCHEMA,
  REVIEWS_LIST_TYPED_SCHEMA,
  MARK_REVIEWED_TYPED_SCHEMA,
  SET_SCHEDULE_TYPED_SCHEMA,
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
  it('(a) accepts minimal wire-shape count payload (count + all required fields)', () => {
    // The emitter always emits all required fields — the real wire shape is never count-only.
    // Fixture corrected per OMN-158 spec §5: fix fixtures to wire shapes, never loosen schemas.
    const result = CountResultSchema.safeParse({
      count: 42,
      filters_applied: {},
      query_time_ms: 50,
      optimization: 'omnijs_count_no_tags',
      filter_description: 'all tasks',
      scanned: 42,
      total_tasks: 42,
      limited: false,
    });
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

  it('(a) accepts json task export with limited + debug (wire shape from buildExportTasksScript)', () => {
    // Fixture corrected per OMN-158 spec §5: debug has all required fields; message absent (not limited).
    const result = ExportResultSchema.safeParse({
      format: 'json',
      data: [{ id: 'abc', name: 'Task' }],
      count: 1,
      duration: 80,
      limited: false,
      debug: {
        totalTasksProcessed: 1,
        maxTasksAllowed: 1000,
        filterDescription: 'all tasks',
        fieldsRequested: ['name', 'project'],
        optimizationUsed: 'AST filter + OmniJS bridge',
      },
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts json project export with debug (wire shape from export-projects.ts)', () => {
    // Fixture corrected per OMN-158 spec §5: debug requires optimizationUsed field.
    const result = ExportResultSchema.safeParse({
      format: 'json',
      data: [{ id: 'p1', name: 'Project', status: 'active' }],
      count: 1,
      duration: 55,
      debug: {
        totalProjectsProcessed: 1,
        includeStats: false,
        optimizationUsed: 'OmniJS bridge for 5-10x faster property access',
      },
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

  // OMN-158 leaf-strict tests
  it('(leaf) rejects create-variant with wrong-typed leaf: flagged as string', () => {
    const result = TaskWriteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      note: '',
      flagged: 'yes', // wrong type
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
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects create-variant with wrong-typed leaf: tags as string', () => {
    const result = TaskWriteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      note: '',
      flagged: false,
      dueDate: null,
      deferDate: null,
      plannedDate: null,
      estimatedMinutes: null,
      tags: 'Work', // wrong type, should be array
      project: null,
      inInbox: true,
      warnings: [],
      created: true,
    });
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects update-variant carrying create-only keys (cross-variant hybrid)', () => {
    // update + note (only on create) should fail the update branch
    const result = TaskWriteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      note: 'some note',
      flagged: false,
      updated: true,
      warnings: [],
    });
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects update-variant with wrong-typed leaf: warnings as string', () => {
    const result = TaskWriteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      flagged: false,
      updated: true,
      warnings: 'none', // wrong type
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

  // OMN-158 leaf-strict tests
  it('(leaf) rejects wrong-typed leaf: completionDate as number', () => {
    const result = CompleteResultSchema.safeParse({
      taskId: 'abc123',
      name: 'Buy milk',
      completed: true,
      completionDate: 12345, // wrong type, should be string|null
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
      deleted: [
        { id: 'abc', name: 'Task 1' },
        { id: 'def', name: 'Task 2' },
      ],
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

  // OMN-158 leaf-strict tests
  it('(leaf) rejects extra key inside deleted item', () => {
    const result = BulkDeleteResultSchema.safeParse({
      deleted: [{ id: 'abc', name: 'Task 1', rogue: true }],
      errors: [],
      message: 'Deleted 1 of 1 tasks',
    });
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects wrong-typed leaf inside deleted item: id as number', () => {
    const result = BulkDeleteResultSchema.safeParse({
      deleted: [{ id: 123, name: 'Task 1' }], // id should be string
      errors: [],
      message: 'Deleted 1 of 1 tasks',
    });
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects extra key inside errors item', () => {
    const result = BulkDeleteResultSchema.safeParse({
      deleted: [],
      errors: [{ taskId: 'abc', error: 'not found', rogue: true }],
      message: 'Deleted 0 of 1 tasks',
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

  // OMN-158 leaf-strict tests
  it('(leaf) rejects wrong-typed: warnings as string not array', () => {
    const result = FolderCreateResultSchema.safeParse({
      folderId: 'f123',
      name: 'My Folder',
      parentFolder: null,
      warnings: 'none', // wrong type
      created: true,
    });
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects wrong-typed: parentFolder as number', () => {
    const result = FolderCreateResultSchema.safeParse({
      folderId: 'f123',
      name: 'My Folder',
      parentFolder: 42, // wrong type, should be string|null
      warnings: [],
      created: true,
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
        { tempId: 't1', taskId: 'abc', success: true, warnings: [] },
        { tempId: 't2', taskId: null, success: false, error: 'Not found', warnings: [] },
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

  // OMN-158 leaf-strict tests
  it('(leaf) accepts success batch item with warnings', () => {
    const result = BatchCreateResultSchema.safeParse({
      results: [{ tempId: 't1', taskId: 'abc123', success: true, warnings: [] }],
    });
    expect(result.success).toBe(true);
  });

  it('(leaf) accepts failure batch item', () => {
    const result = BatchCreateResultSchema.safeParse({
      results: [{ tempId: 't1', taskId: null, success: false, error: 'Project not found', warnings: [] }],
    });
    expect(result.success).toBe(true);
  });

  it('(leaf) rejects extra key inside success batch item', () => {
    const result = BatchCreateResultSchema.safeParse({
      results: [{ tempId: 't1', taskId: 'abc123', success: true, warnings: [], rogue: true }],
    });
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects wrong-typed field inside success batch item: taskId as number', () => {
    const result = BatchCreateResultSchema.safeParse({
      results: [{ tempId: 't1', taskId: 123, success: true, warnings: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects hybrid: success:true with error key (cross-variant)', () => {
    const result = BatchCreateResultSchema.safeParse({
      results: [{ tempId: 't1', taskId: 'abc', success: true, warnings: [], error: 'oops' }],
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

  // OMN-158 leaf-strict tests
  it('(leaf) rejects path-created with wrong-typed createdSegments: not array of strings', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'created',
      tagName: 'Work',
      tagId: 'tid1',
      path: 'Context : Work',
      createdSegments: [{ name: 'Work' }], // should be string[]
      message: 'Created 1 tag(s)',
    });
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects merged_with_warning with wrong-typed tasksMerged: string not number', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'merged_with_warning',
      sourceTag: 'OldTag',
      targetTag: 'NewTag',
      tasksMerged: '3', // wrong type, should be number
      warning: 'could not delete',
      message: 'Merged 3 tasks but could not delete source tag',
    });
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects reparented-to-root carrying newParentTagId (cross-variant hybrid)', () => {
    // reparented-to-root must NOT have newParentTagId; the two-variant union enforces this
    const result = TagMutationResultSchema.safeParse({
      action: 'reparented',
      tagName: 'Work',
      newParentTagId: 'npid1', // must be absent on to-root variant
      message: "Tag 'Work' moved to root level",
    });
    // After OMN-158: should fail because to-root variant is strict (no newParentTagId)
    // and with-parent variant requires newParentTagName (missing here)
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects merged_with_warning missing required warning key', () => {
    const result = TagMutationResultSchema.safeParse({
      action: 'merged_with_warning',
      sourceTag: 'OldTag',
      targetTag: 'NewTag',
      tasksMerged: 3,
      // warning key absent - should fail after OMN-158
      message: 'Merged 3 tasks but could not delete source tag',
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
    // Fixture corrected per OMN-158 spec §5: wire shapes for slimmed rows.
    // tasks: id, name, completed, flagged, status, tags are always emitted.
    // projects: id, name, status always emitted.
    // tags: id, name, taskCount always emitted.
    const result = SlimmedDataSchema.safeParse({
      tasks: [{ id: 't1', name: 'Buy milk', completed: false, flagged: false, status: 'available', tags: [] }],
      projects: [{ id: 'p1', name: 'Errands', status: 'active' }],
      tags: [{ id: 'tag1', name: 'home', taskCount: 3 }],
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
    // Fixture corrected per OMN-158 spec §5: wire shapes from get-recurring-patterns.ts.
    // patterns[]: {pattern, unit, steps, count, percentage, examples} required.
    // byProject[]: {project, recurringCount, patterns:[{pattern,count}]} required.
    // mostCommon: same shape as patterns[] entry (or null).
    // duration: number (Date.now() subtraction).
    const result = RecurringPatternsSchema.safeParse({
      totalRecurring: 12,
      patterns: [{ pattern: 'days_1', unit: 'days', steps: 1, count: 5, percentage: 41, examples: ['Daily standup'] }],
      byProject: [{ project: 'Work', recurringCount: 3, patterns: [{ pattern: 'days_1', count: 3 }] }],
      mostCommon: { pattern: 'days_1', unit: 'days', steps: 1, count: 5, percentage: 41, examples: ['Daily standup'] },
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

// ---------------------------------------------------------------------------
// OMN-158 Task 2: Read-family row + metadata schemas
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TaskRowSchema
// ---------------------------------------------------------------------------

describe('TaskRowSchema', () => {
  it('(a) accepts a fully-projected task row (all fields present)', () => {
    const result = TaskRowSchema.safeParse({
      id: 'abc123',
      name: 'Buy milk',
      completed: false,
      flagged: true,
      inInbox: false,
      blocked: false,
      available: true,
      dueDate: '2026-06-15T17:00:00.000Z',
      deferDate: null,
      plannedDate: null,
      effectivePlannedDate: null,
      completionDate: null,
      modified: '2026-06-12T10:00:00.000Z',
      added: '2026-06-01T08:00:00.000Z',
      dropDate: null,
      tags: ['Work', 'Urgent'],
      note: 'Get 2% milk',
      project: 'Errands',
      projectId: 'proj1',
      estimatedMinutes: 15,
      repetitionRule: { ruleString: 'FREQ=WEEKLY', scheduleType: 'fixed' },
      parentTaskId: null,
      parentTaskName: null,
      reason: 'due_soon',
      daysOverdue: 0,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts a minimal task row (id + name only — projection-gated)', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc123', name: 'Buy milk' });
    expect(result.success).toBe(true);
  });

  it('(a) accepts task row with null repetitionRule', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Task', repetitionRule: null });
    expect(result.success).toBe(true);
  });

  it('(b) rejects task row with wrong-typed field: flagged as string', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Task', flagged: 'yes' });
    expect(result.success).toBe(false);
  });

  it('(b) rejects task row with wrong-typed field: tags as string', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Task', tags: 'Work' });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key on task row', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Task', rogue: true });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key inside repetitionRule sub-object', () => {
    const result = TaskRowSchema.safeParse({
      id: 'abc',
      name: 'Task',
      repetitionRule: { ruleString: 'FREQ=DAILY', rogue: 'extra' },
    });
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects wrong reason enum value', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Task', reason: 'critical' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProjectRowSchema
// ---------------------------------------------------------------------------

describe('ProjectRowSchema', () => {
  it('(a) accepts a fully-projected project row', () => {
    const result = ProjectRowSchema.safeParse({
      id: 'p1',
      name: 'My Project',
      status: 'active',
      flagged: false,
      note: 'Project note',
      dueDate: null,
      deferDate: null,
      folder: 'Work',
      folderPath: 'Work/Projects',
      folderId: 'f1',
      sequential: false,
      lastReviewDate: '2026-06-01T00:00:00.000Z',
      nextReviewDate: '2026-07-01T00:00:00.000Z',
      reviewInterval: { unit: 'weeks', steps: 2 },
      completionDate: null,
      defaultSingletonActionHolder: false,
      tags: ['GTD'],
      plannedDate: null,
      taskCounts: { total: 10, available: 5, completed: 3 },
      nextTask: { id: 'abc', name: 'Do thing', flagged: false, dueDate: null },
      stats: { active: 5, completed: 3, total: 10, completionRate: 30, overdue: 1, flagged: 2 },
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts minimal project row (id + name only)', () => {
    const result = ProjectRowSchema.safeParse({ id: 'p1', name: 'Project' });
    expect(result.success).toBe(true);
  });

  it('(b) rejects wrong-typed field: sequential as string', () => {
    const result = ProjectRowSchema.safeParse({ id: 'p1', name: 'Project', sequential: 'yes' });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key on project row', () => {
    const result = ProjectRowSchema.safeParse({ id: 'p1', name: 'Project', rogue: true });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key inside reviewInterval sub-object', () => {
    const result = ProjectRowSchema.safeParse({
      id: 'p1',
      name: 'Project',
      reviewInterval: { unit: 'weeks', steps: 2, rogue: true },
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key inside nextTask sub-object', () => {
    const result = ProjectRowSchema.safeParse({
      id: 'p1',
      name: 'Project',
      nextTask: { id: 'abc', name: 'Task', flagged: false, dueDate: null, rogue: true },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TaskListMetadataSchema
// ---------------------------------------------------------------------------

describe('TaskListMetadataSchema', () => {
  it('(a) accepts full filtered-tasks metadata (all fields present)', () => {
    const result = TaskListMetadataSchema.safeParse({
      total_count: 100,
      total_matched: 100,
      sorted_in_script: false,
      limit_applied: 25,
      offset: 0,
      offset_applied: 0,
      mode: 'ast_filtered',
      filter_description: 'active tasks',
      optimization: 'ast_v4',
      architecture: 'ast_first',
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts id-lookup metadata (total_matched/filter_description/offset_applied absent)', () => {
    // PATH TRAP: id_lookup inner emits only {tasks, count, mode, targetId}; the
    // wrapper copies these values and JSON.stringify drops undefined — these three
    // keys are ABSENT, not null, on id-lookup reads.
    const result = TaskListMetadataSchema.safeParse({
      total_count: 1,
      sorted_in_script: false,
      limit_applied: 50,
      offset: 0,
      mode: 'id_lookup',
      optimization: 'ast_v4',
      architecture: 'ast_first',
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects metadata missing required total_count', () => {
    const result = TaskListMetadataSchema.safeParse({
      sorted_in_script: false,
      limit_applied: 25,
      offset: 0,
      mode: 'ast_filtered',
      optimization: 'ast_v4',
      architecture: 'ast_first',
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in task list metadata', () => {
    const result = TaskListMetadataSchema.safeParse({
      total_count: 5,
      sorted_in_script: false,
      limit_applied: 25,
      offset: 0,
      mode: 'ast_filtered',
      optimization: 'ast_v4',
      architecture: 'ast_first',
      rogue: true,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProjectListMetadataSchema
// ---------------------------------------------------------------------------

describe('ProjectListMetadataSchema', () => {
  it('(a) accepts full project list metadata', () => {
    const result = ProjectListMetadataSchema.safeParse({
      total_available: 50,
      total_matched: 10,
      returned_count: 10,
      limit_applied: 25,
      performance_mode: 'normal',
      stats_included: false,
      optimization: 'ast_filtered',
      filter_description: 'active projects',
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects metadata missing required total_available', () => {
    const result = ProjectListMetadataSchema.safeParse({
      total_matched: 10,
      returned_count: 10,
      limit_applied: 25,
      performance_mode: 'normal',
      stats_included: false,
      optimization: 'ast_filtered',
      filter_description: 'active projects',
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in project list metadata', () => {
    const result = ProjectListMetadataSchema.safeParse({
      total_available: 50,
      total_matched: 10,
      returned_count: 10,
      limit_applied: 25,
      performance_mode: 'normal',
      stats_included: false,
      optimization: 'ast_filtered',
      filter_description: 'active projects',
      rogue: true,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ExportTasksResultSchema and ExportProjectsResultSchema
// ---------------------------------------------------------------------------

describe('ExportTasksResultSchema', () => {
  it('(a) accepts csv empty variant (no limited, has message)', () => {
    const result = ExportTasksResultSchema.safeParse({
      format: 'csv',
      data: 'name,project\n',
      count: 0,
      duration: 45,
      message: 'No tasks found matching the filter criteria',
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts csv non-empty variant (with limited)', () => {
    const result = ExportTasksResultSchema.safeParse({
      format: 'csv',
      data: 'name,project\nTask A,Work\n',
      count: 1,
      duration: 60,
      limited: false,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts markdown variant', () => {
    const result = ExportTasksResultSchema.safeParse({
      format: 'markdown',
      data: '# OmniFocus Tasks Export\n',
      count: 5,
      duration: 80,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts json variant with full debug object', () => {
    const result = ExportTasksResultSchema.safeParse({
      format: 'json',
      data: [{ id: 'abc', name: 'Task A' }],
      count: 1,
      duration: 90,
      limited: false,
      debug: {
        totalTasksProcessed: 5,
        maxTasksAllowed: 1000,
        filterDescription: 'all tasks',
        fieldsRequested: ['name', 'project', 'dueDate'],
        optimizationUsed: 'AST filter + OmniJS bridge',
      },
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects json variant missing required debug field', () => {
    const result = ExportTasksResultSchema.safeParse({
      format: 'json',
      data: [],
      count: 0,
      duration: 50,
      limited: false,
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: csv payload with debug key (wrong variant)', () => {
    const result = ExportTasksResultSchema.safeParse({
      format: 'csv',
      data: 'name,project\n',
      count: 0,
      duration: 45,
      debug: {
        totalTasksProcessed: 0,
        maxTasksAllowed: 1000,
        filterDescription: '',
        fieldsRequested: [],
        optimizationUsed: '',
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('ExportProjectsResultSchema', () => {
  it('(a) accepts csv variant', () => {
    const result = ExportProjectsResultSchema.safeParse({
      format: 'csv',
      data: 'id,name,status\n',
      count: 0,
      duration: 30,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts markdown variant', () => {
    const result = ExportProjectsResultSchema.safeParse({
      format: 'markdown',
      data: '# OmniFocus Projects Export\n',
      count: 5,
      duration: 40,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts json variant with debug object', () => {
    const result = ExportProjectsResultSchema.safeParse({
      format: 'json',
      data: [{ id: 'p1', name: 'My Project', status: 'active' }],
      count: 1,
      duration: 55,
      debug: {
        totalProjectsProcessed: 1,
        includeStats: false,
        optimizationUsed: 'OmniJS bridge for 5-10x faster property access',
      },
    });
    expect(result.success).toBe(true);
  });

  it('(c) rejects closed-world: csv payload with debug key (wrong variant)', () => {
    const result = ExportProjectsResultSchema.safeParse({
      format: 'csv',
      data: 'id,name\n',
      count: 0,
      duration: 30,
      debug: { totalProjectsProcessed: 0, includeStats: false, optimizationUsed: '' },
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: project json debug missing optimizationUsed', () => {
    const result = ExportProjectsResultSchema.safeParse({
      format: 'json',
      data: [],
      count: 0,
      duration: 30,
      debug: { totalProjectsProcessed: 0, includeStats: false },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RecurringTaskRowSchema + summary/metadata
// ---------------------------------------------------------------------------

describe('RecurringTaskRowSchema', () => {
  it('(a) accepts full recurring task row', () => {
    const result = RecurringTaskRowSchema.safeParse({
      id: 'task1',
      name: 'Daily standup',
      project: 'Work',
      projectId: 'proj1',
      repetitionRule: {
        unit: 'days',
        steps: 1,
        ruleString: 'FREQ=DAILY',
        _inferenceSource: 'ruleString',
      },
      frequency: 'Daily',
      dueDate: '2026-06-13T17:00:00.000Z',
      nextDue: '2026-06-13T17:00:00.000Z',
      daysUntilDue: 1,
      isOverdue: false,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts minimal recurring task row with null unit (emitter default when no rule/name match)', () => {
    // Fixture corrected per OMN-158 Task 2 spec-review: unit required + nullable; steps required.
    // When ruleString is absent and name-inference fails, ruleData = {unit: null, steps: 1}.
    const result = RecurringTaskRowSchema.safeParse({
      id: 'task1',
      name: 'Weekly review',
      repetitionRule: { unit: null, steps: 1 },
      frequency: 'Unknown Pattern',
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects missing required id', () => {
    const result = RecurringTaskRowSchema.safeParse({
      name: 'Weekly review',
      repetitionRule: { unit: null, steps: 1 },
      frequency: 'Weekly',
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key on recurring task row', () => {
    const result = RecurringTaskRowSchema.safeParse({
      id: 'task1',
      name: 'Weekly review',
      repetitionRule: { unit: null, steps: 1 },
      frequency: 'Weekly',
      rogue: true,
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key inside repetitionRule', () => {
    const result = RecurringTaskRowSchema.safeParse({
      id: 'task1',
      name: 'Daily task',
      repetitionRule: { unit: 'days', steps: 1, rogue: true },
      frequency: 'Daily',
    });
    expect(result.success).toBe(false);
  });
});

describe('RecurringTasksSummarySchema', () => {
  it('(a) accepts full recurring tasks summary', () => {
    const result = RecurringTasksSummarySchema.safeParse({
      totalRecurring: 12,
      returned: 12,
      overdue: 2,
      dueThisWeek: 5,
      byFrequency: { Daily: 4, Weekly: 3, Monthly: 2 },
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects missing required returned field', () => {
    const result = RecurringTasksSummarySchema.safeParse({
      totalRecurring: 5,
      overdue: 0,
      dueThisWeek: 2,
      byFrequency: {},
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in summary', () => {
    const result = RecurringTasksSummarySchema.safeParse({
      totalRecurring: 5,
      returned: 5,
      overdue: 0,
      dueThisWeek: 2,
      byFrequency: {},
      rogue: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('RecurringTasksMetadataSchema', () => {
  it('(a) accepts full recurring tasks metadata', () => {
    const result = RecurringTasksMetadataSchema.safeParse({
      query_time_ms: 350,
      optimization: 'ast_recurring_builder',
      options: { includeCompleted: false, sortBy: 'name' },
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts metadata without optional options key', () => {
    const result = RecurringTasksMetadataSchema.safeParse({
      query_time_ms: 200,
      optimization: 'ast_recurring_builder',
    });
    expect(result.success).toBe(true);
  });

  it('(c) rejects closed-world: extra key in metadata', () => {
    const result = RecurringTasksMetadataSchema.safeParse({
      query_time_ms: 200,
      optimization: 'ast_recurring_builder',
      rogue: true,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PerspectiveItemSchema and PerspectiveSummarySchema
// ---------------------------------------------------------------------------

describe('PerspectiveItemSchema', () => {
  it('(a) accepts built-in perspective item', () => {
    const result = PerspectiveItemSchema.safeParse({
      name: 'Inbox',
      type: 'builtin',
      isBuiltIn: true,
      identifier: null,
      filterRules: null,
    });
    expect(result.success).toBe(true);
  });

  it('(a) accepts custom perspective item with identifier', () => {
    const result = PerspectiveItemSchema.safeParse({
      name: 'My Custom View',
      type: 'custom',
      isBuiltIn: false,
      identifier: 'custom-id-123',
      filterRules: null,
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects perspective missing required isBuiltIn field', () => {
    const result = PerspectiveItemSchema.safeParse({
      name: 'Inbox',
      type: 'builtin',
      identifier: null,
      filterRules: null,
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key on perspective item', () => {
    const result = PerspectiveItemSchema.safeParse({
      name: 'Inbox',
      type: 'builtin',
      isBuiltIn: true,
      identifier: null,
      filterRules: null,
      rogue: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('PerspectiveSummarySchema', () => {
  it('(a) accepts representative perspective summary', () => {
    const result = PerspectiveSummarySchema.safeParse({
      total: 10,
      insights: ['Found 10 perspectives (6 built-in, 4 custom)'],
    });
    expect(result.success).toBe(true);
  });

  it('(b) rejects summary missing total', () => {
    const result = PerspectiveSummarySchema.safeParse({ insights: [] });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in perspective summary', () => {
    const result = PerspectiveSummarySchema.safeParse({ total: 5, insights: [], rogue: true });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OMN-158 Task 3: RecurringTaskRowSchema nullability fix
// ---------------------------------------------------------------------------

describe('RecurringTaskRowSchema (OMN-158 Task 3 nullability fix)', () => {
  it('(nullability) accepts unit: null (no ruleString and no name-inference match)', () => {
    // This is the key regression test: the emitter sets ruleData.unit = null by default
    // when parseRuleString finds no FREQ= and inferFrequencyFromName returns null.
    // The old schema had z.string().optional() which REJECTED null — this test would
    // have FAILED before the fix.
    const result = RecurringTaskRowSchema.safeParse({
      id: 'task-abc',
      name: 'Some unrecognized task',
      repetitionRule: { unit: null, steps: 1 },
      frequency: 'Unknown Pattern',
    });
    expect(result.success).toBe(true);
  });

  it('(nullability) accepts unit: string (parsed from RRULE)', () => {
    const result = RecurringTaskRowSchema.safeParse({
      id: 'task-abc',
      name: 'Daily task',
      repetitionRule: { unit: 'days', steps: 1, ruleString: 'FREQ=DAILY', _inferenceSource: 'ruleString' },
      frequency: 'Daily',
    });
    expect(result.success).toBe(true);
  });

  it('(nullability) accepts method: null (when repetitionRule.method.name resolves to null)', () => {
    const result = RecurringTaskRowSchema.safeParse({
      id: 'task-abc',
      name: 'Recurring task',
      repetitionRule: { unit: 'weeks', steps: 1, method: null },
      frequency: 'Weekly',
    });
    expect(result.success).toBe(true);
  });

  it('(nullability) rejects unit: undefined (unit is required, not optional)', () => {
    // unit is required (must be present, may be null), NOT optional (may be absent).
    const result = RecurringTaskRowSchema.safeParse({
      id: 'task-abc',
      name: 'Recurring task',
      repetitionRule: { steps: 1 }, // unit key absent
      frequency: 'Unknown Pattern',
    });
    expect(result.success).toBe(false);
  });

  it('(nullability) rejects missing steps (steps required)', () => {
    const result = RecurringTaskRowSchema.safeParse({
      id: 'task-abc',
      name: 'Recurring task',
      repetitionRule: { unit: null }, // steps absent
      frequency: 'Unknown Pattern',
    });
    expect(result.success).toBe(false);
  });

  it('(leaf) rejects extra key inside repetitionRule (anchorDateKey removed from schema — not emitted)', () => {
    // The emitter only emits unit/steps/ruleString/_inferenceSource/method.
    // anchorDateKey/catchUpAutomatically/scheduleType were legacy; .strict() rejects them.
    const result = RecurringTaskRowSchema.safeParse({
      id: 'task-abc',
      name: 'Daily task',
      repetitionRule: { unit: 'days', steps: 1, anchorDateKey: 'due' },
      frequency: 'Daily',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OMN-158 Task 3: v3EnvelopeSchema factory
// ---------------------------------------------------------------------------

describe('v3EnvelopeSchema factory', () => {
  const TestSchema = v3EnvelopeSchema(z.object({ count: z.number(), label: z.string() }).strict());

  it('(a) accepts typed data payload', () => {
    const result = TestSchema.safeParse({ ok: true, v: '3', data: { count: 5, label: 'test' } });
    expect(result.success).toBe(true);
  });

  it('(b) rejects data payload with wrong type', () => {
    const result = TestSchema.safeParse({ ok: true, v: '3', data: { count: 'five', label: 'test' } });
    expect(result.success).toBe(false);
  });

  it('(b) rejects data payload with extra key (strict data)', () => {
    const result = TestSchema.safeParse({ ok: true, v: '3', data: { count: 5, label: 'test', rogue: true } });
    expect(result.success).toBe(false);
  });

  it('(c) rejects envelope with extra top-level key', () => {
    const result = TestSchema.safeParse({ ok: true, v: '3', data: { count: 5, label: 'test' }, extra: 'x' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OMN-158 Task 3: PRODUCTIVITY_STATS_V3_SCHEMA
// ---------------------------------------------------------------------------

describe('PRODUCTIVITY_STATS_V3_SCHEMA', () => {
  const minimalPayload = {
    ok: true,
    v: '3',
    data: {
      summary: {
        period: 'week',
        totalProjects: 5,
        activeProjects: 3,
        totalTasks: 120,
        completedTasks: 80,
        completedInPeriod: 12,
        availableTasks: 25,
        completionRate: 0.6667,
        dailyAverage: 1.7,
        daysInPeriod: 7,
        overdueCount: 3,
      },
      insights: ['Low task completion rate'],
      metadata: {
        generated_at: '2026-06-12T10:00:00.000Z',
        method: 'omnijs_v3_single_bridge',
        optimization: 'omnijs_v3',
        query_time_ms: 450,
        note: 'All statistics calculated in single OmniJS bridge call',
      },
    },
  };

  it('(a) accepts minimal payload (no projectStats/tagStats)', () => {
    const result = PRODUCTIVITY_STATS_V3_SCHEMA.safeParse(minimalPayload);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(a) accepts payload with projectStats and tagStats (name-keyed maps)', () => {
    const result = PRODUCTIVITY_STATS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: {
        ...minimalPayload.data,
        projectStats: {
          'My Project': {
            total: 10,
            completed: 5,
            available: 3,
            completionRate: '50.0',
            status: 'active',
            hadRecentActivity: true,
          },
        },
        tagStats: {
          Work: { available: 5, remaining: 8, completionRate: '37.5' },
        },
      },
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(b) rejects payload with wrong-typed summary.completionRate (string not number)', () => {
    const result = PRODUCTIVITY_STATS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: {
        ...minimalPayload.data,
        summary: { ...minimalPayload.data.summary, completionRate: '66.67%' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('(b) rejects payload missing metadata.generated_at', () => {
    const metaWithout = Object.fromEntries(
      Object.entries(minimalPayload.data.metadata).filter(([k]) => k !== 'generated_at'),
    );
    const result = PRODUCTIVITY_STATS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: { ...minimalPayload.data, metadata: metaWithout },
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in data', () => {
    const result = PRODUCTIVITY_STATS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: { ...minimalPayload.data, rogue: true },
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in projectStats value', () => {
    const result = PRODUCTIVITY_STATS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: {
        ...minimalPayload.data,
        projectStats: {
          'My Project': {
            total: 10,
            completed: 5,
            available: 3,
            completionRate: '50.0',
            status: 'active',
            hadRecentActivity: true,
            rogue: true,
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OMN-158 Task 3: TASK_VELOCITY_V3_SCHEMA
// ---------------------------------------------------------------------------

describe('TASK_VELOCITY_V3_SCHEMA', () => {
  const minimalPayload = {
    ok: true,
    v: '3',
    data: {
      velocity: {
        period: 'week',
        averageCompleted: '3.5',
        averageCreated: '2.0',
        dailyVelocity: '0.50',
        backlogGrowthRate: '-1.5',
      },
      throughput: {
        intervals: [
          {
            start: '2026-06-05T00:00:00.000Z',
            end: '2026-06-12T23:59:59.000Z',
            created: 14,
            completed: 24,
            label: '6/12/2026',
          },
        ],
        totalCompleted: 24,
        totalCreated: 14,
      },
      breakdown: { medianCompletionHours: '12.5', tasksAnalyzed: 1961 },
      projections: { tasksPerDay: '0.50', tasksPerWeek: '3.5', tasksPerMonth: '15.0' },
      optimization: 'omnijs_v3',
      dateRange: { start: '2026-06-05', end: '2026-06-12' },
    },
  };

  it('(a) accepts full payload with ISO string start/end in intervals', () => {
    // Verifying Date.toJSON() → ISO string on the wire (emitter uses Date objects,
    // JSON.stringify calls Date.prototype.toJSON() producing ISO-8601 string).
    const result = TASK_VELOCITY_V3_SCHEMA.safeParse(minimalPayload);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(b) rejects interval with non-string start (wrong type)', () => {
    const result = TASK_VELOCITY_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: {
        ...minimalPayload.data,
        throughput: {
          ...minimalPayload.data.throughput,
          intervals: [{ start: new Date(), end: '2026-06-12T23:59:59.000Z', created: 1, completed: 2, label: 'x' }],
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in velocity', () => {
    const result = TASK_VELOCITY_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: { ...minimalPayload.data, velocity: { ...minimalPayload.data.velocity, rogue: true } },
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in interval', () => {
    const result = TASK_VELOCITY_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: {
        ...minimalPayload.data,
        throughput: {
          ...minimalPayload.data.throughput,
          intervals: [
            {
              start: '2026-06-05T00:00:00.000Z',
              end: '2026-06-12T23:59:59.000Z',
              created: 1,
              completed: 2,
              label: 'x',
              rogue: true,
            },
          ],
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OMN-158 Task 3: OVERDUE_ANALYSIS_V3_SCHEMA
// ---------------------------------------------------------------------------

describe('OVERDUE_ANALYSIS_V3_SCHEMA', () => {
  const overdueTask = {
    id: 'task1',
    name: 'Overdue task',
    dueDate: '2026-06-01T17:00:00.000Z',
    daysOverdue: 11,
    project: 'Work',
    tags: ['urgent'],
    blocked: false,
    isNext: true,
  };

  const minimalPayload = {
    ok: true,
    v: '3',
    data: {
      summary: {
        totalOverdue: 1,
        blockedCount: 0,
        unblockedCount: 1,
        blockedPercentage: 0.0,
        avgDaysOverdue: 11.0,
        mostOverdue: overdueTask,
      },
      insights: ['1 overdue tasks found'],
      groupedByUrgency: { critical: [], high: [overdueTask], medium: [], low: [] },
      projectBottlenecks: [
        { name: 'Work', overdueCount: 1, blockedCount: 0, avgDaysOverdue: '11.0', blockageRate: '0.0' },
      ],
      blockedTasks: [],
      metadata: {
        generated_at: '2026-06-12T10:00:00.000Z',
        method: 'omnijs_v3_single_bridge',
        optimization: 'omnijs_v3',
        query_time_ms: 800,
        tasksAnalyzed: 100,
        note: 'All analysis calculated in single OmniJS bridge call',
      },
    },
  };

  it('(a) accepts full payload with overdue task', () => {
    const result = OVERDUE_ANALYSIS_V3_SCHEMA.safeParse(minimalPayload);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(a) accepts payload where mostOverdue is null (no overdue tasks)', () => {
    const result = OVERDUE_ANALYSIS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: {
        ...minimalPayload.data,
        summary: {
          totalOverdue: 0,
          blockedCount: 0,
          unblockedCount: 0,
          blockedPercentage: 0.0,
          avgDaysOverdue: 0.0,
          mostOverdue: null,
        },
        insights: ['No overdue tasks found - excellent!'],
        groupedByUrgency: { critical: [], high: [], medium: [], low: [] },
        projectBottlenecks: [],
        blockedTasks: [],
      },
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(b) rejects wrong-typed blockedPercentage (string not number)', () => {
    // blockedPercentage: parseFloat(toFixed(1)) → number; must NOT be string
    const result = OVERDUE_ANALYSIS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: {
        ...minimalPayload.data,
        summary: { ...minimalPayload.data.summary, blockedPercentage: '0.0' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in overdue task row', () => {
    const result = OVERDUE_ANALYSIS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: {
        ...minimalPayload.data,
        groupedByUrgency: { critical: [], high: [{ ...overdueTask, rogue: true }], medium: [], low: [] },
      },
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra urgency bucket key (groupedByUrgency is strict)', () => {
    const result = OVERDUE_ANALYSIS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: {
        ...minimalPayload.data,
        groupedByUrgency: { critical: [], high: [], medium: [], low: [], extreme: [] },
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OMN-158 Task 3: WORKFLOW_ANALYSIS_V3_SCHEMA
// ---------------------------------------------------------------------------

describe('WORKFLOW_ANALYSIS_V3_SCHEMA', () => {
  const minimalPayload = {
    ok: true,
    v: '3',
    data: {
      insights: [{ category: 'productivity', insight: '75% of tasks are ready', priority: 'medium' }],
      patterns: {
        workloadDistribution: { byProject: {}, byTag: {}, timeBuckets: {} },
        workflowMetrics: { availablePercentage: '75.0', overduePercentage: '5.0' },
        deferralAnalysis: { totalDeferred: 10, strategicDeferrals: 8, problematicDeferrals: 2 },
      },
      recommendations: [
        { category: 'dependency_management', recommendation: 'Review blocked tasks', priority: 'high' },
      ],
      totalTasks: 200,
      totalProjects: 15,
      analysisTime: 1200,
      dataPoints: 200,
      metadata: {
        analysisDepth: 'standard',
        focusAreas: ['productivity', 'workload'],
        maxInsights: 15,
        method: 'omnijs_v3_single_bridge',
        optimization: 'omnijs_v3',
        query_time_ms: 1200,
        note: 'All analysis calculated in single OmniJS bridge call',
      },
    },
  };

  it('(a) accepts minimal payload without data key (includeRawData=false → undefined-dropped)', () => {
    const result = WORKFLOW_ANALYSIS_V3_SCHEMA.safeParse(minimalPayload);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(a) accepts payload with data key (includeRawData=true passthrough)', () => {
    const result = WORKFLOW_ANALYSIS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: { ...minimalPayload.data, data: { tasks: [], projects: [], workload: {} } },
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(b) rejects wrong-typed insight (priority not string)', () => {
    const result = WORKFLOW_ANALYSIS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: {
        ...minimalPayload.data,
        insights: [{ category: 'productivity', insight: 'x', priority: 5 }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in patterns (patterns is strict)', () => {
    const result = WORKFLOW_ANALYSIS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: {
        ...minimalPayload.data,
        patterns: { ...minimalPayload.data.patterns, extraPattern: {} },
      },
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in metadata', () => {
    const result = WORKFLOW_ANALYSIS_V3_SCHEMA.safeParse({
      ...minimalPayload,
      data: { ...minimalPayload.data, metadata: { ...minimalPayload.data.metadata, rogue: true } },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OMN-158 Task 3: REVIEWS_LIST_TYPED_SCHEMA
// ---------------------------------------------------------------------------

describe('REVIEWS_LIST_TYPED_SCHEMA', () => {
  it('(a) accepts payload with project items', () => {
    const result = REVIEWS_LIST_TYPED_SCHEMA.safeParse({
      success: true,
      projects: [
        {
          id: 'p1',
          name: 'My Project',
          status: 'active',
          flagged: false,
          sequential: false,
          completedByChildren: false,
        },
      ],
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(a) accepts payload with all optional fields on project', () => {
    const result = REVIEWS_LIST_TYPED_SCHEMA.safeParse({
      success: true,
      projects: [
        {
          id: 'p1',
          name: 'My Project',
          status: 'active',
          flagged: false,
          sequential: false,
          completedByChildren: false,
          note: 'Some note',
          folder: 'Work',
          dueDate: '2026-07-01T17:00:00.000Z',
          lastReviewDate: '2026-06-01T00:00:00.000Z',
          nextReviewDate: '2026-07-01T00:00:00.000Z',
          reviewInterval: { unit: 'weeks', steps: 4 },
          taskCounts: { total: 5, available: 3, completed: 2 },
        },
      ],
      metadata: {
        total_found: 1,
        generated_at: '2026-06-12T10:00:00.000Z',
        filter_applied: { overdue: true },
        search_criteria: { overdue_only: true, days_ahead: 7 },
      },
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(b) rejects project missing required flagged field', () => {
    const result = REVIEWS_LIST_TYPED_SCHEMA.safeParse({
      success: true,
      projects: [{ id: 'p1', name: 'Project', status: 'active', sequential: false, completedByChildren: false }],
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key on project row', () => {
    const result = REVIEWS_LIST_TYPED_SCHEMA.safeParse({
      success: true,
      projects: [
        {
          id: 'p1',
          name: 'Project',
          status: 'active',
          flagged: false,
          sequential: false,
          completedByChildren: false,
          rogue: true,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OMN-158 Task 3: MARK_REVIEWED_TYPED_SCHEMA
// ---------------------------------------------------------------------------

describe('MARK_REVIEWED_TYPED_SCHEMA', () => {
  it('(a) accepts full mark-reviewed payload', () => {
    const result = MARK_REVIEWED_TYPED_SCHEMA.safeParse({
      success: true,
      project: {
        id: 'p1',
        name: 'My Project',
        lastReviewDate: '2026-06-12T12:00:00.000Z',
        nextReviewDate: '2026-07-10T12:00:00.000Z',
        reviewInterval: { unit: 'weeks', steps: 4 },
      },
      changes: ['Last review date set to 2026-06-12'],
      message: "Project 'My Project' marked as reviewed",
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(a) accepts payload with null reviewInterval and null dates', () => {
    const result = MARK_REVIEWED_TYPED_SCHEMA.safeParse({
      success: true,
      project: {
        id: 'p1',
        name: 'My Project',
        lastReviewDate: '2026-06-12T12:00:00.000Z',
        nextReviewDate: null,
        reviewInterval: null,
      },
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(b) rejects missing required project field', () => {
    const result = MARK_REVIEWED_TYPED_SCHEMA.safeParse({ success: true, message: 'done' });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in project', () => {
    const result = MARK_REVIEWED_TYPED_SCHEMA.safeParse({
      success: true,
      project: {
        id: 'p1',
        name: 'Project',
        lastReviewDate: null,
        nextReviewDate: null,
        reviewInterval: null,
        rogue: true,
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OMN-158 Task 3: SET_SCHEDULE_TYPED_SCHEMA
// ---------------------------------------------------------------------------

describe('SET_SCHEDULE_TYPED_SCHEMA', () => {
  it('(a) accepts full set-schedule payload with success + failure items', () => {
    const result = SET_SCHEDULE_TYPED_SCHEMA.safeParse({
      success: true,
      results: {
        successful: [
          {
            projectId: 'p1',
            projectName: 'My Project',
            changes: ['Review interval set to every 4 weeks'],
            reviewInterval: { unit: 'weeks', steps: 4 },
            nextReviewDate: '2026-07-10T12:00:00.000Z',
          },
        ],
        failed: [{ projectId: 'p2', projectName: 'Missing Project', error: 'Project not found' }],
        summary: { total_requested: 2, successful_count: 1, failed_count: 1 },
      },
      message: 'Batch review schedule update completed: 1 successful, 1 failed',
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(a) accepts failed entry without projectName (project not found early failure)', () => {
    const result = SET_SCHEDULE_TYPED_SCHEMA.safeParse({
      success: true,
      results: {
        successful: [],
        failed: [{ projectId: 'p2', error: 'Project not found' }],
        summary: { total_requested: 1, successful_count: 0, failed_count: 1 },
      },
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(b) rejects missing required results.summary', () => {
    const result = SET_SCHEDULE_TYPED_SCHEMA.safeParse({
      success: true,
      results: { successful: [], failed: [] },
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in successful entry', () => {
    const result = SET_SCHEDULE_TYPED_SCHEMA.safeParse({
      success: true,
      results: {
        successful: [
          { projectId: 'p1', projectName: 'P', changes: [], reviewInterval: null, nextReviewDate: null, rogue: true },
        ],
        failed: [],
        summary: { total_requested: 1, successful_count: 1, failed_count: 0 },
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OMN-158 Task 3: Deepened RecurringPatternsSchema
// ---------------------------------------------------------------------------

describe('RecurringPatternsSchema (deepened OMN-158 Task 3)', () => {
  it('(a) accepts payload where mostCommon is null', () => {
    const result = RecurringPatternsSchema.safeParse({
      totalRecurring: 0,
      patterns: [],
      byProject: [],
      mostCommon: null,
      duration: 100,
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(b) rejects pattern entry missing percentage field', () => {
    const result = RecurringPatternsSchema.safeParse({
      totalRecurring: 1,
      patterns: [{ pattern: 'days_1', unit: 'days', steps: 1, count: 1, examples: [] }], // missing percentage
      byProject: [],
      mostCommon: null,
      duration: 100,
    });
    expect(result.success).toBe(false);
  });

  it('(b) accepts steps as string ("unknown" when no pattern matched)', () => {
    // The emitter sets steps = ruleData.steps || 'unknown' which produces string 'unknown'
    const result = RecurringPatternsSchema.safeParse({
      totalRecurring: 1,
      patterns: [
        {
          pattern: 'unknown_unknown',
          unit: 'unknown',
          steps: 'unknown',
          count: 1,
          percentage: 100,
          examples: ['Task'],
        },
      ],
      byProject: [],
      mostCommon: null,
      duration: 50,
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(c) rejects closed-world: extra key in pattern entry', () => {
    const result = RecurringPatternsSchema.safeParse({
      totalRecurring: 1,
      patterns: [{ pattern: 'days_1', unit: 'days', steps: 1, count: 1, percentage: 100, examples: [], rogue: true }],
      byProject: [],
      mostCommon: null,
      duration: 100,
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in byProject entry', () => {
    const result = RecurringPatternsSchema.safeParse({
      totalRecurring: 1,
      patterns: [],
      byProject: [{ project: 'Work', recurringCount: 1, patterns: [], rogue: true }],
      mostCommon: null,
      duration: 100,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OMN-158 Task 3: Deepened SlimmedDataSchema
// ---------------------------------------------------------------------------

describe('SlimmedDataSchema (deepened OMN-158 Task 3)', () => {
  it('(a) accepts full payload with all optional fields on task row', () => {
    const result = SlimmedDataSchema.safeParse({
      tasks: [
        {
          id: 't1',
          name: 'Buy milk',
          completed: false,
          flagged: true,
          status: 'available',
          tags: ['errands'],
          project: 'Shopping',
          projectId: 'p1',
          deferDate: '2026-06-12T08:00:00.000Z',
          dueDate: '2026-06-15T17:00:00.000Z',
          creationDate: '2026-06-01T08:00:00.000Z',
          modificationDate: '2026-06-10T10:00:00.000Z',
          estimatedMinutes: 15,
          noteHead: 'Get 2%',
          children: 0,
          note: 'Get 2% milk',
        },
      ],
      projects: [
        {
          id: 'p1',
          name: 'Shopping',
          status: 'active',
          taskCount: 5,
          availableTaskCount: 3,
          lastReviewDate: '2026-06-01T00:00:00.000Z',
          nextReviewDate: '2026-07-01T00:00:00.000Z',
        },
      ],
      tags: [{ id: 'tag1', name: 'errands', taskCount: 3 }],
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('(b) rejects task row missing required completed field', () => {
    const result = SlimmedDataSchema.safeParse({
      tasks: [{ id: 't1', name: 'Task', flagged: false, status: 'available', tags: [] }],
      projects: [],
      tags: [],
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in task row', () => {
    const result = SlimmedDataSchema.safeParse({
      tasks: [{ id: 't1', name: 'Task', completed: false, flagged: false, status: 'available', tags: [], rogue: true }],
      projects: [],
      tags: [],
    });
    expect(result.success).toBe(false);
  });

  it('(c) rejects closed-world: extra key in tag row', () => {
    const result = SlimmedDataSchema.safeParse({
      tasks: [],
      projects: [],
      tags: [{ id: 'tag1', name: 'Work', taskCount: 3, rogue: true }],
    });
    expect(result.success).toBe(false);
  });
});

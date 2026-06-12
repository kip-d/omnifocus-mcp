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
} from '../../../src/omnifocus/script-response-schemas.js';

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

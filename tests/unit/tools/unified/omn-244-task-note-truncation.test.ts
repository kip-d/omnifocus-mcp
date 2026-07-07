/**
 * OMN-244: noteTruncated flag for TASK notes (sibling of OMN-242/OMN-245,
 * mirrors merged PR #194/#204's project pattern).
 *
 * The task path already threads noteTruncateLength (resolveNoteTruncateLength
 * via buildTaskQuery — #204's shared helper), but the task projection
 * truncated silently: the same `note` field could carry a full or truncated
 * note with no signal. These tests pin: the conditional-spread emission, the
 * strict row schema widening, and the post-hoc projection carrying the marker
 * (the #204 live-verify finding class, task side).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { NOTE_TRUNCATE_LENGTH } from '../../../../src/contracts/ast/script-builder.js';
import { projectFields } from '../../../../src/tools/tasks/task-query-pipeline.js';
import { TaskRowSchema } from '../../../../src/omnifocus/script-response-schemas.js';
import type { OmniFocusTask } from '../../../../src/omnifocus/types.js';

function createMockCache(): CacheManager & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    invalidateForTaskChange: vi.fn(),
    invalidateProject: vi.fn(),
    invalidateTag: vi.fn(),
    invalidateTaskQueries: vi.fn(),
    clear: vi.fn(),
  } as unknown as CacheManager & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
}

describe('OMN-244: task list note truncation emits the noteTruncated marker', () => {
  let tool: OmniFocusReadTool;
  let execJsonSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tool = new OmniFocusReadTool(createMockCache());
    execJsonSpy = vi.fn().mockResolvedValue({
      success: true,
      data: { tasks: [], metadata: { total_matched: 0 } },
    });
    vi.spyOn(tool as unknown as { execJson: unknown }, 'execJson' as never).mockImplementation(execJsonSpy as never);
  });

  async function runTasksQuery(extra: Record<string, unknown> = {}): Promise<string> {
    await tool.execute({
      query: { type: 'tasks', filters: { status: 'active' }, fields: ['id', 'name', 'note'], ...extra },
    });
    expect(execJsonSpy).toHaveBeenCalled();
    return String(execJsonSpy.mock.calls[0][0]);
  }

  it('list WITHOUT details: generated script contains the truncation branch + noteTruncated flag', async () => {
    const script = await runTasksQuery();
    expect(script).toContain('noteTruncated: true');
    expect(script).toContain(`n.length > ${NOTE_TRUNCATE_LENGTH}`);
  });

  it('list WITH details:true: full note, no truncation branch', async () => {
    const script = await runTasksQuery({ details: true });
    expect(script).not.toContain('noteTruncated');
    expect(script).toMatch(/note: task\.note \|\| /);
  });
});

describe('OMN-244: post-hoc projection carries the noteTruncated marker (the #204 finding class)', () => {
  const truncatedTask = {
    id: 't1',
    name: 'T',
    completed: false,
    flagged: false,
    blocked: false,
    note: 'x'.repeat(200) + '...',
    noteTruncated: true,
  } as unknown as OmniFocusTask;

  it('keeps noteTruncated when note is among the projected fields', () => {
    const out = projectFields([truncatedTask], ['id', 'name', 'note']) as Array<Record<string, unknown>>;
    expect(out[0].noteTruncated).toBe(true);
  });

  it('drops noteTruncated when note is NOT projected (marker rides the note)', () => {
    const out = projectFields([truncatedTask], ['id', 'name']) as Array<Record<string, unknown>>;
    expect(out[0]).not.toHaveProperty('noteTruncated');
    expect(out[0]).not.toHaveProperty('note');
  });

  it('does not invent the marker for full notes', () => {
    const full = { ...truncatedTask, note: 'short' } as Record<string, unknown>;
    delete full.noteTruncated;
    const out = projectFields([full as unknown as OmniFocusTask], ['id', 'note']) as Array<Record<string, unknown>>;
    expect(out[0]).not.toHaveProperty('noteTruncated');
  });
});

describe('OMN-244: TaskRowSchema accepts the marker (strict widening)', () => {
  it('accepts a truncated row carrying noteTruncated: true', () => {
    const r = TaskRowSchema.safeParse({ id: 't1', note: 'x...', noteTruncated: true });
    expect(r.success).toBe(true);
  });

  it('remains strict for unknown keys', () => {
    const r = TaskRowSchema.safeParse({ id: 't1', bogusKey: 1 });
    expect(r.success).toBe(false);
  });
});

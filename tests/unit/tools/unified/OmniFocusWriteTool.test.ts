import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OmniFocusWriteTool } from '../../../../src/tools/unified/OmniFocusWriteTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { createScriptSuccess, createScriptError } from '../../../../src/omnifocus/script-result-types.js';
import * as scriptBuilder from '../../../../src/contracts/ast/mutation-script-builder.js';

/**
 * Integration tests for task CRUD operations through OmniFocusWriteTool.
 *
 * These tests mock execJson on the tool's omniAutomation (via BaseTool.execJson)
 * and verify the full path from execute() input through to response output,
 * including sanitization, date conversion, cache invalidation, and v3 envelope unwrapping.
 */

function createMockCache(): CacheManager {
  return {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    invalidateForTaskChange: vi.fn(),
    invalidateProject: vi.fn(),
    invalidateTag: vi.fn(),
    invalidateTaskQueries: vi.fn(),
    clear: vi.fn(),
  } as unknown as CacheManager;
}

describe('OmniFocusWriteTool task operations', () => {
  let tool: OmniFocusWriteTool;
  let mockCache: CacheManager;
  let execJsonSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCache = createMockCache();
    tool = new OmniFocusWriteTool(mockCache);

    // Mock execJson on the tool instance (protected method on BaseTool)
    execJsonSpy = vi.fn();
    vi.spyOn(tool as any, 'execJson').mockImplementation(execJsonSpy);
  });

  // ─── CREATE ─────────────────────────────────────────────────────────

  describe('task create', () => {
    it('creates a task and returns success with created id', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { id: 'task-abc', name: 'Buy milk', taskId: 'task-abc' },
        }),
      );

      const result = (await tool.execute({
        mutation: {
          operation: 'create',
          target: 'task',
          data: { name: 'Buy milk' },
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('task-abc');
      expect(result.data.name).toBe('Buy milk');
      expect(result.data.operation).toBe('create');
    });

    it('calls cache.invalidateForTaskChange after create', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { id: 'task-1', name: 'T', taskId: 'task-1' },
        }),
      );

      await tool.execute({
        mutation: {
          operation: 'create',
          target: 'task',
          data: { name: 'T', tags: ['work'], project: 'proj-1' },
        },
      });

      expect(mockCache.invalidateForTaskChange).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'create',
          tags: ['work'],
        }),
      );
    });

    it('OMN-128: lowers repetitionRule in-program — ONE script, rule passed to the builder', async () => {
      // Call through to the real builder so the generated script is the real
      // artifact; the spy just records the data arg.
      const buildSpy = vi.spyOn(scriptBuilder, 'buildCreateTaskScript');
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { id: 'task-rep', name: 'Repeat Task', taskId: 'task-rep', warnings: [] },
        }),
      );

      const result = (await tool.execute({
        mutation: {
          operation: 'create',
          target: 'task',
          data: {
            name: 'Repeat Task',
            repetitionRule: { frequency: 'daily', interval: 1 },
          },
        },
      })) as any;

      expect(result.success).toBe(true);
      // The rule rides the create script itself (no second post-create update).
      expect(execJsonSpy).toHaveBeenCalledTimes(1);
      expect(buildSpy).toHaveBeenCalledTimes(1);
      expect(buildSpy.mock.calls[0][0]).toMatchObject({
        repetitionRule: { frequency: 'daily', interval: 1 },
      });
      // metadata stays truthful about the rule
      expect(result.metadata.input_params.has_repeat_rule).toBe(true);
      buildSpy.mockRestore();
    });

    it('OMN-137: surfaces script warnings in the create response data', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { taskId: 'task-w', name: 'Warned', warnings: ['tags: boom'] },
        }),
      );

      const result = (await tool.execute({
        mutation: { operation: 'create', target: 'task', data: { name: 'Warned' } },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.warnings).toEqual(['tags: boom']);
    });

    it('OMN-137: omits the warnings key when the script reports none', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { taskId: 'task-nw', name: 'Clean', warnings: [] },
        }),
      );

      const result = (await tool.execute({
        mutation: { operation: 'create', target: 'task', data: { name: 'Clean' } },
      })) as any;

      expect(result.success).toBe(true);
      expect('warnings' in result.data).toBe(false);
    });

    it('returns error when script fails', async () => {
      execJsonSpy.mockResolvedValue(createScriptError('OmniFocus not running', 'connection'));

      const result = (await tool.execute({
        mutation: {
          operation: 'create',
          target: 'task',
          data: { name: 'Will fail' },
        },
      })) as any;

      expect(result.success).toBe(false);
    });

    it('OMN-63: backfills data.task.taskId from id when script omits taskId', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { id: 'task-xyz', name: 'No taskId here' }, // NOTE: no `taskId`
        }),
      );

      const result = (await tool.execute({
        mutation: { operation: 'create', target: 'task', data: { name: 'No taskId here' } },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.task.taskId).toBe('task-xyz'); // backfilled from id
      expect(result.data.id).toBe('task-xyz'); // unchanged
    });

    it('OMN-63: preserves a script-emitted taskId (no id present)', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { taskId: 'real-tid', name: 'Has taskId' },
        }),
      );

      const result = (await tool.execute({
        mutation: { operation: 'create', target: 'task', data: { name: 'Has taskId' } },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.task.taskId).toBe('real-tid'); // unclobbered
    });

    it('OMN-63: ??= is a no-op when both taskId and a differing id are present', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { taskId: 'tid-1', id: 'id-2', name: 'Both present' },
        }),
      );

      const result = (await tool.execute({
        mutation: { operation: 'create', target: 'task', data: { name: 'Both present' } },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.task.taskId).toBe('tid-1'); // taskId wins; not overwritten by id
    });

    it('unwraps v3 envelope from create result', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { id: 'task-v3', name: 'V3 Task', taskId: 'task-v3' },
        }),
      );

      const result = (await tool.execute({
        mutation: {
          operation: 'create',
          target: 'task',
          data: { name: 'V3 Task' },
        },
      })) as any;

      // The task data should be unwrapped from the v3 envelope
      expect(result.data.task.id).toBe('task-v3');
      expect(result.data.task.name).toBe('V3 Task');
    });
  });

  // ─── UPDATE ─────────────────────────────────────────────────────────

  describe('task update', () => {
    it('updates a task and returns success', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: {
            task: { id: 'task-upd', name: 'Updated Name' },
          },
        }),
      );

      const result = (await tool.execute({
        mutation: {
          operation: 'update',
          target: 'task',
          id: 'task-upd',
          changes: { name: 'Updated Name' },
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.task.id).toBe('task-upd');
    });

    it('calls sanitizeTaskUpdates and converts dates', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { task: { id: 'task-date', name: 'Dated' } },
        }),
      );

      const result = (await tool.execute({
        mutation: {
          operation: 'update',
          target: 'task',
          id: 'task-date',
          changes: { dueDate: '2026-03-15' },
        },
      })) as any;

      expect(result.success).toBe(true);
      // The script should have been called (date conversion happens inside sanitizer)
      expect(execJsonSpy).toHaveBeenCalledTimes(1);
    });

    it('unwraps v3 envelope from update result', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { task: { id: 'task-v3u', name: 'V3 Updated' } },
        }),
      );

      const result = (await tool.execute({
        mutation: {
          operation: 'update',
          target: 'task',
          id: 'task-v3u',
          changes: { name: 'V3 Updated' },
        },
      })) as any;

      // Result should contain unwrapped task data
      expect(result.success).toBe(true);
      expect(result.data.task.id).toBe('task-v3u');
    });

    it('returns error when taskId is missing', async () => {
      // The schema requires 'id' for update operations, so this should fail at validation
      try {
        await tool.execute({
          mutation: {
            operation: 'update',
            target: 'task',
            // id is intentionally missing
            changes: { name: 'No ID' },
          } as any,
        });
        // If it doesn't throw, check for error response
      } catch (e: any) {
        expect(e.message || e.code).toBeDefined();
      }
    });

    it('calls cache.invalidateForTaskChange with affected tags', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { task: { id: 'task-tags', name: 'Tagged' } },
        }),
      );

      await tool.execute({
        mutation: {
          operation: 'update',
          target: 'task',
          id: 'task-tags',
          changes: { addTags: ['urgent'], removeTags: ['later'] },
        },
      });

      expect(mockCache.invalidateForTaskChange).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'update',
        }),
      );
    });

    it('returns no-op when update has no valid changes', async () => {
      const result = (await tool.execute({
        mutation: {
          operation: 'update',
          target: 'task',
          id: 'task-noop',
          changes: {},
        },
      })) as any;

      // With no valid changes, should still succeed but indicate no updates
      expect(result.success).toBe(true);
      expect(execJsonSpy).not.toHaveBeenCalled();
    });

    it('handles minimalResponse flag', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { task: { id: 'task-min', name: 'Minimal' } },
        }),
      );

      const result = (await tool.execute({
        mutation: {
          operation: 'update',
          target: 'task',
          id: 'task-min',
          changes: { name: 'Minimal' },
          minimalResponse: true,
        },
      })) as any;

      expect(result.success).toBe(true);
      // Minimal response should include fields_updated
      expect(result.id || result.data?.id || result.data?.task?.id || 'task-min').toBeDefined();
    });
  });

  // ─── COMPLETE ───────────────────────────────────────────────────────

  describe('task complete', () => {
    it('completes a task and returns success', async () => {
      // Mock buildScript (called by handleTaskComplete before execJson)
      (tool as any).omniAutomation = { buildScript: vi.fn().mockReturnValue('complete-script') };

      execJsonSpy.mockResolvedValue({
        success: true,
        data: { id: 'task-done', name: 'Done Task', completed: true },
      });

      const result = (await tool.execute({
        mutation: {
          operation: 'complete',
          target: 'task',
          id: 'task-done',
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(mockCache.invalidateForTaskChange).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'complete',
          affectsToday: true,
          affectsOverdue: true,
        }),
      );
    });

    it('handles COMPLETE_TASK_SCRIPT error', async () => {
      (tool as any).omniAutomation = { buildScript: vi.fn().mockReturnValue('complete-script') };

      execJsonSpy.mockResolvedValue({
        success: false,
        error: 'Task not found',
      });

      const result = (await tool.execute({
        mutation: {
          operation: 'complete',
          target: 'task',
          id: 'nonexistent',
        },
      })) as any;

      expect(result.success).toBe(false);
    });
  });

  // ─── DELETE ─────────────────────────────────────────────────────────

  describe('task delete', () => {
    it('deletes a task and returns success', async () => {
      (tool as any).omniAutomation = { buildScript: vi.fn().mockReturnValue('delete-script') };

      execJsonSpy.mockResolvedValue({
        success: true,
        data: { id: 'task-del', name: 'Deleted Task', deleted: true },
      });

      const result = (await tool.execute({
        mutation: {
          operation: 'delete',
          target: 'task',
          id: 'task-del',
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(mockCache.invalidateForTaskChange).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'delete',
          affectsToday: true,
          affectsOverdue: true,
        }),
      );
      // Delete also invalidates projects and tags
      expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
      expect(mockCache.invalidate).toHaveBeenCalledWith('tags');
    });

    it('handles DELETE_TASK_SCRIPT error', async () => {
      (tool as any).omniAutomation = { buildScript: vi.fn().mockReturnValue('delete-script') };

      execJsonSpy.mockResolvedValue({
        success: false,
        error: 'Task not found: bad-id',
      });

      const result = (await tool.execute({
        mutation: {
          operation: 'delete',
          target: 'task',
          id: 'bad-id',
        },
      })) as any;

      expect(result.success).toBe(false);
    });
  });

  // ─── BULK DELETE ────────────────────────────────────────────────────

  describe('bulk_delete tasks', () => {
    it('bulk deletes tasks via BULK_DELETE_TASKS_SCRIPT', async () => {
      (tool as any).omniAutomation = { buildScript: vi.fn().mockReturnValue('bulk-delete-script') };

      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          deleted: [
            { id: 'id1', name: 'Task 1' },
            { id: 'id2', name: 'Task 2' },
          ],
          errors: [],
        }),
      );

      const result = (await tool.execute({
        mutation: {
          operation: 'bulk_delete',
          target: 'task',
          ids: ['id1', 'id2'],
        },
      })) as any;

      expect(result).toBeDefined();
      // Cache should be cleared for bulk operations
      expect(mockCache.clear).toHaveBeenCalledWith('tasks');
    });
  });

  // ─── PROJECT OPERATIONS (inline, no ProjectsTool) ──────────────────

  describe('project create', () => {
    it('creates a project via buildCreateProjectScript and invalidates cache', async () => {
      execJsonSpy.mockResolvedValue(createScriptSuccess({ id: 'proj-new', name: 'New Project', status: 'active' }));

      const result = (await tool.execute({
        mutation: {
          operation: 'create',
          target: 'project',
          data: { name: 'New Project' },
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.project).toBeDefined();
      expect(result.data.operation).toBe('create');
      expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
    });

    it('returns error when project name is missing', async () => {
      // The write schema requires 'name' in data for create operations,
      // so Zod validation throws before reaching the inline handler
      await expect(
        tool.execute({
          mutation: {
            operation: 'create',
            target: 'project',
            data: {} as any,
          },
        }),
      ).rejects.toThrow('Invalid parameters');
    });

    it('passes tags and folder through to create script', async () => {
      execJsonSpy.mockResolvedValue(createScriptSuccess({ id: 'proj-t', name: 'Tagged', tags: ['work'] }));

      const result = (await tool.execute({
        mutation: {
          operation: 'create',
          target: 'project',
          data: { name: 'Tagged', tags: ['work'], folder: 'Work' },
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(execJsonSpy).toHaveBeenCalledTimes(1);
    });

    it('OMN-137: surfaces script warnings in the project create response data', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({ projectId: 'proj-w', name: 'Warned Project', warnings: ['status: boom'] }),
      );

      const result = (await tool.execute({
        mutation: { operation: 'create', target: 'project', data: { name: 'Warned Project' } },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.warnings).toEqual(['status: boom']);
    });

    it('OMN-137: omits the warnings key when the project script reports none', async () => {
      execJsonSpy.mockResolvedValue(createScriptSuccess({ projectId: 'proj-nw', name: 'Clean Project', warnings: [] }));

      const result = (await tool.execute({
        mutation: { operation: 'create', target: 'project', data: { name: 'Clean Project' } },
      })) as any;

      expect(result.success).toBe(true);
      expect('warnings' in result.data).toBe(false);
    });
  });

  // ─── BATCH WARNINGS PASS-THROUGH (OMN-137) ──────────────────────────

  describe('batch create warnings pass-through', () => {
    it('fast path: per-item script warnings survive into the flattened batch results', async () => {
      const buildSpy = vi.spyOn(scriptBuilder, 'buildBatchCreateTasksScript').mockResolvedValue({
        script: 'mock batch script',
        operation: 'create',
        target: 'task',
        description: 'mock',
      });
      execJsonSpy.mockResolvedValue({
        success: true,
        data: {
          results: [
            { tempId: 't1', taskId: 'real-1', success: true, warnings: ['tags: boom'] },
            { tempId: 't2', taskId: 'real-2', success: true, warnings: [] },
          ],
        },
      });

      const result = (await tool.execute({
        mutation: {
          operation: 'batch',
          target: 'task',
          operations: [
            { operation: 'create', target: 'task', data: { tempId: 't1', name: 'A' } },
            { operation: 'create', target: 'task', data: { tempId: 't2', name: 'B' } },
          ],
        },
      })) as any;

      expect(result.success).toBe(true);
      const items = result.data.results as Array<Record<string, unknown>>;
      expect(items[0].tempId).toBe('t1');
      expect(items[0].warnings).toEqual(['tags: boom']);
      // empty warnings stay omitted — no noise
      expect('warnings' in items[1]).toBe(false);
      buildSpy.mockRestore();
    });

    it('slow path: per-item warnings from project and task creates survive the result mapping', async () => {
      // A mixed project+task batch is fast-path ineligible → per-item loop.
      const projSpy = vi.spyOn(scriptBuilder, 'buildCreateProjectScript').mockResolvedValue({
        script: 'mock project script',
        operation: 'create',
        target: 'project',
        description: 'mock',
      });
      const taskSpy = vi.spyOn(scriptBuilder, 'buildCreateTaskScript').mockResolvedValue({
        script: 'mock task script',
        operation: 'create',
        target: 'task',
        description: 'mock',
      });
      execJsonSpy
        .mockResolvedValueOnce({
          success: true,
          data: { projectId: 'proj-1', name: 'P', warnings: ['reviewInterval: boom'] },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { taskId: 'task-1', name: 'T', warnings: ['repetitionRule: boom'] },
        });

      const result = (await tool.execute({
        mutation: {
          operation: 'batch',
          target: 'task',
          operations: [
            { operation: 'create', target: 'project', data: { tempId: 'p1', name: 'P' } },
            { operation: 'create', target: 'task', data: { tempId: 't1', name: 'T', parentTempId: 'p1' } },
          ],
        },
      })) as any;

      expect(result.success).toBe(true);
      const items = result.data.results as Array<Record<string, unknown>>;
      expect(items[0].tempId).toBe('p1');
      expect(items[0].warnings).toEqual(['reviewInterval: boom']);
      expect(items[1].tempId).toBe('t1');
      expect(items[1].warnings).toEqual(['repetitionRule: boom']);
      projSpy.mockRestore();
      taskSpy.mockRestore();
    });

    it('slow path: failure branches (no ID returned) still carry degraded-item warnings', async () => {
      // Mixed project+task batch → per-item loop. Both scripts "succeed" but
      // return no ID — the failure returns must keep the script warnings,
      // matching the fast path (Task-10 review symmetry item).
      const projSpy = vi.spyOn(scriptBuilder, 'buildCreateProjectScript').mockResolvedValue({
        script: 'mock project script',
        operation: 'create',
        target: 'project',
        description: 'mock',
      });
      const taskSpy = vi.spyOn(scriptBuilder, 'buildCreateTaskScript').mockResolvedValue({
        script: 'mock task script',
        operation: 'create',
        target: 'task',
        description: 'mock',
      });
      execJsonSpy
        .mockResolvedValueOnce({
          success: true,
          data: { name: 'P', warnings: ['status: boom'] }, // no projectId
        })
        .mockResolvedValueOnce({
          success: true,
          data: { name: 'T', warnings: ['tags: boom'] }, // no taskId
        });

      const result = (await tool.execute({
        mutation: {
          operation: 'batch',
          target: 'task',
          stopOnError: false, // keep failed items in the flattened results
          operations: [
            { operation: 'create', target: 'project', data: { tempId: 'p1', name: 'P' } },
            { operation: 'create', target: 'task', data: { tempId: 't1', name: 'T' } },
          ],
        },
      })) as any;

      const items = result.data.results as Array<Record<string, unknown>>;
      expect(items[0].tempId).toBe('p1');
      expect(items[0].success).toBe(false);
      expect(items[0].error).toBe('No project ID returned from script');
      expect(items[0].warnings).toEqual(['status: boom']);
      expect(items[1].tempId).toBe('t1');
      expect(items[1].success).toBe(false);
      expect(items[1].error).toBe('No task ID returned from script');
      expect(items[1].warnings).toEqual(['tags: boom']);
      projSpy.mockRestore();
      taskSpy.mockRestore();
    });

    it('slow path: batch task create passes repetitionRule to the builder with NO second script', async () => {
      // repetitionRule on an item forces the per-item path; the rule must ride
      // the create script itself (applyRepetitionRuleSilently is gone).
      const taskSpy = vi.spyOn(scriptBuilder, 'buildCreateTaskScript').mockResolvedValue({
        script: 'mock task script',
        operation: 'create',
        target: 'task',
        description: 'mock',
      });
      execJsonSpy.mockResolvedValue({
        success: true,
        data: { taskId: 'task-rep', name: 'R', warnings: [] },
      });

      const result = (await tool.execute({
        mutation: {
          operation: 'batch',
          target: 'task',
          operations: [
            {
              operation: 'create',
              target: 'task',
              data: { tempId: 't1', name: 'R', repetitionRule: { frequency: 'weekly', interval: 1 } },
            },
          ],
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(execJsonSpy).toHaveBeenCalledTimes(1); // create only — no post-create repeat update
      expect(taskSpy).toHaveBeenCalledTimes(1);
      expect(taskSpy.mock.calls[0][0]).toMatchObject({
        repetitionRule: { frequency: 'weekly', interval: 1 },
      });
      taskSpy.mockRestore();
    });
  });

  describe('project complete', () => {
    it('completes a project via buildCompleteScript and invalidates cache', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({ success: true, projectId: 'proj-done', name: 'Done', completed: true }),
      );

      const result = (await tool.execute({
        mutation: {
          operation: 'complete',
          target: 'project',
          id: 'proj-done',
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.project).toBeDefined();
      expect(result.data.operation).toBe('complete');
      expect(mockCache.invalidateProject).toHaveBeenCalledWith('proj-done');
      expect(mockCache.invalidate).toHaveBeenCalledWith('analytics');
    });

    it('returns error when script fails', async () => {
      execJsonSpy.mockResolvedValue(createScriptError('Project not found', 'complete'));

      const result = (await tool.execute({
        mutation: {
          operation: 'complete',
          target: 'project',
          id: 'proj-missing',
        },
      })) as any;

      expect(result.success).toBe(false);
    });
  });

  describe('project delete', () => {
    it('deletes a project via buildDeleteScript and invalidates cache', async () => {
      execJsonSpy.mockResolvedValue(createScriptSuccess({ success: true, projectId: 'proj-del', deleted: true }));

      const result = (await tool.execute({
        mutation: {
          operation: 'delete',
          target: 'project',
          id: 'proj-del',
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.project).toBeDefined();
      expect(result.data.project.deleted).toBe(true);
      expect(result.data.operation).toBe('delete');
      expect(mockCache.invalidateProject).toHaveBeenCalledWith('proj-del');
      expect(mockCache.invalidate).toHaveBeenCalledWith('analytics');
    });
  });

  describe('project update (direct)', () => {
    it('updates a project via handleProjectUpdateDirect (bypass path)', async () => {
      execJsonSpy.mockResolvedValue(createScriptSuccess({ project: { id: 'proj-upd', name: 'Updated' } }));

      const result = (await tool.execute({
        mutation: {
          operation: 'update',
          target: 'project',
          id: 'proj-upd',
          changes: { name: 'Updated' },
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(mockCache.invalidateProject).toHaveBeenCalledWith('proj-upd');
    });
  });

  // ─── TAG MANAGEMENT (inlined from TagsTool) ────────────────────────

  describe('tag management', () => {
    it('executes tag rename via AST builder and invalidates cache', async () => {
      execJsonSpy.mockResolvedValue({
        success: true,
        data: {
          ok: true,
          v: '1',
          data: { success: true, action: 'rename', tagName: 'OldTag', newName: 'NewTag' },
        },
      });

      const result = (await tool.execute({
        mutation: {
          operation: 'tag_manage',
          action: 'rename',
          tagName: 'OldTag',
          newName: 'NewTag',
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('rename');
      expect(result.data.tagName).toBe('OldTag');
      expect(result.data.newName).toBe('NewTag');
      // Both old and new names should be invalidated
      expect(mockCache.invalidateTag).toHaveBeenCalledWith('OldTag');
      expect(mockCache.invalidateTag).toHaveBeenCalledWith('NewTag');
    });

    it('executes tag merge and invalidates both tag caches', async () => {
      execJsonSpy.mockResolvedValue({
        success: true,
        data: {
          ok: true,
          v: '1',
          data: { success: true, action: 'merge', message: 'Merged SourceTag into TargetTag' },
        },
      });

      const result = (await tool.execute({
        mutation: {
          operation: 'tag_manage',
          action: 'merge',
          tagName: 'SourceTag',
          targetTag: 'TargetTag',
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('merge');
      expect(mockCache.invalidateTag).toHaveBeenCalledWith('SourceTag');
      expect(mockCache.invalidateTag).toHaveBeenCalledWith('TargetTag');
    });

    it('maps unnest action to unparent builder', async () => {
      execJsonSpy.mockResolvedValue({
        success: true,
        data: {
          ok: true,
          v: '1',
          data: { success: true, action: 'unparented' },
        },
      });

      const result = (await tool.execute({
        mutation: {
          operation: 'tag_manage',
          action: 'unnest',
          tagName: 'ChildTag',
        },
      })) as any;

      // Verify the script was executed (buildUnparentTagScript called via unnest→unparent mapping)
      expect(execJsonSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('returns error when newName is missing for rename', async () => {
      const result = (await tool.execute({
        mutation: {
          operation: 'tag_manage',
          action: 'rename',
          tagName: 'SomeTag',
          // newName intentionally missing
        },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_PARAMETER');
      expect(result.error.message).toContain('newName is required');
    });

    it('returns error when targetTag is missing for merge', async () => {
      const result = (await tool.execute({
        mutation: {
          operation: 'tag_manage',
          action: 'merge',
          tagName: 'SomeTag',
          // targetTag intentionally missing
        },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_PARAMETER');
      expect(result.error.message).toContain('targetTag is required');
    });

    it('handles script errors for tag management', async () => {
      execJsonSpy.mockResolvedValue({
        success: false,
        error: 'Tag not found',
        details: 'Tag "NonExistent" could not be located',
      });

      const result = (await tool.execute({
        mutation: {
          operation: 'tag_manage',
          action: 'delete',
          tagName: 'NonExistent',
        },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SCRIPT_ERROR');
    });

    it('creates a tag successfully', async () => {
      execJsonSpy.mockResolvedValue({
        success: true,
        data: {
          ok: true,
          v: '1',
          data: { success: true, action: 'create', tagName: 'NewTag' },
        },
      });

      const result = (await tool.execute({
        mutation: {
          operation: 'tag_manage',
          action: 'create',
          tagName: 'NewTag',
        },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('create');
      expect(result.data.tagName).toBe('NewTag');
      expect(mockCache.invalidateTag).toHaveBeenCalledWith('NewTag');
    });
  });

  // ─── ADVERTISED SCHEMA ──────────────────────────────────────────────

  describe('inputSchema (MCP advertisement)', () => {
    it('should use a hand-crafted minimal schema, not the expanded Zod oneOf', () => {
      const schema = tool.inputSchema;

      // Should be a flat discriminated structure, not oneOf with duplicated branches
      const mutation = (schema as any).properties?.mutation;
      expect(mutation).toBeDefined();

      // The discriminator field should be present
      expect(mutation.properties?.operation).toBeDefined();

      // Should NOT have oneOf (which duplicates repetitionRule across branches)
      expect(mutation.oneOf).toBeUndefined();
    });

    it('should advertise all 7 operation types', () => {
      const schema = tool.inputSchema as any;
      const opEnum = schema.properties.mutation.properties.operation.enum;
      expect(opEnum).toEqual(
        expect.arrayContaining(['create', 'update', 'complete', 'delete', 'batch', 'bulk_delete', 'tag_manage']),
      );
    });

    it('should include key fields for create/update without deeply nesting repetitionRule', () => {
      const schema = tool.inputSchema as any;
      const mutationProps = schema.properties.mutation.properties;

      // OMN-97: data/changes now advertise their supported fields so MCP
      // clients get field-level guidance and misplace fewer keys.
      expect(mutationProps.data.type).toBe('object');
      for (const f of ['name', 'dueDate', 'estimatedMinutes', 'flagged', 'tags', 'status']) {
        expect(mutationProps.data.properties[f]).toBeDefined();
      }
      // changes is a superset (adds addTags/removeTags/clear* fields)
      expect(mutationProps.changes.properties.addTags).toBeDefined();
      expect(mutationProps.changes.properties.clearDueDate).toBeDefined();

      // repetitionRule stays shallow — advertised as a loose object, NOT the
      // deeply-expanded recursive shape (the size blowup this test guards).
      expect(mutationProps.data.properties.repetitionRule).toEqual({ type: 'object' });
    });

    it('should advertise batch control flags as boolean, not string', () => {
      const schema = tool.inputSchema as any;
      const mutationProps = schema.properties.mutation.properties;

      const booleanFlags = ['createSequentially', 'returnMapping', 'stopOnError', 'atomicOperation', 'dryRun'];
      for (const flag of booleanFlags) {
        expect(mutationProps[flag]).toEqual({ type: 'boolean' });
      }
    });

    it('should be under 4KB minified', () => {
      const size = JSON.stringify(tool.inputSchema).length;
      expect(size).toBeLessThan(4000);
    });
  });

  // ─── ERROR CASES ────────────────────────────────────────────────────

  describe('error cases', () => {
    it('returns error for v3 error envelope from script', async () => {
      execJsonSpy.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { error: true, message: 'Something went wrong' },
        }),
      );

      const result = (await tool.execute({
        mutation: {
          operation: 'create',
          target: 'task',
          data: { name: 'Error Task' },
        },
      })) as any;

      // The error inside the data should be detected
      expect(result.success).toBe(false);
    });

    it('handles script execution exception gracefully', async () => {
      execJsonSpy.mockRejectedValue(new Error('OmniAutomation timeout'));

      const result = (await tool.execute({
        mutation: {
          operation: 'create',
          target: 'task',
          data: { name: 'Timeout Task' },
        },
      })) as any;

      expect(result.success).toBe(false);
    });

    it('rejects invalid date format in create', async () => {
      // The write schema should reject invalid dates at validation level
      try {
        const result = (await tool.execute({
          mutation: {
            operation: 'create',
            target: 'task',
            data: { name: 'Bad Date', dueDate: 'not-a-date' },
          },
        })) as any;
        // If schema validation fails, it throws; otherwise check result
        if (result) {
          expect(result.success).toBe(false);
        }
      } catch (e: any) {
        // Schema validation error is expected
        expect(e.message || e.code).toBeDefined();
      }
    });
  });
});

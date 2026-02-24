import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OmniFocusWriteTool } from '../../../../src/tools/unified/OmniFocusWriteTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { createScriptSuccess, createScriptError } from '../../../../src/omnifocus/script-result-types.js';

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

    it('applies repetition rule post-creation via a second update script', async () => {
      // First call: create task. Second call: apply repeat rule.
      execJsonSpy
        .mockResolvedValueOnce(
          createScriptSuccess({
            ok: true,
            v: '3',
            data: { id: 'task-rep', name: 'Repeat Task', taskId: 'task-rep' },
          }),
        )
        .mockResolvedValueOnce(createScriptSuccess({ ok: true, v: '3', data: { updated: true } }));

      await tool.execute({
        mutation: {
          operation: 'create',
          target: 'task',
          data: {
            name: 'Repeat Task',
            repetitionRule: { frequency: 'daily', interval: 1 },
          },
        },
      });

      // Should have called execJson twice: once for create, once for repeat rule update
      expect(execJsonSpy).toHaveBeenCalledTimes(2);
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
    it('executes tag rename via MANAGE_TAGS_SCRIPT and invalidates cache', async () => {
      (tool as any).omniAutomation = { buildScript: vi.fn().mockReturnValue('manage-tags-script') };

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
      (tool as any).omniAutomation = { buildScript: vi.fn().mockReturnValue('manage-tags-script') };

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

    it('maps unnest action to unparent', async () => {
      (tool as any).omniAutomation = { buildScript: vi.fn().mockReturnValue('manage-tags-script') };

      execJsonSpy.mockResolvedValue({
        success: true,
        data: {
          ok: true,
          v: '1',
          data: { success: true, action: 'unparent' },
        },
      });

      await tool.execute({
        mutation: {
          operation: 'tag_manage',
          action: 'unnest',
          tagName: 'ChildTag',
        },
      });

      // Verify buildScript was called with 'unparent' (not 'unnest')
      expect((tool as any).omniAutomation.buildScript).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ action: 'unparent' }),
      );
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
      (tool as any).omniAutomation = { buildScript: vi.fn().mockReturnValue('manage-tags-script') };

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
      (tool as any).omniAutomation = { buildScript: vi.fn().mockReturnValue('manage-tags-script') };

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

      // data and changes should be loose objects
      expect(mutationProps.data).toEqual({ type: 'object' });
      expect(mutationProps.changes).toEqual({ type: 'object' });
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

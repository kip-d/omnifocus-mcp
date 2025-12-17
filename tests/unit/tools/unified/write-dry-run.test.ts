import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OmniFocusWriteTool } from '../../../../src/tools/unified/OmniFocusWriteTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

describe('OmniFocusWriteTool dry-run mode', () => {
  let tool: OmniFocusWriteTool;
  let mockCache: CacheManager;

  beforeEach(() => {
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
      invalidateForTaskChange: vi.fn(),
      invalidateProject: vi.fn(),
      invalidateTag: vi.fn(),
      invalidateTaskQueries: vi.fn(),
      clear: vi.fn(),
    } as unknown as CacheManager;

    tool = new OmniFocusWriteTool(mockCache);
  });

  describe('batch operation dry-run', () => {
    it('should return preview without executing for batch create', async () => {
      const result = await tool.execute({
        mutation: {
          operation: 'batch',
          target: 'task',
          operations: [
            {
              operation: 'create',
              target: 'task',
              data: { name: 'Task 1', tags: ['work'] },
            },
            {
              operation: 'create',
              target: 'task',
              data: { name: 'Task 2', dueDate: '2025-12-01' },
            },
          ],
          dryRun: true,
        },
      });

      expect(result).toBeDefined();
      const response = result as {
        success: boolean;
        data: { dryRun: boolean; wouldAffect: { count: number; creates: number; items: unknown[] } };
      };
      expect(response.success).toBe(true);
      expect(response.data.dryRun).toBe(true);
      expect(response.data.wouldAffect.count).toBe(2);
      expect(response.data.wouldAffect.creates).toBe(2);
      expect(response.data.wouldAffect.items).toHaveLength(2);
    });

    it('should detect duplicate tempIds', async () => {
      const result = await tool.execute({
        mutation: {
          operation: 'batch',
          target: 'task',
          operations: [
            {
              operation: 'create',
              target: 'task',
              data: { name: 'Task 1', tempId: 'dup' },
            },
            {
              operation: 'create',
              target: 'task',
              data: { name: 'Task 2', tempId: 'dup' },
            },
          ],
          dryRun: true,
        },
      });

      const response = result as { success: boolean; data: { validation: { passed: boolean; errors?: string[] } } };
      expect(response.success).toBe(true);
      expect(response.data.validation.passed).toBe(false);
      expect(response.data.validation.errors).toBeDefined();
      expect(response.data.validation.errors![0]).toContain('Duplicate tempIds');
    });

    it('should detect orphan parentTempIds', async () => {
      const result = await tool.execute({
        mutation: {
          operation: 'batch',
          target: 'task',
          operations: [
            {
              operation: 'create',
              target: 'task',
              data: { name: 'Task 1', tempId: 'task1', parentTempId: 'nonexistent' },
            },
          ],
          dryRun: true,
        },
      });

      const response = result as { success: boolean; data: { validation: { passed: boolean; errors?: string[] } } };
      expect(response.success).toBe(true);
      expect(response.data.validation.passed).toBe(false);
      expect(response.data.validation.errors).toBeDefined();
      expect(response.data.validation.errors![0]).toContain('Parent references not found');
    });

    it('should warn for large batches', async () => {
      const operations = Array.from({ length: 60 }, (_, i) => ({
        operation: 'create' as const,
        target: 'task' as const,
        data: { name: `Task ${i + 1}` },
      }));

      const result = await tool.execute({
        mutation: {
          operation: 'batch',
          target: 'task',
          operations,
          dryRun: true,
        },
      });

      const response = result as { success: boolean; data: { validation: { warnings?: string[] } } };
      expect(response.success).toBe(true);
      expect(response.data.validation.warnings).toBeDefined();
      expect(response.data.validation.warnings![0]).toContain('Large batch');
    });
  });

  describe('bulk_delete dry-run', () => {
    it('should return preview without executing for bulk delete', async () => {
      const result = await tool.execute({
        mutation: {
          operation: 'bulk_delete',
          target: 'task',
          ids: ['id1', 'id2', 'id3'],
          dryRun: true,
        },
      });

      expect(result).toBeDefined();
      const response = result as {
        success: boolean;
        data: { dryRun: boolean; wouldAffect: { count: number; items: unknown[] } };
      };
      expect(response.success).toBe(true);
      expect(response.data.dryRun).toBe(true);
      expect(response.data.wouldAffect.count).toBe(3);
      expect(response.data.wouldAffect.items).toHaveLength(3);
    });

    it('should warn for large bulk deletes', async () => {
      const ids = Array.from({ length: 25 }, (_, i) => `id${i + 1}`);

      const result = await tool.execute({
        mutation: {
          operation: 'bulk_delete',
          target: 'task',
          ids,
          dryRun: true,
        },
      });

      const response = result as { success: boolean; data: { validation: { warnings?: string[] } } };
      expect(response.success).toBe(true);
      expect(response.data.validation.warnings).toBeDefined();
      expect(response.data.validation.warnings![0]).toContain('Large bulk delete');
    });

    it('should include validation note about ID verification', async () => {
      const result = await tool.execute({
        mutation: {
          operation: 'bulk_delete',
          target: 'task',
          ids: ['id1'],
          dryRun: true,
        },
      });

      const response = result as { success: boolean; data: { validation: { note?: string } } };
      expect(response.success).toBe(true);
      expect(response.data.validation.note).toContain('ID existence not verified');
    });
  });

  describe('metadata', () => {
    it('should include DRY RUN message in metadata', async () => {
      const result = await tool.execute({
        mutation: {
          operation: 'bulk_delete',
          target: 'task',
          ids: ['id1', 'id2'],
          dryRun: true,
        },
      });

      const response = result as { metadata: { message: string } };
      expect(response.metadata.message).toContain('DRY RUN');
      expect(response.metadata.message).toContain('No changes made');
    });
  });
});

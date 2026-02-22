import { describe, it, expect } from 'vitest';
import { ReadSchema } from '../../../../../src/tools/unified/schemas/read-schema.js';

describe('ReadSchema', () => {
  it('should validate simple tasks query', () => {
    const input = {
      query: {
        type: 'tasks',
        filters: { status: 'active' },
        limit: 25,
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should validate complex filter with tags', () => {
    const input = {
      query: {
        type: 'tasks',
        filters: {
          tags: { any: ['work', 'urgent'] },
          dueDate: { before: '2025-01-31' },
        },
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid type', () => {
    const input = {
      query: {
        type: 'invalid',
        filters: {},
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should validate query with offset for pagination', () => {
    const input = {
      query: {
        type: 'tasks',
        mode: 'all',
        limit: 100,
        offset: 200,
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.offset).toBe(200);
    }
  });

  it('should coerce string offset to number', () => {
    const input = {
      query: {
        type: 'tasks',
        mode: 'all',
        limit: '100',
        offset: '200',
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.offset).toBe(200);
      expect(result.data.query.limit).toBe(100);
    }
  });

  it('should coerce stringified filters JSON to object', () => {
    // LLMs may accidentally stringify nested objects when calling MCP tools
    const input = {
      query: {
        type: 'tasks',
        filters: '{"name": {"contains": "macOS"}}',
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.filters).toEqual({ name: { contains: 'macOS' } });
    }
  });

  it('should coerce stringified filters with complex nested structure', () => {
    const input = {
      query: {
        type: 'tasks',
        filters: '{"tags": {"any": ["work", "urgent"]}, "dueDate": {"before": "2025-01-31"}}',
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.filters).toEqual({
        tags: { any: ['work', 'urgent'] },
        dueDate: { before: '2025-01-31' },
      });
    }
  });

  it('should reject invalid stringified filters JSON', () => {
    const input = {
      query: {
        type: 'tasks',
        filters: 'not valid json',
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  describe('strict filter validation (Bug 1: silent filter failure)', () => {
    it('should reject unknown filter fields with ZodError', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: { bogusField: true },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        // Verify it's a Zod unrecognized_keys error from .strict()
        const unrecognizedKeyErrors = result.error.issues.filter(
          (issue) => issue.code === 'unrecognized_keys',
        );
        expect(unrecognizedKeyErrors.length).toBeGreaterThan(0);
        expect(unrecognizedKeyErrors[0].keys).toContain('bogusField');
      }
    });

    it('should reject multiple unknown filter fields', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: { bogusField: true, anotherBadField: 'value' },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject misspelled filter fields like complted', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: { complted: true },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should still accept all known filter fields', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: {
            status: 'active',
            tags: { any: ['work'] },
            dueDate: { before: '2025-12-31' },
            deferDate: { after: '2025-01-01' },
            plannedDate: { between: ['2025-01-01', '2025-12-31'] },
            completionDate: { before: '2025-06-30' },
            added: { after: '2024-01-01' },
            flagged: true,
            blocked: false,
            available: true,
            inInbox: false,
            text: { contains: 'search' },
            name: { contains: 'project' },
            project: 'abc123',
            folder: 'Work',
            id: 'task-xyz',
          },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('completionDate filter (Bug 3)', () => {
    it('should accept completionDate.before', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: { completionDate: { before: '2025-12-31' } },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept completionDate.after', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: { completionDate: { after: '2025-01-01' } },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept completionDate.between', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: { completionDate: { between: ['2025-01-01', '2025-12-31'] } },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('type-discriminated fields', () => {
    it('should accept project fields on project queries', () => {
      const input = {
        query: {
          type: 'projects',
          fields: ['id', 'name', 'status', 'folder', 'folderPath'],
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.fields).toEqual(['id', 'name', 'status', 'folder', 'folderPath']);
      }
    });

    it('should reject task fields on project queries', () => {
      const input = {
        query: {
          type: 'projects',
          fields: ['id', 'name', 'blocked', 'parentTaskId'],
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject project fields on task queries', () => {
      const input = {
        query: {
          type: 'tasks',
          fields: ['id', 'name', 'status', 'folder'],
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject task-only params on project queries', () => {
      const input = {
        query: {
          type: 'projects',
          countOnly: true,
          mode: 'flagged',
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept shared params on both task and project queries', () => {
      const taskInput = {
        query: { type: 'tasks', limit: 10, offset: 5 },
      };
      const projectInput = {
        query: { type: 'projects', limit: 10, offset: 5 },
      };
      expect(ReadSchema.safeParse(taskInput).success).toBe(true);
      expect(ReadSchema.safeParse(projectInput).success).toBe(true);
    });

    it('should accept export params only on export queries', () => {
      const exportInput = {
        query: {
          type: 'export',
          exportType: 'tasks',
          format: 'json',
        },
      };
      const taskInput = {
        query: {
          type: 'tasks',
          exportType: 'tasks',
        },
      };
      expect(ReadSchema.safeParse(exportInput).success).toBe(true);
      expect(ReadSchema.safeParse(taskInput).success).toBe(false);
    });

    it('should accept all 15 project fields from script-builder', () => {
      const allProjectFields = [
        'id',
        'name',
        'status',
        'flagged',
        'note',
        'dueDate',
        'deferDate',
        'completedDate',
        'folder',
        'folderPath',
        'folderId',
        'sequential',
        'lastReviewDate',
        'nextReviewDate',
        'defaultSingletonActionHolder',
      ];
      const input = {
        query: { type: 'projects', fields: allProjectFields },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept includeStats on project queries', () => {
      const input = {
        query: { type: 'projects', includeStats: true },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should coerce stringified query with discriminated union', () => {
      const input = {
        query: '{"type":"projects","fields":["id","name","status"]}',
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.type).toBe('projects');
      }
    });
  });
});

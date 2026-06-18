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
        const unrecognizedKeyErrors = result.error.issues.filter((issue) => issue.code === 'unrecognized_keys');
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

  // OMN-96: `folder: null` means "top-level projects only" (no containing
  // folder). We mold the schema to the model's natural guess for that intent —
  // see the decision record in read-schema.ts at the `folder` field.
  describe('folder: null → top-level only (OMN-96)', () => {
    it('should accept folder: null on projects queries', () => {
      const input = {
        query: {
          type: 'projects',
          filters: { folder: null },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should still accept a folder name string', () => {
      const input = {
        query: {
          type: 'projects',
          filters: { folder: 'Work' },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  // OMN-43: explicit projectId filter key. Previously the only project-related
  // filter was `project` (string-or-null), which routed string values through a
  // name-resolution path that failed with SCRIPT_ERROR for ambiguous or unmatched
  // names. `projectId` gives consumers a direct, unambiguous, fast path.
  describe('projectId filter (OMN-43)', () => {
    it('should accept projectId on tasks queries', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: { projectId: 'h1Y_Mpkz5fL' },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept projectId alongside other filters', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: { projectId: 'h1Y_Mpkz5fL', flagged: true },
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

  describe('flat logical operators (no recursive nesting)', () => {
    it('should accept AND with flat filter conditions', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: {
            AND: [{ status: 'active' }, { flagged: true }],
          },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept OR with flat filter conditions', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: {
            OR: [{ status: 'active' }, { flagged: true }],
          },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept NOT with a flat filter condition', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: {
            NOT: { status: 'completed' },
          },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject nested AND inside AND (no recursive logical operators)', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: {
            AND: [
              { AND: [{ status: 'active' }] }, // nested AND should fail
            ],
          },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject OR inside AND (no recursive logical operators)', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: {
            AND: [
              { OR: [{ status: 'active' }, { flagged: true }] }, // nested OR should fail
            ],
          },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject nested NOT inside NOT', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: {
            NOT: { NOT: { status: 'active' } }, // nested NOT should fail
          },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject AND inside NOT', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: {
            NOT: { AND: [{ status: 'active' }] }, // nested AND inside NOT should fail
          },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(false);
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
      if (result.success && result.data.query.type === 'projects') {
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

    it('should reject mode (a task-only view selector) on project queries', () => {
      const input = {
        query: {
          type: 'projects',
          mode: 'flagged',
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    // OMN-174: countOnly was scoped tasks-only by design; it is now a shared
    // fast-path on projects/tags/folders too (the population count those queries
    // already compute, returned without row projection/enrichment).
    it('should accept countOnly on projects/tags/folders queries (OMN-174)', () => {
      for (const type of ['projects', 'tags', 'folders'] as const) {
        const result = ReadSchema.safeParse({ query: { type, countOnly: true } });
        expect(result.success, `${type} countOnly should be accepted`).toBe(true);
      }
    });

    it('should still reject countOnly on perspectives/export queries (out of scope, OMN-174)', () => {
      expect(ReadSchema.safeParse({ query: { type: 'perspectives', countOnly: true } }).success).toBe(false);
      expect(ReadSchema.safeParse({ query: { type: 'export', countOnly: true } }).success).toBe(false);
    });

    // OMN-174: countOnly is now valid on projects, but mode is still rejected —
    // the combination must still reject (the mode guard, not countOnly).
    it('should reject mode even when combined with the now-valid countOnly on projects', () => {
      const result = ReadSchema.safeParse({ query: { type: 'projects', countOnly: true, mode: 'flagged' } });
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

    it('should accept all 16 project fields from script-builder', () => {
      const allProjectFields = [
        'id',
        'name',
        'status',
        'flagged',
        'note',
        'dueDate',
        'deferDate',
        'completionDate', // OMN-81: renamed from completedDate to match OmniJS canonical API
        'folder',
        'folderPath',
        'folderId',
        'sequential',
        'lastReviewDate',
        'nextReviewDate',
        'reviewInterval', // OMN-60: readable review interval
        'defaultSingletonActionHolder',
      ];
      const input = {
        query: { type: 'projects', fields: allProjectFields },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    // OMN-81: completionDate is the canonical name (matches OmniJS Project class
    // + filterFields.completionDate + parseProjects' override key). Was
    // erroneously named completedDate in the enum and script-builder, causing
    // silent total failure (script always emitted null because the OmniJS
    // Project class has no .completedDate property).
    it('OMN-81: accepts fields:["completionDate"] on a projects query', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'projects', fields: ['completionDate'] },
      });
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

  // OMN-72: accept `filters.completed` (boolean). The schema previously rejected
  // it via .strict(), contradicting the documented GTD idiom in CLAUDE.md/memory
  // (`completed: false` = "only active"). Real failure-log finding B (3 hits,
  // distinct sessions). This describe block is the regression fixture.
  describe('filters.completed (OMN-72)', () => {
    it('accepts completed: false alongside a text filter (the exact failing payload)', () => {
      const input = {
        query: {
          type: 'tasks',
          filters: { text: { matches: 'quarterly review' }, completed: false },
        },
      };
      const result = ReadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts completed: true', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'tasks', filters: { completed: true } },
      });
      expect(result.success).toBe(true);
    });

    it('still rejects genuinely unknown filter keys (strict mode intact)', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'tasks', filters: { completed: false, bogusField: true } },
      });
      expect(result.success).toBe(false);
    });
  });

  // OMN-73: the 5 requested fields are all already backed for their correct
  // type (tags/plannedDate on both; review fields are projects-only by design,
  // resolved by OMN-60/62). Ticket scope reduced to: when a model requests a
  // cross-type field, the enum error must *steer* it instead of an opaque
  // "Invalid enum value". This describe block is the regression fixture.
  describe('cross-type field error guidance (OMN-73)', () => {
    it('valid task fields still parse (no regression)', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'tasks', fields: ['name', 'plannedDate', 'tags'] },
      });
      expect(result.success).toBe(true);
    });

    it('a projects-only field on a tasks query is rejected with steering guidance', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'tasks', fields: ['reviewInterval'] },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = JSON.stringify(result.error.issues);
        expect(msg).toMatch(/projects/i);
        expect(msg).toContain('reviewInterval');
      }
    });

    it('a tasks-only field on a projects query is rejected with steering guidance', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'projects', fields: ['inInbox'] },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = JSON.stringify(result.error.issues);
        expect(msg).toMatch(/task/i);
        expect(msg).toContain('inInbox');
      }
    });

    it('an entirely unknown field still lists valid fields', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'tasks', fields: ['totallyBogus'] },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = JSON.stringify(result.error.issues);
        expect(msg).toMatch(/valid task fields/i);
      }
    });
  });

  // OMN-74: `mode` is a tasks-only view selector by design. A projects query
  // with `mode` must be rejected with guidance to filters.name/filters.text
  // (the real projects search interface), not an opaque strict "Unrecognized
  // key" error. Non-breaking: was rejected before, still rejected.
  describe('mode on projects query — guided rejection (OMN-74)', () => {
    it('tasks query still accepts mode (no regression)', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'tasks', mode: 'search' },
      });
      expect(result.success).toBe(true);
    });

    it('projects query with mode is rejected with guidance to filters.name/text', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'projects', mode: 'search' },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = JSON.stringify(result.error.issues);
        expect(msg).toMatch(/filters\.(name|text)/i);
      }
    });

    it('the real projects search interface (filters.name) works', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'projects', filters: { name: { contains: 'Quarterly' } } },
      });
      expect(result.success).toBe(true);
    });
  });

  // OMN-133: forecast_past is a tasks-only mode (union of dueDate-overdue and
  // plannedDate-past, excluding blocked).
  describe('forecast_past mode (OMN-133)', () => {
    it('tasks query accepts mode:"forecast_past"', () => {
      expect(ReadSchema.safeParse({ query: { type: 'tasks', mode: 'forecast_past' } }).success).toBe(true);
    });

    it('projects query with mode:"forecast_past" is rejected (tasks-only)', () => {
      expect(ReadSchema.safeParse({ query: { type: 'projects', mode: 'forecast_past' } }).success).toBe(false);
    });
  });

  // OMN-150: schema-level regex validation for { matches } patterns.
  // An invalid regex is an input-validation problem, not a runtime OF error.
  // TextFilterSchema.matches should reject at the schema boundary with a message
  // naming the pattern and the regex error — before the script reaches OmniFocus.
  describe('regex validation for { matches } (OMN-150)', () => {
    it('rejects an invalid regex on filters.text with a message naming the pattern', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'tasks', filters: { text: { matches: '(unclosed' } } },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = JSON.stringify(result.error.issues);
        expect(msg).toContain('(unclosed');
      }
    });

    it('rejects an invalid regex on filters.name with a message naming the pattern', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'tasks', filters: { name: { matches: '[bad' } } },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = JSON.stringify(result.error.issues);
        expect(msg).toContain('[bad');
      }
    });

    it('accepts a valid regex pattern on filters.text', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'tasks', filters: { text: { matches: '\\d{4}-\\d{2}-\\d{2}' } } },
      });
      expect(result.success).toBe(true);
    });

    it('accepts a plain string (valid as a regex literal) on filters.text', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'tasks', filters: { text: { matches: 'quarterly review' } } },
      });
      expect(result.success).toBe(true);
    });

    it('accepts a valid regex on filters.name', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'projects', filters: { name: { matches: '^Weekly' } } },
      });
      expect(result.success).toBe(true);
    });

    it('error message for invalid regex names the pattern and indicates a regex error', () => {
      const result = ReadSchema.safeParse({
        query: { type: 'tasks', filters: { text: { matches: '(unclosed' } } },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = JSON.stringify(result.error.issues);
        // Message must name the bad pattern AND include some indication of the error
        expect(msg).toContain('(unclosed');
        expect(msg.toLowerCase()).toMatch(/invalid|regex|pattern/);
      }
    });
  });
});

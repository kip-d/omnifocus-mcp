import { describe, it, expect } from 'vitest';
import { AnalyzeSchema } from '../../../../../src/tools/unified/schemas/analyze-schema.js';

describe('AnalyzeSchema', () => {
  it('should validate productivity stats analysis', () => {
    const input = {
      analysis: {
        type: 'productivity_stats',
        scope: {
          dateRange: {
            start: '2025-01-01',
            end: '2025-01-31',
          },
        },
        params: {
          groupBy: 'week',
          metrics: ['completed', 'velocity'],
        },
      },
    };

    const result = AnalyzeSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should validate parse meeting notes', () => {
    const input = {
      analysis: {
        type: 'parse_meeting_notes',
        params: {
          text: 'Follow up with Sarah',
          extractTasks: true,
        },
      },
    };

    const result = AnalyzeSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  // OMN-124: structured items[] input (Option 1)
  describe('parse_meeting_notes structured items[] (OMN-124)', () => {
    it('accepts a structured items[] array (no text)', () => {
      const input = {
        analysis: {
          type: 'parse_meeting_notes',
          params: {
            items: [
              { name: 'Order scanners', project: 'Hardware', tags: ['@errand'], dueDate: '2026-06-20' },
              { name: 'Email Dennis', flagged: true },
            ],
            validateAgainstExisting: false,
          },
        },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(true);
    });

    it('rejects providing BOTH text and items', () => {
      const input = {
        analysis: {
          type: 'parse_meeting_notes',
          params: { text: 'Some notes', items: [{ name: 'X' }] },
        },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(false);
    });

    it('rejects providing NEITHER text nor items', () => {
      const input = {
        analysis: { type: 'parse_meeting_notes', params: { defaultProject: 'Inbox' } },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(false);
    });

    it('rejects an empty items[] array (treated as "neither provided")', () => {
      const input = {
        analysis: { type: 'parse_meeting_notes', params: { items: [] } },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(false);
    });

    it('rejects an item with a malformed date (kept honest with the write boundary)', () => {
      const input = {
        analysis: { type: 'parse_meeting_notes', params: { items: [{ name: 'X', dueDate: 'tomorrow' }] } },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(false);
    });

    it('rejects an item with an empty name', () => {
      const input = {
        analysis: { type: 'parse_meeting_notes', params: { items: [{ name: '' }] } },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(false);
    });

    it('rejects unknown keys on an item (strict)', () => {
      const input = {
        analysis: { type: 'parse_meeting_notes', params: { items: [{ name: 'X', priority: 'high' }] } },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(false);
    });
  });

  it('should reject invalid type', () => {
    const input = {
      analysis: {
        type: 'invalid_type',
      },
    };

    const result = AnalyzeSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  describe('manage_reviews set_schedule reviewInterval (OMN-60)', () => {
    it('accepts set_schedule with a reviewInterval and preserves it through parse', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: {
            operation: 'set_schedule',
            projectId: 'abc123',
            reviewInterval: { unit: 'week', steps: 2 },
          },
        },
      };

      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        const params = (result.data.analysis as { params?: Record<string, unknown> }).params;
        expect(params?.reviewInterval).toEqual({ unit: 'week', steps: 2 });
      }
    });

    it('rejects a reviewInterval with an invalid unit', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: {
            operation: 'set_schedule',
            projectId: 'abc123',
            reviewInterval: { unit: 'fortnight', steps: 2 },
          },
        },
      };

      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('still accepts set_schedule without a reviewInterval (field is optional)', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: { operation: 'set_schedule', projectId: 'abc123' },
        },
      };

      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('manage_reviews batch projectIds (OMN-256)', () => {
    it('accepts mark_reviewed with projectIds (1..100)', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: { operation: 'mark_reviewed', projectIds: ['p1', 'p2', 'p3'] },
        },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(true);
    });

    it('accepts set_schedule with projectIds', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: {
            operation: 'set_schedule',
            projectIds: ['p1', 'p2'],
            reviewInterval: { unit: 'week', steps: 1 },
          },
        },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(true);
    });

    it('rejects an empty projectIds array', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: { operation: 'mark_reviewed', projectIds: [] },
        },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(false);
    });

    it('rejects projectIds over the 100-id cap', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: { operation: 'mark_reviewed', projectIds: Array.from({ length: 101 }, (_, i) => `p${i}`) },
        },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(false);
    });

    it('rejects providing BOTH projectId and projectIds on mark_reviewed', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: { operation: 'mark_reviewed', projectId: 'p1', projectIds: ['p2'] },
        },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(false);
    });

    it('rejects providing BOTH projectId and projectIds on set_schedule', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: {
            operation: 'set_schedule',
            projectId: 'p1',
            projectIds: ['p2'],
            reviewInterval: { unit: 'week', steps: 1 },
          },
        },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(false);
    });

    it('rejects projectIds on list_for_review (loud, not silently ignored)', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: { operation: 'list_for_review', projectIds: ['p1'] },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('single projectId form still works unchanged on mark_reviewed', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: { operation: 'mark_reviewed', projectId: 'p1' },
        },
      };
      expect(AnalyzeSchema.safeParse(input).success).toBe(true);
    });
  });

  // OMN-90: AnalyzeSchema must reject unknown fields, matching OMN-76's
  // CreateDataSchema/UpdateChangesSchema strict behavior. Without `.strict()`
  // applied at every depth (wrapper, discriminated-union members, scope,
  // params, and nested objects inside params), unknown keys vanish silently,
  // the call returns `success:true`, and the diagnose-failures pipeline
  // never sees the LLM↔schema mismatch.
  describe('strictness (OMN-90)', () => {
    it('rejects unknown top-level field on analysis (wrapper strictness)', () => {
      const input = {
        analysis: {
          type: 'productivity_stats',
          unknownTopLevel: 'x',
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown field inside scope (shared AnalysisScopeSchema)', () => {
      const input = {
        analysis: {
          type: 'productivity_stats',
          scope: {
            dateRange: { start: '2026-01-01', end: '2026-01-31' },
            unknownScope: 'x',
          },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown field inside scope.dateRange (nested-object strictness)', () => {
      const input = {
        analysis: {
          type: 'productivity_stats',
          scope: {
            dateRange: { start: '2026-01-01', end: '2026-01-31', unknownNested: 'x' },
          },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown field inside productivity_stats.params', () => {
      const input = {
        analysis: {
          type: 'productivity_stats',
          params: { groupBy: 'day', unknownParam: 'x' },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown field inside task_velocity.params', () => {
      const input = {
        analysis: {
          type: 'task_velocity',
          params: { groupBy: 'week', unknownParam: 'x' },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown field inside overdue_analysis.params (empty params object)', () => {
      const input = {
        analysis: {
          type: 'overdue_analysis',
          params: { unknownParam: 'x' },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown field inside pattern_analysis.params', () => {
      const input = {
        analysis: {
          type: 'pattern_analysis',
          params: { insights: ['gtd_review'], unknownParam: 'x' },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown field inside workflow_analysis.params (empty params object)', () => {
      const input = {
        analysis: {
          type: 'workflow_analysis',
          params: { unknownParam: 'x' },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown field inside recurring_tasks.params', () => {
      const input = {
        analysis: {
          type: 'recurring_tasks',
          params: { operation: 'analyze', unknownParam: 'x' },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown field inside parse_meeting_notes.params', () => {
      const input = {
        analysis: {
          type: 'parse_meeting_notes',
          params: { text: 'notes here', unknownParam: 'x' },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown field inside manage_reviews.params', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: { operation: 'list_for_review', unknownParam: 'x' },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown field inside manage_reviews.params.reviewInterval (deeply nested)', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: {
            operation: 'set_schedule',
            projectId: 'abc',
            reviewInterval: { unit: 'week', steps: 2, unknownNested: 'x' },
          },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects scope on parse_meeting_notes arm (scope is not declared on this arm — an LLM-plausible confusion)', () => {
      const input = {
        analysis: {
          type: 'parse_meeting_notes',
          params: { text: 'notes here' },
          scope: { includeCompleted: true },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects unknown member-level field on a discriminated-union arm', () => {
      const input = {
        analysis: {
          type: 'productivity_stats',
          unknownMemberField: 'x',
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('still accepts the documented analyze surface (no regression — productivity_stats)', () => {
      const input = {
        analysis: {
          type: 'productivity_stats',
          scope: {
            dateRange: { start: '2026-01-01', end: '2026-01-31' },
            tags: ['work'],
            includeCompleted: true,
          },
          params: { groupBy: 'week', metrics: ['completed', 'velocity'] },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('still accepts the documented analyze surface (no regression — manage_reviews/set_schedule)', () => {
      const input = {
        analysis: {
          type: 'manage_reviews',
          params: {
            operation: 'set_schedule',
            projectId: 'abc',
            reviewInterval: { unit: 'week', steps: 2 },
          },
        },
      };
      const result = AnalyzeSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});

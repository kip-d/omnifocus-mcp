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
});

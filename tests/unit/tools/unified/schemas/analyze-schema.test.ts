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
            end: '2025-01-31'
          }
        },
        params: {
          groupBy: 'week',
          metrics: ['completed', 'velocity']
        }
      }
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
          extractTasks: true
        }
      }
    };

    const result = AnalyzeSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid type', () => {
    const input = {
      analysis: {
        type: 'invalid_type'
      }
    };

    const result = AnalyzeSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

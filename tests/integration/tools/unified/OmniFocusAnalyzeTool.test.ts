import { describe, it, expect, beforeAll } from 'vitest';
import { OmniFocusAnalyzeTool } from '../../../../src/tools/unified/OmniFocusAnalyzeTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

describe('OmniFocusAnalyzeTool Integration', () => {
  let tool: OmniFocusAnalyzeTool;
  let cache: CacheManager;

  beforeAll(() => {
    cache = new CacheManager();
    tool = new OmniFocusAnalyzeTool(cache);
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('omnifocus_analyze');
    expect(tool.description).toContain('Analyze OmniFocus data');
  });

  it('should route productivity_stats analysis', async () => {
    const input = {
      analysis: {
        type: 'productivity_stats' as const,
        scope: {
          dateRange: {
            start: '2025-01-01',
            end: '2025-01-31',
          },
        },
      },
    };

    const result = await tool.execute(input);

    expect(result).toHaveProperty('success');
    if (result.success) {
      expect(result).toHaveProperty('data');
    }
  });

  it('should route parse_meeting_notes analysis', async () => {
    const input = {
      analysis: {
        type: 'parse_meeting_notes' as const,
        params: {
          text: 'Follow up with Sarah tomorrow',
          extractTasks: true,
        },
      },
    };

    const result = await tool.execute(input);

    expect(result).toHaveProperty('success');
  });
});

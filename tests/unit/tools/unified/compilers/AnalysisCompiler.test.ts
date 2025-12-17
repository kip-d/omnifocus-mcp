import { describe, it, expect } from 'vitest';
import { AnalysisCompiler } from '../../../../../src/tools/unified/compilers/AnalysisCompiler.js';
import type { AnalyzeInput } from '../../../../../src/tools/unified/schemas/analyze-schema.js';

describe('AnalysisCompiler', () => {
  const compiler = new AnalysisCompiler();

  it('should compile productivity stats analysis', () => {
    const input: AnalyzeInput = {
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
        },
      },
    };

    const compiled = compiler.compile(input);

    expect(compiled.type).toBe('productivity_stats');
    expect(compiled.scope?.dateRange?.start).toBe('2025-01-01');
    expect(compiled.params?.groupBy).toBe('week');
  });

  it('should compile parse meeting notes analysis', () => {
    const input: AnalyzeInput = {
      analysis: {
        type: 'parse_meeting_notes',
        params: {
          text: 'Follow up with Sarah',
          extractTasks: true,
        },
      },
    };

    const compiled = compiler.compile(input);

    expect(compiled.type).toBe('parse_meeting_notes');
    expect(compiled.params?.text).toBe('Follow up with Sarah');
    expect(compiled.params?.extractTasks).toBe(true);
  });
});

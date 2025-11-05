import type { AnalyzeInput } from '../schemas/analyze-schema.js';

export interface CompiledAnalysis {
  type: 'productivity_stats' | 'task_velocity' | 'overdue_analysis' | 'pattern_analysis' |
        'workflow_analysis' | 'recurring_tasks' | 'parse_meeting_notes' | 'manage_reviews';
  scope?: {
    dateRange?: { start: string; end: string };
    tags?: string[];
    projects?: string[];
    includeCompleted?: boolean;
    includeDropped?: boolean;
  };
  params?: Record<string, any>;
}

/**
 * AnalysisCompiler translates builder JSON into parameters for existing analysis tools
 */
export class AnalysisCompiler {
  compile(input: AnalyzeInput): CompiledAnalysis {
    const { analysis } = input;

    const compiled: CompiledAnalysis = {
      type: analysis.type,
    };

    // Pass through scope if present
    if ('scope' in analysis && analysis.scope) {
      compiled.scope = analysis.scope;
    }

    // Pass through params if present
    if ('params' in analysis && analysis.params) {
      compiled.params = analysis.params;
    }

    return compiled;
  }
}

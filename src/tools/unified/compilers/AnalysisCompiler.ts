import type { AnalyzeInput } from '../schemas/analyze-schema.js';

// Base scope interface
interface AnalysisScope {
  dateRange?: { start: string; end: string };
  tags?: string[];
  projects?: string[];
  includeCompleted?: boolean;
  includeDropped?: boolean;
}

// Discriminated union for compiled analysis (properly typed)
export type CompiledAnalysis =
  | {
      type: 'productivity_stats';
      scope?: AnalysisScope;
      params?: {
        groupBy?: 'day' | 'week' | 'month';
        metrics?: string[];
      };
    }
  | {
      type: 'task_velocity';
      scope?: AnalysisScope;
      params?: {
        groupBy?: 'day' | 'week' | 'month';
        metrics?: string[];
      };
    }
  | {
      type: 'overdue_analysis';
      scope?: AnalysisScope;
      params?: Record<string, never>; // Empty params
    }
  | {
      type: 'pattern_analysis';
      scope?: AnalysisScope;
      params?: {
        insights?: string[];
      };
    }
  | {
      type: 'workflow_analysis';
      scope?: AnalysisScope;
      params?: Record<string, never>; // Empty params
    }
  | {
      type: 'recurring_tasks';
      scope?: AnalysisScope;
      params?: {
        operation?: 'analyze' | 'patterns';
        sortBy?: 'nextDue' | 'frequency' | 'name';
      };
    }
  | {
      type: 'parse_meeting_notes';
      params: {
        text: string;
        extractTasks?: boolean;
        defaultProject?: string;
        defaultTags?: string[];
      };
    }
  | {
      type: 'manage_reviews';
      params?: {
        operation?: 'list_for_review' | 'mark_reviewed' | 'set_schedule' | 'clear_schedule';
        projectId?: string;
        reviewDate?: string;
      };
    };

/**
 * AnalysisCompiler translates builder JSON into parameters for existing analysis tools
 */
export class AnalysisCompiler {
  compile(input: AnalyzeInput): CompiledAnalysis {
    const { analysis } = input;

    if (analysis.type === 'parse_meeting_notes') {
      return { type: 'parse_meeting_notes', params: analysis.params };
    }

    // All other types share the same structure: type + optional scope + optional params
    return this.compileStandard(analysis);
  }

  private compileStandard(
    analysis: Exclude<AnalyzeInput['analysis'], { type: 'parse_meeting_notes' }>,
  ): CompiledAnalysis {
    return {
      type: analysis.type,
      scope: 'scope' in analysis ? analysis.scope : undefined,
      params: 'params' in analysis ? analysis.params : undefined,
    } as CompiledAnalysis;
  }
}

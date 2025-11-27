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

    // Build the compiled result based on type (discriminated union requires type-specific handling)
    switch (analysis.type) {
      case 'productivity_stats':
        return {
          type: 'productivity_stats',
          scope: 'scope' in analysis ? analysis.scope : undefined,
          params: 'params' in analysis ? analysis.params : undefined,
        };

      case 'task_velocity':
        return {
          type: 'task_velocity',
          scope: 'scope' in analysis ? analysis.scope : undefined,
          params: 'params' in analysis ? analysis.params : undefined,
        };

      case 'overdue_analysis':
        return {
          type: 'overdue_analysis',
          scope: 'scope' in analysis ? analysis.scope : undefined,
          params: 'params' in analysis ? analysis.params : undefined,
        };

      case 'pattern_analysis':
        return {
          type: 'pattern_analysis',
          scope: 'scope' in analysis ? analysis.scope : undefined,
          params: 'params' in analysis ? analysis.params : undefined,
        };

      case 'workflow_analysis':
        return {
          type: 'workflow_analysis',
          scope: 'scope' in analysis ? analysis.scope : undefined,
          params: 'params' in analysis ? analysis.params : undefined,
        };

      case 'recurring_tasks':
        return {
          type: 'recurring_tasks',
          scope: 'scope' in analysis ? analysis.scope : undefined,
          params: 'params' in analysis ? analysis.params : undefined,
        };

      case 'parse_meeting_notes':
        return {
          type: 'parse_meeting_notes',
          params: analysis.params, // required for this type
        };

      case 'manage_reviews':
        return {
          type: 'manage_reviews',
          params: 'params' in analysis ? analysis.params : undefined,
        };

      default: {
        // Exhaustiveness check
        const _exhaustive: never = analysis;
        throw new Error(`Unknown analysis type: ${String(_exhaustive)}`);
      }
    }
  }
}

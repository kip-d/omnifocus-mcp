import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { AnalyzeSchema, type AnalyzeInput } from './schemas/analyze-schema.js';
import { AnalysisCompiler, type CompiledAnalysis } from './compilers/AnalysisCompiler.js';
import { createLogger, Logger } from '../../utils/logger.js';
import {
  createAnalyticsResponseV2,
  createErrorResponseV2,
  createSuccessResponseV2,
  createListResponseV2,
  OperationTimerV2,
  StandardResponseV2,
} from '../../utils/response-format.js';
import { isScriptError, isScriptSuccess } from '../../omnifocus/script-result-types.js';
import {
  astEnvelopeSchema,
  listResultSchema,
  SlimmedDataSchema,
  RecurringPatternsSchema,
  TaskRowSchema,
  ProjectRowSchema,
  TaskListMetadataSchema,
  ProjectListMetadataSchema,
  TagItemSchema,
  TagSummarySchema,
  RecurringTaskRowSchema,
  RecurringTasksSummarySchema,
  RecurringTasksMetadataSchema,
  PRODUCTIVITY_STATS_V3_SCHEMA,
  TASK_VELOCITY_V3_SCHEMA,
  OVERDUE_ANALYSIS_V3_SCHEMA,
  WORKFLOW_ANALYSIS_V3_SCHEMA,
  REVIEWS_LIST_TYPED_SCHEMA,
  MARK_REVIEWED_TYPED_SCHEMA,
  SET_SCHEDULE_TYPED_SCHEMA,
} from '../../omnifocus/script-response-schemas.js';
// Script imports (irreducible computation)
import { PRODUCTIVITY_STATS_SCRIPT_V3 as PRODUCTIVITY_STATS_SCRIPT } from '../../omnifocus/scripts/analytics/productivity-stats-v3.js';
import { TASK_VELOCITY_SCRIPT_V3 as TASK_VELOCITY_SCRIPT } from '../../omnifocus/scripts/analytics/task-velocity-v3.js';
import { ANALYZE_OVERDUE_V3 as ANALYZE_OVERDUE_SCRIPT } from '../../omnifocus/scripts/analytics/analyze-overdue-v3.js';
import { WORKFLOW_ANALYSIS_V3 } from '../../omnifocus/scripts/analytics/workflow-analysis-v3.js';
import { GET_RECURRING_PATTERNS_SCRIPT } from '../../omnifocus/scripts/recurring.js';
import { buildRecurringTasksScript } from '../../omnifocus/scripts/recurring/analyze-recurring-tasks-ast.js';
// OMN-106: review mutations emit from the AST mutation pipeline (sandbox-guarded).
import {
  buildMarkProjectReviewedScript,
  buildSetReviewScheduleScript,
} from '../../contracts/ast/mutation-script-builder.js';
import { buildProjectsForReviewScript } from '../../omnifocus/scripts/reviews/projects-for-review.js';

// Pure-JS analyzer imports (for pattern analysis)
import { analyzeReviewGaps } from '../../omnifocus/scripts/analytics/review-gaps-analyzer.js';
import { analyzeNextActions } from '../../omnifocus/scripts/analytics/next-actions-analyzer.js';
import { analyzeWipLimits } from '../../omnifocus/scripts/analytics/wip-limits-analyzer.js';
import { analyzeDueDateBunching } from '../../omnifocus/scripts/analytics/due-date-bunching-analyzer.js';

// Capture utilities (for meeting notes parsing)
import { detectContextTags } from '../capture/context-detection.js';
import { extractDates } from '../capture/date-extraction.js';

// OMN-124: read-only pre-flight for structured meeting-note items.
import { buildFilteredProjectsScript } from '../../contracts/ast/script-builder.js';
import { buildListTasksScriptV4 } from '../../omnifocus/scripts/tasks/list-tasks-ast.js';
import { buildTagsScript } from '../../contracts/ast/tag-script-builder.js';

// Response types
import type { ReviewListData } from '../../omnifocus/script-response-types.js';
// OMN-187/194: read analytics payloads against schema-inferred types so the
// compiler forbids reading a field the v3 scripts never emit.
import type {
  OverdueAnalysisV3Data,
  TaskVelocityV3Data,
  WorkflowAnalysisV3Data,
} from '../../omnifocus/script-response-schemas.js';
import type { OverdueAnalysisDataV2, RecurringTaskV2 } from '../response-types-v2.js';
import type { ProjectId } from '../../utils/branded-types.js';

// ---------------------------------------------------------------------------
// Internal type helpers
// ---------------------------------------------------------------------------

// OMN-187: the overdue read-path now consumes OverdueAnalysisV3Data (inferred
// from OVERDUE_ANALYSIS_V3_SCHEMA) directly — see executeOverdueAnalysis. The
// former TestMockOverdueData union + get*/isTestMockOverdueFormat helpers existed
// only to straddle a legacy script shape that the v3 script never emitted; they
// silently defaulted every field and are deleted.

function classifyAnalyticsError(errorMessage: string): { errorCode: string; suggestion: string } {
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return {
      errorCode: 'SCRIPT_TIMEOUT',
      suggestion: 'Try reducing the analysis period or exclude project/tag stats for faster results',
    };
  }
  if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
    return { errorCode: 'OMNIFOCUS_NOT_RUNNING', suggestion: 'Start OmniFocus and ensure it is running' };
  }
  if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
    return {
      errorCode: 'PERMISSION_DENIED',
      suggestion: 'Enable automation access in System Settings > Privacy & Security > Automation',
    };
  }
  if (errorMessage.includes('no data') || errorMessage.includes('empty database')) {
    return { errorCode: 'NO_DATA', suggestion: 'Add some tasks to OmniFocus before running productivity analysis' };
  }
  return { errorCode: 'STATS_ERROR', suggestion: 'Ensure OmniFocus is running and has data to analyze' };
}

// Pattern analysis types
interface PatternFinding {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  count: number;
  items?: unknown;
  recommendation?: string;
}

interface SlimTask {
  id: string;
  name: string;
  project?: string;
  projectId?: string;
  tags: string[];
  status: string;
  completed: boolean;
  flagged: boolean;
  deferDate?: string;
  dueDate?: string;
  completionDate?: string;
  createdDate?: string;
  modifiedDate?: string;
  estimatedMinutes?: number;
  note?: string;
  noteHead?: string;
  children?: number;
}

interface ProjectData {
  id: string;
  name: string;
  status: string;
  taskCount?: number;
  availableTaskCount?: number;
  lastReviewDate?: string;
  nextReviewDate?: string;
  creationDate?: string;
  modificationDate?: string;
  completionDate?: string;
}

interface TagData {
  id: string;
  name: string;
  taskCount?: number;
}

interface DuplicateCluster {
  cluster_size: number;
  tasks: Array<{ id: string; name: string; project?: string }>;
}

interface DormantProject {
  id: string;
  name: string;
  days_dormant: number;
  last_modified?: string;
  task_count?: number;
  available_tasks?: number;
}

// Meeting notes types
type ProjectMatchLevel = 'exact' | 'partial' | 'none';
type ConfidenceLevel = 'high' | 'medium' | 'low';

interface ExtractedTask {
  tempId: string;
  name: string;
  suggestedProject: string | null;
  projectMatch: ProjectMatchLevel;
  suggestedTags: string[];
  suggestedDueDate?: string;
  suggestedDeferDate?: string;
  estimatedMinutes?: number;
  confidence: ConfidenceLevel;
  sourceText: string;
  note?: string;
}

interface ExtractedProject {
  tempId: string;
  name: string;
  tasks: Array<{
    tempId: string;
    name: string;
    estimatedMinutes?: number;
    suggestedTags?: string[];
  }>;
  confidence: ConfidenceLevel;
  sourceText: string;
}

interface ExtractionResult {
  tasks: ExtractedTask[];
  projects: ExtractedProject[];
  // OMN-123: content lines that were neither metadata nor turned into a task.
  // Surfaced so nothing is ever silently discarded.
  unparsed: string[];
}

// Convert string ID to branded ProjectId for type safety
const convertToProjectId = (id: string): ProjectId => id as ProjectId;

// ---------------------------------------------------------------------------
// MODULE-SCOPE SUCCESS SCHEMAS (OMN-139 / OMN-158)
// Instantiated once; never constructed per-request.
// Source-verified against each emitting script before finalizing.
// OMN-158: per-operation typed v3 envelopes replace the shared ANALYZE_V3_SCHEMA;
// typed review schemas replace the z.unknown() shapes.
// ---------------------------------------------------------------------------

/**
 * AST recurring-tasks envelope: {ok:true, v:'ast', tasks, summary, metadata}.
 * Source: analyze-recurring-tasks-ast.ts buildRecurringTasksScript.
 */
const RECURRING_TASKS_SCHEMA = astEnvelopeSchema('tasks', {
  rowSchema: RecurringTaskRowSchema,
  summarySchema: RecurringTasksSummarySchema,
  metadataSchema: RecurringTasksMetadataSchema,
});

/**
 * AST tag items envelope: {ok:true, v:'ast', items, summary?}.
 * Analyze tool receives 'basic' mode items ({id, name, parentId} objects).
 * OMN-145: parentId is null for top-level tags, string ID for nested tags.
 * Source: tag-script-builder.ts buildBasicTagsScript.
 */
const TAG_ITEMS_SCHEMA = astEnvelopeSchema('items', {
  rowSchema: TagItemSchema,
  summarySchema: TagSummarySchema,
});

/**
 * Filtered-projects list: {projects|items, metadata?}.
 * Source: buildFilteredProjectsScript.
 */
const PROJECTS_LIST_SCHEMA = listResultSchema(['projects', 'items'], {
  rowSchema: ProjectRowSchema,
  metadata: ProjectListMetadataSchema,
});

/**
 * Task list: {tasks|items, metadata?}.
 * Source: buildListTasksScriptV4 (wraps filtered/inbox/id_lookup inner scripts).
 */
const TASKS_LIST_SCHEMA = listResultSchema(['tasks', 'items'], {
  rowSchema: TaskRowSchema,
  metadata: TaskListMetadataSchema,
});

// OMN-158: per-operation typed schemas imported from script-response-schemas.ts.
// PRODUCTIVITY_STATS_V3_SCHEMA / TASK_VELOCITY_V3_SCHEMA / OVERDUE_ANALYSIS_V3_SCHEMA /
// WORKFLOW_ANALYSIS_V3_SCHEMA / REVIEWS_LIST_TYPED_SCHEMA / MARK_REVIEWED_TYPED_SCHEMA /
// SET_SCHEDULE_TYPED_SCHEMA are module-scope constants defined in script-response-schemas.ts.
// Re-exported aliases kept here for local readability.
const REVIEWS_LIST_SCHEMA = REVIEWS_LIST_TYPED_SCHEMA;
const MARK_REVIEWED_SCHEMA = MARK_REVIEWED_TYPED_SCHEMA;
const SET_SCHEDULE_SCHEMA = SET_SCHEDULE_TYPED_SCHEMA;

// ---------------------------------------------------------------------------
// Main tool
// ---------------------------------------------------------------------------

export class OmniFocusAnalyzeTool extends BaseTool<typeof AnalyzeSchema, unknown> {
  name = 'omnifocus_analyze';
  description = `Analyze OmniFocus data for insights, patterns, and specialized operations.

ANALYSIS TYPES:
- productivity_stats: GTD health metrics (completion rates, velocity)
- task_velocity: Completion trends over time
- overdue_analysis: Bottleneck identification
- pattern_analysis: Database-wide patterns (tags, projects, stale items)
- workflow_analysis: Deep workflow analysis
- recurring_tasks: Recurring task patterns and frequencies
- parse_meeting_notes: Structure meeting action items into OmniFocus.
  PREFERRED: extract the action items YOURSELF, then pass params.items[] —
  each { name, project?, tags?, dueDate?, deferDate?, estimatedMinutes?, flagged?, note? }.
  The tool does a read-only pre-flight (resolves project names, dedupes against
  existing tasks, classifies tags existing-vs-new) and returns a batchPayload you
  send to omnifocus_write { batch } (try dryRun:true first). Set
  validateAgainstExisting:false to skip the DB reads. If a pre-flight read fails,
  it is reported in warnings[] (validation may be incomplete) rather than silently
  degrading to "nothing exists".
  FALLBACK: pass params.text (raw prose) and the heuristic extractor runs;
  un-parsed lines are surfaced in unparsed[]. Provide exactly one of items|text.
- manage_reviews: Project review operations
  params: { operation, projectId, reviewDate, reviewInterval }
  - set_schedule accepts reviewInterval: { unit: 'day'|'week'|'month'|'year', steps: positive int }
  - clear_schedule always returns UNSUPPORTED (OmniJS cannot remove a project reviewInterval —
    OMN-41/OMN-58); set a different interval with set_schedule or clear it in the OmniFocus app

PERFORMANCE WARNINGS:
- pattern_analysis on 1000+ items: ~5-10 seconds
- workflow_analysis: ~20-45s — scans the ENTIRE task database (no cap); scales with DB size
- Most others: <1 second with caching

SCOPE FILTERING:
- Use dateRange for time-based analysis
- Use tags/projects to focus analysis`;

  schema = AnalyzeSchema;

  /**
   * Hand-crafted minimal JSON Schema for MCP tool advertisement.
   *
   * The auto-generated schema is ~4 KB due to discriminatedUnion duplicating
   * the scope object across 8 analysis type branches.
   *
   * Server-side validation still uses the full Zod AnalyzeSchema.
   */
  override get inputSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        analysis: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'productivity_stats',
                'task_velocity',
                'overdue_analysis',
                'pattern_analysis',
                'workflow_analysis',
                'recurring_tasks',
                'parse_meeting_notes',
                'manage_reviews',
              ],
            },
            scope: { type: 'object' },
            params: { type: 'object' },
          },
          required: ['type'],
        },
      },
      required: ['analysis'],
    };
  }

  meta = {
    category: 'Analytics' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'slow' as const,
    tags: ['unified', 'analyze', 'analytics'],
    capabilities: [
      'productivity_stats',
      'task_velocity',
      'overdue_analysis',
      'pattern_analysis',
      'workflow_analysis',
      'recurring_tasks',
      'parse_meeting_notes',
      'manage_reviews',
    ],
  };

  annotations = {
    title: 'Analyze OmniFocus Data',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };

  private compiler: AnalysisCompiler;
  private patternLogger: Logger;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new AnalysisCompiler();
    this.patternLogger = createLogger('PatternAnalysis');
  }

  async executeValidated(args: AnalyzeInput): Promise<unknown> {
    const compiled = this.compiler.compile(args);

    switch (compiled.type) {
      case 'productivity_stats':
        return this.executeProductivityStats(compiled);
      case 'task_velocity':
        return this.executeTaskVelocity(compiled);
      case 'overdue_analysis':
        return this.executeOverdueAnalysis(compiled);
      case 'pattern_analysis':
        return this.executePatternAnalysis(compiled);
      case 'workflow_analysis':
        return this.executeWorkflowAnalysis(compiled);
      case 'recurring_tasks':
        return this.executeRecurringTasks(compiled);
      case 'parse_meeting_notes':
        return this.executeParseMeetingNotes(compiled);
      case 'manage_reviews':
        return this.executeManageReviews(compiled);
      default: {
        const _exhaustive: never = compiled;
        throw new Error(`Unsupported analysis type: ${(_exhaustive as CompiledAnalysis).type}`);
      }
    }
  }

  // =========================================================================
  // Productivity Stats
  // =========================================================================

  private async executeProductivityStats(
    compiled: Extract<CompiledAnalysis, { type: 'productivity_stats' }>,
  ): Promise<unknown> {
    const timer = new OperationTimerV2();

    try {
      const period = compiled.params?.groupBy ?? 'week';
      const includeProjectStats = true;
      const includeTagStats = true;

      // Cache key
      const cacheKey = `productivity_v2_${period}_${includeProjectStats}_${includeTagStats}`;

      const cached = this.cache.get<{ period?: string; stats?: Record<string, unknown>; healthScore?: number }>(
        'analytics',
        cacheKey,
      );
      if (cached) {
        this.logger.debug('Returning cached productivity stats');
        return createAnalyticsResponseV2(
          'productivity_stats',
          cached,
          'Productivity Analysis',
          this.extractProductivityKeyFindings(
            cached as { period?: string; stats?: Record<string, unknown>; healthScore?: number },
          ),
          { from_cache: true, period, ...timer.toMetadata() },
        );
      }

      const script = this.omniAutomation.buildScript(PRODUCTIVITY_STATS_SCRIPT, {
        options: { period, includeProjectStats, includeTagStats, includeInactive: false },
      });
      const result = await this.execJson(script, PRODUCTIVITY_STATS_V3_SCHEMA);

      if (isScriptError(result)) {
        return createErrorResponseV2(
          'productivity_stats',
          'STATS_ERROR',
          result.error || 'Script execution failed',
          'Ensure OmniFocus is running and has data to analyze',
          result.details,
          timer.toMetadata(),
        );
      }

      const { overview, projectStatsArray, tagStatsArray, insights } = this.unwrapProductivityResult(
        result,
        includeProjectStats,
        includeTagStats,
      );

      const responseData = {
        period,
        stats: {
          overview,
          daily: [],
          weekly: {},
          projectStats: Array.isArray(projectStatsArray)
            ? projectStatsArray
            : Object.entries(projectStatsArray || {}).map(([name, data]) => ({
                name,
                // OMN-252 (OMN-148 drift D8): the script's map emits `completed`;
                // this reshape read `completedCount` — always 0, so the "Most
                // productive project" finding could never fire.
                completedCount:
                  data && typeof data === 'object' && 'completed' in data ? Number(data.completed) || 0 : 0,
                ...(data && typeof data === 'object' ? (data as Record<string, unknown>) : {}),
              })),
          tagStats: tagStatsArray,
        },
        insights: { recommendations: insights },
        healthScore: Math.max(0, Math.min(100, Math.round((overview.completionRate || 0) * 100))),
      };

      this.cache.set('analytics', cacheKey, responseData);

      const keyFindings = this.extractProductivityKeyFindings(responseData);

      return createAnalyticsResponseV2('productivity_stats', responseData, 'Productivity Analysis', keyFindings, {
        from_cache: false,
        period,
        include_project_stats: includeProjectStats,
        include_tag_stats: includeTagStats,
        ...timer.toMetadata(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const { errorCode, suggestion } = classifyAnalyticsError(errorMessage);

      return createErrorResponseV2(
        'productivity_stats',
        errorCode,
        errorMessage,
        suggestion,
        error instanceof Error ? { stack: error.stack } : undefined,
        timer.toMetadata(),
      );
    }
  }

  private unwrapProductivityResult(
    result: unknown,
    includeProjectStats: boolean,
    includeTagStats: boolean,
  ): {
    overview: {
      totalTasks: number;
      completedTasks: number;
      completionRate: number;
      activeProjects: number;
      overdueCount: number;
    };
    projectStatsArray: Array<{ name: string; completedCount: number }> | Record<string, unknown>;
    tagStatsArray: Record<string, unknown>;
    insights: string[];
  } {
    interface ScriptOverview {
      totalTasks?: number;
      completedTasks?: number;
      completionRate?: number;
      activeProjects?: number;
      overdueCount?: number;
    }
    interface ScriptData {
      summary?: ScriptOverview;
      projectStats?: Record<string, unknown>;
      tagStats?: Record<string, unknown>;
      insights?: string[];
    }

    let actualData: unknown;
    if (result && typeof result === 'object') {
      actualData = 'data' in result ? (result as { data: unknown }).data : result;
      if (actualData && typeof actualData === 'object' && 'ok' in actualData && 'data' in actualData) {
        actualData = (actualData as { ok: boolean; data: unknown }).data;
      }
    } else {
      actualData = result;
    }

    const empty = { totalTasks: 0, completedTasks: 0, completionRate: 0, activeProjects: 0, overdueCount: 0 };
    if (!actualData || typeof actualData !== 'object' || !('summary' in actualData)) {
      return { overview: empty, projectStatsArray: [], tagStatsArray: {}, insights: [] };
    }

    const typedScriptData = actualData as ScriptData;
    const summary = typedScriptData.summary!;
    return {
      overview: {
        totalTasks: summary.totalTasks || 0,
        completedTasks: summary.completedTasks || 0,
        completionRate: summary.completionRate || 0,
        activeProjects: summary.activeProjects || 0,
        overdueCount: summary.overdueCount || 0,
      },
      projectStatsArray: includeProjectStats ? typedScriptData.projectStats || [] : [],
      tagStatsArray: includeTagStats ? typedScriptData.tagStats || {} : {},
      insights: typedScriptData.insights || [],
    };
  }

  private extractProductivityKeyFindings(data: {
    period?: string;
    stats?: {
      overview?: {
        totalTasks?: number;
        completedTasks?: number;
        completionRate?: number;
        activeProjects?: number;
        overdueCount?: number;
      };
      projectStats?: Array<{ name: string; completedCount: number }>;
    };
    healthScore?: number;
    insights?: { recommendations?: string[] };
  }): string[] {
    const findings: string[] = [];

    if (data.stats?.overview) {
      const { completedTasks, completionRate } = data.stats.overview;
      if (completedTasks && completedTasks > 0) {
        const rate = completionRate || 0;
        findings.push(`Completed ${completedTasks} tasks (${(rate * 100).toFixed(1)}% completion rate)`);
      }
    }

    if (typeof data.healthScore === 'number') {
      const score = Math.round(data.healthScore);
      let assessment = 'Needs attention';
      if (score >= 80) assessment = 'Excellent';
      else if (score >= 60) assessment = 'Good';
      else if (score >= 40) assessment = 'Fair';
      findings.push(`GTD Health Score: ${score}/100 (${assessment})`);
    }

    if (data.stats?.projectStats && data.stats.projectStats.length > 0) {
      const sortedProjectStats = [...data.stats.projectStats].sort(
        (a, b) => (b.completedCount || 0) - (a.completedCount || 0),
      );
      const topProject = sortedProjectStats[0];
      if (topProject && topProject.completedCount > 0) {
        findings.push(`Most productive project: ${topProject.name} (${topProject.completedCount} completed)`);
      }
    }

    if (data.insights && Array.isArray(data.insights.recommendations) && data.insights.recommendations.length > 0) {
      // Cross-check: filter out recommendations that contradict the data
      const score = data.healthScore ?? 0;
      const filteredRecs = data.insights.recommendations.filter((rec) => {
        const recLower = rec.toLowerCase();
        // Don't say "excellent" if health score is low
        if (recLower.includes('excellent') && score < 60) return false;
        // Don't say "low" or "needs attention" if health score is high
        if ((recLower.includes('low completion') || recLower.includes('needs attention')) && score >= 60) return false;
        return true;
      });
      if (filteredRecs.length > 0) {
        findings.push(filteredRecs[0]);
      }
    }

    return findings.length > 0 ? findings : ['No productivity data available for this period'];
  }

  // =========================================================================
  // Task Velocity
  // =========================================================================

  private async executeTaskVelocity(compiled: Extract<CompiledAnalysis, { type: 'task_velocity' }>): Promise<unknown> {
    const timer = new OperationTimerV2();

    try {
      const groupBy = compiled.params?.groupBy ?? 'day';
      const includeWeekends = true;
      const days = 7;

      // Compute actual date range
      let rangeStart: string;
      let rangeEnd: string;

      if (compiled.scope?.dateRange) {
        rangeStart = compiled.scope.dateRange.start;
        rangeEnd = compiled.scope.dateRange.end;
      } else {
        const now = new Date();
        const start = new Date(now);
        start.setDate(start.getDate() - days);
        rangeStart = start.toISOString().split('T')[0];
        rangeEnd = now.toISOString().split('T')[0];
      }

      const cacheKey = `velocity_v2_${rangeStart}_${rangeEnd}_${groupBy}_${includeWeekends}`;

      const cached = this.cache.get<{
        velocity?: { period?: string; tasksCompleted?: number; averagePerDay?: number };
        patterns?: unknown;
        insights?: string[];
      }>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached task velocity');
        return createAnalyticsResponseV2(
          'task_velocity',
          cached,
          'Task Velocity Analysis',
          this.extractVelocityKeyFindings(cached as Parameters<typeof this.extractVelocityKeyFindings>[0]),
          {
            from_cache: true,
            start_date: rangeStart,
            end_date: rangeEnd,
            group_by: groupBy,
            include_weekends: includeWeekends,
            ...timer.toMetadata(),
          },
        );
      }

      const script = this.omniAutomation.buildScript(TASK_VELOCITY_SCRIPT, {
        options: { period: groupBy, startDate: rangeStart, endDate: rangeEnd },
      });

      const result = await this.execJson(script, TASK_VELOCITY_V3_SCHEMA);

      if (isScriptError(result)) {
        return createErrorResponseV2(
          'task_velocity',
          'VELOCITY_ERROR',
          result.error || 'Script execution failed',
          undefined,
          result.details,
          timer.toMetadata(),
        );
      }

      // OMN-194: typed unwrap — execJson validates the full envelope; .data is the payload.
      const scriptData: TaskVelocityV3Data | null = isScriptSuccess(result) ? result.data.data : null;

      const tasksCompleted = scriptData?.throughput?.totalCompleted || 0;
      const averagePerDay = parseFloat(scriptData?.velocity?.dailyVelocity || '0');
      const predictedCapacity = parseFloat(scriptData?.projections?.tasksPerWeek || '0');

      const peak = { date: null, count: 0 };
      const trend = 'stable' as const;
      const daily = scriptData?.throughput?.intervals || [];

      const responseData = {
        velocity: {
          period: groupBy,
          tasksCompleted,
          averagePerDay: typeof averagePerDay === 'number' ? averagePerDay : Number(averagePerDay) || 0,
          peakDay: peak,
          trend,
          predictedCapacity: typeof predictedCapacity === 'number' ? predictedCapacity : Number(predictedCapacity) || 0,
        },
        daily,
        patterns: { byDayOfWeek: {}, byTimeOfDay: {}, byProject: [] },
        insights: [],
      };

      this.cache.set('analytics', cacheKey, responseData);

      const keyFindings = this.extractVelocityKeyFindings(responseData);

      return createAnalyticsResponseV2('task_velocity', responseData, 'Task Velocity Analysis', keyFindings, {
        from_cache: false,
        start_date: rangeStart,
        end_date: rangeEnd,
        group_by: groupBy,
        include_weekends: includeWeekends,
        ...timer.toMetadata(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return createErrorResponseV2(
        'task_velocity',
        'VELOCITY_ERROR',
        errorMessage,
        'Ensure OmniFocus is running and has completion data',
        undefined,
        timer.toMetadata(),
      );
    }
  }

  private extractVelocityKeyFindings(data: {
    velocity?: {
      period?: string;
      tasksCompleted?: number;
      averagePerDay?: number;
      peakDay?: { date: string | null; count: number };
      trend?: string;
      predictedCapacity?: number;
    };
    patterns?: {
      byDayOfWeek?: Record<string, number>;
      byProject?: Array<{ name: string; completed: number }>;
    };
    insights?: string[];
  }): string[] {
    const findings: string[] = [];

    if (data.velocity) {
      this.collectVelocityFindings(data.velocity, findings);
    }

    this.collectPeakDayFinding(data.velocity?.peakDay, findings);
    this.collectMostProductiveDayFinding(data.patterns?.byDayOfWeek, findings);
    this.collectTopProjectFinding(data.patterns?.byProject, findings);

    if (data.insights && Array.isArray(data.insights) && data.insights.length > 0) {
      findings.push(data.insights[0]);
    }

    return findings.length > 0 ? findings : ['No velocity data available for this period'];
  }

  private static readonly TREND_LABELS: Record<string, string> = {
    increasing: 'Velocity trending upward',
    decreasing: 'Velocity trending downward',
  };

  private collectVelocityFindings(
    velocity: {
      tasksCompleted?: number;
      averagePerDay?: number;
      trend?: string;
      predictedCapacity?: number;
    },
    findings: string[],
  ): void {
    const { tasksCompleted, averagePerDay, trend, predictedCapacity } = velocity;

    if (tasksCompleted && tasksCompleted > 0) {
      const avgPerDay = averagePerDay || 0;
      findings.push(`Completed ${tasksCompleted} tasks (avg ${avgPerDay.toFixed(1)}/day)`);
    }

    findings.push(OmniFocusAnalyzeTool.TREND_LABELS[trend ?? ''] ?? 'Velocity stable');

    if (predictedCapacity && predictedCapacity > 0) {
      findings.push(`Predicted capacity: ${Math.round(predictedCapacity)} tasks/week`);
    }
  }

  private collectPeakDayFinding(peakDay: { date: string | null; count: number } | undefined, findings: string[]): void {
    if (peakDay?.date && peakDay.count > 0) {
      findings.push(`Peak day: ${peakDay.date} (${peakDay.count} tasks)`);
    }
  }

  private collectMostProductiveDayFinding(byDayOfWeek: Record<string, number> | undefined, findings: string[]): void {
    if (!byDayOfWeek) return;

    const days = Object.entries(byDayOfWeek).sort((a, b) => {
      const aVal = typeof a[1] === 'number' ? a[1] : 0;
      const bVal = typeof b[1] === 'number' ? b[1] : 0;
      return bVal - aVal;
    });

    if (days.length > 0) {
      const dayCount = typeof days[0][1] === 'number' ? days[0][1] : 0;
      if (dayCount > 0) {
        findings.push(`Most productive: ${days[0][0]}s`);
      }
    }
  }

  private collectTopProjectFinding(
    byProject: Array<{ name: string; completed: number }> | undefined,
    findings: string[],
  ): void {
    if (!Array.isArray(byProject) || byProject.length === 0) return;

    const topProject = byProject[0];
    if (topProject && topProject.completed > 0) {
      findings.push(`Fastest moving project: ${topProject.name}`);
    }
  }

  // =========================================================================
  // Overdue Analysis
  // =========================================================================

  private async executeOverdueAnalysis(
    _compiled: Extract<CompiledAnalysis, { type: 'overdue_analysis' }>,
  ): Promise<unknown> {
    const timer = new OperationTimerV2();

    try {
      const includeRecentlyCompleted = true;
      const groupBy = 'project';
      const limit = 100;

      const cacheKey = `overdue_v2_${includeRecentlyCompleted}_${groupBy}_${limit}`;

      const cached = this.cache.get<OverdueAnalysisDataV2>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached overdue analysis');
        return createAnalyticsResponseV2(
          'analyze_overdue',
          cached,
          'Overdue Task Analysis',
          this.extractOverdueKeyFindings(cached),
          { from_cache: true, ...timer.toMetadata() },
        );
      }

      const script = this.omniAutomation.buildScript(ANALYZE_OVERDUE_SCRIPT, {
        options: { includeRecentlyCompleted, groupBy, limit },
      });
      const result = await this.execJson(script, OVERDUE_ANALYSIS_V3_SCHEMA);

      if (isScriptError(result)) {
        return createErrorResponseV2(
          'analyze_overdue',
          'ANALYSIS_ERROR',
          result.error || 'Script execution failed',
          undefined,
          result.details,
          timer.toMetadata(),
        );
      }

      const envelope = result.data as unknown as
        | { ok?: boolean; v?: string; data?: OverdueAnalysisV3Data }
        | OverdueAnalysisV3Data;
      const scriptData: OverdueAnalysisV3Data =
        'data' in envelope && envelope.data ? envelope.data : (envelope as OverdueAnalysisV3Data);

      const { summary, groupedByUrgency, projectBottlenecks, insights } = scriptData;

      // OMN-187: the v3 script returns overdue tasks split across urgency buckets
      // (not a flat array). Flatten them back into one list, most-overdue first,
      // so the response carries real per-task rows.
      const urgencyKeys = ['critical', 'high', 'medium', 'low'] as const;
      const allOverdue = urgencyKeys
        .flatMap((key) => groupedByUrgency[key])
        .sort((a, b) => b.daysOverdue - a.daysOverdue);

      const responseData: OverdueAnalysisDataV2 = {
        stats: {
          summary: {
            totalOverdue: summary.totalOverdue,
            overduePercentage: summary.overduePercentage,
            averageDaysOverdue: summary.avgDaysOverdue,
            // OMN-187: exact oldest due date computed over the full population in the
            // script (not derived from the capped mostOverdue sample).
            oldestOverdueDate: summary.oldestOverdueDate ?? '',
          },
          overdueTasks: allOverdue.map((task) => ({
            id: task.id,
            name: task.name,
            dueDate: task.dueDate,
            project: task.project,
            tags: task.tags,
            daysOverdue: task.daysOverdue,
          })),
          // projectBottlenecks → flat pattern rows (blockageRate is a toFixed string).
          patterns: projectBottlenecks.map((b) => ({
            type: 'project',
            value: b.name,
            count: b.overdueCount,
            percentage: parseFloat(b.blockageRate) || 0,
          })),
          insights: { topRecommendations: insights },
        },
        groupedAnalysis: Object.fromEntries(
          urgencyKeys.map((key) => {
            const tasks = groupedByUrgency[key];
            const averageDaysOverdue =
              tasks.length > 0 ? tasks.reduce((sum, t) => sum + t.daysOverdue, 0) / tasks.length : 0;
            return [key, { count: tasks.length, averageDaysOverdue, tasks }];
          }),
        ),
      };

      this.cache.set('analytics', cacheKey, responseData);

      const keyFindings = this.extractOverdueKeyFindings(responseData);

      return createAnalyticsResponseV2('analyze_overdue', responseData, 'Overdue Task Analysis', keyFindings, {
        from_cache: false,
        group_by: groupBy,
        include_completed: includeRecentlyCompleted,
        ...timer.toMetadata(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      let suggestion = 'Ensure OmniFocus is running and has data to analyze';
      let errorCode = 'ANALYSIS_ERROR';

      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorCode = 'SCRIPT_TIMEOUT';
        suggestion = 'Try reducing the limit parameter or use basic analysis without grouping';
      } else if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
        errorCode = 'OMNIFOCUS_NOT_RUNNING';
        suggestion = 'Start OmniFocus and ensure it is running';
      } else if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
        errorCode = 'PERMISSION_DENIED';
        suggestion = 'Enable automation access in System Settings > Privacy & Security > Automation';
      } else if (errorMessage.includes('no overdue') || errorMessage.includes('no data')) {
        errorCode = 'NO_OVERDUE_TASKS';
        suggestion = 'No overdue tasks found - this is actually good news for your productivity!';
      }

      return createErrorResponseV2(
        'analyze_overdue',
        errorCode,
        errorMessage,
        suggestion,
        error instanceof Error ? { stack: error.stack } : undefined,
        timer.toMetadata(),
      );
    }
  }

  private extractOverdueKeyFindings(data: OverdueAnalysisDataV2): string[] {
    const findings: string[] = [];

    if (data.stats?.summary) {
      const { totalOverdue, averageDaysOverdue, overduePercentage } = data.stats.summary;
      if ((totalOverdue ?? 0) > 0) {
        findings.push(`${totalOverdue ?? 0} tasks overdue (${(overduePercentage ?? 0).toFixed(1)}% of active tasks)`);
        findings.push(`Average ${Math.round(averageDaysOverdue ?? 0)} days overdue`);
      }
    }

    if (data?.stats?.patterns && Array.isArray(data.stats.patterns) && data.stats.patterns.length > 0) {
      const topPattern = data.stats.patterns[0];
      if (
        topPattern &&
        typeof topPattern === 'object' &&
        typeof topPattern.value === 'string' &&
        topPattern.value &&
        typeof topPattern.count === 'number' &&
        topPattern.count > 0
      ) {
        // OMN-187: `value` is the project name; `type` is the category ('project').
        findings.push(`Most overdue in: ${topPattern.value} (${topPattern.count} tasks)`);
      }
    }

    if (
      data?.groupedAnalysis &&
      typeof data.groupedAnalysis === 'object' &&
      Object.keys(data.groupedAnalysis).length > 0
    ) {
      const groups = Object.entries(data.groupedAnalysis)
        .filter(([_, info]) => info && typeof info === 'object' && typeof info.count === 'number')
        .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
        .slice(0, 2);

      groups.forEach(([name, info]) => {
        if (info && typeof info.count === 'number' && info.count > 0) {
          findings.push(`${name}: ${info.count} overdue tasks`);
        }
      });
    }

    if (
      data?.stats?.insights?.topRecommendations &&
      Array.isArray(data.stats.insights.topRecommendations) &&
      data.stats.insights.topRecommendations.length > 0
    ) {
      const recommendations = data.stats.insights.topRecommendations;
      const firstRecommendation = recommendations[0] as unknown;
      if (firstRecommendation && typeof firstRecommendation === 'string') {
        findings.push(firstRecommendation);
      }
    }

    return findings.length > 0 ? findings : ['No overdue tasks found'];
  }

  // =========================================================================
  // Pattern Analysis
  // =========================================================================

  private async executePatternAnalysis(
    compiled: Extract<CompiledAnalysis, { type: 'pattern_analysis' }>,
  ): Promise<unknown> {
    const startTime = Date.now();

    try {
      const rawPatterns = compiled.params?.insights ?? ['all'];

      // Options with defaults
      const options = {
        dormant_threshold_days: 90,
        duplicate_similarity_threshold: 0.85,
        include_completed: false,
        max_tasks: 3000,
        wip_limit: 5,
        bunching_threshold: 8,
      };

      // Expand 'all' to include all patterns
      const patterns = rawPatterns.includes('all')
        ? [
            'duplicates',
            'dormant_projects',
            'tag_audit',
            'deadline_health',
            'waiting_for',
            'estimation_bias',
            'next_actions',
            'review_gaps',
            'wip_limits',
            'due_date_bunching',
          ]
        : rawPatterns;

      // Fetch slimmed task data
      const slimData = await this.fetchSlimmedData(options);

      if (!slimData) {
        return createErrorResponseV2(
          'analyze_patterns',
          'EXECUTION_ERROR',
          'Failed to fetch data from OmniFocus - received null response',
          'Check that OmniFocus is running and accessible',
          undefined,
          { query_time_ms: Date.now() - startTime },
        );
      }

      if (!slimData.tasks || !slimData.projects) {
        return createErrorResponseV2(
          'analyze_patterns',
          'EXECUTION_ERROR',
          'Failed to fetch complete data from OmniFocus - missing tasks or projects',
          'Check that OmniFocus database has tasks and projects',
          undefined,
          { query_time_ms: Date.now() - startTime },
        );
      }

      // Run requested pattern analyses
      const findings: Record<string, PatternFinding> = {};

      for (const pattern of patterns) {
        switch (pattern) {
          case 'duplicates':
            findings.duplicates = this.detectDuplicates(slimData.tasks, options);
            break;
          case 'dormant_projects':
            findings.dormant_projects = this.detectDormantProjects(slimData.projects, options.dormant_threshold_days);
            break;
          case 'tag_audit':
            findings.tag_audit = this.auditTags(slimData.tasks, slimData.tags);
            break;
          case 'deadline_health':
            findings.deadline_health = this.analyzeDeadlines(slimData.tasks);
            break;
          case 'waiting_for':
            findings.waiting_for = this.analyzeWaitingFor(slimData.tasks);
            break;
          case 'estimation_bias':
            findings.estimation_bias = this.analyzeEstimationBias(slimData.tasks);
            break;
          case 'next_actions': {
            const result = analyzeNextActions(
              slimData.tasks.map((t) => ({ id: t.id, name: t.name, completed: t.completed })),
            );
            findings.next_actions = {
              type: 'next_actions',
              severity: result.vagueTasks > 20 ? 'warning' : 'info',
              count: result.vagueTasks,
              items: result.examples,
              recommendation:
                result.recommendations.join(' ') || 'Most tasks appear to be clear, actionable next actions.',
            };
            break;
          }
          case 'review_gaps': {
            const result = analyzeReviewGaps(
              slimData.projects.map((p) => ({
                id: p.id,
                name: p.name,
                status: p.status,
                nextReviewDate: p.nextReviewDate || null,
                lastReviewDate: p.lastReviewDate || null,
              })),
            );
            findings.review_gaps = {
              type: 'review_gaps',
              severity:
                result.projectsNeverReviewed.length > 5 || result.projectsOverdueForReview.length > 3
                  ? 'warning'
                  : 'info',
              count: result.projectsNeverReviewed.length + result.projectsOverdueForReview.length,
              items: { never_reviewed: result.projectsNeverReviewed, overdue: result.projectsOverdueForReview },
              recommendation: result.recommendations.join(' ') || 'Project review schedule is mostly up to date.',
            };
            break;
          }
          case 'wip_limits':
            findings.wip_limits = this.analyzeWipPattern(slimData, options.wip_limit);
            break;
          case 'due_date_bunching':
            findings.due_date_bunching = this.analyzeBunchingPattern(slimData.tasks, options.bunching_threshold);
            break;
        }
      }

      // Generate summary
      const summary = this.generatePatternSummary(findings, slimData);
      const duration = Date.now() - startTime;

      return createAnalyticsResponseV2('analyze_patterns', findings, 'pattern_analysis', summary.key_insights || [], {
        tasks_analyzed: slimData.tasks.length,
        projects_analyzed: slimData.projects.length,
        patterns_checked: patterns,
        query_time_ms: duration,
        from_cache: false,
      });
    } catch (error) {
      this.patternLogger.error('Analysis failed', { error });
      return this.handleErrorV2(error);
    }
  }

  private analyzeWipPattern(
    slimData: { tasks: SlimTask[]; projects: ProjectData[] },
    wipLimit: number,
  ): PatternFinding {
    const tasksByProject = new Map<string, SlimTask[]>();
    for (const task of slimData.tasks) {
      if (task.projectId) {
        if (!tasksByProject.has(task.projectId)) {
          tasksByProject.set(task.projectId, []);
        }
        tasksByProject.get(task.projectId)!.push(task);
      }
    }

    const projectsWithTasks = slimData.projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      sequential: false,
      tasks: (tasksByProject.get(project.id) || []).map((task) => ({
        id: task.id,
        completed: task.completed,
        blocked: task.status === 'blocked',
        deferDate: task.deferDate || null,
      })),
    }));

    const wipResult = analyzeWipLimits(projectsWithTasks, { wipLimit });
    return {
      type: 'wip_limits',
      severity: wipResult.overloadedProjects > 5 ? 'warning' : 'info',
      count: wipResult.overloadedProjects,
      items: {
        projects_over_limit: wipResult.projectsOverWipLimit,
        healthy_projects: wipResult.healthyProjects,
        overloaded_projects: wipResult.overloadedProjects,
      },
      recommendation: wipResult.recommendations.join(' ') || 'All projects within WIP limits.',
    };
  }

  private analyzeBunchingPattern(tasks: SlimTask[], bunchingThreshold: number): PatternFinding {
    const bunchingResult = analyzeDueDateBunching(
      tasks.map((t) => ({
        id: t.id,
        dueDate: t.dueDate || null,
        completed: t.completed,
        project: t.project || 'Inbox',
      })),
      { threshold: bunchingThreshold },
    );
    return {
      type: 'due_date_bunching',
      severity: bunchingResult.bunchedDates.length > 3 ? 'warning' : 'info',
      count: bunchingResult.bunchedDates.length,
      items: {
        bunched_dates: bunchingResult.bunchedDates,
        average_tasks_per_day: bunchingResult.averageTasksPerDay,
        peak_day: bunchingResult.peakDay,
      },
      recommendation: bunchingResult.recommendations.join(' ') || 'Deadline distribution looks manageable.',
    };
  }

  private async fetchSlimmedData(
    options: Record<string, unknown>,
  ): Promise<{ tasks: SlimTask[]; projects: ProjectData[]; tags: TagData[] }> {
    const taskScript = `(() => {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      const tasks = [];
      const projects = [];

      const allTasks = doc.flattenedTasks();
      const maxTasks = ${String(options.max_tasks)};
      const includeCompleted = ${String(options.include_completed)};

      for (let i = 0; i < Math.min(allTasks.length, maxTasks); i++) {
        const task = allTasks[i];

        try {
          const completed = task.completed();
          if (!includeCompleted && completed) continue;

          const taskData = {
            id: task.id(),
            name: task.name(),
            completed: completed,
            flagged: task.flagged(),
            status: task.taskStatus ? task.taskStatus().toString() : 'unknown'
          };

          try {
            const container = task.containingProject();
            if (container) {
              taskData.project = container.name();
              taskData.projectId = container.id();
            }
          } catch(e) {}

          try {
            const tags = task.tags();
            taskData.tags = tags ? tags.map(t => t.name()) : [];
          } catch(e) { taskData.tags = []; }

          try { taskData.deferDate = task.deferDate()?.toISOString(); } catch(e) {}
          try { taskData.dueDate = task.dueDate()?.toISOString(); } catch(e) {}
          try { taskData.completionDate = task.completionDate()?.toISOString(); } catch(e) {}
          try { taskData.creationDate = task.creationDate()?.toISOString(); } catch(e) {}
          try { taskData.modificationDate = task.modificationDate()?.toISOString(); } catch(e) {}
          try { taskData.estimatedMinutes = task.estimatedMinutes(); } catch(e) {}

          try {
            const note = task.note();
            if (note) {
              taskData.noteHead = note.substring(0, 160);
            }
          } catch(e) {}

          try {
            const children = task.tasks();
            taskData.children = children ? children.length : 0;
          } catch(e) {}

          tasks.push(taskData);
        } catch(e) {
          // Skip problematic tasks
        }
      }

      const allProjects = doc.flattenedProjects();
      for (let i = 0; i < allProjects.length; i++) {
        const project = allProjects[i];

        try {
          const projectData = {
            id: project.id(),
            name: project.name(),
            status: project.status().toString(),
            taskCount: project.numberOfTasks(),
            availableTaskCount: project.numberOfAvailableTasks()
          };

          try { projectData.lastReviewDate = project.lastReviewDate()?.toISOString(); } catch(e) {}
          try { projectData.nextReviewDate = project.nextReviewDate()?.toISOString(); } catch(e) {}
          try { projectData.creationDate = project.creationDate()?.toISOString(); } catch(e) {}
          try { projectData.modificationDate = project.modificationDate()?.toISOString(); } catch(e) {}
          try { projectData.completionDate = project.completionDate()?.toISOString(); } catch(e) {}

          projects.push(projectData);
        } catch(e) {}
      }

      const tags = [];
      const allTags = doc.flattenedTags();
      for (let i = 0; i < allTags.length; i++) {
        const tag = allTags[i];
        try {
          const tagData = {
            name: tag.name(),
            id: tag.id()
          };

          let taskCount = 0;
          try {
            const taggedTasks = tag.tasks();
            taskCount = taggedTasks ? taggedTasks.length : 0;
          } catch(e) {}

          tagData.taskCount = taskCount;
          tags.push(tagData);
        } catch(e) {}
      }

      return JSON.stringify({ tasks, projects, tags });
    })()`;

    const scriptResult = await this.execJson(taskScript, SlimmedDataSchema);

    if (isScriptError(scriptResult)) {
      this.patternLogger.error('fetchSlimmedData failed', { error: scriptResult.error });
      return { tasks: [], projects: [], tags: [] };
    }

    if (!isScriptSuccess(scriptResult)) {
      this.patternLogger.error('fetchSlimmedData returned unexpected format', { result: scriptResult });
      return { tasks: [], projects: [], tags: [] };
    }

    const result = scriptResult.data;
    if (!result) {
      return { tasks: [], projects: [], tags: [] };
    }

    if (typeof result === 'string') {
      return JSON.parse(result) as { tasks: SlimTask[]; projects: ProjectData[]; tags: TagData[] };
    }
    return result as { tasks: SlimTask[]; projects: ProjectData[]; tags: TagData[] };
  }

  private detectDuplicates(tasks: SlimTask[], options: Record<string, unknown>): PatternFinding {
    const duplicates: Array<{ task1: SlimTask; task2: SlimTask; similarity: number }> = [];
    const threshold =
      typeof options.duplicate_similarity_threshold === 'number' ? options.duplicate_similarity_threshold : 0.85;

    for (let i = 0; i < tasks.length - 1; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const similarity = this.calculateSimilarity(tasks[i].name, tasks[j].name);
        if (similarity >= threshold) {
          if (tasks[i].projectId !== tasks[j].projectId || !tasks[i].projectId) {
            duplicates.push({ task1: tasks[i], task2: tasks[j], similarity });
          }
        }
      }
    }

    const clusters = this.clusterDuplicates(duplicates);

    return {
      type: 'duplicates',
      severity: clusters.length > 10 ? 'warning' : 'info',
      count: clusters.length,
      items: clusters.slice(0, 10),
      recommendation:
        clusters.length > 0
          ? `Found ${clusters.length} potential duplicate task clusters. Review and merge or clarify distinctions.`
          : 'No significant duplicates detected.',
    };
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2) return 1.0;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    const distance = this.levenshteinDistance(s1, s2);
    return 1 - distance / maxLen;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map((): number[] => Array(n + 1).fill(0) as number[]);

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1);
        }
      }
    }

    return dp[m][n];
  }

  private clusterDuplicates(
    duplicates: Array<{ task1: SlimTask; task2: SlimTask; similarity: number }>,
  ): DuplicateCluster[] {
    const clusters: Map<string, Set<string>> = new Map();

    for (const dup of duplicates) {
      const id1 = dup.task1.id;
      const id2 = dup.task2.id;

      let foundCluster = false;
      for (const [, members] of clusters) {
        if (members.has(id1) || members.has(id2)) {
          members.add(id1);
          members.add(id2);
          foundCluster = true;
          break;
        }
      }

      if (!foundCluster) {
        clusters.set(id1, new Set([id1, id2]));
      }
    }

    return Array.from(clusters.values()).map((cluster) => {
      const taskIds = Array.from(cluster);
      const tasks = duplicates
        .filter((d) => taskIds.includes(d.task1.id) || taskIds.includes(d.task2.id))
        .flatMap((d) => [d.task1, d.task2])
        .filter((task, index, self) => self.findIndex((t) => t.id === task.id) === index);

      return {
        cluster_size: cluster.size,
        tasks: tasks.map((t) => ({ id: t.id, name: t.name, project: t.project })),
      };
    });
  }

  private detectDormantProjects(projects: ProjectData[], thresholdDays: number): PatternFinding {
    const now = new Date();
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const dormant: DormantProject[] = [];

    for (const project of projects) {
      if (project.status === 'done' || project.status === 'dropped') continue;

      const lastModified = project.modificationDate ? new Date(project.modificationDate) : null;

      if (lastModified) {
        const dormantTime = now.getTime() - lastModified.getTime();
        if (dormantTime > thresholdMs) {
          dormant.push({
            id: project.id,
            name: project.name,
            days_dormant: Math.floor(dormantTime / (24 * 60 * 60 * 1000)),
            last_modified: project.modificationDate,
            task_count: project.taskCount,
            available_tasks: project.availableTaskCount,
          });
        }
      }
    }

    dormant.sort((a, b) => b.days_dormant - a.days_dormant);

    return {
      type: 'dormant_projects',
      severity: dormant.length > 5 ? 'warning' : 'info',
      count: dormant.length,
      items: dormant.slice(0, 10),
      recommendation:
        dormant.length > 0
          ? `${dormant.length} projects haven't been modified in over ${thresholdDays} days. Consider reviewing, completing, or dropping them.`
          : 'All projects show recent activity.',
    };
  }

  private auditTags(tasks: SlimTask[], allTags: TagData[] = []): PatternFinding {
    const tagStats = new Map<string, number>();
    const tagProjects = new Map<string, Set<string>>();

    for (const tag of allTags) {
      tagStats.set(tag.name, tag.taskCount || 0);
    }

    this.indexTaskTags(tasks, tagStats, tagProjects);

    const findings = this.classifyTags(tagStats, tagProjects);

    this.detectSynonyms(tagStats, findings);
    const entropy = this.calculateTagEntropy(tagStats);

    const severity = findings.underused_tags.length > 10 || findings.potential_synonyms.length > 5 ? 'warning' : 'info';
    const entropyInterpretation = this.interpretEntropy(entropy);

    return {
      type: 'tag_audit',
      severity,
      count: tagStats.size,
      items: {
        ...findings,
        entropy: entropy.toFixed(2),
        entropy_interpretation: entropyInterpretation,
      },
      recommendation: this.generateTagRecommendation(findings),
    };
  }

  private indexTaskTags(tasks: SlimTask[], tagStats: Map<string, number>, tagProjects: Map<string, Set<string>>): void {
    for (const task of tasks) {
      for (const tag of task.tags) {
        if (!tagStats.has(tag)) {
          tagStats.set(tag, 0);
        }
        if (task.projectId) {
          if (!tagProjects.has(tag)) {
            tagProjects.set(tag, new Set());
          }
          tagProjects.get(tag)!.add(task.projectId);
        }
      }
    }
  }

  private classifyTags(
    tagStats: Map<string, number>,
    tagProjects: Map<string, Set<string>>,
  ): {
    total_tags: number;
    unused_tags: string[];
    underused_tags: Array<{ tag: string; count: number }>;
    overused_tags: Array<{ tag: string; count: number; project_spread: number }>;
    potential_synonyms: Array<{ tag1: string; tag2: string; similarity: number; combined_usage: number }>;
  } {
    const findings = {
      total_tags: tagStats.size,
      unused_tags: [] as string[],
      underused_tags: [] as Array<{ tag: string; count: number }>,
      overused_tags: [] as Array<{ tag: string; count: number; project_spread: number }>,
      potential_synonyms: [] as Array<{ tag1: string; tag2: string; similarity: number; combined_usage: number }>,
    };

    for (const [tag, count] of tagStats) {
      if (count === 0) {
        findings.unused_tags.push(tag);
      } else if (count < 3) {
        findings.underused_tags.push({ tag, count });
      } else if (count > 100) {
        findings.overused_tags.push({ tag, count, project_spread: tagProjects.get(tag)?.size || 0 });
      }
    }

    return findings;
  }

  private interpretEntropy(entropy: number): string {
    if (entropy < 2) return 'Low diversity - consider more tags';
    if (entropy > 5) return 'High diversity - consider consolidation';
    return 'Moderate diversity';
  }

  private detectSynonyms(
    tagStats: Map<string, number>,
    findings: { potential_synonyms: Array<{ tag1: string; tag2: string; similarity: number; combined_usage: number }> },
  ): void {
    const tagNames = Array.from(tagStats.keys());
    for (let i = 0; i < tagNames.length - 1; i++) {
      for (let j = i + 1; j < tagNames.length; j++) {
        const similarity = this.calculateSimilarity(tagNames[i], tagNames[j]);
        if (similarity > 0.8 && similarity < 1.0) {
          findings.potential_synonyms.push({
            tag1: tagNames[i],
            tag2: tagNames[j],
            similarity,
            combined_usage: (tagStats.get(tagNames[i]) || 0) + (tagStats.get(tagNames[j]) || 0),
          });
        }
      }
    }
  }

  private calculateTagEntropy(tagStats: Map<string, number>): number {
    const totalTagUsage = Array.from(tagStats.values()).reduce((a, b) => a + b, 0);
    if (totalTagUsage === 0) return 0;
    let entropy = 0;
    for (const count of tagStats.values()) {
      const p = count / totalTagUsage;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  private generateTagRecommendation(findings: {
    underused_tags: Array<{ tag: string; count: number }>;
    potential_synonyms: Array<{ tag1: string; tag2: string; similarity: number }>;
    overused_tags: Array<{ tag: string; count: number; project_spread: number }>;
  }): string {
    const recommendations: string[] = [];
    if (findings.underused_tags.length > 5) {
      recommendations.push(
        `${findings.underused_tags.length} tags are rarely used. Consider removing or merging them.`,
      );
    }
    if (findings.potential_synonyms.length > 0) {
      recommendations.push(`Found ${findings.potential_synonyms.length} potential tag synonyms that could be merged.`);
    }
    if (findings.overused_tags.length > 0) {
      recommendations.push(
        `${findings.overused_tags.length} tags are heavily used. Consider creating more specific sub-tags.`,
      );
    }
    return recommendations.length > 0 ? recommendations.join(' ') : 'Tag usage appears well-balanced.';
  }

  private analyzeDeadlines(tasks: SlimTask[]): PatternFinding {
    const now = new Date();
    const findings: {
      overdue: Array<{ id: string; name: string; project?: string; days_overdue: number }>;
      due_today: Array<{ id: string; name: string }>;
      due_this_week: Array<{ id: string; name: string; days_until: number }>;
      deadline_bunching: Map<string, number>;
    } = {
      overdue: [],
      due_today: [],
      due_this_week: [],
      deadline_bunching: new Map<string, number>(),
    };

    for (const task of tasks) {
      if (task.completed) continue;
      if (!task.dueDate) continue;

      const dueDate = new Date(task.dueDate);
      const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      if (daysUntilDue < 0) {
        findings.overdue.push({
          id: task.id,
          name: task.name,
          project: task.project,
          days_overdue: Math.abs(daysUntilDue),
        });
      } else if (daysUntilDue === 0) {
        findings.due_today.push({ id: task.id, name: task.name });
      } else if (daysUntilDue <= 7) {
        findings.due_this_week.push({ id: task.id, name: task.name, days_until: daysUntilDue });
      }

      const dateKey = dueDate.toISOString().split('T')[0];
      findings.deadline_bunching.set(dateKey, (findings.deadline_bunching.get(dateKey) || 0) + 1);
    }

    const bunchedEntries: Array<[string, number]> = Array.from(findings.deadline_bunching.entries());
    const bunchedDates = bunchedEntries.filter(([_, count]) => count > 5).sort((a, b) => b[1] - a[1]);

    const overdueLevel = findings.overdue.length > 5 ? 'warning' : 'info';
    const severity = findings.overdue.length > 10 ? 'critical' : overdueLevel;

    const deadlineInfo = {
      overdue_count: findings.overdue.length,
      overdue_samples: findings.overdue.slice(0, 5),
      due_today_count: findings.due_today.length,
      due_this_week_count: findings.due_this_week.length,
      bunched_dates: bunchedDates.slice(0, 5).map(([date, count]) => ({ date, task_count: count })),
    };

    return {
      type: 'deadline_health',
      severity,
      count: findings.overdue.length,
      items: deadlineInfo,
      recommendation: this.generateDeadlineRecommendation(findings, bunchedDates),
    };
  }

  private generateDeadlineRecommendation(
    findings: { overdue: unknown[] },
    bunchedDates: Array<[string, number]>,
  ): string {
    const recommendations: string[] = [];
    if (findings.overdue.length > 5) {
      recommendations.push(`${findings.overdue.length} tasks are overdue. Prioritize or reschedule them.`);
    }
    if (bunchedDates.length > 0) {
      recommendations.push(`${bunchedDates.length} dates have 5+ tasks due. Consider spreading deadlines more evenly.`);
    }
    return recommendations.length > 0 ? recommendations.join(' ') : 'Deadline distribution looks manageable.';
  }

  private analyzeWaitingFor(tasks: SlimTask[]): PatternFinding {
    const waitingPatterns = [
      /waiting/i,
      /wait for/i,
      /blocked by/i,
      /depends on/i,
      /after/i,
      /once .* complete/i,
      /pending/i,
    ];

    const waitingTasks: Array<{
      id: string;
      name: string;
      project?: string;
      reason: 'name_pattern' | 'tag' | 'blocked';
      days_waiting: number;
    }> = [];

    for (const task of tasks) {
      if (task.completed) continue;

      const isWaiting = waitingPatterns.some((pattern) => pattern.test(task.name));
      const hasWaitingTag = task.tags.some((tag) => /wait/i.test(tag) || /pending/i.test(tag) || /blocked/i.test(tag));
      const isBlocked = task.status === 'blocked' || (task.children && task.children > 0);

      if (isWaiting || hasWaitingTag || isBlocked) {
        const daysWaiting = task.createdDate
          ? Math.floor((Date.now() - new Date(task.createdDate).getTime()) / (24 * 60 * 60 * 1000))
          : 0;
        const tagOrBlocked = hasWaitingTag ? 'tag' : 'blocked';
        const waitingReason: 'name_pattern' | 'tag' | 'blocked' = isWaiting ? 'name_pattern' : tagOrBlocked;

        waitingTasks.push({
          id: task.id,
          name: task.name,
          project: task.project,
          reason: waitingReason,
          days_waiting: daysWaiting,
        });
      }
    }

    waitingTasks.sort((a, b) => b.days_waiting - a.days_waiting);

    const severity = waitingTasks.filter((t) => t.days_waiting > 30).length > 5 ? 'warning' : 'info';

    return {
      type: 'waiting_for',
      severity,
      count: waitingTasks.length,
      items: waitingTasks.slice(0, 10),
      recommendation:
        waitingTasks.length > 10
          ? `${waitingTasks.length} tasks appear to be waiting. Review blockers and follow up on dependencies.`
          : 'Waiting/blocked tasks are at reasonable levels.',
    };
  }

  private analyzeEstimationBias(tasks: SlimTask[]): PatternFinding {
    const estimatedTasks = tasks.filter((t) => t.estimatedMinutes && t.completed && t.completionDate);

    if (estimatedTasks.length < 10) {
      return {
        type: 'estimation_bias',
        severity: 'info',
        count: 0,
        recommendation: 'Not enough completed tasks with estimates to analyze bias.',
      };
    }

    const estimates = tasks.filter((t) => t.estimatedMinutes).map((t) => t.estimatedMinutes!);

    if (estimates.length === 0) {
      return {
        type: 'estimation_bias',
        severity: 'info',
        count: 0,
        recommendation: 'No tasks have time estimates. Consider adding estimates for better planning.',
      };
    }

    const stats = {
      count: estimates.length,
      min: Math.min(...estimates),
      max: Math.max(...estimates),
      mean: estimates.reduce((a, b) => a + b, 0) / estimates.length,
      median: [...estimates].sort((a, b) => a - b)[Math.floor(estimates.length / 2)],
    };

    const patterns: string[] = [];

    const commonEstimates = estimates.filter((e) => e === 30 || e === 60);
    if (commonEstimates.length > estimates.length * 0.5) {
      patterns.push('Over-reliance on 30/60 minute estimates');
    }
    if (stats.min >= 30) {
      patterns.push('No tasks under 30 minutes - consider breaking down work');
    }
    if (stats.max > stats.mean * 10) {
      patterns.push('Very large tasks detected - consider decomposition');
    }

    return {
      type: 'estimation_bias',
      severity: patterns.length > 1 ? 'warning' : 'info',
      count: estimates.length,
      items: { stats, patterns },
      recommendation:
        patterns.length > 0
          ? `Estimation patterns suggest: ${patterns.join(', ')}`
          : 'Time estimation distribution looks reasonable.',
    };
  }

  private generatePatternSummary(
    findings: Record<string, PatternFinding>,
    data: { tasks: SlimTask[]; projects: ProjectData[] },
  ): {
    health_score: number;
    health_rating: string;
    total_tasks_analyzed: number;
    total_projects_analyzed: number;
    patterns_analyzed: number;
    critical_findings: number;
    warning_findings: number;
    key_insights: string[];
  } {
    const criticalCount = Object.values(findings).filter((f) => f.severity === 'critical').length;
    const warningCount = Object.values(findings).filter((f) => f.severity === 'warning').length;

    const keyInsights: string[] = [];
    for (const [key, finding] of Object.entries(findings)) {
      if (finding.severity === 'critical' || finding.severity === 'warning') {
        keyInsights.push(finding.recommendation || `${key}: ${finding.count} issues found`);
      }
    }

    const healthScore = Math.max(0, 100 - criticalCount * 20 - warningCount * 10);

    const fairOrNeedsAttention = healthScore >= 60 ? 'Fair' : 'Needs Attention';
    return {
      health_score: healthScore,
      health_rating: healthScore >= 80 ? 'Good' : fairOrNeedsAttention,
      total_tasks_analyzed: data.tasks.length,
      total_projects_analyzed: data.projects.length,
      patterns_analyzed: Object.keys(findings).length,
      critical_findings: criticalCount,
      warning_findings: warningCount,
      key_insights: keyInsights.slice(0, 5),
    };
  }

  // =========================================================================
  // Workflow Analysis
  // =========================================================================

  private async executeWorkflowAnalysis(
    _compiled: Extract<CompiledAnalysis, { type: 'workflow_analysis' }>,
  ): Promise<unknown> {
    const timer = new OperationTimerV2();
    const wfLogger = createLogger('workflow_analysis');

    try {
      // OMN-200: 'full' — workflow_analysis always scans the entire task DB (the
      // 1000-task cap and its unreachable 'deep' branch were removed). The label is
      // informational only; it no longer gates any behavior.
      const analysisDepth = 'full';
      const focusAreas = ['productivity', 'workload', 'bottlenecks'];
      const maxInsights = 15;
      const includeRawData = false;

      wfLogger.info(`Starting workflow analysis with depth: ${analysisDepth}, focus: ${focusAreas.join(', ')}`);

      const cacheKey = `workflow_analysis_${analysisDepth}_${[...focusAreas].sort((a, b) => a.localeCompare(b)).join('_')}_${maxInsights}`;

      const cached = this.cache.get<{
        insights?: Array<string | { insight?: string; message?: string }>;
        recommendations?: Array<string | { recommendation?: string; message?: string }>;
        patterns?: unknown[];
        metadata?: Record<string, unknown>;
      }>('analytics', cacheKey);
      if (cached) {
        wfLogger.debug('Returning cached workflow analysis');
        return createAnalyticsResponseV2(
          'workflow_analysis',
          cached,
          'Workflow Analysis Results',
          this.extractWorkflowKeyFindings(cached),
          {
            from_cache: true,
            analysis_depth: analysisDepth,
            focus_areas: focusAreas,
            ...timer.toMetadata(),
          },
        );
      }

      const script = this.omniAutomation.buildScript(WORKFLOW_ANALYSIS_V3, {
        options: { analysisDepth, focusAreas, maxInsights, includeRawData },
      });

      const result = await this.execJson(script, WORKFLOW_ANALYSIS_V3_SCHEMA);

      if (isScriptError(result)) {
        return createErrorResponseV2(
          'workflow_analysis',
          'ANALYSIS_FAILED',
          result.error || 'Script execution failed',
          'Check that OmniFocus has sufficient data for analysis',
          result.details,
          timer.toMetadata(),
        );
      }

      // OMN-194: typed unwrap — execJson validates the full envelope; .data is the payload.
      const v3Data: WorkflowAnalysisV3Data | null = isScriptSuccess(result) ? result.data.data : null;

      if (!v3Data) {
        return createErrorResponseV2(
          'workflow_analysis',
          'NO_DATA',
          'No workflow analysis data returned from OmniFocus',
          'Ensure OmniFocus has tasks and projects to analyze',
          { scriptData: null },
          timer.toMetadata(),
        );
      }

      const responseData = {
        analysis: {
          depth: analysisDepth,
          focusAreas,
          timestamp: new Date().toISOString(),
        },
        insights: v3Data.insights || [],
        patterns: v3Data.patterns || {},
        recommendations: v3Data.recommendations || [],
        data: includeRawData ? v3Data.data : undefined,
        metadata: {
          totalTasks: v3Data.totalTasks || 0,
          totalProjects: v3Data.totalProjects || 0,
          analysisTime: v3Data.analysisTime || 0,
          dataPoints: v3Data.dataPoints || 0,
          method: v3Data.metadata?.method || 'omnijs_v3',
          optimization: v3Data.metadata?.optimization || 'v3',
        },
      };

      this.cache.set('analytics', cacheKey, responseData);

      const keyFindings = this.extractWorkflowKeyFindings(responseData);

      return createAnalyticsResponseV2('workflow_analysis', responseData, 'Workflow Analysis Results', keyFindings, {
        analysis_depth: analysisDepth,
        focus_areas: focusAreas,
        include_raw_data: includeRawData,
        ...timer.toMetadata(),
      });
    } catch (error) {
      wfLogger.error('Workflow analysis failed', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // OMN-200: suggestions are actionable. analysisDepth and focusAreas are not
      // user-configurable (both hardcoded; the old 'quick'/'standard'/'deep' knob
      // never existed on this tool), so don't tell users to tune them.
      let suggestion = 'Retry; if it persists, your task database may be very large or OmniFocus may be busy';
      let errorCode = 'EXECUTION_ERROR';

      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorCode = 'SCRIPT_TIMEOUT';
        suggestion =
          'workflow_analysis scans the entire task database and exceeded the 120s script timeout — your DB may be unusually large. Retry, and report it if it recurs so the per-task loop can be profiled';
      } else if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
        errorCode = 'OMNIFOCUS_NOT_RUNNING';
        suggestion = 'Start OmniFocus and ensure it is running';
      } else if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
        errorCode = 'PERMISSION_DENIED';
        suggestion = 'Enable automation access in System Settings > Privacy & Security > Automation';
      } else if (errorMessage.includes('insufficient data') || errorMessage.includes('no data')) {
        errorCode = 'INSUFFICIENT_DATA';
        suggestion = 'Add more tasks and projects to OmniFocus before running workflow analysis';
      }

      return createErrorResponseV2(
        'workflow_analysis',
        errorCode,
        'Failed to execute workflow analysis',
        suggestion,
        error instanceof Error ? error.message : String(error),
        timer.toMetadata(),
      );
    }
  }

  private extractWorkflowKeyFindings(data: {
    insights?: Array<string | { category?: string; insight?: string; message?: string; priority?: string }>;
    recommendations?: Array<
      string | { category?: string; recommendation?: string; message?: string; priority?: string }
    >;
    patterns?: unknown;
    metadata?: { score?: number; totalTasks?: number; totalProjects?: number };
  }): string[] {
    const findings: string[] = [];

    if (data.insights && Array.isArray(data.insights)) {
      findings.push(
        ...(data.insights as unknown[]).slice(0, 3).map((i) => {
          if (typeof i === 'string') return i;
          if (typeof i === 'object' && i !== null) {
            const insight =
              (i as { insight?: string; message?: string }).insight ||
              (i as { insight?: string; message?: string }).message;
            return insight || JSON.stringify(i);
          }
          return JSON.stringify(i);
        }),
      );
    }

    if (data.recommendations && Array.isArray(data.recommendations)) {
      findings.push(
        ...(data.recommendations as unknown[]).slice(0, 2).map((r) => {
          if (typeof r === 'string') return r;
          if (typeof r === 'object' && r !== null) {
            const rec =
              (r as { recommendation?: string; message?: string }).recommendation ||
              (r as { recommendation?: string; message?: string }).message;
            return rec || JSON.stringify(r);
          }
          return JSON.stringify(r);
        }),
      );
    }

    if (data.patterns && typeof data.patterns === 'object') {
      const patternCount = Object.keys(data.patterns).length;
      if (patternCount > 0) {
        findings.push(`Found ${patternCount} pattern categories in your workflow`);
      }
    }

    if (data.metadata?.totalTasks && data.metadata.totalTasks > 0) {
      findings.push(`Analyzed ${data.metadata.totalTasks} tasks across ${data.metadata.totalProjects || 0} projects`);
    }

    return findings.length > 0 ? findings : ['Analysis completed successfully'];
  }

  // =========================================================================
  // Recurring Tasks
  // =========================================================================

  private async executeRecurringTasks(
    compiled: Extract<CompiledAnalysis, { type: 'recurring_tasks' }>,
  ): Promise<unknown> {
    const timer = new OperationTimerV2();
    const operation = compiled.params?.operation ?? 'analyze';

    try {
      switch (operation) {
        case 'analyze':
          return await this.executeRecurringAnalyze(compiled, timer);
        case 'patterns':
          return await this.executeRecurringPatterns(timer);
        default:
          return createErrorResponseV2(
            'recurring_tasks',
            'INVALID_OPERATION',
            `Invalid operation: ${String(operation)}`,
            undefined,
            { operation },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleErrorV2(error);
    }
  }

  private async executeRecurringAnalyze(
    compiled: Extract<CompiledAnalysis, { type: 'recurring_tasks' }>,
    timer: OperationTimerV2,
  ): Promise<unknown> {
    const analyzeOptions = {
      activeOnly: true,
      includeCompleted: false,
      includeDropped: false,
      includeHistory: false,
      sortBy: (compiled.params?.sortBy === 'nextDue' ? 'dueDate' : compiled.params?.sortBy) as
        | 'name'
        | 'dueDate'
        | 'frequency'
        | 'project'
        | undefined,
    };

    const analyzeCacheKey = `recurring_${JSON.stringify(analyzeOptions)}`;
    const cachedAnalysis = this.cache.get('analytics', analyzeCacheKey);
    if (cachedAnalysis) {
      return cachedAnalysis;
    }

    const generatedScript = buildRecurringTasksScript(analyzeOptions);
    const result = await this.execJson(generatedScript.script, RECURRING_TASKS_SCHEMA);

    if (isScriptError(result)) {
      return createErrorResponseV2(
        'recurring_tasks',
        'SCRIPT_ERROR',
        result.error || 'Analysis failed',
        'Check error details',
        result.details,
        timer.toMetadata(),
      );
    }

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'recurring_tasks',
        'UNEXPECTED_RESULT',
        'Unexpected script result format',
        undefined,
        { result },
        timer.toMetadata(),
      );
    }

    const envelope = result.data as {
      ok?: boolean;
      v?: string;
      tasks?: unknown[];
      summary?: Record<string, unknown>;
    };
    const analyzeResult = {
      tasks: envelope.tasks || [],
      summary: envelope.summary || {},
    };

    const analyzeResponse = createSuccessResponseV2(
      'recurring_tasks',
      {
        recurringTasks: analyzeResult.tasks as RecurringTaskV2[],
        summary: analyzeResult.summary as { totalRecurring: number; byFrequency?: Record<string, number> },
      },
      undefined,
      {
        ...timer.toMetadata(),
        operation: 'analyze',
        filters_applied: analyzeOptions,
        total_analyzed: analyzeResult.tasks?.length || 0,
        optimization: 'ast_phase4',
      },
    );

    this.cache.set('analytics', analyzeCacheKey, analyzeResponse);
    return analyzeResponse;
  }

  private async executeRecurringPatterns(timer: OperationTimerV2): Promise<unknown> {
    const patternsOptions = { activeOnly: true, includeCompleted: false, includeDropped: false };

    const patternsCacheKey = `recurring_patterns_${JSON.stringify(patternsOptions)}`;
    const cachedPatterns = this.cache.get('analytics', patternsCacheKey);
    if (cachedPatterns) {
      return cachedPatterns;
    }

    const patternsScript = this.omniAutomation.buildScript(GET_RECURRING_PATTERNS_SCRIPT, {
      options: patternsOptions,
    });
    const patternsScriptResult = await this.execJson(patternsScript, RecurringPatternsSchema);

    if (isScriptError(patternsScriptResult)) {
      return createErrorResponseV2(
        'recurring_tasks',
        'SCRIPT_ERROR',
        patternsScriptResult.error || 'Pattern analysis failed',
        'Check error details',
        patternsScriptResult.details,
        timer.toMetadata(),
      );
    }

    if (!isScriptSuccess(patternsScriptResult)) {
      return createErrorResponseV2(
        'recurring_tasks',
        'UNEXPECTED_RESULT',
        'Unexpected script result format',
        undefined,
        { result: patternsScriptResult },
        timer.toMetadata(),
      );
    }

    const patternsResult = patternsScriptResult.data as {
      totalRecurring: number;
      patterns: unknown[];
      byProject: unknown[];
      mostCommon: Record<string, unknown>;
    };

    const insights = this.generateRecurringPatternInsights(patternsResult);

    const patternsResponse = createSuccessResponseV2(
      'recurring_tasks',
      {
        recurringTasks: [] as RecurringTaskV2[],
        summary: { totalRecurring: patternsResult.totalRecurring, byFrequency: {} as Record<string, number> },
        patterns: {} as Record<string, RecurringTaskV2[]>,
        byProject: patternsResult.byProject || [],
        mostCommon: patternsResult.mostCommon,
        insights,
      },
      undefined,
      {
        ...timer.toMetadata(),
        operation: 'patterns',
        filters_applied: patternsOptions,
        patterns_found: patternsResult.patterns?.length || 0,
      },
    );

    this.cache.set('analytics', patternsCacheKey, patternsResponse);
    return patternsResponse;
  }

  private generateRecurringPatternInsights(patternsResult: {
    totalRecurring: number;
    patterns: unknown[];
    byProject: unknown[];
    mostCommon: Record<string, unknown>;
  }): string[] {
    const insights: string[] = [];
    if (patternsResult.totalRecurring === 0) {
      insights.push('No recurring tasks found in your OmniFocus database');
      return insights;
    }

    if (patternsResult.mostCommon) {
      insights.push(
        `Most common recurrence pattern: ${(patternsResult.mostCommon as { pattern?: string }).pattern} (${(patternsResult.mostCommon as { count?: number }).count} tasks)`,
      );
    }
    if (patternsResult.patterns && patternsResult.patterns.length > 0) {
      insights.push(`Found ${patternsResult.patterns.length} different recurrence patterns`);
      const weeklyCount = patternsResult.patterns.filter(
        (p: unknown) => (p as { pattern?: string }).pattern && (p as { pattern?: string }).pattern?.includes('week'),
      ).length;
      const dailyCount = patternsResult.patterns.filter(
        (p: unknown) => (p as { pattern?: string }).pattern && (p as { pattern?: string }).pattern?.includes('day'),
      ).length;
      const monthlyCount = patternsResult.patterns.filter(
        (p: unknown) => (p as { pattern?: string }).pattern && (p as { pattern?: string }).pattern?.includes('month'),
      ).length;
      if (weeklyCount > 0) insights.push(`${weeklyCount} weekly patterns found`);
      if (dailyCount > 0) insights.push(`${dailyCount} daily patterns found`);
      if (monthlyCount > 0) insights.push(`${monthlyCount} monthly patterns found`);
    }
    if (patternsResult.byProject && patternsResult.byProject.length > 0) {
      const projectWithMostRecurring = patternsResult.byProject[0];
      insights.push(
        `Project "${(projectWithMostRecurring as { project?: string }).project}" has the most recurring tasks (${(projectWithMostRecurring as { count?: number }).count})`,
      );
    }

    return insights;
  }

  // =========================================================================
  // Parse Meeting Notes
  // =========================================================================

  private async executeParseMeetingNotes(
    compiled: Extract<CompiledAnalysis, { type: 'parse_meeting_notes' }>,
  ): Promise<unknown> {
    const timer = new OperationTimerV2();

    // OMN-124: structured items[] is the preferred path — the caller (LLM) has
    // already extracted the action items, and the tool does the read-only
    // pre-flight (resolve/dedupe/classify) and emits a ready batch payload.
    // The schema guarantees exactly one of items|text.
    if (compiled.params.items && compiled.params.items.length > 0) {
      return this.parseStructuredItems(compiled.params, timer);
    }

    try {
      const input = compiled.params.text ?? '';
      const taskMode = compiled.params.extractTasks ? 'action_items' : 'both';
      const extractMode = compiled.params.extractTasks !== undefined ? taskMode : 'both';
      const defaultProject = compiled.params.defaultProject ?? undefined;
      const defaultTags = compiled.params.defaultTags;

      this.logger.info('Parsing meeting notes', {
        inputLength: input.length,
        extractMode,
      });

      const args = {
        input,
        extractMode: extractMode as 'action_items' | 'projects' | 'both',
        suggestProjects: true,
        suggestTags: true,
        suggestDueDates: true,
        suggestEstimates: true,
        returnFormat: 'preview' as const,
        groupByProject: true,
        existingProjects: undefined as string[] | undefined,
        defaultProject,
        defaultTags,
      };

      const extracted = this.extractActionItems(input, args);

      const result = this.formatPreview(extracted, args);

      return createSuccessResponseV2('parse_meeting_notes', result, undefined, timer.toMetadata());
    } catch (error) {
      this.logger.error('Parse meeting notes failed', { error });
      return createErrorResponseV2(
        'parse_meeting_notes',
        'PARSE_ERROR',
        error instanceof Error ? error.message : 'Failed to parse meeting notes',
        'Check that the input text contains actionable items',
        undefined,
        timer.toMetadata(),
      );
    }
  }

  // =========================================================================
  // OMN-124: structured items[] — read-only pre-flight
  // =========================================================================

  /**
   * The caller (an LLM) has already extracted action items into `items[]`. This
   * path does NOT do NLP — it does what only the server can: read the live
   * database to resolve project names, dedupe against existing tasks, and
   * classify tags existing-vs-new, then hand back an `omnifocus_write { batch }`
   * payload that round-trips unchanged. Creation stays in the write tool; this
   * stays read-only.
   */
  private async parseStructuredItems(
    params: Extract<CompiledAnalysis, { type: 'parse_meeting_notes' }>['params'],
    timer: OperationTimerV2,
  ): Promise<unknown> {
    try {
      const items = params.items ?? [];
      const validate = params.validateAgainstExisting !== false; // default true
      const defaultProject = params.defaultProject ?? null;
      const defaultTags = params.defaultTags ?? [];

      this.logger.info('Parsing structured meeting items', { count: items.length, validate });

      // OMN-204: collect pre-flight read failures here instead of swallowing them.
      // A failed read silently degrades to "nothing exists" (no projects/tags/dups),
      // which looks like correct output — the OMN-125 silent-dedupe bug. Surface it.
      const warnings: string[] = [];
      let existingProjects: string[] = [];
      let existingTags = new Set<string>();
      let existingTasks: Array<{ name: string; project: string | null }> = [];
      if (validate) {
        // OMN-126: scope the dedup read to the requested target project(s) + inbox.
        // Each named scope reads ONLY that project's own task subtree
        // (`project.flattenedTasks`, ~0.3s — see readScopedIncompleteTasks), NOT a
        // filter over the global `flattenedTasks`, which hits the ~10s whole-DB
        // iteration floor PER scope and, fanned out over N distinct projects,
        // serializes on OmniFocus's single automation channel past the osascript
        // timeout. The duplicate comparison (findDuplicateTask) is already against
        // `project.requested` and compares names case-insensitively, so scoping the
        // candidate read changes no match results.
        //
        // The scoped read resolves the project name case-insensitively itself, so
        // `existingProjects` is needed only for the preview's project.match — a
        // failed projects read degrades that preview, never the dedup read.
        // scopeProjects derives purely from items/defaultProject (not existingProjects),
        // so all three pre-flight reads run concurrently — no sequential dependency.
        const scopeProjects = [...new Set(items.map((item) => this.requestedScope(item, defaultProject)))];
        [existingProjects, existingTags, existingTasks] = await Promise.all([
          this.fetchExistingProjectNames(warnings),
          this.fetchExistingTagNames(warnings),
          this.fetchExistingIncompleteTasks(warnings, scopeProjects),
        ]);
      }

      const previewItems = items.map((item) => {
        const requestedProject = this.requestedScope(item, defaultProject);
        const combinedTags = [...new Set([...(item.tags ?? []), ...defaultTags])];

        const project = this.resolveProjectName(requestedProject, existingProjects, validate);
        const tags = this.classifyItemTags(combinedTags, existingTags, validate);
        // Dedup against the project the task will ACTUALLY be created in
        // (buildBatchCreateData uses project.requested). For a 'partial' match,
        // resolved is a different, existing project — scoping dedup there would
        // check the wrong project. exact/inbox: requested === resolved anyway.
        const duplicateOf = validate ? this.findDuplicateTask(item.name, project.requested, existingTasks) : null;

        return {
          name: item.name,
          project,
          tags,
          combinedTags,
          dueDate: item.dueDate,
          deferDate: item.deferDate,
          estimatedMinutes: item.estimatedMinutes,
          flagged: item.flagged,
          note: item.note,
          duplicateOf,
          readyToCreate: !duplicateOf,
        };
      });

      const operations = previewItems
        .filter((p) => p.readyToCreate)
        .map((p) => ({
          operation: 'create' as const,
          target: 'task' as const,
          data: this.buildBatchCreateData(p),
        }));

      const newProjects = [
        ...new Set(
          previewItems
            .filter((p) => p.project.match === 'none' && typeof p.project.requested === 'string')
            .map((p) => p.project.requested as string),
        ),
      ];
      const newTags = [...new Set(previewItems.flatMap((p) => p.tags.new))];

      const baseNextSteps =
        operations.length > 0
          ? 'Review the preview (duplicateOf, project.match==="none", tags.new), then send batchPayload to omnifocus_write { mutation: { operation: "batch", operations } } — try dryRun:true first.'
          : 'No items ready to create (all were duplicates). Review duplicateOf entries.';

      const result = {
        mode: 'structured' as const,
        // Strip the internal combinedTags helper from the surfaced shape.
        items: previewItems.map(({ combinedTags: _omit, ...rest }) => rest),
        unparsed: [] as string[],
        // OMN-204: pre-flight read failures, surfaced rather than swallowed. Empty
        // when validation is skipped or every read succeeded.
        warnings,
        summary: {
          total: previewItems.length,
          readyToCreate: operations.length,
          needsReview: previewItems.filter(
            (p) => Boolean(p.duplicateOf) || p.project.match === 'none' || p.tags.new.length > 0,
          ).length,
          duplicates: previewItems.filter((p) => Boolean(p.duplicateOf)).length,
          newProjects: validate ? newProjects.length : null,
          newTags: validate ? newTags.length : null,
          unparsedCount: 0,
          warnings: warnings.length,
        },
        batchPayload: { operations },
        nextSteps:
          warnings.length > 0
            ? `⚠️ ${warnings.length} pre-flight read(s) failed (see warnings[]) — project/tag/dedupe validation may be incomplete; treat readyToCreate with caution. ${baseNextSteps}`
            : baseNextSteps,
      };

      return createSuccessResponseV2('parse_meeting_notes', result, undefined, timer.toMetadata());
    } catch (error) {
      this.logger.error('Parse structured meeting items failed', { error });
      return createErrorResponseV2(
        'parse_meeting_notes',
        'PARSE_ERROR',
        error instanceof Error ? error.message : 'Failed to process structured items',
        'Check that each item has a non-empty name; set validateAgainstExisting:false to skip DB reads',
        undefined,
        timer.toMetadata(),
      );
    }
  }

  /**
   * The project a structured item targets: `item.project`, else `defaultProject`,
   * else the inbox (`null`). An empty-string project is treated as inbox (`null`),
   * NOT a project literally named '' — otherwise the scoped dedup read would filter
   * on `name === ''` (zero matches) and silently miss inbox duplicates (review ①).
   * Used at both the scope-building and per-item preview sites so the two never
   * diverge on what "the requested project" is.
   */
  private requestedScope(item: { project?: string | null }, defaultProject: string | null): string | null {
    const p = item.project ?? defaultProject ?? null;
    return p === '' ? null : p;
  }

  /** Resolve a requested project name against existing projects (case-insensitive). */
  private resolveProjectName(
    requested: string | null,
    existing: string[],
    validate: boolean,
  ): { requested: string | null; resolved: string | null; match: 'exact' | 'partial' | 'none' | 'unchecked' } {
    if (!validate) return { requested, resolved: requested, match: 'unchecked' };
    if (requested === null) return { requested: null, resolved: null, match: 'exact' }; // inbox is always valid

    const lower = requested.toLowerCase();
    const exact = existing.find((p) => p.toLowerCase() === lower);
    if (exact) return { requested, resolved: exact, match: 'exact' };

    const partial = existing.find((p) => p.toLowerCase().includes(lower) || lower.includes(p.toLowerCase()));
    if (partial) return { requested, resolved: partial, match: 'partial' };

    return { requested, resolved: requested, match: 'none' };
  }

  /** Split tags into those that already exist vs those that would be created. */
  private classifyItemTags(
    tags: string[],
    existing: Set<string>,
    validate: boolean,
  ): { existing: string[]; new: string[] } {
    if (!validate) return { existing: [], new: tags };
    const lowerExisting = new Set([...existing].map((t) => t.toLowerCase()));
    const have: string[] = [];
    const fresh: string[] = [];
    for (const tag of tags) {
      (lowerExisting.has(tag.toLowerCase()) ? have : fresh).push(tag);
    }
    return { existing: have, new: fresh };
  }

  /** Find an existing incomplete task with the same name in the target project. */
  private findDuplicateTask(
    name: string,
    resolvedProject: string | null,
    existing: Array<{ name: string; project: string | null }>,
  ): { name: string; project: string | null } | null {
    const lowerName = name.toLowerCase();
    const targetProject = resolvedProject?.toLowerCase() ?? null;
    const dup = existing.find(
      (t) => t.name.toLowerCase() === lowerName && (t.project?.toLowerCase() ?? null) === targetProject,
    );
    return dup ? { name: dup.name, project: dup.project } : null;
  }

  /** Build a batch `create` data object, omitting undefined optional fields. */
  private buildBatchCreateData(p: {
    name: string;
    project: { requested: string | null; resolved: string | null };
    combinedTags: string[];
    dueDate?: string;
    deferDate?: string;
    estimatedMinutes?: number;
    flagged?: boolean;
    note?: string;
  }): Record<string, unknown> {
    const data: Record<string, unknown> = { name: p.name };
    // Use the requested project name (literal caller intent); preview.project.match
    // tells the human whether it already exists.
    if (typeof p.project.requested === 'string' && p.project.requested.length > 0) {
      data.project = p.project.requested;
    }
    if (p.combinedTags.length > 0) data.tags = p.combinedTags;
    if (p.dueDate !== undefined) data.dueDate = p.dueDate;
    if (p.deferDate !== undefined) data.deferDate = p.deferDate;
    if (p.estimatedMinutes !== undefined) data.estimatedMinutes = p.estimatedMinutes;
    if (p.flagged !== undefined) data.flagged = p.flagged;
    if (p.note !== undefined) data.note = p.note;
    return data;
  }

  /**
   * Read existing project names (lite, no stats) for the preview's project.match
   * classification. Warns + returns [] on script error (OMN-204). NOTE: the dedup
   * read no longer depends on this — readScopedIncompleteTasks resolves each project
   * name case-insensitively itself — so a failed projects read degrades only the
   * preview's match labels, never duplicate detection.
   */
  private async fetchExistingProjectNames(warnings: string[]): Promise<string[]> {
    const gen = buildFilteredProjectsScript({}, { limit: 1000, includeStats: false, performanceMode: 'lite' });
    const result = await this.execJson(gen.script, PROJECTS_LIST_SCHEMA);
    if (!isScriptSuccess(result)) {
      warnings.push('project resolution unavailable: existing-projects read failed');
      return [];
    }
    return this.unwrapList(result.data, ['projects', 'items'])
      .map((p) => (p as { name?: unknown }).name)
      .filter((n): n is string => typeof n === 'string');
  }

  /** Read existing tag names (basic mode). Warns + returns empty set on script error. */
  private async fetchExistingTagNames(warnings: string[]): Promise<Set<string>> {
    const gen = buildTagsScript({ mode: 'basic', includeEmpty: true, sortBy: 'name' });
    const result = await this.execJson(gen.script, TAG_ITEMS_SCHEMA);
    if (!isScriptSuccess(result)) {
      warnings.push('tag classification unavailable: existing-tags read failed');
      return new Set();
    }
    const names = this.unwrapList(result.data, ['tags', 'items'])
      .map((t) => (typeof t === 'string' ? t : (t as { name?: unknown }).name))
      .filter((n): n is string => typeof n === 'string');
    return new Set(names);
  }

  /**
   * Read incomplete (not completed/dropped) tasks with their project name, scoped
   * to the dedup candidates we actually need. Warns + returns [] on script error
   * (OMN-204). OMN-126: scope to the requested target project(s) + inbox instead
   * of scanning the whole DB.
   *
   * We issue ONE scoped read per distinct requested scope and merge, rather than a
   * single `OR`-of-projects read: the AST contradiction detector rejects two
   * `{ project }` OR branches as "contradictory conditions on task.containingProject"
   * (project=A OR project=B is a legitimate union, but the detector flags same-field
   * branches). Per-scope reads sidestep that and are still far cheaper than the old
   * whole-DB scan — each is project- or inbox-scoped. The duplicate comparison
   * (findDuplicateTask) is already against `project.requested`, so scoping the
   * candidate set changes no match results; it only kills the ~8s whole-DB scan and
   * makes the 2000-row cap per-scope instead of a global truncation.
   */
  private async fetchExistingIncompleteTasks(
    warnings: string[],
    scopeProjects: Array<string | null>,
  ): Promise<Array<{ name: string; project: string | null }>> {
    // scopeProjects is already de-duplicated by the caller — one read per distinct scope.
    const reads = await Promise.all(
      scopeProjects.map(async (scope) => ({ scope, ...(await this.readScopedIncompleteTasks(scope)) })),
    );

    // Review ③: name the scope(s) whose read failed instead of a single blanket
    // "dedupe unavailable" — dedupe still works for the scopes that succeeded, so a
    // global warning is both over- and under-informative. (OMN-204 no-silent-failure.)
    const failed = reads.filter((r) => !r.ok).map((r) => r.scope);
    if (failed.length > 0) {
      const names = failed.map((s) => (s === null ? 'inbox' : s)).join(', ');
      warnings.push(`dedupe unavailable: incomplete-tasks read failed for ${names}`);
    }

    // Merge + dedup by (name, project): scopes can overlap (e.g. two items request
    // the same project, or a project named like the inbox fallback).
    const seen = new Set<string>();
    const merged: Array<{ name: string; project: string | null }> = [];
    for (const r of reads) {
      for (const t of r.tasks) {
        const key = `${t.name.toLowerCase()}\u0000${t.project?.toLowerCase() ?? ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(t);
        }
      }
    }
    return merged;
  }

  /**
   * One scoped incomplete-tasks read. `scope`: a project name → tasks in THAT
   * project's own subtree; `null` → inbox tasks.
   *
   * Named project: read `project.flattenedTasks` (the resolved project's own
   * descendants) instead of filtering the global `flattenedTasks`. The latter
   * iterates the whole database (~10s floor) on EVERY scope, which serializes past
   * the script timeout over multiple projects; `project.flattenedTasks` is ~40x
   * faster and naturally excludes the project ROOT (OMN-191: a root is named like
   * its project but is not actionable, so it must not look like a duplicate). The
   * project name is resolved case-insensitively here, so the dedup read needs no
   * separate canonicalization step.
   *
   * Inbox: the global `flattenedTasks` pipeline (buildListTasksScriptV4, embedded in
   * the JXA→bridge harness) is fine — the inbox is small, so the read is sub-second.
   *
   * Both terminal states excluded: a dropped task has completed===false, so without
   * the Dropped exclusion an abandoned task would false-positive as a duplicate.
   */
  private async readScopedIncompleteTasks(
    scope: string | null,
  ): Promise<{ ok: boolean; tasks: Array<{ name: string; project: string | null }> }> {
    const script =
      scope === null
        ? buildListTasksScriptV4({
            filter: { completed: false, dropped: false, inInbox: true },
            fields: ['name', 'project'],
            limit: 2000,
          })
        : this.buildProjectScopedDedupScript(scope);
    const result = await this.execJson(script, TASKS_LIST_SCHEMA);
    if (!isScriptSuccess(result)) {
      return { ok: false, tasks: [] };
    }
    const tasks = this.unwrapList(result.data, ['tasks', 'items'])
      .map((t) => {
        const rec = t as { name?: unknown; project?: unknown };
        return {
          name: typeof rec.name === 'string' ? rec.name : '',
          project: typeof rec.project === 'string' && rec.project.length > 0 ? rec.project : null,
        };
      })
      .filter((t) => t.name.length > 0);
    return { ok: true, tasks };
  }

  /**
   * Build a JXA→OmniJS script that reads incomplete (not completed/dropped) tasks
   * from ONE project's own subtree (`project.flattenedTasks`), resolving the project
   * name case-insensitively (status-aware: prefer a non-dropped/done match). Returns
   * raw `{ tasks: [{ name, project }] }` for execJson to wrap. The program crosses
   * the JXA→OmniJS boundary as a single JSON.stringify'd string (no nested template /
   * hand-rolled escaper — closes the OMN-111/113 injection class).
   */
  private buildProjectScopedDedupScript(projectName: string): string {
    const program =
      '(() => {' +
      `var target = ${JSON.stringify(projectName)};` +
      'var lower = target.toLowerCase();' +
      'var named = flattenedProjects.filter(function(p){ return p.name.toLowerCase() === lower; });' +
      'var live = named.filter(function(p){ return p.status !== Project.Status.Dropped && p.status !== Project.Status.Done; });' +
      // OmniFocus does not enforce unique project names: aggregate across ALL matching
      // live projects (fall back to any match only if none are live) so a duplicate in
      // a second same-named project is not missed — matching the old whole-DB read,
      // which keyed candidates by project NAME, not a single project object.
      'var matches = live.length > 0 ? live : named;' +
      'var out = [];' +
      'matches.forEach(function(p){ p.flattenedTasks.forEach(function(t){ if (t.taskStatus !== Task.Status.Completed && t.taskStatus !== Task.Status.Dropped) { out.push({ name: t.name, project: p.name }); } }); });' +
      'return JSON.stringify({ tasks: out });' +
      '})()';
    return `(() => { const app = Application('OmniFocus'); return app.evaluateJavascript(${JSON.stringify(program)}); })()`;
  }

  /**
   * Unwrap a script result's data into an array, tolerating the `{ ok, v, data }`
   * envelope and `{ <key>: [...] }` / bare-array shapes the OmniJS bridge emits.
   */
  private unwrapList(data: unknown, keys: string[]): unknown[] {
    let d = data;
    if (d && typeof d === 'object' && 'data' in (d as Record<string, unknown>)) {
      const inner = (d as { data?: unknown }).data;
      if (inner && typeof inner === 'object') d = inner;
    }
    if (Array.isArray(d)) return d;
    if (d && typeof d === 'object') {
      for (const key of keys) {
        const v = (d as Record<string, unknown>)[key];
        if (Array.isArray(v)) return v;
      }
    }
    return [];
  }

  private extractActionItems(
    input: string,
    args: {
      extractMode: string;
      suggestTags: boolean;
      suggestDueDates: boolean;
      suggestEstimates: boolean;
      existingProjects?: string[];
      defaultProject?: string;
    },
  ): ExtractionResult {
    const lines = input.split('\n').filter((line) => line.trim());
    const tasks: ExtractedTask[] = [];
    const projects: ExtractedProject[] = [];
    const unparsed: string[] = [];

    let taskCounter = 1;
    let projectCounter = 1;
    let currentProject: ExtractedProject | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || this.isNonActionable(trimmed)) {
        continue;
      }

      const isList = this.isListItem(trimmed);

      // OMN-123: only NON-bullet lines are considered project headers
      // ("Website Redesign project:"). A bullet is always an action — without
      // this gate, "- Marketing project: launch the new site" was misread as a
      // project named "- Marketing" and its action text vanished from both
      // tasks[] and unparsed[].
      if (!isList) {
        const projectResult = this.tryExtractProject(
          trimmed,
          args.extractMode,
          currentProject,
          projects,
          projectCounter,
        );
        if (projectResult) {
          currentProject = projectResult.currentProject;
          projectCounter = projectResult.projectCounter;
          continue;
        }
      }

      // OMN-123: task-candidacy is decided by list-membership, NOT by a verb
      // allowlist. A line is a task if it is a bullet/numbered list item, or if
      // the caller is in explicit action_items mode (every line is asserted to be
      // an action). Anything else is non-bullet prose — surface it in unparsed[]
      // rather than silently dropping it.
      const isTaskCandidate = isList || args.extractMode === 'action_items';
      if (!isTaskCandidate) {
        unparsed.push(trimmed);
        continue;
      }

      const taskResult = this.tryExtractAndAssignTask(trimmed, args, taskCounter, currentProject, tasks);
      if (taskResult) {
        taskCounter = taskResult.taskCounter;
      } else {
        // Candidate that failed extraction (e.g. too short) — surface, never drop.
        unparsed.push(trimmed);
      }
    }

    if (currentProject) {
      projects.push(currentProject);
    }

    return { tasks, projects, unparsed };
  }

  /**
   * OMN-123: a line is a task candidate when it is a markdown list item —
   * a bullet (-, *, •) or a numbered item (1. / 1)). This replaces the old
   * hardcoded action-verb allowlist, which silently dropped any item whose
   * leading verb was not on the list (finalize, coordinate, secure, ...).
   */
  private isListItem(line: string): boolean {
    return /^\s*([-*•]|\d+[.)])\s+/.test(line);
  }

  private tryExtractProject(
    trimmed: string,
    extractMode: string,
    currentProject: ExtractedProject | null,
    projects: ExtractedProject[],
    projectCounter: number,
  ): { currentProject: ExtractedProject; projectCounter: number } | null {
    if (extractMode === 'action_items') return null;

    const projectMatch = this.detectProject(trimmed);
    if (!projectMatch) return null;

    if (currentProject) {
      projects.push(currentProject);
    }

    return {
      currentProject: {
        tempId: `proj_${projectCounter}`,
        name: projectMatch.name,
        tasks: [],
        confidence: projectMatch.confidence,
        sourceText: trimmed,
      },
      projectCounter: projectCounter + 1,
    };
  }

  private tryExtractAndAssignTask(
    trimmed: string,
    args: {
      extractMode: string;
      suggestTags: boolean;
      suggestDueDates: boolean;
      suggestEstimates: boolean;
      existingProjects?: string[];
      defaultProject?: string;
    },
    taskCounter: number,
    currentProject: ExtractedProject | null,
    tasks: ExtractedTask[],
  ): { taskCounter: number } | null {
    if (args.extractMode === 'projects') return null;

    const task = this.extractTask(trimmed, args, taskCounter);
    if (!task) return null;

    if (currentProject) {
      currentProject.tasks.push({
        tempId: task.tempId,
        name: task.name,
        estimatedMinutes: task.estimatedMinutes,
        suggestedTags: task.suggestedTags,
      });
    } else {
      tasks.push(task);
    }

    return { taskCounter: taskCounter + 1 };
  }

  private isNonActionable(line: string): boolean {
    const nonActionablePatterns = [
      /^(meeting|agenda|action items?|discussion|attendees?|standalone task):/i,
      /^(date|time|location):/i,
      /^meeting\s+notes:/i,
      /^#+\s/,
      /^\*+\s/,
      /^-+\s*$/,
    ];
    return nonActionablePatterns.some((pattern) => pattern.test(line));
  }

  private detectProject(line: string): { name: string; confidence: 'high' | 'medium' | 'low' } | null {
    const projectPatterns = [
      /^(.*\S)\s+project:/i,
      /^project:\s*(.+)/i,
      /^([^:]+):\s*(create|build|design|plan|implement)/i,
    ];

    for (const pattern of projectPatterns) {
      const match = pattern.exec(line);
      if (match) {
        return { name: match[1].trim(), confidence: 'high' };
      }
    }

    const includesIdx = line.search(/\b(includes?|involves?|requires?):/i);
    if (includesIdx > 0) {
      return { name: line.substring(0, includesIdx).trim(), confidence: 'high' };
    }

    if (/^[A-Z]/.test(line) && /^(.+?):\s*$/.test(line)) {
      const match = /^(.+?):\s*$/.exec(line);
      if (match) {
        return { name: match[1].trim(), confidence: 'medium' };
      }
    }

    if (/(then|after that|followed by|next step)/i.test(line)) {
      const match = /^(.*\S)(?:\s*[:|]|\s*-|\s+(then|after|followed))/i.exec(line);
      if (match) {
        return { name: match[1].trim(), confidence: 'medium' };
      }
    }

    return null;
  }

  private extractTask(
    line: string,
    args: {
      suggestTags: boolean;
      suggestDueDates: boolean;
      suggestEstimates: boolean;
      existingProjects?: string[];
      defaultProject?: string;
    },
    taskId: number,
  ): ExtractedTask | null {
    const cleaned = line
      .replace(/^[-*\u2022]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim();

    if (cleaned.length < 5) {
      return null;
    }

    // OMN-123: the hardcoded actionVerbs allowlist used to gate here dropped
    // ~8/13 real action items whose leading verb (finalize, coordinate, secure,
    // reorder, provide, attend, confirm, evaluate, ...) was not on the list, and
    // its failure mode was silent. Task-candidacy is now decided upstream by
    // list-membership (see isListItem / extractActionItems), so any candidate of
    // sufficient length becomes a task.
    const taskName = this.extractTaskName(cleaned);
    // OMN-123: people tags (waiting-for / agenda) and context tags both come from
    // detectContextTags now — the single source of truth. The old parallel
    // detectAssignee re-emitted non-vault tag shapes into this same union.
    const contextTags = args.suggestTags ? detectContextTags(cleaned) : [];
    const allTags = [...new Set(contextTags)];
    const dates = args.suggestDueDates ? extractDates(cleaned) : {};
    const estimate = args.suggestEstimates ? this.estimateDuration(cleaned) : undefined;

    let projectMatch: { project: string | null; match: 'exact' | 'partial' | 'none' };
    if (args.existingProjects) {
      projectMatch = this.matchToProject(cleaned, args.existingProjects);
      if (projectMatch.match === 'none' && args.defaultProject) {
        projectMatch = { project: args.defaultProject, match: 'none' };
      }
    } else {
      projectMatch = { project: args.defaultProject || null, match: 'none' };
    }

    return {
      tempId: `task_${taskId}`,
      name: taskName,
      suggestedProject: projectMatch.project,
      projectMatch: projectMatch.match,
      suggestedTags: allTags,
      suggestedDueDate: dates.dueDate,
      suggestedDeferDate: dates.deferDate,
      estimatedMinutes: estimate,
      confidence: this.calculateConfidence(taskName, allTags, dates),
      sourceText: line,
      note: this.extractNote(cleaned, taskName),
    };
  }

  private extractTaskName(text: string): string {
    // OMN-123: the old implementation ran two greedy operations that deleted real
    // content — a global /\b(by|for|with|from)\s+\w+\b/gi strip (which ate
    // "with Westgate", "with PEDS", "for testing") and a mid-sentence truncation
    // at the first " by|on|before|after|until " (which lopped off
    // "...before installing new microfilm station").
    //
    // Over-truncation is itself silent data loss, so the name is now the bullet-
    // stripped line VERBATIM. Earlier drafts also trimmed a leading "Owner:"
    // label and trailing date tokens, but both reintroduced the same failure
    // class: "Owner:" can't be told from content labels ("Update:", "Order:"),
    // and stripping a trailing weekday left dangling prepositions ("...report by").
    // Dates are still captured separately by extractDates(); a slightly longer,
    // faithful name is strictly safer than a cleverly-shortened, lossy one.
    return text.trim();
  }

  private estimateDuration(text: string): number | undefined {
    const durationHints = [
      { pattern: /\bdeep work\b|\bfocus\b/i, minutes: 180 },
      { pattern: /\bplan\b|\banalyze\b|\bresearch\b/i, minutes: 120 },
      { pattern: /\bwrite\b|\bcreate\b|\bdesign\b/i, minutes: 90 },
      { pattern: /\bmeeting\b|\bdiscuss\b/i, minutes: 60 },
      { pattern: /\bcall\b|\bphone\b/i, minutes: 30 },
      { pattern: /\breview\b|\bcheck\b/i, minutes: 30 },
      { pattern: /\bquick\b|\bbrief\b|\bshort\b/i, minutes: 15 },
    ];
    for (const hint of durationHints) {
      if (hint.pattern.test(text)) {
        return hint.minutes;
      }
    }
    return undefined;
  }

  private matchToProject(
    text: string,
    existingProjects: string[],
  ): { project: string | null; match: 'exact' | 'partial' | 'none' } {
    const textLower = text.toLowerCase();
    for (const project of existingProjects) {
      if (textLower.includes(project.toLowerCase())) {
        return { project, match: 'exact' };
      }
    }
    const commonWords = ['project', 'task', 'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in'];
    for (const project of existingProjects) {
      const keywords = project
        .toLowerCase()
        .split(/\s+/)
        .filter((k) => !commonWords.includes(k) && k.length > 2);
      if (keywords.length > 0 && keywords.some((keyword) => textLower.includes(keyword))) {
        return { project, match: 'partial' };
      }
    }
    return { project: null, match: 'none' };
  }

  private calculateConfidence(
    name: string,
    tags: string[],
    dates: { dueDate?: string; deferDate?: string },
  ): 'high' | 'medium' | 'low' {
    let score = 0;
    if (name.length > 10) score++;
    if (tags.length > 0) score++;
    if (dates.dueDate || dates.deferDate) score++;
    const mediumOrLow = score === 1 ? 'medium' : 'low';
    return score >= 2 ? 'high' : mediumOrLow;
  }

  private extractNote(fullText: string, taskName: string): string | undefined {
    const remainder = fullText.replace(taskName, '').trim();
    return remainder.length > 10 ? remainder : undefined;
  }

  private formatPreview(extracted: ExtractionResult, _args: Record<string, unknown>): unknown {
    const totalTasks = extracted.tasks.length + extracted.projects.reduce((sum, p) => sum + p.tasks.length, 0);
    const highConfidence = [
      ...extracted.tasks.filter((t) => t.confidence === 'high'),
      ...extracted.projects.filter((p) => p.confidence === 'high'),
    ].length;
    const mediumConfidence = [
      ...extracted.tasks.filter((t) => t.confidence === 'medium'),
      ...extracted.projects.filter((p) => p.confidence === 'medium'),
    ].length;
    const needsReview = extracted.tasks
      .filter((t) => t.confidence === 'low' || t.projectMatch === 'none')
      .map((t) => t.tempId);

    const unparsed = extracted.unparsed;

    return {
      // OMN-123: `unparsed` carries every content line that was NOT turned into a
      // task, so nothing the user wrote can silently vanish.
      extracted: { tasks: extracted.tasks, projects: extracted.projects, unparsed },
      summary: {
        totalTasks,
        totalProjects: extracted.projects.length,
        highConfidence,
        mediumConfidence,
        needsReview,
        unparsedCount: unparsed.length,
      },
      nextSteps:
        unparsed.length > 0
          ? 'Review extracted items AND unparsed[] (lines not turned into tasks — add any missed actions by hand), then use batch_create to add to OmniFocus'
          : 'Review extracted items and use batch_create to add to OmniFocus',
    };
  }

  // =========================================================================
  // Manage Reviews
  // =========================================================================

  private async executeManageReviews(
    compiled: Extract<CompiledAnalysis, { type: 'manage_reviews' }>,
  ): Promise<unknown> {
    const timer = new OperationTimerV2();
    const operation = compiled.params?.operation ?? 'list_for_review';

    try {
      switch (operation) {
        case 'list_for_review':
          return this.reviewsListForReview(compiled, timer);
        case 'mark_reviewed':
          return this.reviewsMarkReviewed(compiled, timer);
        case 'set_schedule':
          return this.reviewsSetSchedule(compiled, timer);
        case 'clear_schedule':
          return this.reviewsClearSchedule(compiled, timer);
        default:
          return createErrorResponseV2(
            'manage_reviews',
            'INVALID_OPERATION',
            `Unknown operation: ${String(operation)}`,
            'Use one of: list_for_review, mark_reviewed, set_schedule (clear_schedule is unsupported — OMN-41/OMN-58)',
            { operation },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleErrorV2(error);
    }
  }

  private async reviewsListForReview(
    _compiled: Extract<CompiledAnalysis, { type: 'manage_reviews' }>,
    timer: OperationTimerV2,
  ): Promise<StandardResponseV2<unknown>> {
    const daysAhead = 7;
    const args = { operation: 'list_for_review', daysAhead };

    const cacheKey = JSON.stringify(args);
    const cached = this.cache.get<{ metadata?: Record<string, unknown>; projects?: unknown[] }>('reviews', cacheKey);
    if (cached) {
      this.logger.debug('Returning cached projects for review');
      return {
        ...cached,
        metadata: {
          operation: 'manage_reviews',
          timestamp: new Date().toISOString(),
          ...cached?.metadata,
          from_cache: true,
          ...timer.toMetadata(),
        },
      } as StandardResponseV2<unknown>;
    }

    const script = buildProjectsForReviewScript({ filter: args });
    const result = await this.execJson(script, REVIEWS_LIST_SCHEMA);
    if (isScriptError(result)) {
      return createErrorResponseV2(
        'manage_reviews',
        result.error === 'NULL_RESULT' ? 'NULL_RESULT' : 'SCRIPT_ERROR',
        result.error || 'Script error',
        undefined,
        result.details,
        timer.toMetadata(),
      );
    }

    const envelope = result.data as { ok?: boolean; v?: string; data?: ReviewListData } | ReviewListData;
    const data: ReviewListData =
      envelope && typeof envelope === 'object' && 'data' in envelope && envelope.data
        ? envelope.data
        : (envelope as ReviewListData);
    const src = data?.projects || data?.items || [];
    if (!Array.isArray(src)) {
      return createErrorResponseV2(
        'manage_reviews',
        'INVALID_RESPONSE',
        'Invalid response from OmniFocus: projects array not found',
        'Script should return { projects: [...] } or { items: [...] }',
        { received: data, expected: 'object with projects/items array' },
        timer.toMetadata(),
      );
    }

    const now = new Date();
    const sourceProjects = src as Array<{
      id?: string;
      name?: string;
      nextReviewDate?: string;
      lastReviewDate?: string;
      dueDate?: string;
      deferDate?: string;
      completionDate?: string;
      [key: string]: unknown;
    }>;
    const parsedProjects = sourceProjects.map((project) => {
      const nextReviewDate = project.nextReviewDate ? new Date(project.nextReviewDate) : null;
      const lastReviewDate = project.lastReviewDate ? new Date(project.lastReviewDate) : null;

      let reviewStatus = 'no_schedule';
      let daysUntilReview = null;

      if (nextReviewDate) {
        const msUntilReview = nextReviewDate.getTime() - now.getTime();
        daysUntilReview = Math.ceil(msUntilReview / (1000 * 60 * 60 * 24));

        if (daysUntilReview < 0) {
          reviewStatus = 'overdue';
        } else if (daysUntilReview === 0) {
          reviewStatus = 'due_today';
        } else if (daysUntilReview <= daysAhead) {
          reviewStatus = 'due_soon';
        } else {
          reviewStatus = 'scheduled';
        }
      }

      return {
        ...project,
        dueDate: project.dueDate ? new Date(project.dueDate) : undefined,
        deferDate: project.deferDate ? new Date(project.deferDate) : undefined,
        completionDate: project.completionDate ? new Date(project.completionDate) : undefined,
        lastReviewDate,
        nextReviewDate,
        reviewStatus,
        daysUntilReview,
        daysSinceLastReview: lastReviewDate
          ? Math.floor((now.getTime() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      } as {
        id?: string;
        name?: string;
        reviewStatus: string;
        daysUntilReview: number | null;
        daysSinceLastReview: number | null;
        [key: string]: unknown;
      };
    });

    const standardResponse = createListResponseV2('manage_reviews', parsedProjects, 'projects', {
      ...timer.toMetadata(),
      operation: 'list_for_review',
      filters_applied: args,
      review_summary: {
        total_projects: parsedProjects.length,
        overdue: parsedProjects.filter((p) => p.reviewStatus === 'overdue').length,
        due_today: parsedProjects.filter((p) => p.reviewStatus === 'due_today').length,
        due_soon: parsedProjects.filter((p) => p.reviewStatus === 'due_soon').length,
        no_schedule: parsedProjects.filter((p) => p.reviewStatus === 'no_schedule').length,
      },
      ...(data && typeof data === 'object' && 'metadata' in data
        ? (data as { metadata?: Record<string, unknown> }).metadata
        : {}),
    });

    this.cache.set('reviews', cacheKey, standardResponse);
    return standardResponse;
  }

  private async reviewsMarkReviewed(
    compiled: Extract<CompiledAnalysis, { type: 'manage_reviews' }>,
    timer: OperationTimerV2,
  ): Promise<StandardResponseV2<unknown>> {
    const projectId = compiled.params?.projectId;
    const reviewDate = compiled.params?.reviewDate || new Date().toISOString();
    const brandedProjectId = projectId ? convertToProjectId(projectId) : undefined;

    const { script } = await buildMarkProjectReviewedScript({
      projectId: brandedProjectId ?? null,
      reviewDate,
      updateNextReviewDate: true,
    });
    const result = await this.execJson(script, MARK_REVIEWED_SCHEMA);

    if (isScriptError(result)) {
      return createErrorResponseV2(
        'manage_reviews',
        'SCRIPT_ERROR',
        result.error || 'Script execution failed',
        'Try again with updateNextReviewDate=false',
        result.details,
        timer.toMetadata(),
      );
    }

    this.cache.invalidate('projects');
    this.cache.invalidate('reviews');

    const envelope = result.data as unknown;
    const parsedResult =
      envelope && typeof envelope === 'object' && 'data' in envelope && envelope.data ? envelope.data : envelope;

    return createSuccessResponseV2('manage_reviews', { project: parsedResult }, undefined, {
      ...timer.toMetadata(),
      operation: 'mark_reviewed',
      reviewed_id: projectId,
      review_date: reviewDate,
      next_review_calculated: true,
      input_params: { projectId, reviewDate, updateNextReviewDate: true },
    });
  }

  private async reviewsSetSchedule(
    compiled: Extract<CompiledAnalysis, { type: 'manage_reviews' }>,
    timer: OperationTimerV2,
  ): Promise<StandardResponseV2<unknown>> {
    const projectId = compiled.params?.projectId;
    const brandedProjectIds = projectId ? [convertToProjectId(projectId)] : [];

    // OMN-106 fail-loud (Kip 2026-07-06, with OMN-136): with neither an
    // interval nor a date the legacy script reported per-project success with
    // empty changes — a silent no-op. Refuse loudly before building.
    if (!compiled.params?.reviewInterval && !compiled.params?.reviewDate) {
      return createErrorResponseV2(
        'manage_reviews',
        'VALIDATION_ERROR',
        'set_schedule requires reviewInterval and/or reviewDate — with neither there is nothing to set',
        'Provide reviewInterval {unit, steps} and/or reviewDate',
        { projectId },
        timer.toMetadata(),
      );
    }

    // OMN-60: pass the requested interval through (was hardcoded null, which
    // made the entire reviewInterval path dead code).
    const { script } = await buildSetReviewScheduleScript({
      projectIds: brandedProjectIds,
      reviewInterval: compiled.params?.reviewInterval ?? null,
      nextReviewDate: compiled.params?.reviewDate ?? null,
    });
    const result = await this.execJson(script, SET_SCHEDULE_SCHEMA);

    if (isScriptError(result)) {
      return createErrorResponseV2(
        'manage_reviews',
        'SCRIPT_ERROR',
        result.error || 'Script execution failed',
        'Verify project IDs and schedule details',
        result.details,
        timer.toMetadata(),
      );
    }

    this.cache.invalidate('projects');
    this.cache.invalidate('reviews');

    const envelope = result.data as unknown;
    const parsedResult =
      envelope && typeof envelope === 'object' && 'data' in envelope && envelope.data ? envelope.data : envelope;

    return createSuccessResponseV2('manage_reviews', { batch: parsedResult }, undefined, {
      ...timer.toMetadata(),
      operation: 'set_schedule',
      projects_updated: brandedProjectIds.length,
      input_params: { projectId },
    });
  }

  private reviewsClearSchedule(
    compiled: Extract<CompiledAnalysis, { type: 'manage_reviews' }>,
    timer: OperationTimerV2,
  ): StandardResponseV2<unknown> {
    const projectId = compiled.params?.projectId;

    // OMN-106 fail-loud (Kip 2026-07-06, with OMN-136): the legacy path sent
    // {reviewInterval:null, nextReviewDate:null}, which the script if-gated
    // into a per-project SUCCESS with empty changes — nothing was ever cleared.
    // OmniJS cannot construct or null a Project.ReviewInterval (OMN-41/OMN-58),
    // so a clear cannot take effect through this seam; say so instead of lying.
    return createErrorResponseV2(
      'manage_reviews',
      'UNSUPPORTED',
      'clear_schedule cannot clear a review schedule: OmniJS cannot remove or null a project reviewInterval ' +
        '(OMN-41/OMN-58). The previous behavior reported success without changing anything.',
      'Set a different interval with set_schedule, or clear the review schedule in the OmniFocus app',
      { projectId },
      timer.toMetadata(),
    );
  }
}

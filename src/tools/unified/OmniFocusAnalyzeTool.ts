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

// Script imports (irreducible computation)
import { PRODUCTIVITY_STATS_SCRIPT_V3 as PRODUCTIVITY_STATS_SCRIPT } from '../../omnifocus/scripts/analytics/productivity-stats-v3.js';
import { TASK_VELOCITY_SCRIPT_V3 as TASK_VELOCITY_SCRIPT } from '../../omnifocus/scripts/analytics/task-velocity-v3.js';
import { ANALYZE_OVERDUE_V3 as ANALYZE_OVERDUE_SCRIPT } from '../../omnifocus/scripts/analytics/analyze-overdue-v3.js';
import { WORKFLOW_ANALYSIS_V3 } from '../../omnifocus/scripts/analytics/workflow-analysis-v3.js';
import { GET_RECURRING_PATTERNS_SCRIPT } from '../../omnifocus/scripts/recurring.js';
import { buildRecurringTasksScript } from '../../omnifocus/scripts/recurring/analyze-recurring-tasks-ast.js';
import {
  PROJECTS_FOR_REVIEW_SCRIPT,
  MARK_PROJECT_REVIEWED_SCRIPT,
  SET_REVIEW_SCHEDULE_SCRIPT,
} from '../../omnifocus/scripts/reviews.js';

// Pure-JS analyzer imports (for pattern analysis)
import { analyzeReviewGaps } from '../../omnifocus/scripts/analytics/review-gaps-analyzer.js';
import { analyzeNextActions } from '../../omnifocus/scripts/analytics/next-actions-analyzer.js';
import { analyzeWipLimits } from '../../omnifocus/scripts/analytics/wip-limits-analyzer.js';
import { analyzeDueDateBunching } from '../../omnifocus/scripts/analytics/due-date-bunching-analyzer.js';

// Capture utilities (for meeting notes parsing)
import { detectContextTags } from '../capture/context-detection.js';
import { extractDates } from '../capture/date-extraction.js';

// Response types
import type { ProductivityStatsData } from '../../omnifocus/script-response-types.js';
import type { OverdueAnalysisData } from '../../omnifocus/script-response-types.js';
import type { WorkflowAnalysisData } from '../../omnifocus/script-response-types.js';
import type { ReviewListData } from '../../omnifocus/script-response-types.js';
import type { OverdueAnalysisDataV2 } from '../response-types-v2.js';
import type { RecurringTaskV2 } from '../response-types-v2.js';
import type { ProjectId } from '../../utils/branded-types.js';

// ---------------------------------------------------------------------------
// Internal type helpers
// ---------------------------------------------------------------------------

// Union type for overdue data (production script format vs test mock format)
interface TestMockOverdueData {
  summary: {
    totalOverdue: number;
    overduePercentage: number;
    averageDaysOverdue: number;
    oldestOverdueDate: string;
  };
  overdueTasks: Array<{
    id: string;
    name: string;
    dueDate: string;
    daysOverdue: number;
    tags: string[];
    projectId?: string;
  }>;
  patterns: Array<{
    type: string;
    value: string;
    count: number;
    percentage: number;
  }>;
  recommendations: string[];
  groupedAnalysis?: Record<string, unknown>;
}

type OverdueDataUnion = OverdueAnalysisData | TestMockOverdueData;

function isTestMockOverdueFormat(data: OverdueDataUnion): data is TestMockOverdueData {
  return 'recommendations' in data && Array.isArray(data.recommendations);
}

function getRecommendations(data: OverdueDataUnion): string[] {
  if (isTestMockOverdueFormat(data)) {
    return data.recommendations;
  }
  return data.recommendations || [];
}

function getPatternsWithValue(
  data: OverdueDataUnion,
): Array<{ type: string; value: string; count: number; percentage: number }> {
  if (isTestMockOverdueFormat(data)) {
    return data.patterns;
  }
  return (data.patterns || []).map((p) => ({
    type: p.type || 'unknown',
    value: p.value || 'unknown',
    count: p.count || 0,
    percentage: p.percentage || 0,
  }));
}

function getTaskProjectId(task: OverdueDataUnion['overdueTasks'][0]): string | undefined {
  if ('projectId' in task) {
    return task.projectId;
  }
  return undefined;
}

function getTaskDaysOverdue(task: OverdueDataUnion['overdueTasks'][0]): number {
  if ('daysOverdue' in task) {
    return task.daysOverdue;
  }
  return 0;
}

// V3 script response structure for task velocity
interface TaskVelocityV3Data {
  velocity: {
    period: string;
    averageCompleted: string;
    averageCreated: string;
    dailyVelocity: string;
    backlogGrowthRate: string;
  };
  throughput: {
    intervals: Array<{
      start: Date;
      end: Date;
      created: number;
      completed: number;
      label: string;
    }>;
    totalCompleted: number;
    totalCreated: number;
  };
  breakdown: {
    medianCompletionHours: string;
    tasksAnalyzed: number;
  };
  projections: {
    tasksPerDay: string;
    tasksPerWeek: string;
    tasksPerMonth: string;
  };
  optimization: string;
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
interface ExtractedTask {
  tempId: string;
  name: string;
  suggestedProject: string | null;
  projectMatch: 'exact' | 'partial' | 'none';
  suggestedTags: string[];
  suggestedDueDate?: string;
  suggestedDeferDate?: string;
  estimatedMinutes?: number;
  confidence: 'high' | 'medium' | 'low';
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
  confidence: 'high' | 'medium' | 'low';
  sourceText: string;
}

interface ExtractionResult {
  tasks: ExtractedTask[];
  projects: ExtractedProject[];
}

// Convert string ID to branded ProjectId for type safety
const convertToProjectId = (id: string): ProjectId => id as ProjectId;

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
- parse_meeting_notes: Extract action items from meeting notes
- manage_reviews: Project review operations

PERFORMANCE WARNINGS:
- pattern_analysis on 1000+ items: ~5-10 seconds
- workflow_analysis: ~3-5 seconds for comprehensive
- Most others: <1 second with caching

SCOPE FILTERING:
- Use dateRange for time-based analysis
- Use tags/projects to focus analysis`;

  schema = AnalyzeSchema;
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
      const result = await this.execJson<ProductivityStatsData>(script);

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

      // Handle the script result - unwrap v3 envelope
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

      if (result && typeof result === 'object' && result !== null) {
        if ('data' in result) {
          actualData = (result as { data: unknown }).data;
        } else {
          actualData = result;
        }

        if (
          actualData &&
          typeof actualData === 'object' &&
          actualData !== null &&
          'ok' in actualData &&
          'data' in actualData
        ) {
          actualData = (actualData as { ok: boolean; data: unknown }).data;
        }
      } else {
        actualData = result;
      }

      let overview: ScriptOverview;
      let projectStatsArray: Array<{ name: string; completedCount: number }> | Record<string, unknown>;
      let tagStatsArray: Record<string, unknown>;
      let insights: string[];

      if (actualData && typeof actualData === 'object' && actualData !== null && 'summary' in actualData) {
        const typedScriptData = actualData as ScriptData;
        const summary = typedScriptData.summary!;
        overview = {
          totalTasks: summary.totalTasks || 0,
          completedTasks: summary.completedTasks || 0,
          completionRate: summary.completionRate || 0,
          activeProjects: summary.activeProjects || 0,
          overdueCount: summary.overdueCount || 0,
        };

        projectStatsArray = includeProjectStats ? typedScriptData.projectStats || [] : [];
        tagStatsArray = includeTagStats ? typedScriptData.tagStats || {} : {};
        insights = typedScriptData.insights || [];
      } else {
        overview = { totalTasks: 0, completedTasks: 0, completionRate: 0, activeProjects: 0, overdueCount: 0 };
        projectStatsArray = [];
        tagStatsArray = {};
        insights = [];
      }

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
                completedCount:
                  data && typeof data === 'object' && 'completedCount' in data ? Number(data.completedCount) || 0 : 0,
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
        includeProjectStats,
        includeTagStats,
        ...timer.toMetadata(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      let suggestion = 'Ensure OmniFocus is running and has data to analyze';
      let errorCode = 'STATS_ERROR';

      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorCode = 'SCRIPT_TIMEOUT';
        suggestion = 'Try reducing the analysis period or exclude project/tag stats for faster results';
      } else if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
        errorCode = 'OMNIFOCUS_NOT_RUNNING';
        suggestion = 'Start OmniFocus and ensure it is running';
      } else if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
        errorCode = 'PERMISSION_DENIED';
        suggestion = 'Enable automation access in System Settings > Privacy & Security > Automation';
      } else if (errorMessage.includes('no data') || errorMessage.includes('empty database')) {
        errorCode = 'NO_DATA';
        suggestion = 'Add some tasks to OmniFocus before running productivity analysis';
      }

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

    if (data.healthScore) {
      const score = Math.round(data.healthScore);
      let assessment = 'Needs attention';
      if (score >= 80) assessment = 'Excellent';
      else if (score >= 60) assessment = 'Good';
      else if (score >= 40) assessment = 'Fair';
      findings.push(`GTD Health Score: ${score}/100 (${assessment})`);
    }

    if (data.stats?.projectStats && data.stats.projectStats.length > 0) {
      const topProject = data.stats.projectStats.sort((a, b) => (b.completedCount || 0) - (a.completedCount || 0))[0];
      if (topProject && topProject.completedCount > 0) {
        findings.push(`Most productive project: ${topProject.name} (${topProject.completedCount} completed)`);
      }
    }

    if (data.insights && Array.isArray(data.insights.recommendations) && data.insights.recommendations.length > 0) {
      findings.push(data.insights.recommendations[0]);
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
            startDate: rangeStart,
            endDate: rangeEnd,
            groupBy,
            includeWeekends,
            ...timer.toMetadata(),
          },
        );
      }

      const script = this.omniAutomation.buildScript(TASK_VELOCITY_SCRIPT, {
        options: { period: groupBy, startDate: rangeStart, endDate: rangeEnd },
      });

      const result = await this.execJson<TaskVelocityV3Data>(script);

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

      // V3 envelope unwrapping
      const rawData = isScriptSuccess(result) ? result.data : null;
      const scriptData = (rawData as { data?: TaskVelocityV3Data } | null)?.data ?? null;

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
        startDate: rangeStart,
        endDate: rangeEnd,
        groupBy,
        includeWeekends,
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
      const { tasksCompleted, averagePerDay, trend, predictedCapacity } = data.velocity;
      if (tasksCompleted && tasksCompleted > 0) {
        const avgPerDay = averagePerDay || 0;
        findings.push(`Completed ${tasksCompleted} tasks (avg ${avgPerDay.toFixed(1)}/day)`);
      }

      if (trend === 'increasing') {
        findings.push('Velocity trending upward');
      } else if (trend === 'decreasing') {
        findings.push('Velocity trending downward');
      } else {
        findings.push('Velocity stable');
      }

      if (predictedCapacity && predictedCapacity > 0) {
        findings.push(`Predicted capacity: ${Math.round(predictedCapacity)} tasks/week`);
      }
    }

    if (data.velocity?.peakDay?.date && data.velocity.peakDay.count > 0) {
      findings.push(`Peak day: ${data.velocity.peakDay.date} (${data.velocity.peakDay.count} tasks)`);
    }

    if (data.patterns?.byDayOfWeek) {
      const days = Object.entries(data.patterns.byDayOfWeek).sort((a, b) => {
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

    if (data.patterns?.byProject && Array.isArray(data.patterns.byProject) && data.patterns.byProject.length > 0) {
      const topProject = data.patterns.byProject[0];
      if (topProject && topProject.completed > 0) {
        findings.push(`Fastest moving project: ${topProject.name}`);
      }
    }

    if (data.insights && Array.isArray(data.insights) && data.insights.length > 0) {
      findings.push(data.insights[0]);
    }

    return findings.length > 0 ? findings : ['No velocity data available for this period'];
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
      const result = await this.execJson<OverdueDataUnion>(script);

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

      const envelope = result.data as { ok?: boolean; v?: string; data?: OverdueDataUnion } | OverdueDataUnion;
      const scriptData: OverdueDataUnion =
        'data' in envelope && envelope.data ? envelope.data : (envelope as OverdueDataUnion);

      const responseData: OverdueAnalysisDataV2 = {
        stats: {
          summary: {
            totalOverdue: scriptData.summary.totalOverdue ?? 0,
            overduePercentage: scriptData.summary.overduePercentage ?? 0,
            averageDaysOverdue: Number(scriptData.summary.averageDaysOverdue ?? 0),
            oldestOverdueDate: scriptData.summary.oldestOverdueDate ?? '',
          },
          overdueTasks: (scriptData.overdueTasks ?? []).map((task) => ({
            id: String(task.id || ''),
            name: String(task.name || ''),
            dueDate: task.dueDate ?? null,
            project: getTaskProjectId(task) ? String(getTaskProjectId(task)) : undefined,
            daysOverdue: getTaskDaysOverdue(task),
          })),
          patterns: getPatternsWithValue(scriptData),
          insights: { topRecommendations: getRecommendations(scriptData) },
        },
        groupedAnalysis: Object.fromEntries(
          Object.entries(scriptData.groupedAnalysis ?? {}).map(([key, value]) => {
            const groupData = value as { count?: number; averageDaysOverdue?: number; tasks?: unknown[] } | null;
            return [
              key,
              {
                count: groupData?.count ?? 0,
                averageDaysOverdue: groupData?.averageDaysOverdue,
                tasks: groupData?.tasks,
              },
            ];
          }),
        ),
      };

      this.cache.set('analytics', cacheKey, responseData);

      const keyFindings = this.extractOverdueKeyFindings(responseData);

      return createAnalyticsResponseV2('analyze_overdue', responseData, 'Overdue Task Analysis', keyFindings, {
        from_cache: false,
        groupBy,
        includeCompleted: includeRecentlyCompleted,
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
        topPattern.type &&
        typeof topPattern.count === 'number' &&
        topPattern.count > 0
      ) {
        findings.push(`Most overdue in: ${topPattern.type} (${topPattern.count} tasks)`);
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
          case 'wip_limits': {
            const tasksByProject = new Map<string, typeof slimData.tasks>();
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

            const wipResult = analyzeWipLimits(projectsWithTasks, { wipLimit: options.wip_limit });
            findings.wip_limits = {
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
            break;
          }
          case 'due_date_bunching': {
            const bunchingResult = analyzeDueDateBunching(
              slimData.tasks.map((t) => ({
                id: t.id,
                dueDate: t.dueDate || null,
                completed: t.completed,
                project: t.project || 'Inbox',
              })),
              { threshold: options.bunching_threshold },
            );
            findings.due_date_bunching = {
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
            break;
          }
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

    const scriptResult = await this.execJson(taskScript);

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

    const findings: {
      total_tags: number;
      unused_tags: string[];
      underused_tags: Array<{ tag: string; count: number }>;
      overused_tags: Array<{ tag: string; count: number; project_spread: number }>;
      potential_synonyms: Array<{ tag1: string; tag2: string; similarity: number; combined_usage: number }>;
    } = {
      total_tags: tagStats.size,
      unused_tags: [],
      underused_tags: [],
      overused_tags: [],
      potential_synonyms: [],
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

    const totalTagUsage = Array.from(tagStats.values()).reduce((a, b) => a + b, 0);
    let entropy = 0;
    for (const count of tagStats.values()) {
      const p = count / totalTagUsage;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    const severity = findings.underused_tags.length > 10 || findings.potential_synonyms.length > 5 ? 'warning' : 'info';

    return {
      type: 'tag_audit',
      severity,
      count: tagStats.size,
      items: {
        ...findings,
        entropy: entropy.toFixed(2),
        entropy_interpretation:
          entropy < 2
            ? 'Low diversity - consider more tags'
            : entropy > 5
              ? 'High diversity - consider consolidation'
              : 'Moderate diversity',
      },
      recommendation: this.generateTagRecommendation(findings),
    };
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

    const severity = findings.overdue.length > 10 ? 'critical' : findings.overdue.length > 5 ? 'warning' : 'info';

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

        waitingTasks.push({
          id: task.id,
          name: task.name,
          project: task.project,
          reason: isWaiting ? 'name_pattern' : hasWaitingTag ? 'tag' : 'blocked',
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
      median: estimates.sort((a, b) => a - b)[Math.floor(estimates.length / 2)],
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

    return {
      health_score: healthScore,
      health_rating: healthScore >= 80 ? 'Good' : healthScore >= 60 ? 'Fair' : 'Needs Attention',
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
      const analysisDepth = 'standard';
      const focusAreas = ['productivity', 'workload', 'bottlenecks'];
      const maxInsights = 15;
      const includeRawData = false;

      wfLogger.info(`Starting workflow analysis with depth: ${analysisDepth}, focus: ${focusAreas.join(', ')}`);

      const cacheKey = `workflow_analysis_${analysisDepth}_${[...focusAreas].sort().join('_')}_${maxInsights}`;

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

      const result = await this.execJson<WorkflowAnalysisData>(script);

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

      // V3 envelope unwrapping
      const envelope = result.data as unknown;
      let scriptData: unknown = envelope;

      if (envelope && typeof envelope === 'object' && 'ok' in envelope && 'v' in envelope && envelope.v === '3') {
        const v3Envelope = envelope as { ok: boolean; v: string; data?: unknown };
        if (v3Envelope.ok && v3Envelope.data) {
          scriptData = v3Envelope.data;
          wfLogger.debug('Unwrapped v3 envelope');
        }
      }

      if (!scriptData || typeof scriptData !== 'object' || scriptData === null) {
        return createErrorResponseV2(
          'workflow_analysis',
          'NO_DATA',
          'No workflow analysis data returned from OmniFocus',
          'Ensure OmniFocus has tasks and projects to analyze',
          { scriptData },
          timer.toMetadata(),
        );
      }

      interface WorkflowV3Data {
        insights: Array<{ category: string; insight: string; priority: string }>;
        patterns: {
          workloadDistribution?: unknown;
          workflowMetrics?: unknown;
          deferralAnalysis?: unknown;
        };
        recommendations: Array<{ category: string; recommendation: string; priority: string }>;
        data?: unknown;
        totalTasks: number;
        totalProjects: number;
        analysisTime: number;
        dataPoints: number;
        metadata: {
          analysisDepth: string;
          focusAreas: string[];
          maxInsights: number;
          method?: string;
          optimization?: string;
          query_time_ms?: number;
          note?: string;
        };
      }

      const v3Data = scriptData as WorkflowV3Data;

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

      let suggestion = 'Try reducing analysis depth or focus areas';
      let errorCode = 'EXECUTION_ERROR';

      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorCode = 'SCRIPT_TIMEOUT';
        suggestion = 'Try using "quick" analysis depth or reduce the focus areas for faster results';
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
        ...data.insights.slice(0, 3).map((i) => {
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
        ...data.recommendations.slice(0, 2).map((r) => {
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
        case 'analyze': {
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
          const result = await this.execJson(generatedScript.script);

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

        case 'patterns': {
          const patternsOptions = { activeOnly: true, includeCompleted: false, includeDropped: false };

          const patternsCacheKey = `recurring_patterns_${JSON.stringify(patternsOptions)}`;
          const cachedPatterns = this.cache.get('analytics', patternsCacheKey);
          if (cachedPatterns) {
            return cachedPatterns;
          }

          const patternsScript = this.omniAutomation.buildScript(GET_RECURRING_PATTERNS_SCRIPT, {
            options: patternsOptions,
          });
          const patternsScriptResult = await this.execJson(patternsScript);

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

          const insights: string[] = [];
          if (patternsResult.totalRecurring === 0) {
            insights.push('No recurring tasks found in your OmniFocus database');
          } else {
            if (patternsResult.mostCommon) {
              insights.push(
                `Most common recurrence pattern: ${(patternsResult.mostCommon as { pattern?: string }).pattern} (${(patternsResult.mostCommon as { count?: number }).count} tasks)`,
              );
            }
            if (patternsResult.patterns && patternsResult.patterns.length > 0) {
              insights.push(`Found ${patternsResult.patterns.length} different recurrence patterns`);
              const weeklyCount = patternsResult.patterns.filter(
                (p: unknown) =>
                  (p as { pattern?: string }).pattern && (p as { pattern?: string }).pattern?.includes('week'),
              ).length;
              const dailyCount = patternsResult.patterns.filter(
                (p: unknown) =>
                  (p as { pattern?: string }).pattern && (p as { pattern?: string }).pattern?.includes('day'),
              ).length;
              const monthlyCount = patternsResult.patterns.filter(
                (p: unknown) =>
                  (p as { pattern?: string }).pattern && (p as { pattern?: string }).pattern?.includes('month'),
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
          }

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

  // =========================================================================
  // Parse Meeting Notes
  // =========================================================================

  private executeParseMeetingNotes(compiled: Extract<CompiledAnalysis, { type: 'parse_meeting_notes' }>): unknown {
    const timer = new OperationTimerV2();

    try {
      const input = compiled.params.text;
      const extractMode =
        compiled.params.extractTasks !== undefined ? (compiled.params.extractTasks ? 'action_items' : 'both') : 'both';
      const defaultProject = compiled.params.defaultProject;
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

    let taskCounter = 1;
    let projectCounter = 1;
    let currentProject: ExtractedProject | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || this.isNonActionable(trimmed)) {
        continue;
      }

      if (args.extractMode !== 'action_items') {
        const projectMatch = this.detectProject(trimmed);
        if (projectMatch) {
          if (currentProject) {
            projects.push(currentProject);
          }
          currentProject = {
            tempId: `proj_${projectCounter++}`,
            name: projectMatch.name,
            tasks: [],
            confidence: projectMatch.confidence,
            sourceText: trimmed,
          };
          continue;
        }
      }

      if (args.extractMode !== 'projects') {
        const task = this.extractTask(trimmed, args, taskCounter, currentProject !== null);
        if (task) {
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
          taskCounter++;
        }
      }
    }

    if (currentProject) {
      projects.push(currentProject);
    }

    return { tasks, projects };
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
      /^(.+?)\s+project:/i,
      /^project:\s*(.+)/i,
      /^(.+?):\s*(create|build|design|plan|implement)/i,
      /(.+?)\s+(includes?|involves?|requires?):/i,
    ];

    for (const pattern of projectPatterns) {
      const match = line.match(pattern);
      if (match) {
        return { name: match[1].trim(), confidence: 'high' };
      }
    }

    if (/^[A-Z]/.test(line) && /^(.+?):\s*$/.test(line)) {
      const match = line.match(/^(.+?):\s*$/);
      if (match) {
        return { name: match[1].trim(), confidence: 'medium' };
      }
    }

    if (/(then|after that|followed by|next step)/i.test(line)) {
      const match = line.match(/^(.+?)(?:\s*[:|-]|\s+(then|after|followed))/i);
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
    isUnderProject = false,
  ): ExtractedTask | null {
    let cleaned = line
      .replace(/^[-*\u2022]\s*/, '')
      .replace(/^\d+\.\s*/, '')
      .trim();

    if (cleaned.length < 5) {
      return null;
    }

    const actionVerbs = [
      'send',
      'call',
      'email',
      'review',
      'update',
      'create',
      'write',
      'schedule',
      'discuss',
      'follow up',
      'check',
      'prepare',
      'organize',
      'plan',
      'research',
      'contact',
      'complete',
      'finish',
      'implement',
      'test',
      'deploy',
      'ask',
      'buy',
      'purchase',
      'get',
      'pick up',
      'drop off',
      'waiting',
      'task',
    ];

    const hasActionVerb = actionVerbs.some((verb) => new RegExp(`\\b${verb}\\b`, 'i').test(cleaned));

    if (!hasActionVerb && !isUnderProject) {
      return null;
    }

    if (isUnderProject && !hasActionVerb && cleaned.length < 3) {
      return null;
    }

    const taskName = this.extractTaskName(cleaned);
    const assigneeTags = this.detectAssignee(cleaned);
    const contextTags = args.suggestTags ? detectContextTags(cleaned) : [];
    const allTags = [...new Set([...assigneeTags, ...contextTags])];
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
    let name = text.replace(/\b(by|for|with|from)\s+\w+\b/gi, '');
    name = name.replace(/\s+(by|on|before|after|until)\s+[\w\s,]+$/i, '');
    name = name.replace(
      /\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week)$/i,
      '',
    );
    return name.trim();
  }

  private detectAssignee(text: string): string[] {
    const tags: string[] = [];
    const assigneeMatch = text.match(/^(\w+)\s+(to|needs to|will|should)\b/i);
    if (assigneeMatch) {
      tags.push(`@${assigneeMatch[1].toLowerCase()}`);
    }
    const waitingMatch = text.match(/waiting\s+(?:for|on)\s+(\w+)(?:'s)?/i);
    if (waitingMatch) {
      tags.push(`@waiting-for-${waitingMatch[1].toLowerCase()}`);
    }
    const agendaMatch = text.match(/(ask|check with|discuss with|talk to)\s+(\w+)/i);
    if (agendaMatch) {
      tags.push(`@agenda-${agendaMatch[2].toLowerCase()}`);
    }
    return tags;
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
    return score >= 2 ? 'high' : score === 1 ? 'medium' : 'low';
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

    return {
      extracted: { tasks: extracted.tasks, projects: extracted.projects },
      summary: { totalTasks, totalProjects: extracted.projects.length, highConfidence, mediumConfidence, needsReview },
      nextSteps: 'Review extracted items and use batch_create to add to OmniFocus',
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
            'Use one of: list_for_review, mark_reviewed, set_schedule, clear_schedule',
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

    const script = this.omniAutomation.buildScript(PROJECTS_FOR_REVIEW_SCRIPT, { filter: args });
    const result = await this.execJson<ReviewListData>(script);
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

    const script = this.omniAutomation.buildScript(MARK_PROJECT_REVIEWED_SCRIPT, {
      projectId: brandedProjectId,
      reviewDate,
      updateNextReviewDate: true,
    });
    const result = await this.execJson(script);

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

    const script = this.omniAutomation.buildScript(SET_REVIEW_SCHEDULE_SCRIPT, {
      projectIds: brandedProjectIds,
      reviewInterval: null,
      nextReviewDate: compiled.params?.reviewDate ?? null,
    });
    const result = await this.execJson(script);

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

  private async reviewsClearSchedule(
    compiled: Extract<CompiledAnalysis, { type: 'manage_reviews' }>,
    timer: OperationTimerV2,
  ): Promise<StandardResponseV2<unknown>> {
    const projectId = compiled.params?.projectId;
    const brandedProjectIds = projectId ? [convertToProjectId(projectId)] : [];

    const script = this.omniAutomation.buildScript(SET_REVIEW_SCHEDULE_SCRIPT, {
      projectIds: brandedProjectIds,
      reviewInterval: null,
      nextReviewDate: null,
    });
    const result = await this.execJson(script);

    if (isScriptError(result)) {
      return createErrorResponseV2(
        'manage_reviews',
        'SCRIPT_ERROR',
        result.error || 'Script execution failed',
        undefined,
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
      operation: 'clear_schedule',
      projects_updated: brandedProjectIds.length,
      input_params: { projectId },
    });
  }
}

import { z } from 'zod';
import { isoDate, v3EnvelopeSchema } from './common.js';

// ---------------------------------------------------------------------------
// V3 analytics data payload schemas (OMN-158 Task 3)
// One module-scope instance per operation (defined below the factory).
// ---------------------------------------------------------------------------

/**
 * Per-project stats value — emitted by productivity-stats-v3.ts projectStats map.
 * Source: projectStats[projectName] = {total, completed, available, completionRate, status, hadRecentActivity}.
 * completionRate is toFixed(1) → string; status/hadRecentActivity always present.
 */
const ProductivityProjectStatsValue = z
  .object({
    total: z.number(),
    completed: z.number(),
    available: z.number(),
    completionRate: z.string(),
    status: z.string(),
    hadRecentActivity: z.boolean(),
  })
  .strict();

/**
 * Per-tag stats value — emitted by productivity-stats-v3.ts tagStats map.
 * Source: tagStats[tagName] = {available, remaining, completionRate}.
 * completionRate is toFixed(1) → string.
 */
const ProductivityTagStatsValue = z
  .object({
    available: z.number(),
    remaining: z.number(),
    completionRate: z.string(),
  })
  .strict();

/**
 * Productivity stats data payload — emitted by PRODUCTIVITY_STATS_SCRIPT_V3 data block.
 * Source: productivity-stats-v3.ts return JSON.stringify({ok:true, v:'3', data:{summary, projectStats, tagStats, insights, metadata}}).
 *
 * summary.completionRate: parseFloat(toFixed(4)) → number.
 * summary.dailyAverage: parseFloat(toFixed(1)) → number.
 * projectStats / tagStats: name-keyed maps → z.record(strict value). Present only when requested.
 */
const ProductivityStatsDataSchema = z
  .object({
    summary: z
      .object({
        period: z.string(),
        totalProjects: z.number(),
        activeProjects: z.number(),
        totalTasks: z.number(),
        completedTasks: z.number(),
        completedInPeriod: z.number(),
        availableTasks: z.number(),
        completionRate: z.number(),
        dailyAverage: z.number(),
        daysInPeriod: z.number(),
        overdueCount: z.number(),
      })
      .strict(),
    projectStats: z.record(ProductivityProjectStatsValue).optional(),
    tagStats: z.record(ProductivityTagStatsValue).optional(),
    insights: z.array(z.string()),
    metadata: z
      .object({
        generated_at: isoDate,
        method: z.string(),
        optimization: z.string(),
        query_time_ms: z.number(),
        note: z.string(),
      })
      .strict(),
  })
  .strict();

/** Module-scope productivity_stats envelope. */
export const PRODUCTIVITY_STATS_V3_SCHEMA = v3EnvelopeSchema(ProductivityStatsDataSchema);

/**
 * Task velocity throughput interval — emitted inside the OmniJS bridge.
 * start/end are Date objects pushed into an array and then passed to JSON.stringify;
 * JSON.stringify calls Date.prototype.toJSON() which returns an ISO string. → z.string().
 * label is toLocaleDateString() → locale-formatted string.
 */
const ThroughputIntervalSchema = z
  .object({
    start: z.string(),
    end: z.string(),
    created: z.number(),
    completed: z.number(),
    label: z.string(),
  })
  .strict();

/**
 * Task velocity data payload — emitted by TASK_VELOCITY_SCRIPT_V3 data block.
 * Source: task-velocity-v3.ts OmniJS return JSON.stringify({ok:true, v:'3', data:{…}}).
 * All velocity fields are toFixed() → strings.
 */
export const TaskVelocityDataSchema = z
  .object({
    velocity: z
      .object({
        period: z.string(),
        averageCompleted: z.string(),
        averageCreated: z.string(),
        dailyVelocity: z.string(),
        backlogGrowthRate: z.string(),
      })
      .strict(),
    throughput: z
      .object({
        intervals: z.array(ThroughputIntervalSchema),
        totalCompleted: z.number(),
        totalCreated: z.number(),
      })
      .strict(),
    breakdown: z
      .object({
        medianCompletionHours: z.string(),
        tasksAnalyzed: z.number(),
      })
      .strict(),
    projections: z
      .object({
        tasksPerDay: z.string(),
        tasksPerWeek: z.string(),
        tasksPerMonth: z.string(),
      })
      .strict(),
    optimization: z.string(),
    dateRange: z
      .object({
        start: z.string(),
        end: z.string(),
      })
      .strict(),
  })
  .strict();

/** Module-scope task_velocity envelope. */
export const TASK_VELOCITY_V3_SCHEMA = v3EnvelopeSchema(TaskVelocityDataSchema);

/**
 * OMN-194: the v3 task-velocity payload's inner `data` block, inferred from
 * `TaskVelocityDataSchema`. Consumers MUST type reads against this (not a
 * hand-maintained parallel interface) so the compiler forbids reading a field
 * the script never emits — the same drift class that produced the OMN-187 bug.
 */
export type TaskVelocityV3Data = z.infer<typeof TaskVelocityDataSchema>;

/**
 * Overdue task row — emitted inside the OmniJS bridge per-task object.
 * Source: analyze-overdue-v3.ts overdueTask object.
 */
const OverdueTaskRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    dueDate: z.string(),
    daysOverdue: z.number(),
    project: z.string(),
    tags: z.array(z.string()),
    blocked: z.boolean(),
    isNext: z.boolean(),
  })
  .strict();

/**
 * Project bottleneck row — emitted inside the OmniJS bridge per-project.
 * Source: analyze-overdue-v3.ts projectList push {name, overdueCount, blockedCount, avgDaysOverdue, blockageRate}.
 * avgDaysOverdue / blockageRate are toFixed(1) → strings.
 */
const ProjectBottleneckRowSchema = z
  .object({
    name: z.string(),
    overdueCount: z.number(),
    blockedCount: z.number(),
    avgDaysOverdue: z.string(),
    blockageRate: z.string(),
  })
  .strict();

/**
 * Overdue analysis data payload — emitted by ANALYZE_OVERDUE_V3 data block.
 * Source: analyze-overdue-v3.ts return JSON.stringify({ok:true, v:'3', data:{summary, insights, groupedByUrgency,
 *   projectBottlenecks, metadata}}).
 *
 * summary.blockedPercentage: round1(n) → number.
 * summary.avgDaysOverdue: round1(n) → number.
 * summary.overduePercentage: OMN-187 — totalOverdue/totalActive*100, round1(n) → number.
 * summary.totalActive: OMN-187 — non-completed, non-dropped task count (the overduePercentage denominator).
 * groupedByUrgency: fixed keys (critical/high/medium/low) all always emitted → NOT z.record.
 * metadata.note is present in the outer emitter.
 * blockedTasks: OMN-194 — dropped (was emitted but never consumed by the tool).
 */
export const OverdueAnalysisDataSchema = z
  .object({
    summary: z
      .object({
        totalOverdue: z.number(),
        blockedCount: z.number(),
        unblockedCount: z.number(),
        blockedPercentage: z.number(),
        avgDaysOverdue: z.number(),
        overduePercentage: z.number(),
        totalActive: z.number(),
        // OMN-187: exact oldest overdue due date over the FULL population (null when
        // none) — tracked uncapped, so correct even past the maxTasks detail cap.
        oldestOverdueDate: z.string().nullable(),
        mostOverdue: OverdueTaskRowSchema.nullable(),
      })
      .strict(),
    insights: z.array(z.string()),
    groupedByUrgency: z
      .object({
        critical: z.array(OverdueTaskRowSchema),
        high: z.array(OverdueTaskRowSchema),
        medium: z.array(OverdueTaskRowSchema),
        low: z.array(OverdueTaskRowSchema),
      })
      .strict(),
    projectBottlenecks: z.array(ProjectBottleneckRowSchema),
    metadata: z
      .object({
        generated_at: isoDate,
        method: z.string(),
        optimization: z.string(),
        query_time_ms: z.number(),
        tasksAnalyzed: z.number(),
        note: z.string(),
      })
      .strict(),
  })
  .strict();

/** Module-scope overdue_analysis envelope. */
export const OVERDUE_ANALYSIS_V3_SCHEMA = v3EnvelopeSchema(OverdueAnalysisDataSchema);

/**
 * OMN-187: the v3 overdue payload's real shape — the INNER `data` block, inferred
 * from `OverdueAnalysisDataSchema` (not the OVERDUE_ANALYSIS_V3_SCHEMA envelope).
 * The tool validates against the envelope, then unwraps `.data` to this. Consumers
 * MUST type their reads against this (not a hand-maintained parallel interface) so
 * the compiler forbids reading a field the script never emits — exactly the drift
 * that produced the always-0/empty overdue_analysis bug.
 */
export type OverdueAnalysisV3Data = z.infer<typeof OverdueAnalysisDataSchema>;

/**
 * Workflow analysis insight row.
 * Source: analyze-overdue-v3.ts insights.push({category, insight, priority}).
 */
const WorkflowInsightSchema = z.object({ category: z.string(), insight: z.string(), priority: z.string() }).strict();

/**
 * Workflow analysis recommendation row.
 * Source: workflow-analysis-v3.ts recommendations.push({category, recommendation, priority}).
 */
const WorkflowRecommendationSchema = z
  .object({ category: z.string(), recommendation: z.string(), priority: z.string() })
  .strict();

/**
 * Workflow analysis data payload — emitted by WORKFLOW_ANALYSIS_V3 data block.
 * Source: workflow-analysis-v3.ts outer return JSON.stringify({ok:true, v:'3', data:{…}}).
 *
 * patterns: NOT a name-keyed map. The script always emits exactly three named keys
 *   (workloadDistribution, workflowMetrics, deferralAnalysis) with heterogeneous shapes.
 *   Using z.unknown() for each sub-value since these contain deeply nested data that would
 *   require extensive schema definitions for no additional safety beyond the top-level strict().
 *
 * data: passthrough of raw task/project/workload data when includeRawData=true;
 *   undefined-dropped (JSON.stringify(undefined)) when false → z.unknown().optional().
 *
 * metadata.note: present from the outer spread. metadata.focusAreas: string[] (from options).
 */
export const WorkflowAnalysisDataSchema = z
  .object({
    insights: z.array(WorkflowInsightSchema),
    patterns: z
      .object({
        workloadDistribution: z.unknown(),
        workflowMetrics: z.unknown(),
        deferralAnalysis: z.unknown(),
      })
      .strict(),
    recommendations: z.array(WorkflowRecommendationSchema),
    // passthrough: includeRawData echo — raw task/project/workload data; undefined-dropped when false
    data: z.unknown().optional(),
    totalTasks: z.number(),
    totalProjects: z.number(),
    analysisTime: z.number(),
    dataPoints: z.number(),
    metadata: z
      .object({
        analysisDepth: z.string(),
        focusAreas: z.array(z.string()),
        maxInsights: z.number(),
        method: z.string(),
        optimization: z.string(),
        query_time_ms: z.number(),
        note: z.string(),
      })
      .strict(),
  })
  .strict();

/** Module-scope workflow_analysis envelope. */
export const WORKFLOW_ANALYSIS_V3_SCHEMA = v3EnvelopeSchema(WorkflowAnalysisDataSchema);

/**
 * OMN-194: the v3 workflow-analysis payload's inner `data` block, inferred from
 * `WorkflowAnalysisDataSchema`. Consumers MUST type reads against this (not a
 * hand-maintained parallel interface) so the compiler forbids reading a field
 * the script never emits — the same drift class that produced the OMN-187 bug.
 */
export type WorkflowAnalysisV3Data = z.infer<typeof WorkflowAnalysisDataSchema>;

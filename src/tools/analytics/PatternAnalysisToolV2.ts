/**
 * Pattern Analysis Tool - Analyzes patterns across entire OmniFocus database
 * Implements duplicate detection, dormant projects, tag audits, and more
 */

import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createAnalyticsResponseV2, createErrorResponseV2 } from '../../utils/response-format.js';
import { createLogger } from '../../utils/logger.js';
import type { PatternAnalysisResponseV2, PatternAnalysisDataV2 } from '../response-types-v2.js';
import { isScriptError, isScriptSuccess } from '../../omnifocus/script-result-types.js';
import { analyzeReviewGaps } from '../../omnifocus/scripts/analytics/review-gaps-analyzer.js';
import { analyzeNextActions } from '../../omnifocus/scripts/analytics/next-actions-analyzer.js';
import { analyzeWipLimits } from '../../omnifocus/scripts/analytics/wip-limits-analyzer.js';
import { analyzeDueDateBunching } from '../../omnifocus/scripts/analytics/due-date-bunching-analyzer.js';

// Schema for pattern analysis request
const PatternAnalysisSchema = z.object({
  patterns: z.array(z.enum([
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
    'all',
  ])).min(1).describe('Which patterns to analyze'),

  options: z.preprocess(
    // First, handle any string inputs by parsing them
    (val) => {
      // If it's already an object, return it
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return val;
      }

      // If it's a string, try to parse it
      if (typeof val === 'string') {
        // Handle empty string
        if (val === '' || val === '""') {
          return {};
        }

        try {
          // Try to parse as JSON
          const parsed = JSON.parse(val) as unknown;

          // If parsed result is a string, try parsing again (double-encoded)
          if (typeof parsed === 'string') {
            try {
              const doubleParsed = JSON.parse(parsed as string) as unknown;
              return doubleParsed;
            } catch {
              // If double parsing fails, return the first parse result
              return parsed;
            }
          }

          return parsed;
        } catch {
          return {};
        }
      }

      // Default to empty object
      return {};
    },
    // Then apply the schema
    z.object({
      dormant_threshold_days: z.union([
        z.number(),
        z.string().transform(val => parseInt(val, 10)),
      ]).optional(),

      duplicate_similarity_threshold: z.union([
        z.number(),
        z.string().transform(val => parseFloat(val)),
      ]).optional(),

      include_completed: z.union([
        z.boolean(),
        z.string().transform(val => val === 'true'),
      ]).optional(),

      excludeCompleted: z.union([
        z.boolean(),
        z.string().transform(val => val === 'true'),
      ]).optional(),

      exclude_completed: z.union([  // Snake_case variant
        z.boolean(),
        z.string().transform(val => val === 'true'),
      ]).optional(),

      includeCompleted: z.union([
        z.boolean(),
        z.string().transform(val => val === 'true'),
      ]).optional(),

      max_tasks: z.union([
        z.number(),
        z.string().transform(val => parseInt(val, 10)),
      ]).optional(),

      // Also accept camelCase variants
      dormantThresholdDays: z.union([
        z.number(),
        z.string().transform(val => parseInt(val, 10)),
      ]).optional(),

      duplicateSimilarityThreshold: z.union([
        z.number(),
        z.string().transform(val => parseFloat(val)),
      ]).optional(),

      similarity_threshold: z.union([  // Shorter variant Claude is using
        z.number(),
        z.string().transform(val => parseFloat(val)),
      ]).optional(),

      maxTasks: z.union([
        z.number(),
        z.string().transform(val => parseInt(val, 10)),
      ]).optional(),

      wipLimit: z.union([
        z.number(),
        z.string().transform(val => parseInt(val, 10)),
      ]).optional(),

      wip_limit: z.union([
        z.number(),
        z.string().transform(val => parseInt(val, 10)),
      ]).optional(),

      bunchingThreshold: z.union([
        z.number(),
        z.string().transform(val => parseInt(val, 10)),
      ]).optional(),

      bunching_threshold: z.union([
        z.number(),
        z.string().transform(val => parseInt(val, 10)),
      ]).optional(),
    }).passthrough(), // Allow unknown fields
  ).default({}).describe('Options object with threshold settings'),
});

type PatternAnalysisParams = z.infer<typeof PatternAnalysisSchema>;

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
  noteHead?: string; // First 160 chars
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

export class PatternAnalysisToolV2 extends BaseTool<typeof PatternAnalysisSchema, PatternAnalysisResponseV2> {
  name = 'analyze_patterns';
  description = 'Analyze patterns across entire OmniFocus database for insights and improvements. Supports: duplicates, dormant projects, tag audits, deadline health, waiting tasks, review gaps, next actions clarity, WIP limits, and due date bunching analysis.';
  schema = PatternAnalysisSchema;

  protected logger = createLogger('PatternAnalysisToolV2');

  protected async executeValidated(params: PatternAnalysisParams): Promise<PatternAnalysisResponseV2> {
    const startTime = Date.now();

    try {
      // The schema has already normalized the options, but we need to handle field mappings
      const rawOptions = params.options || {};

      // Create normalized options object
      // Handle all the various field name formats Claude Desktop might send
      const options = {
        dormant_threshold_days:
          rawOptions.dormant_threshold_days ??
          rawOptions.dormantThresholdDays ??
          90,

        duplicate_similarity_threshold:
          rawOptions.duplicate_similarity_threshold ??
          rawOptions.duplicateSimilarityThreshold ??
          rawOptions.similarity_threshold ?? // New variant Claude is using
          0.85,

        include_completed:
          rawOptions.include_completed ??
          rawOptions.includeCompleted ??
          (rawOptions.excludeCompleted !== undefined ? !rawOptions.excludeCompleted :
           rawOptions.exclude_completed !== undefined ? !rawOptions.exclude_completed : false), // Handle both variants

        max_tasks:
          rawOptions.max_tasks ??
          rawOptions.maxTasks ??
          3000,

        wip_limit:
          rawOptions.wipLimit ??
          rawOptions.wip_limit ??
          5,

        bunching_threshold:
          rawOptions.bunchingThreshold ??
          rawOptions.bunching_threshold ??
          8,
      };

      // Expand 'all' to include all patterns
      const patterns = params.patterns.includes('all') ?
        ['duplicates', 'dormant_projects', 'tag_audit', 'deadline_health',
         'waiting_for', 'estimation_bias', 'next_actions', 'review_gaps', 'wip_limits', 'due_date_bunching'] :
        params.patterns;

      // Fetch slimmed task data
      const slimData = await this.fetchSlimmedData(options);

      if (!slimData) {
        return createErrorResponseV2(
          this.name,
          'EXECUTION_ERROR',
          'Failed to fetch data from OmniFocus - received null response',
          'Check that OmniFocus is running and accessible',
          undefined,
          { query_time_ms: Date.now() - startTime },
        );
      }

      if (!slimData.tasks || !slimData.projects) {
        return createErrorResponseV2(
          this.name,
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
            findings.dormant_projects = this.detectDormantProjects(
              slimData.projects,
              options.dormant_threshold_days,
            );
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
            const result = analyzeNextActions(slimData.tasks.map(t => ({
              id: t.id,
              name: t.name,
              completed: t.completed,
            })));
            findings.next_actions = {
              type: 'next_actions',
              severity: result.vagueTasks > 20 ? 'warning' : 'info',
              count: result.vagueTasks,
              items: result.examples,
              recommendation: result.recommendations.join(' ') || 'Most tasks appear to be clear, actionable next actions.',
            };
            break;
          }
          case 'review_gaps': {
            const result = analyzeReviewGaps(slimData.projects.map(p => ({
              id: p.id,
              name: p.name,
              status: p.status,
              nextReviewDate: p.nextReviewDate || null,
              lastReviewDate: p.lastReviewDate || null,
            })));
            findings.review_gaps = {
              type: 'review_gaps',
              severity: result.projectsNeverReviewed.length > 5 || result.projectsOverdueForReview.length > 3 ? 'warning' : 'info',
              count: result.projectsNeverReviewed.length + result.projectsOverdueForReview.length,
              items: {
                never_reviewed: result.projectsNeverReviewed,
                overdue: result.projectsOverdueForReview,
              },
              recommendation: result.recommendations.join(' ') || 'Project review schedule is mostly up to date.',
            };
            break;
          }
          case 'wip_limits': {
            // WIP analyzer needs projects with their tasks included
            // Group tasks by projectId
            const tasksByProject = new Map<string, typeof slimData.tasks>();
            for (const task of slimData.tasks) {
              if (task.projectId) {
                if (!tasksByProject.has(task.projectId)) {
                  tasksByProject.set(task.projectId, []);
                }
                tasksByProject.get(task.projectId)!.push(task);
              }
            }

            // Build project objects with tasks
            const projectsWithTasks = slimData.projects.map(project => ({
              id: project.id,
              name: project.name,
              status: project.status,
              sequential: false, // We don't have this info, assume parallel
              tasks: (tasksByProject.get(project.id) || []).map(task => ({
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
              slimData.tasks.map(t => ({
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

      // Generate summary insights
      const summary = this.generateSummary(findings, slimData);

      const duration = Date.now() - startTime;

      return createAnalyticsResponseV2(
        'analyze_patterns',
        findings,
        'pattern_analysis',
        summary.key_insights || [],
        {
          tasks_analyzed: slimData.tasks.length,
          projects_analyzed: slimData.projects.length,
          patterns_checked: patterns,
          query_time_ms: duration,
          from_cache: false,
        },
      );

    } catch (error) {
      this.logger.error('Analysis failed', { error });
      return this.handleErrorV2<PatternAnalysisDataV2>(error);
    }
  }

  private async fetchSlimmedData(options: Record<string, unknown>): Promise<{ tasks: SlimTask[], projects: ProjectData[], tags: TagData[] }> {
    // Fetch tasks with minimal data for pattern analysis
    const taskScript = `(() => {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      const tasks = [];
      const projects = [];
      
      // Fetch tasks
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
          
          // Optional fields
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
      
      // Fetch projects
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
        } catch(e) {
          // Skip problematic projects
        }
      }
      
      // Fetch all tags from OmniFocus
      const tags = [];
      const allTags = doc.flattenedTags();
      for (let i = 0; i < allTags.length; i++) {
        const tag = allTags[i];
        try {
          const tagData = {
            name: tag.name(),
            id: tag.id()
          };
          
          // Count tasks with this tag
          let taskCount = 0;
          try {
            const taggedTasks = tag.tasks();
            taskCount = taggedTasks ? taggedTasks.length : 0;
          } catch(e) {}
          
          tagData.taskCount = taskCount;
          tags.push(tagData);
        } catch(e) {
          // Skip problematic tags
        }
      }
      
      return JSON.stringify({ tasks, projects, tags });
    })()`;  // Execute the IIFE immediately

    const scriptResult = await this.execJson(taskScript);

    if (isScriptError(scriptResult)) {
      this.logger.error('fetchSlimmedData failed', { error: scriptResult.error });
      return { tasks: [], projects: [], tags: [] };
    }

    if (!isScriptSuccess(scriptResult)) {
      this.logger.error('fetchSlimmedData returned unexpected format', { result: scriptResult });
      return { tasks: [], projects: [], tags: [] };
    }

    // The script returns the data directly (already parsed JSON)
    const result = scriptResult.data;
    if (!result) {
      return { tasks: [], projects: [], tags: [] };
    }

    // Result can be either already parsed or a string
    if (typeof result === 'string') {
      // JSON parsing of OmniAutomation result string is untyped
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(result);
    }
    return result as { tasks: SlimTask[], projects: ProjectData[], tags: TagData[] };
  }

  private detectDuplicates(tasks: SlimTask[], options: Record<string, unknown>): PatternFinding {
    const duplicates: Array<{ task1: SlimTask, task2: SlimTask, similarity: number }> = [];
    const threshold = typeof options.duplicate_similarity_threshold === 'number' ? options.duplicate_similarity_threshold : 0.85;

    // Simple duplicate detection based on name similarity
    for (let i = 0; i < tasks.length - 1; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const similarity = this.calculateSimilarity(tasks[i].name, tasks[j].name);

        if (similarity >= threshold) {
          // Check they're not in the same project (subtasks with similar names are OK)
          if (tasks[i].projectId !== tasks[j].projectId || !tasks[i].projectId) {
            duplicates.push({
              task1: tasks[i],
              task2: tasks[j],
              similarity,
            });
          }
        }
      }
    }

    // Group duplicate clusters
    const clusters = this.clusterDuplicates(duplicates);

    return {
      type: 'duplicates',
      severity: clusters.length > 10 ? 'warning' : 'info',
      count: clusters.length,
      items: clusters.slice(0, 10), // Top 10 clusters
      recommendation: clusters.length > 0 ?
        `Found ${clusters.length} potential duplicate task clusters. Review and merge or clarify distinctions.` :
        'No significant duplicates detected.',
    };
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Normalize strings
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // Exact match
    if (s1 === s2) return 1.0;

    // Calculate Levenshtein distance ratio
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;

    const distance = this.levenshteinDistance(s1, s2);
    return 1 - (distance / maxLen);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    // Array creation with fill/map pattern is untyped but mathematically correct
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,    // deletion
            dp[i][j - 1] + 1,    // insertion
            dp[i - 1][j - 1] + 1, // substitution
          );
        }
      }
    }

    return dp[m][n];
  }

  private clusterDuplicates(duplicates: Array<{ task1: SlimTask; task2: SlimTask; similarity: number }>): DuplicateCluster[] {
    // Group duplicates into clusters
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

    // Convert to array format with task details
    return Array.from(clusters.values()).map(cluster => {
      const taskIds = Array.from(cluster);
      const tasks = duplicates
        .filter(d => taskIds.includes(d.task1.id) || taskIds.includes(d.task2.id))
        .flatMap(d => [d.task1, d.task2])
        .filter((task, index, self) => self.findIndex(t => t.id === task.id) === index);

      return {
        cluster_size: cluster.size,
        tasks: tasks.map(t => ({ id: t.id, name: t.name, project: t.project })),
      };
    });
  }

  private detectDormantProjects(projects: ProjectData[], thresholdDays: number): PatternFinding {
    const now = new Date();
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const dormant: DormantProject[] = [];

    for (const project of projects) {
      // Skip completed/dropped projects
      if (project.status === 'done' || project.status === 'dropped') continue;

      // Check last modification date
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

    // Sort by dormancy duration
    dormant.sort((a, b) => b.days_dormant - a.days_dormant);

    return {
      type: 'dormant_projects',
      severity: dormant.length > 5 ? 'warning' : 'info',
      count: dormant.length,
      items: dormant.slice(0, 10),
      recommendation: dormant.length > 0 ?
        `${dormant.length} projects haven't been modified in over ${thresholdDays} days. Consider reviewing, completing, or dropping them.` :
        'All projects show recent activity.',
    };
  }

  private auditTags(tasks: SlimTask[], allTags: TagData[] = []): PatternFinding {
    const tagStats = new Map<string, number>();
    const tagProjects = new Map<string, Set<string>>();

    // First, populate all tags from the tags array (includes unused tags)
    for (const tag of allTags) {
      tagStats.set(tag.name, tag.taskCount || 0);
    }

    // Then collect tag usage from tasks to get project distribution
    for (const task of tasks) {
      for (const tag of task.tags) {
        // Update count if we're getting it from tasks (more accurate)
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

    // Analyze tag patterns
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

    // Find unused and underused tags
    for (const [tag, count] of tagStats) {
      if (count === 0) {
        findings.unused_tags.push(tag);
      } else if (count < 3) {
        findings.underused_tags.push({ tag, count });
      } else if (count > 100) {
        findings.overused_tags.push({
          tag,
          count,
          project_spread: tagProjects.get(tag)?.size || 0,
        });
      }
    }

    // Detect potential synonyms (tags with very similar names)
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

    // Calculate tag entropy (diversity measure)
    const totalTagUsage = Array.from(tagStats.values()).reduce((a, b) => a + b, 0);
    let entropy = 0;
    for (const count of tagStats.values()) {
      const p = count / totalTagUsage;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    const severity = findings.underused_tags.length > 10 || findings.potential_synonyms.length > 5 ?
      'warning' : 'info';

    return {
      type: 'tag_audit',
      severity,
      count: tagStats.size,
      items: {
        ...findings,
        entropy: entropy.toFixed(2),
        entropy_interpretation: entropy < 2 ? 'Low diversity - consider more tags' :
                                entropy > 5 ? 'High diversity - consider consolidation' :
                                'Moderate diversity',
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
      recommendations.push(`${findings.underused_tags.length} tags are rarely used. Consider removing or merging them.`);
    }

    if (findings.potential_synonyms.length > 0) {
      recommendations.push(`Found ${findings.potential_synonyms.length} potential tag synonyms that could be merged.`);
    }

    if (findings.overused_tags.length > 0) {
      recommendations.push(`${findings.overused_tags.length} tags are heavily used. Consider creating more specific sub-tags.`);
    }

    return recommendations.length > 0 ?
      recommendations.join(' ') :
      'Tag usage appears well-balanced.';
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

      // Track deadline bunching by date
      const dateKey = dueDate.toISOString().split('T')[0];
      findings.deadline_bunching.set(dateKey, (findings.deadline_bunching.get(dateKey) || 0) + 1);
    }

    // Find days with too many deadlines
    const bunchedEntries: Array<[string, number]> = Array.from(findings.deadline_bunching.entries());
    const bunchedDates = bunchedEntries
      .filter(([_, count]) => count > 5)
      .sort((a, b) => b[1] - a[1]);

    const severity = findings.overdue.length > 10 ? 'critical' :
                     findings.overdue.length > 5 ? 'warning' : 'info';

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

    return recommendations.length > 0 ?
      recommendations.join(' ') :
      'Deadline distribution looks manageable.';
  }

  private analyzeWaitingFor(tasks: SlimTask[]): PatternFinding {
    // Look for tasks that might be waiting (based on name patterns or tags)
    const waitingPatterns = [
      /waiting/i, /wait for/i, /blocked by/i, /depends on/i,
      /after/i, /once .* complete/i, /pending/i,
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

      // Check name for waiting patterns
      const isWaiting = waitingPatterns.some(pattern => pattern.test(task.name));

      // Check for waiting tag
      const hasWaitingTag = task.tags.some(tag =>
        /wait/i.test(tag) || /pending/i.test(tag) || /blocked/i.test(tag),
      );

      // Check if task is blocked (has incomplete children)
      const isBlocked = task.status === 'blocked' || (task.children && task.children > 0);

      if (isWaiting || hasWaitingTag || isBlocked) {
        const daysWaiting = task.createdDate ?
          Math.floor((Date.now() - new Date(task.createdDate).getTime()) / (24 * 60 * 60 * 1000)) : 0;

        waitingTasks.push({
          id: task.id,
          name: task.name,
          project: task.project,
          reason: isWaiting ? 'name_pattern' : hasWaitingTag ? 'tag' : 'blocked',
          days_waiting: daysWaiting,
        });
      }
    }

    // Sort by waiting duration
    waitingTasks.sort((a, b) => b.days_waiting - a.days_waiting);

    const severity = waitingTasks.filter(t => t.days_waiting > 30).length > 5 ? 'warning' : 'info';

    return {
      type: 'waiting_for',
      severity,
      count: waitingTasks.length,
      items: waitingTasks.slice(0, 10),
      recommendation: waitingTasks.length > 10 ?
        `${waitingTasks.length} tasks appear to be waiting. Review blockers and follow up on dependencies.` :
        'Waiting/blocked tasks are at reasonable levels.',
    };
  }

  private analyzeEstimationBias(tasks: SlimTask[]): PatternFinding {
    const estimatedTasks = tasks.filter(t => t.estimatedMinutes && t.completed && t.completionDate);

    if (estimatedTasks.length < 10) {
      return {
        type: 'estimation_bias',
        severity: 'info',
        count: 0,
        recommendation: 'Not enough completed tasks with estimates to analyze bias.',
      };
    }

    // This would require actual completion time tracking, which OmniFocus doesn't provide
    // Instead, we'll analyze the distribution of estimates
    const estimates = tasks
      .filter(t => t.estimatedMinutes)
      .map(t => t.estimatedMinutes!);

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

    // Check for common estimation anti-patterns
    const findings: {
      stats: {
        count: number;
        min: number;
        max: number;
        mean: number;
        median: number;
      };
      patterns: string[];
    } = {
      stats,
      patterns: [],
    };

    // Pattern: Everything is 30 or 60 minutes
    const commonEstimates = estimates.filter(e => e === 30 || e === 60);
    if (commonEstimates.length > estimates.length * 0.5) {
      findings.patterns.push('Over-reliance on 30/60 minute estimates');
    }

    // Pattern: No small tasks
    if (stats.min >= 30) {
      findings.patterns.push('No tasks under 30 minutes - consider breaking down work');
    }

    // Pattern: Huge variance
    if (stats.max > stats.mean * 10) {
      findings.patterns.push('Very large tasks detected - consider decomposition');
    }

    return {
      type: 'estimation_bias',
      severity: findings.patterns.length > 1 ? 'warning' : 'info',
      count: estimates.length,
      items: findings,
      recommendation: findings.patterns.length > 0 ?
        `Estimation patterns suggest: ${findings.patterns.join(', ')}` :
        'Time estimation distribution looks reasonable.',
    };
  }

  private generateSummary(findings: Record<string, PatternFinding>, data: {
    tasks: SlimTask[];
    projects: ProjectData[];
  }): {
    health_score: number;
    health_rating: string;
    total_tasks_analyzed: number;
    total_projects_analyzed: number;
    patterns_analyzed: number;
    critical_findings: number;
    warning_findings: number;
    key_insights: string[];
  } {
    const criticalCount = Object.values(findings).filter(f => f.severity === 'critical').length;
    const warningCount = Object.values(findings).filter(f => f.severity === 'warning').length;

    const keyInsights: string[] = [];

    // Add most important findings
    for (const [key, finding] of Object.entries(findings)) {
      if (finding.severity === 'critical' || finding.severity === 'warning') {
        keyInsights.push(finding.recommendation || `${key}: ${finding.count} issues found`);
      }
    }

    // Overall health score (simple heuristic)
    const healthScore = Math.max(0, 100 - (criticalCount * 20) - (warningCount * 10));

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

}

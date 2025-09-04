/**
 * Pattern Analysis Tool - Analyzes patterns across entire OmniFocus database
 * v2.0.0 consolidated version
 */

import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createAnalyticsResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { createLogger } from '../../utils/logger.js';
import { getMinimalHelpers } from '../../omnifocus/scripts/shared/helpers.js';
import { isScriptSuccess, AnalyticsResultSchema } from '../../omnifocus/script-result-types.js';

// Schema using v2.0.0 patterns - handle MCP bridge string coercion
const PatternAnalysisSchema = z.object({
  patterns: z.union([
    z.array(z.enum([
      'duplicates',
      'dormant_projects',
      'tag_audit',
      'deadline_health',
      'waiting_for',
      'all',
    ])),
    z.enum(['duplicates', 'dormant_projects', 'tag_audit', 'deadline_health', 'waiting_for', 'all'])
      .transform(val => [val]),
  ]).default(['all']).describe('Patterns to analyze'),

  dormantThresholdDays: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10)),
  ]).pipe(z.number().min(1).max(365)).default(60),

  duplicateSimilarityThreshold: z.union([
    z.number(),
    z.string().transform(val => parseFloat(val)),
  ]).pipe(z.number().min(0.5).max(1.0)).default(0.85),

  includeCompleted: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true'),
  ]).default(false),

  maxTasks: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10)),
  ]).pipe(z.number().min(100).max(10000)).default(3000),
});

type PatternAnalysisParams = z.infer<typeof PatternAnalysisSchema>;

export class PatternAnalysisTool extends BaseTool<typeof PatternAnalysisSchema> {
  name = 'pattern_analysis';
  description = 'Analyze patterns across OmniFocus database (duplicates, dormant projects, tag issues, etc.)';
  schema = PatternAnalysisSchema;

  protected logger = createLogger('PatternAnalysisTool');

  protected async executeValidated(params: PatternAnalysisParams): Promise<any> {
    const timer = new OperationTimerV2();

    try {
      const { patterns, dormantThresholdDays, duplicateSimilarityThreshold, includeCompleted, maxTasks } = params;

      // Expand 'all' pattern
      const patternsToAnalyze = patterns.includes('all')
        ? ['duplicates', 'dormant_projects', 'tag_audit', 'deadline_health', 'waiting_for']
        : patterns;

      // Build and execute the analysis script
      const script = this.buildAnalysisScript({
        patterns: patternsToAnalyze,
        dormantThresholdDays,
        duplicateSimilarityThreshold,
        includeCompleted,
        maxTasks,
      });

      const result = await this.omniAutomation.executeJson(script, AnalyticsResultSchema);

      if (!isScriptSuccess(result)) {
        return createErrorResponseV2(
          'pattern_analysis',
          'ANALYSIS_FAILED',
          result.error,
          'Check OmniFocus is running and has data to analyze',
          result.details,
          timer.toMetadata(),
        );
      }

      // Extract key findings
      const keyFindings = this.extractKeyFindings(result.data);

      return createAnalyticsResponseV2(
        'pattern_analysis',
        result.data,
        'Pattern Analysis Complete',
        keyFindings,
        {
          patterns_analyzed: patternsToAnalyze,
          tasks_analyzed: (result.data as any).metadata?.tasksAnalyzed || 0,
          projects_analyzed: (result.data as any).metadata?.projectsAnalyzed || 0,
          ...timer.toMetadata(),
        },
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return createErrorResponseV2(
        'pattern_analysis',
        'ANALYSIS_ERROR',
        errorMessage,
        'Ensure OmniFocus is running and accessible',
        undefined,
        timer.toMetadata(),
      );
    }
  }

  private buildAnalysisScript(options: any): string {
    const helpers = getMinimalHelpers();

    return `(() => {
      ${helpers}
      
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      const patterns = ${JSON.stringify(options.patterns)};
      const dormantDays = ${options.dormantThresholdDays};
      const duplicateThreshold = ${options.duplicateSimilarityThreshold};
      const includeCompleted = ${options.includeCompleted};
      const maxTasks = ${options.maxTasks};
      
      const findings = {};
      const metadata = { tasksAnalyzed: 0, projectsAnalyzed: 0 };
      
      // Helper: Calculate similarity between two strings
      function similarity(s1, s2) {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = (a, b) => {
          const matrix = [];
          for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
          }
          for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
          }
          for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
              if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
              } else {
                matrix[i][j] = Math.min(
                  matrix[i - 1][j - 1] + 1,
                  matrix[i][j - 1] + 1,
                  matrix[i - 1][j] + 1
                );
              }
            }
          }
          return matrix[b.length][a.length];
        };
        
        return (longer.length - editDistance(longer.toLowerCase(), shorter.toLowerCase())) / longer.length;
      }
      
      // Pattern: Find duplicate tasks
      if (patterns.includes('duplicates')) {
        const tasks = [];
        const allTasks = doc.flattenedTasks();
        
        for (let i = 0; i < Math.min(allTasks.length, maxTasks); i++) {
          const task = allTasks[i];
          try {
            if (!includeCompleted && task.completed()) continue;
            
            tasks.push({
              id: task.id(),
              name: task.name(),
              project: safeGet(() => task.containingProject()?.name())
            });
            metadata.tasksAnalyzed++;
          } catch (e) {}
        }
        
        const duplicates = [];
        for (let i = 0; i < tasks.length - 1; i++) {
          for (let j = i + 1; j < tasks.length; j++) {
            const sim = similarity(tasks[i].name, tasks[j].name);
            if (sim >= duplicateThreshold) {
              duplicates.push({
                task1: tasks[i],
                task2: tasks[j],
                similarity: Math.round(sim * 100)
              });
            }
          }
        }
        
        findings.duplicates = {
          count: duplicates.length,
          items: duplicates.slice(0, 10)
        };
      }
      
      // Pattern: Find dormant projects
      if (patterns.includes('dormant_projects')) {
        const projects = [];
        const allProjects = doc.flattenedProjects();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - dormantDays);
        
        for (let i = 0; i < allProjects.length; i++) {
          const project = allProjects[i];
          try {
            const status = project.status().toString();
            if (status !== 'active') continue;
            
            const lastModified = project.modificationDate();
            if (lastModified && lastModified < cutoffDate) {
              const daysDormant = Math.floor((new Date() - lastModified) / (1000 * 60 * 60 * 24));
              projects.push({
                name: project.name(),
                lastModified: lastModified.toISOString(),
                daysDormant: daysDormant,
                taskCount: project.numberOfTasks()
              });
            }
            metadata.projectsAnalyzed++;
          } catch (e) {}
        }
        
        findings.dormant_projects = {
          count: projects.length,
          threshold_days: dormantDays,
          items: projects.sort((a, b) => b.daysDormant - a.daysDormant).slice(0, 10)
        };
      }
      
      // Pattern: Tag audit
      if (patterns.includes('tag_audit')) {
        const tagUsage = {};
        const allTasks = doc.flattenedTasks();
        
        for (let i = 0; i < Math.min(allTasks.length, maxTasks); i++) {
          const task = allTasks[i];
          try {
            if (!includeCompleted && task.completed()) continue;
            
            const tags = task.tags();
            if (tags) {
              tags.forEach(tag => {
                const tagName = tag.name();
                tagUsage[tagName] = (tagUsage[tagName] || 0) + 1;
              });
            }
          } catch (e) {}
        }
        
        const sortedTags = Object.entries(tagUsage)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
        
        findings.tag_audit = {
          total_tags: sortedTags.length,
          unused_tags: sortedTags.filter(t => t.count === 0).map(t => t.name),
          rarely_used: sortedTags.filter(t => t.count > 0 && t.count <= 2).slice(0, 10),
          most_used: sortedTags.slice(0, 10)
        };
      }
      
      // Pattern: Deadline health
      if (patterns.includes('deadline_health')) {
        const now = new Date();
        let overdue = 0;
        let dueSoon = 0;
        let dueThisWeek = 0;
        
        const allTasks = doc.flattenedTasks();
        for (let i = 0; i < Math.min(allTasks.length, maxTasks); i++) {
          const task = allTasks[i];
          try {
            if (task.completed()) continue;
            
            const dueDate = task.dueDate();
            if (dueDate) {
              const daysUntilDue = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
              
              if (daysUntilDue < 0) overdue++;
              else if (daysUntilDue <= 2) dueSoon++;
              else if (daysUntilDue <= 7) dueThisWeek++;
            }
          } catch (e) {}
        }
        
        findings.deadline_health = {
          overdue_count: overdue,
          due_soon_count: dueSoon,
          due_this_week_count: dueThisWeek
        };
      }
      
      // Pattern: Waiting-for analysis
      if (patterns.includes('waiting_for')) {
        const waitingTasks = [];
        const allTasks = doc.flattenedTasks();
        
        for (let i = 0; i < Math.min(allTasks.length, maxTasks); i++) {
          const task = allTasks[i];
          try {
            if (task.completed()) continue;
            
            const name = task.name().toLowerCase();
            const tags = safeGetTags(task);
            const hasWaitingTag = tags.some(t => t.toLowerCase().includes('wait'));
            
            if (name.includes('waiting') || name.includes('wait for') || hasWaitingTag) {
              const createdDate = task.creationDate();
              const daysWaiting = createdDate ? 
                Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24)) : 0;
              
              waitingTasks.push({
                name: task.name(),
                project: safeGet(() => task.containingProject()?.name()),
                daysWaiting: daysWaiting
              });
            }
          } catch (e) {}
        }
        
        findings.waiting_for = {
          count: waitingTasks.length,
          items: waitingTasks.sort((a, b) => b.daysWaiting - a.daysWaiting).slice(0, 10)
        };
      }
      
      return JSON.stringify({
        findings: findings,
        metadata: metadata,
        timestamp: new Date().toISOString()
      });
    })()`;
  }

  private extractKeyFindings(result: any): string[] {
    const findings: string[] = [];

    if (result?.findings?.duplicates?.count > 0) {
      findings.push(`Found ${result.findings.duplicates.count} potential duplicate tasks`);
    }

    if (result?.findings?.dormant_projects?.count > 0) {
      findings.push(`${result.findings.dormant_projects.count} projects dormant for ${result.findings.dormant_projects.threshold_days}+ days`);
    }

    if (result?.findings?.tag_audit) {
      const audit = result.findings.tag_audit;
      if (audit.unused_tags?.length > 0) {
        findings.push(`${audit.unused_tags.length} unused tags found`);
      }
      if (audit.rarely_used?.length > 0) {
        findings.push(`${audit.rarely_used.length} tags rarely used (≤2 tasks)`);
      }
    }

    if (result?.findings?.deadline_health) {
      const health = result.findings.deadline_health;
      if (health.overdue_count > 0) {
        findings.push(`⚠️ ${health.overdue_count} tasks overdue`);
      }
      if (health.due_soon_count > 0) {
        findings.push(`${health.due_soon_count} tasks due in next 2 days`);
      }
    }

    if (result?.findings?.waiting_for?.count > 0) {
      const longWaiting = result.findings.waiting_for.items?.filter((t: any) => t.daysWaiting > 30);
      if (longWaiting?.length > 0) {
        findings.push(`${longWaiting.length} tasks waiting 30+ days`);
      }
    }

    return findings.length > 0 ? findings : ['Analysis complete - no significant patterns detected'];
  }
}

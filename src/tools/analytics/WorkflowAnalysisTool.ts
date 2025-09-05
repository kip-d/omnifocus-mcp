import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { createLogger } from '../../utils/logger.js';
import { createAnalyticsResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { WORKFLOW_ANALYSIS_SCRIPT } from '../../omnifocus/scripts/analytics.js';
import { isScriptSuccess, AnalyticsResultSchema } from '../../omnifocus/script-result-types.js';

// Schema for the workflow analysis tool
const WorkflowAnalysisSchema = z.object({
  analysisDepth: z.enum(['quick', 'standard', 'deep'])
    .default('standard')
    .describe('Analysis depth: quick (insights only), standard (insights + key data), deep (insights + full dataset)'),

  focusAreas: z.array(z.enum(['productivity', 'workload', 'project_health', 'time_patterns', 'bottlenecks', 'opportunities']))
    .default(['productivity', 'workload', 'bottlenecks'])
    .describe('Specific areas to focus analysis on'),

  includeRawData: z.boolean()
    .default(false)
    .describe('Include raw task/project data for LLM exploration (increases token usage)'),

  maxInsights: z.number()
    .min(5)
    .max(50)
    .default(15)
    .describe('Maximum number of insights to generate'),
});

type WorkflowAnalysisArgs = z.infer<typeof WorkflowAnalysisSchema>;

export class WorkflowAnalysisTool extends BaseTool<typeof WorkflowAnalysisSchema> {
  name = 'workflow_analysis';
  description = 'Deep analysis of your OmniFocus workflow health and system efficiency. Returns actionable insights about workflow patterns, momentum, bottlenecks, and system optimization. Focuses on how well your GTD system is working rather than completion metrics. Use for occasional deep dives into your workflow patterns.';
  schema = WorkflowAnalysisSchema;

  constructor(cache: CacheManager) {
    super(cache);
  }

  async executeValidated(args: WorkflowAnalysisArgs): Promise<any> {
    const timer = new OperationTimerV2();
    const logger = createLogger('workflow_analysis');

    try {
      logger.info(`Starting workflow analysis with depth: ${args.analysisDepth}, focus: ${args.focusAreas.join(', ')}`);

      // Create cache key
      const cacheKey = `workflow_analysis_${args.analysisDepth}_${args.focusAreas.sort().join('_')}_${args.maxInsights}`;

      // Check cache (2 hours TTL for deep analysis)
      const cached = this.cache.get<any>('analytics', cacheKey);
      if (cached) {
        logger.debug('Returning cached workflow analysis');
        return createAnalyticsResponseV2(
          'workflow_analysis',
          cached,
          'Workflow Analysis Results',
          this.extractKeyFindings(cached),
          {
            from_cache: true,
            analysis_depth: args.analysisDepth,
            focus_areas: args.focusAreas,
            ...timer.toMetadata(),
          },
        );
      }

      // Execute the workflow analysis script
      const script = this.omniAutomation.buildScript(WORKFLOW_ANALYSIS_SCRIPT, {
        options: {
          analysisDepth: args.analysisDepth,
          focusAreas: args.focusAreas,
          maxInsights: args.maxInsights,
          includeRawData: args.includeRawData,
        },
      });

      const result = await this.omniAutomation.executeJson(script, AnalyticsResultSchema);

      if (!isScriptSuccess(result)) {
        return createErrorResponseV2(
          'workflow_analysis',
          'ANALYSIS_FAILED',
          result.error,
          'Check that OmniFocus has sufficient data for analysis',
          result.details,
          timer.toMetadata(),
        );
      }

      // Structure the response data
      const responseData = {
        analysis: {
          depth: args.analysisDepth,
          focusAreas: args.focusAreas,
          timestamp: new Date().toISOString(),
        },
        insights: (result.data as any).insights || [],
        patterns: (result.data as any).patterns || {},
        recommendations: (result.data as any).recommendations || [],
        data: args.includeRawData ? ((result.data as any).data || {}) : undefined,
        metadata: {
          totalTasks: (result.data as any).totalTasks || 0,
          totalProjects: (result.data as any).totalProjects || 0,
          analysisTime: (result.data as any).analysisTime || 0,
          dataPoints: (result.data as any).dataPoints || 0,
        },
      };

      // Cache for 2 hours (deep analysis takes time)
      this.cache.set('analytics', cacheKey, responseData);

      // Generate key findings
      const keyFindings = this.extractKeyFindings(responseData);

      return createAnalyticsResponseV2(
        'workflow_analysis',
        responseData,
        'Workflow Analysis Results',
        keyFindings,
        {
          analysis_depth: args.analysisDepth,
          focus_areas: args.focusAreas,
          include_raw_data: args.includeRawData,
          ...timer.toMetadata(),
        },
      );

    } catch (error) {
      logger.error('Workflow analysis failed', error);
      return createErrorResponseV2(
        'workflow_analysis',
        'EXECUTION_ERROR',
        'Failed to execute workflow analysis',
        'Try reducing analysis depth or focus areas',
        error instanceof Error ? error.message : String(error),
        timer.toMetadata(),
      );
    }
  }

  private extractKeyFindings(data: any): string[] {
    const findings: string[] = [];

    if (data.insights && Array.isArray(data.insights)) {
      findings.push(...data.insights.slice(0, 3).map((i: any) => i.insight || i.message || String(i)));
    }

    if (data.recommendations && Array.isArray(data.recommendations)) {
      findings.push(...data.recommendations.slice(0, 2).map((r: any) => r.recommendation || r.message || String(r)));
    }

    if (data.patterns) {
      const patternKeys = Object.keys(data.patterns);
      if (patternKeys.length > 0) {
        findings.push(`Found ${patternKeys.length} key patterns in your workflow`);
      }
    }

    return findings.length > 0 ? findings : ['Analysis completed successfully'];
  }
}

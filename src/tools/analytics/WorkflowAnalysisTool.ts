import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { createLogger } from '../../utils/logger.js';
import { createAnalyticsResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { WORKFLOW_ANALYSIS_SCRIPT } from '../../omnifocus/scripts/analytics.js';
import { isScriptError, isScriptSuccess } from '../../omnifocus/script-result-types.js';
import { WorkflowAnalysisData } from '../../omnifocus/script-response-types.js';

// Schema for the workflow analysis tool
const WorkflowAnalysisSchema = z.object({
  analysisDepth: z.enum(['quick', 'standard', 'deep'])
    .default('standard')
    .describe('Analysis depth: quick (insights only), standard (insights + key data), deep (insights + full dataset)'),

  focusAreas: z.array(z.enum(['productivity', 'workload', 'project_health', 'time_patterns', 'bottlenecks', 'opportunities']))
    .default(['productivity', 'workload', 'bottlenecks'])
    .describe('Specific areas to focus analysis on'),

  includeRawData: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true'),
  ]).pipe(z.boolean())
    .default(false)
    .describe('Include raw task/project data for LLM exploration (increases token usage)'),

  maxInsights: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10)),
  ]).pipe(z.number().min(5).max(50))
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

      const data: WorkflowAnalysisData = isScriptSuccess(result) ? result.data : {
        analysis: {
          patterns: [],
          bottlenecks: [],
          recommendations: [],
          insights: [],
        },
        summary: {
          score: 0,
          status: 'No data available',
        },
      };

      // Structure the response data
      const responseData = {
        analysis: {
          depth: args.analysisDepth,
          focusAreas: args.focusAreas,
          timestamp: new Date().toISOString(),
        },
        insights: data.analysis?.insights || [],
        patterns: data.analysis?.patterns || [],
        recommendations: data.analysis?.recommendations || [],
        data: args.includeRawData ? data : undefined,
        metadata: {
          totalTasks: 0,
          totalProjects: 0,
          analysisTime: 0,
          dataPoints: data.analysis?.patterns?.length || 0,
          score: data.summary?.score || 0,
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

  private extractKeyFindings(data: {
    insights?: Array<string | { insight?: string; message?: string }>;
    recommendations?: Array<string | { recommendation?: string; message?: string }>;
    patterns?: unknown[];
    metadata?: {
      score?: number;
    };
  }): string[] {
    const findings: string[] = [];

    if (data.insights && Array.isArray(data.insights)) {
      findings.push(...data.insights.slice(0, 3).map(i => {
        if (typeof i === 'string') return i;
        if (typeof i === 'object' && i !== null) {
          return (i as any).insight || (i as any).message || String(i);
        }
        return String(i);
      }));
    }

    if (data.recommendations && Array.isArray(data.recommendations)) {
      findings.push(...data.recommendations.slice(0, 2).map(r => {
        if (typeof r === 'string') return r;
        if (typeof r === 'object' && r !== null) {
          return (r as any).recommendation || (r as any).message || String(r);
        }
        return String(r);
      }));
    }

    if (data.patterns && Array.isArray(data.patterns) && data.patterns.length > 0) {
      findings.push(`Found ${data.patterns.length} key patterns in your workflow`);
    }

    if (data.metadata?.score && data.metadata.score > 0) {
      findings.push(`Workflow health score: ${data.metadata.score}/100`);
    }

    return findings.length > 0 ? findings : ['Analysis completed successfully'];
  }
}

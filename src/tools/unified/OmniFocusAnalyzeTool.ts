import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { AnalyzeSchema, type AnalyzeInput } from './schemas/analyze-schema.js';
import { AnalysisCompiler, type CompiledAnalysis } from './compilers/AnalysisCompiler.js';
import { ProductivityStatsTool } from '../analytics/ProductivityStatsTool.js';
import { TaskVelocityTool } from '../analytics/TaskVelocityTool.js';
import { OverdueAnalysisTool } from '../analytics/OverdueAnalysisTool.js';
import { PatternAnalysisTool } from '../analytics/PatternAnalysisTool.js';
import { WorkflowAnalysisTool } from '../analytics/WorkflowAnalysisTool.js';
import { RecurringTasksTool } from '../recurring/RecurringTasksTool.js';
import { ParseMeetingNotesTool } from '../capture/ParseMeetingNotesTool.js';
import { ManageReviewsTool } from '../reviews/ManageReviewsTool.js';

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
    capabilities: ['productivity_stats', 'task_velocity', 'overdue_analysis', 'pattern_analysis', 'workflow_analysis', 'recurring_tasks', 'parse_meeting_notes', 'manage_reviews'],
  };

  private compiler: AnalysisCompiler;
  private productivityTool: ProductivityStatsTool;
  private velocityTool: TaskVelocityTool;
  private overdueTool: OverdueAnalysisTool;
  private patternTool: PatternAnalysisTool;
  private workflowTool: WorkflowAnalysisTool;
  private recurringTool: RecurringTasksTool;
  private meetingNotesTool: ParseMeetingNotesTool;
  private reviewsTool: ManageReviewsTool;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new AnalysisCompiler();

    // Instantiate all analysis tools
    this.productivityTool = new ProductivityStatsTool(cache);
    this.velocityTool = new TaskVelocityTool(cache);
    this.overdueTool = new OverdueAnalysisTool(cache);
    this.patternTool = new PatternAnalysisTool(cache);
    this.workflowTool = new WorkflowAnalysisTool(cache);
    this.recurringTool = new RecurringTasksTool(cache);
    this.meetingNotesTool = new ParseMeetingNotesTool(cache);
    this.reviewsTool = new ManageReviewsTool(cache);
  }

  async executeValidated(args: AnalyzeInput): Promise<unknown> {
    const compiled = this.compiler.compile(args);

    // Route to appropriate tool based on type
    // TypeScript will narrow the type in each case branch
    switch (compiled.type) {
      case 'productivity_stats':
        return this.routeToProductivityStats(compiled);
      case 'task_velocity':
        return this.routeToVelocity(compiled);
      case 'overdue_analysis':
        return this.routeToOverdue(compiled);
      case 'pattern_analysis':
        return this.routeToPattern(compiled);
      case 'workflow_analysis':
        return this.routeToWorkflow(compiled);
      case 'recurring_tasks':
        return this.routeToRecurring(compiled);
      case 'parse_meeting_notes':
        return this.routeToMeetingNotes(compiled);
      case 'manage_reviews':
        return this.routeToReviews(compiled);
      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = compiled;
        throw new Error(`Unsupported analysis type: ${(_exhaustive as CompiledAnalysis).type}`);
      }
    }
  }

  private async routeToProductivityStats(
    compiled: Extract<CompiledAnalysis, { type: 'productivity_stats' }>,
  ): Promise<unknown> {
    const args: Record<string, unknown> = {};

    // ProductivityStatsTool uses period enum (not custom date ranges)
    // Map groupBy to period if provided
    if (compiled.params?.groupBy) {
      args.period = compiled.params.groupBy; // day/week/month
    } else {
      args.period = 'week'; // default
    }

    return this.productivityTool.execute(args);
  }

  private async routeToVelocity(
    compiled: Extract<CompiledAnalysis, { type: 'task_velocity' }>,
  ): Promise<unknown> {
    const args: Record<string, unknown> = {};

    if (compiled.scope?.dateRange) {
      args.startDate = compiled.scope.dateRange.start;
      args.endDate = compiled.scope.dateRange.end;
    }

    if (compiled.params?.groupBy) {
      args.interval = compiled.params.groupBy;
    }

    return this.velocityTool.execute(args);
  }

  private async routeToOverdue(
    compiled: Extract<CompiledAnalysis, { type: 'overdue_analysis' }>,
  ): Promise<unknown> {
    const args: Record<string, unknown> = {};

    if (compiled.scope?.tags) {
      args.tags = compiled.scope.tags;
    }

    if (compiled.scope?.projects) {
      args.projects = compiled.scope.projects;
    }

    return this.overdueTool.execute(args);
  }

  private async routeToPattern(
    compiled: Extract<CompiledAnalysis, { type: 'pattern_analysis' }>,
  ): Promise<unknown> {
    const args: Record<string, unknown> = {};

    // Map insights to patterns (PatternAnalysisTool expects 'patterns' not 'insights')
    if (compiled.params?.insights) {
      args.patterns = compiled.params.insights;
    } else {
      // Default to 'all' if no patterns specified
      args.patterns = ['all'];
    }

    return this.patternTool.execute(args);
  }

  private async routeToWorkflow(
    compiled: Extract<CompiledAnalysis, { type: 'workflow_analysis' }>,
  ): Promise<unknown> {
    const args: Record<string, unknown> = {};

    if (compiled.scope?.dateRange) {
      args.startDate = compiled.scope.dateRange.start;
      args.endDate = compiled.scope.dateRange.end;
    }

    return this.workflowTool.execute(args);
  }

  private async routeToRecurring(
    compiled: Extract<CompiledAnalysis, { type: 'recurring_tasks' }>,
  ): Promise<unknown> {
    const args: Record<string, unknown> = {};

    if (compiled.params?.operation) {
      args.operation = compiled.params.operation;
    }

    if (compiled.params?.sortBy) {
      args.sortBy = compiled.params.sortBy;
    }

    return this.recurringTool.execute(args);
  }

  private async routeToMeetingNotes(
    compiled: Extract<CompiledAnalysis, { type: 'parse_meeting_notes' }>,
  ): Promise<unknown> {
    const args: Record<string, unknown> = {
      input: compiled.params.text, // Note: ParseMeetingNotesTool expects 'input' not 'text'
    };

    if (compiled.params.extractTasks !== undefined) {
      // Map extractTasks to extractMode
      args.extractMode = compiled.params.extractTasks ? 'action_items' : 'both';
    }

    if (compiled.params.defaultProject) {
      args.defaultProject = compiled.params.defaultProject;
    }

    if (compiled.params.defaultTags) {
      args.defaultTags = compiled.params.defaultTags;
    }

    return this.meetingNotesTool.execute(args);
  }

  private async routeToReviews(
    compiled: Extract<CompiledAnalysis, { type: 'manage_reviews' }>,
  ): Promise<unknown> {
    const args: Record<string, unknown> = {};

    if (compiled.params?.projectId) {
      args.projectId = compiled.params.projectId;
    }

    if (compiled.params?.reviewDate) {
      args.reviewDate = compiled.params.reviewDate;
    }

    return this.reviewsTool.execute(args);
  }
}

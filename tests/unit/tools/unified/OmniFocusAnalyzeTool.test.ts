import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OmniFocusAnalyzeTool } from '../../../../src/tools/unified/OmniFocusAnalyzeTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation.js';

vi.mock('../../../../src/cache/CacheManager.js', () => ({ CacheManager: vi.fn() }));
vi.mock('../../../../src/omnifocus/OmniAutomation.js', () => ({ OmniAutomation: vi.fn() }));
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

describe('OmniFocusAnalyzeTool', () => {
  let tool: OmniFocusAnalyzeTool;
  let mockCache: any;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() };
    mockOmni = { buildScript: vi.fn(), executeJson: vi.fn() };
    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmni);
    tool = new OmniFocusAnalyzeTool(mockCache as any);
    (tool as any).omniAutomation = mockOmni;
  });

  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('omnifocus_analyze');
      expect(tool.description).toContain('Analyze OmniFocus data');
    });

    it('should list all 8 capabilities', () => {
      expect(tool.meta.capabilities).toEqual([
        'productivity_stats',
        'task_velocity',
        'overdue_analysis',
        'pattern_analysis',
        'workflow_analysis',
        'recurring_tasks',
        'parse_meeting_notes',
        'manage_reviews',
      ]);
    });
  });

  // ==========================================================================
  // Productivity Stats
  // ==========================================================================
  describe('productivity_stats', () => {
    it('returns cached results when available', async () => {
      const cached = {
        period: 'week',
        stats: { overview: { totalTasks: 100, completedTasks: 75, completionRate: 0.75 } },
        healthScore: 85,
      };
      mockCache.get.mockReturnValue(cached);

      const res: any = await tool.execute({
        analysis: { type: 'productivity_stats' },
      });
      expect(res.success).toBe(true);
      expect(res.metadata.from_cache).toBe(true);
    });

    it('handles script error', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        success: false,
        error: 'Failed to calculate stats',
        details: 'OmniFocus error',
      });

      const res: any = await tool.execute({
        analysis: { type: 'productivity_stats' },
      });
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('STATS_ERROR');
    });

    it('returns productivity stats with key findings', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        summary: {
          totalTasks: 200,
          completedTasks: 150,
          completionRate: 0.75,
          activeProjects: 12,
          overdueCount: 5,
        },
        projectStats: {
          Work: { total: 100, completed: 80, rate: 0.8 },
        },
        tagStats: { urgent: { total: 30, completed: 25, rate: 0.83 } },
        insights: ['Completion rate is healthy'],
      });

      const res: any = await tool.execute({
        analysis: { type: 'productivity_stats', params: { groupBy: 'week' } },
      });

      expect(res.success).toBe(true);
      expect(res.data.period).toBe('week');
      expect(res.data.healthScore).toBe(75);
      expect(res.data.stats.overview.totalTasks).toBe(200);
      expect(Array.isArray(res.summary.key_findings)).toBe(true);
    });

    it('caches results after execution', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        summary: { totalTasks: 100, completedTasks: 80, completionRate: 0.8 },
        insights: [],
      });

      await tool.execute({ analysis: { type: 'productivity_stats' } });

      expect(mockCache.set).toHaveBeenCalled();
      expect(mockCache.set.mock.calls[0][0]).toBe('analytics');
    });
  });

  // ==========================================================================
  // Task Velocity
  // ==========================================================================
  describe('task_velocity', () => {
    it('returns cached results when available', async () => {
      const cached = {
        velocity: { period: '7 days', tasksCompleted: 42, averagePerDay: 6 },
        patterns: {},
        insights: ['Steady velocity'],
      };
      mockCache.get.mockReturnValue(cached);

      const res: any = await tool.execute({
        analysis: { type: 'task_velocity', params: { groupBy: 'day' } },
      });
      expect(res.success).toBe(true);
      expect(res.metadata.from_cache).toBe(true);
    });

    it('handles script error', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        success: false,
        error: 'Failed to calculate velocity',
        details: 'OmniFocus error',
      });

      const res: any = await tool.execute({
        analysis: { type: 'task_velocity' },
      });
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('VELOCITY_ERROR');
    });

    it('returns velocity metrics with v3 envelope unwrapping', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        ok: true,
        v: '3',
        data: {
          velocity: {
            period: '7 days',
            averageCompleted: '6.5',
            averageCreated: '7.2',
            dailyVelocity: '6.5',
            backlogGrowthRate: '+0.7',
          },
          throughput: {
            intervals: [],
            totalCompleted: 45,
            totalCreated: 50,
          },
          breakdown: { medianCompletionHours: '3.5', tasksAnalyzed: 150 },
          projections: { tasksPerDay: '6.5', tasksPerWeek: '45.5', tasksPerMonth: '195' },
          optimization: 'Current velocity is sustainable',
        },
      });

      const res: any = await tool.execute({
        analysis: { type: 'task_velocity', params: { groupBy: 'day' } },
      });

      expect(res.success).toBe(true);
      expect(res.data.velocity).toBeDefined();
      expect(res.data.velocity.averagePerDay).toBe(6.5);
      expect(res.data.velocity.tasksCompleted).toBe(45);
      expect(res.data.velocity.predictedCapacity).toBe(45.5);
    });
  });

  // ==========================================================================
  // Overdue Analysis
  // ==========================================================================
  describe('overdue_analysis', () => {
    it('returns cached results when available', async () => {
      const cached = {
        stats: {
          summary: { totalOverdue: 5, overduePercentage: 10, averageDaysOverdue: 3, oldestOverdueDate: '2025-01-01' },
          overdueTasks: [],
          patterns: [],
          insights: { topRecommendations: [] },
        },
        groupedAnalysis: {},
      };
      mockCache.get.mockReturnValue(cached);

      const res: any = await tool.execute({
        analysis: { type: 'overdue_analysis' },
      });
      expect(res.success).toBe(true);
      expect(res.metadata.from_cache).toBe(true);
    });

    it('handles script error', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        success: false,
        error: 'Failed to analyze overdue tasks',
        details: 'OmniFocus error',
      });

      const res: any = await tool.execute({
        analysis: { type: 'overdue_analysis' },
      });
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('ANALYSIS_ERROR');
    });

    it('returns overdue analysis with patterns', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        data: {
          summary: {
            totalOverdue: 15,
            overduePercentage: 25.5,
            averageDaysOverdue: 7.2,
            oldestOverdueDate: '2025-10-01',
          },
          overdueTasks: [
            {
              id: 'task1',
              name: 'Overdue task',
              dueDate: '2025-10-01',
              daysOverdue: 45,
              tags: ['urgent'],
              projectId: 'proj1',
            },
          ],
          patterns: [{ type: 'project', value: 'Work', count: 8, percentage: 53.3 }],
          recommendations: ['Focus on urgent tasks'],
        },
      });

      const res: any = await tool.execute({
        analysis: { type: 'overdue_analysis' },
      });

      expect(res.success).toBe(true);
      expect(res.data.stats.summary.totalOverdue).toBe(15);
      expect(res.data.stats.overdueTasks.length).toBe(1);
      expect(res.data.stats.patterns.length).toBe(1);
    });
  });

  // ==========================================================================
  // Workflow Analysis
  // ==========================================================================
  describe('workflow_analysis', () => {
    it('returns cached results when available', async () => {
      const cached = { insights: [{ insight: 'Cache' }], recommendations: [], patterns: {} };
      mockCache.get.mockReturnValue(cached);

      const res: any = await tool.execute({
        analysis: { type: 'workflow_analysis' },
      });
      expect(res.success).toBe(true);
      expect(res.metadata.from_cache).toBe(true);
    });

    it('handles script error with structured error', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({ success: false, error: 'Failed', details: 'Test error' });

      const res: any = await tool.execute({
        analysis: { type: 'workflow_analysis' },
      });
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('ANALYSIS_FAILED');
    });

    it('returns analytics response with key findings', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        insights: [{ insight: 'Focus on review cadence' }, { message: 'Reduce WIP' }],
        patterns: { bottlenecks: 3, projects: 2 },
        recommendations: [{ recommendation: 'Batch similar tasks' }],
        data: { raw: true },
        totalTasks: 123,
        totalProjects: 12,
        analysisTime: 250,
        dataPoints: 4000,
      });

      const res: any = await tool.execute({
        analysis: { type: 'workflow_analysis' },
      });
      expect(res.success).toBe(true);
      expect(res.data.analysis.depth).toBe('standard');
      expect(Array.isArray(res.summary.key_findings)).toBe(true);
    });

    it('extractKeyFindings falls back to default message', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({ insights: [], patterns: {}, recommendations: [] });

      const res: any = await tool.execute({
        analysis: { type: 'workflow_analysis' },
      });
      expect(res.success).toBe(true);
      expect(res.summary.key_findings[0]).toMatch(/Analysis completed successfully/);
    });
  });

  // ==========================================================================
  // Workflow Analysis Script Source Assertions (migrated from workflow-analysis-tool.test.ts)
  // ==========================================================================
  describe('workflow analysis script source guards', () => {
    it('workflow analysis script should use task.inInbox for inbox detection', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('src/omnifocus/scripts/analytics/workflow-analysis-v3.ts', 'utf-8');
      // Should NOT use the manual containingProject check for inbox
      expect(source).not.toMatch(/const inInbox = task\.containingProject === null/);
      // Should use the native OmniFocus property
      expect(source).toMatch(/const inInbox = task\.inInbox/);
    });

    it('inbox count should only include incomplete tasks', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('src/omnifocus/scripts/analytics/workflow-analysis-v3.ts', 'utf-8');
      // Completed inbox tasks (2-minute rule) should not inflate inboxPercentage
      expect(source).toMatch(/if \(inInbox && !completed\) totalInboxTasks/);
      expect(source).not.toMatch(/if \(inInbox\) totalInboxTasks/);
    });
  });

  // ==========================================================================
  // Recurring Tasks
  // ==========================================================================
  describe('recurring_tasks', () => {
    it('returns cached results for analyze operation', async () => {
      const cached = { success: true, data: { recurringTasks: [], summary: {} } };
      mockCache.get.mockReturnValue(cached);

      const res: any = await tool.execute({
        analysis: { type: 'recurring_tasks', params: { operation: 'analyze' } },
      });
      // Should return cached response directly
      expect(res.success).toBe(true);
    });

    it('handles script error for analyze operation', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.executeJson.mockResolvedValue({
        success: false,
        error: 'Script failed',
        details: 'Error',
      });

      const res: any = await tool.execute({
        analysis: { type: 'recurring_tasks', params: { operation: 'analyze' } },
      });
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('SCRIPT_ERROR');
    });

    it('handles patterns operation', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        totalRecurring: 5,
        patterns: [{ pattern: 'weekly', count: 3 }],
        byProject: [{ project: 'Work', count: 2 }],
        mostCommon: { pattern: 'weekly', count: 3 },
      });

      const res: any = await tool.execute({
        analysis: { type: 'recurring_tasks', params: { operation: 'patterns' } },
      });
      expect(res.success).toBe(true);
    });
  });

  // ==========================================================================
  // Parse Meeting Notes
  // ==========================================================================
  describe('parse_meeting_notes', () => {
    it('extracts action items from meeting notes', async () => {
      const res: any = await tool.execute({
        analysis: {
          type: 'parse_meeting_notes',
          params: {
            text: 'Meeting Notes:\n- Send proposal to client\n- Call Sarah about budget\n- Review quarterly report',
          },
        },
      });

      expect(res.success).toBe(true);
      expect(res.data.extracted.tasks).toHaveLength(3);
      expect(res.data.extracted.tasks[0].name).toContain('Send proposal');
    });

    it('detects projects with multiple tasks', async () => {
      const res: any = await tool.execute({
        analysis: {
          type: 'parse_meeting_notes',
          params: {
            text: 'Website Redesign project:\n- Review current analytics\n- Create wireframes\n- User testing',
          },
        },
      });

      expect(res.success).toBe(true);
      expect(res.data.extracted.projects).toHaveLength(1);
      expect(res.data.extracted.projects[0].name).toBe('Website Redesign');
      expect(res.data.extracted.projects[0].tasks).toHaveLength(3);
    });

    it('handles empty action items gracefully', async () => {
      const res: any = await tool.execute({
        analysis: {
          type: 'parse_meeting_notes',
          params: {
            text: 'Meeting: Q4 Planning\nDate: October 1, 2025\nAttendees: Everyone\n\nNo actual action items discussed.',
          },
        },
      });

      expect(res.success).toBe(true);
      expect(res.data.extracted.tasks).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Manage Reviews
  // ==========================================================================
  describe('manage_reviews', () => {
    it('lists projects for review', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const today = new Date(now.getTime()).toISOString();
      const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        projects: [
          { id: 'p1', name: 'Overdue', nextReviewDate: yesterday },
          { id: 'p2', name: 'Due Today', nextReviewDate: today },
          { id: 'p3', name: 'Due Soon', nextReviewDate: soon },
          { id: 'p4', name: 'No Schedule' },
        ],
      });

      const res: any = await tool.execute({
        analysis: { type: 'manage_reviews', params: { operation: 'list_for_review' } },
      });

      expect(res.success).toBe(true);
      expect(res.data.projects.length).toBe(4);
      expect(res.metadata.review_summary.total_projects).toBe(4);
    });

    it('returns cached response when available', async () => {
      const cached = { success: true, data: { projects: [] }, metadata: { operation: 'manage_reviews' } };
      mockCache.get.mockReturnValue(cached);

      const res: any = await tool.execute({
        analysis: { type: 'manage_reviews', params: { operation: 'list_for_review' } },
      });
      expect(res.success).toBe(true);
      expect(res.metadata.from_cache).toBe(true);
    });

    it('marks project as reviewed and invalidates caches', async () => {
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({ ok: true, id: 'p1' });

      const res: any = await tool.execute({
        analysis: { type: 'manage_reviews', params: { operation: 'mark_reviewed', projectId: 'p1' } },
      });

      expect(res.success).toBe(true);
      expect(res.metadata.operation).toBe('mark_reviewed');
      expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
      expect(mockCache.invalidate).toHaveBeenCalledWith('reviews');
    });
  });

  // ==========================================================================
  // Pattern Analysis
  // ==========================================================================
  describe('pattern_analysis', () => {
    it('handles fetch failure gracefully', async () => {
      mockOmni.executeJson.mockResolvedValue({
        success: false,
        error: 'Script failed',
      });

      const res: any = await tool.execute({
        analysis: { type: 'pattern_analysis', params: { insights: ['duplicates'] } },
      });

      // Should return error or empty results (not throw)
      expect(res).toBeDefined();
    });
  });
});

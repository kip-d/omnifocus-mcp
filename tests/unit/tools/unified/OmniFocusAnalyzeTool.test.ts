import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OmniFocusAnalyzeTool } from '../../../../src/tools/unified/OmniFocusAnalyzeTool.js';
import { WriteSchema } from '../../../../src/tools/unified/schemas/write-schema.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation.js';
import { createScriptSuccess, createScriptError } from '../../../../src/omnifocus/script-result-types.js';

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

    it('surfaces the most productive project from the script map (OMN-252)', async () => {
      // OMN-148 drift D8: the map→array reshape read `completedCount`, but the
      // script emits `completed` — every row got completedCount: 0 and the
      // "Most productive project" finding could never fire.
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        summary: {
          totalTasks: 50,
          completedTasks: 9,
          completionRate: 0.18,
          activeProjects: 2,
          overdueCount: 0,
        },
        projectStats: {
          Alpha: { total: 10, completed: 7, available: 2, completionRate: '70.0', status: 'active' },
          Beta: { total: 10, completed: 2, available: 5, completionRate: '20.0', status: 'active' },
        },
        tagStats: {},
        insights: [],
      });

      const res: any = await tool.execute({
        analysis: { type: 'productivity_stats', params: { groupBy: 'week' } },
      });

      expect(res.success).toBe(true);
      const alpha = res.data.stats.projectStats.find((p: { name: string }) => p.name === 'Alpha');
      expect(alpha.completedCount).toBe(7);
      expect(res.summary.key_findings).toContain('Most productive project: Alpha (7 completed)');
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

    it('calculates healthScore correctly from decimal completionRate', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        summary: {
          totalTasks: 100,
          completedTasks: 15,
          completionRate: 0.151,
          activeProjects: 5,
          overdueCount: 3,
        },
        insights: ['Low completion rate - many tasks remain incomplete'],
      });

      const res: any = await tool.execute({
        analysis: { type: 'productivity_stats' },
      });

      expect(res.success).toBe(true);
      // completionRate 0.151 * 100 = 15.1, rounded = 15
      expect(res.data.healthScore).toBe(15);
      // Should NOT be 100 (the old bug where 15.1 * 100 = 1510 clamped to 100)
      expect(res.data.healthScore).not.toBe(100);
    });

    it('includes overdueCount in response when script returns it', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        summary: {
          totalTasks: 100,
          completedTasks: 80,
          completionRate: 0.8,
          activeProjects: 5,
          overdueCount: 5,
        },
        insights: [],
      });

      const res: any = await tool.execute({
        analysis: { type: 'productivity_stats' },
      });

      expect(res.success).toBe(true);
      expect(res.data.stats.overview.overdueCount).toBe(5);
    });

    it('includes activeProjects from script activeProjectCount', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        summary: {
          totalTasks: 200,
          completedTasks: 100,
          completionRate: 0.5,
          activeProjects: 12,
          overdueCount: 0,
        },
        insights: [],
      });

      const res: any = await tool.execute({
        analysis: { type: 'productivity_stats' },
      });

      expect(res.success).toBe(true);
      expect(res.data.stats.overview.activeProjects).toBe(12);
    });

    it('includes availableTasks in response when script returns it (OMN-254 surfacing)', async () => {
      // /code-review of PRs #209/#211/#213: the script computes the
      // terminal-state-corrected summary.availableTasks, but the overview
      // reshape silently dropped it — the fixed count never reached the client.
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        summary: {
          totalTasks: 100,
          completedTasks: 80,
          availableTasks: 15,
          completionRate: 0.8,
          activeProjects: 5,
          overdueCount: 5,
        },
        insights: [],
      });

      const res: any = await tool.execute({
        analysis: { type: 'productivity_stats' },
      });

      expect(res.success).toBe(true);
      expect(res.data.stats.overview.availableTasks).toBe(15);
    });

    it('does not produce contradictory recommendations', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        summary: {
          totalTasks: 100,
          completedTasks: 15,
          completionRate: 0.15,
          activeProjects: 3,
          overdueCount: 10,
        },
        // Script says "Excellent" but completionRate is only 15% — contradictory
        insights: ['Excellent completion rate: 85.0%'],
      });

      const res: any = await tool.execute({
        analysis: { type: 'productivity_stats' },
      });

      expect(res.success).toBe(true);
      // healthScore = 0.15 * 100 = 15
      expect(res.data.healthScore).toBe(15);
      // The "Excellent" recommendation should be filtered out since healthScore < 60
      const keyFindings: string[] = res.summary.key_findings;
      const hasExcellentWithLowScore = keyFindings.some(
        (f: string) => f.toLowerCase().includes('excellent') && !f.includes('Health Score'),
      );
      expect(hasExcellentWithLowScore).toBe(false);
    });

    it('healthScore is 0 when no tasks exist', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue({
        summary: {
          totalTasks: 0,
          completedTasks: 0,
          completionRate: 0,
          activeProjects: 0,
          overdueCount: 0,
        },
        insights: ['No tasks completed in this period'],
      });

      const res: any = await tool.execute({
        analysis: { type: 'productivity_stats' },
      });

      expect(res.success).toBe(true);
      expect(res.data.healthScore).toBe(0);
      // Verify the health score finding is included even when score is 0
      const keyFindings: string[] = res.summary.key_findings;
      expect(keyFindings).toEqual(expect.arrayContaining([expect.stringContaining('GTD Health Score: 0/100')]));
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
      // OMN-139: executeJson now returns ScriptResult (schema validated); mock must match
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
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
        }),
      );

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

    it('maps the real v3 envelope shape into the response (OMN-187)', async () => {
      // OMN-187: the v3 script emits summary.{blockedPercentage, avgDaysOverdue,
      // overduePercentage, mostOverdue} + groupedByUrgency + projectBottlenecks +
      // insights — NOT the legacy {overdueTasks, patterns, recommendations,
      // summary.averageDaysOverdue} shape the tool used to read. This mock is the
      // REAL emitted shape; the previous mock encoded the stale contract and so
      // passed vacuously while production returned all-zero/empty.
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');

      const oldest = {
        id: 't1',
        name: 'Old task',
        dueDate: '2025-10-01T17:00:00.000Z',
        daysOverdue: 45,
        project: 'Work',
        tags: ['urgent'],
        blocked: false,
        isNext: true,
      };
      const newer = {
        id: 't2',
        name: 'Newer task',
        dueDate: '2025-11-20T17:00:00.000Z',
        daysOverdue: 8,
        project: 'Work',
        tags: [],
        blocked: false,
        isNext: true,
      };

      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: {
            summary: {
              totalOverdue: 2,
              blockedCount: 0,
              unblockedCount: 2,
              blockedPercentage: 0,
              avgDaysOverdue: 26.5,
              overduePercentage: 40,
              totalActive: 5,
              oldestOverdueDate: '2025-10-01T17:00:00.000Z',
              mostOverdue: oldest,
            },
            insights: ['2 overdue tasks found'],
            groupedByUrgency: { critical: [oldest], high: [newer], medium: [], low: [] },
            projectBottlenecks: [
              { name: 'Work', overdueCount: 2, blockedCount: 0, avgDaysOverdue: '26.5', blockageRate: '0.0' },
            ],
            metadata: {
              generated_at: '2026-06-16T10:00:00.000Z',
              method: 'omnijs_v3_single_bridge',
              optimization: 'omnijs_v3',
              query_time_ms: 800,
              tasksAnalyzed: 2,
              note: 'All analysis calculated in single OmniJS bridge call',
            },
          },
        }),
      );

      const res: any = await tool.execute({
        analysis: { type: 'overdue_analysis' },
      });

      expect(res.success).toBe(true);
      // Summary: real values, not the always-0 the bug produced.
      expect(res.data.stats.summary.totalOverdue).toBe(2);
      expect(res.data.stats.summary.overduePercentage).toBe(40);
      expect(res.data.stats.summary.averageDaysOverdue).toBe(26.5);
      expect(res.data.stats.summary.oldestOverdueDate).toBe('2025-10-01T17:00:00.000Z');
      // overdueTasks: flattened from groupedByUrgency, sorted most-overdue first.
      expect(res.data.stats.overdueTasks.length).toBe(2);
      expect(res.data.stats.overdueTasks[0].id).toBe('t1');
      expect(res.data.stats.overdueTasks[0].daysOverdue).toBe(45);
      expect(res.data.stats.overdueTasks[0].dueDate).toBe('2025-10-01T17:00:00.000Z');
      // patterns: derived from projectBottlenecks.
      expect(res.data.stats.patterns.length).toBe(1);
      expect(res.data.stats.patterns[0].value).toBe('Work');
      expect(res.data.stats.patterns[0].count).toBe(2);
      // groupedAnalysis: urgency buckets with counts.
      expect(res.data.groupedAnalysis.critical.count).toBe(1);
      expect(res.data.groupedAnalysis.high.count).toBe(1);
    });

    it('surfaces summary.mostOverdue from the script, not just the capped detail-array head (OMN-253)', async () => {
      // /code-review of #210/#212: the script's summary.mostOverdue is the TRUE
      // full-population max (OMN-253), tracked separately from the maxTasks-capped
      // groupedByUrgency detail rows. Simulate the >100-overdue scenario: the true
      // max ('the-global-max', 400 days) never made it into groupedByUrgency
      // (beyond the detail cap), so the flattened overdueTasks head is a lesser
      // task — the tool must still surface the script's own mostOverdue field.
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');

      const cappedHead = {
        id: 't2',
        name: 'Capped head',
        dueDate: '2025-11-20T17:00:00.000Z',
        daysOverdue: 8,
        project: 'Work',
        tags: [],
        blocked: false,
        isNext: true,
      };
      const globalMax = {
        id: 'the-global-max',
        name: 'Beyond the cap',
        dueDate: '2025-01-01T17:00:00.000Z',
        daysOverdue: 400,
        project: 'Work',
        tags: [],
        blocked: false,
        isNext: true,
      };

      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: {
            summary: {
              totalOverdue: 150,
              blockedCount: 0,
              unblockedCount: 150,
              blockedPercentage: 0,
              avgDaysOverdue: 10,
              overduePercentage: 40,
              totalActive: 375,
              oldestOverdueDate: '2025-01-01T17:00:00.000Z',
              mostOverdue: globalMax,
            },
            insights: [],
            // globalMax is NOT in the capped detail buckets — it's beyond maxTasks.
            groupedByUrgency: { critical: [], high: [cappedHead], medium: [], low: [] },
            projectBottlenecks: [],
            metadata: {
              generated_at: '2026-06-16T10:00:00.000Z',
              method: 'omnijs_v3_single_bridge',
              optimization: 'omnijs_v3',
              query_time_ms: 800,
              tasksAnalyzed: 1,
              note: 'All analysis calculated in single OmniJS bridge call',
            },
          },
        }),
      );

      const res: any = await tool.execute({
        analysis: { type: 'overdue_analysis' },
      });

      expect(res.success).toBe(true);
      // The flattened detail array's head is the lesser, capped task...
      expect(res.data.stats.overdueTasks[0].id).toBe('t2');
      // ...but summary.mostOverdue is still the true full-population max.
      expect(res.data.stats.summary.mostOverdue?.id).toBe('the-global-max');
      expect(res.data.stats.summary.mostOverdue?.daysOverdue).toBe(400);
    });

    it('coalesces a null oldestOverdueDate to an empty string (OMN-187, no overdue tasks)', async () => {
      // When there are zero overdue tasks the v3 script emits oldestOverdueDate: null;
      // the tool must coalesce it to '' (OverdueAnalysisDataV2 types it as a string).
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: {
            summary: {
              totalOverdue: 0,
              blockedCount: 0,
              unblockedCount: 0,
              blockedPercentage: 0,
              avgDaysOverdue: 0,
              overduePercentage: 0,
              totalActive: 10,
              oldestOverdueDate: null,
              mostOverdue: null,
            },
            insights: ['No overdue tasks found - excellent!'],
            groupedByUrgency: { critical: [], high: [], medium: [], low: [] },
            projectBottlenecks: [],
            metadata: {
              generated_at: '2026-06-16T10:00:00.000Z',
              method: 'omnijs_v3_single_bridge',
              optimization: 'omnijs_v3',
              query_time_ms: 700,
              tasksAnalyzed: 0,
              note: 'All analysis calculated in single OmniJS bridge call',
            },
          },
        }),
      );

      const res: any = await tool.execute({
        analysis: { type: 'overdue_analysis' },
      });

      expect(res.success).toBe(true);
      expect(res.data.stats.summary.totalOverdue).toBe(0);
      // null → '' (not null, not undefined).
      expect(res.data.stats.summary.oldestOverdueDate).toBe('');
      expect(res.data.stats.overdueTasks).toEqual([]);
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
      // OMN-139: executeJson returns ScriptResult; wrap V3 envelope
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: {
            insights: [{ insight: 'Focus on review cadence' }, { message: 'Reduce WIP' }],
            patterns: { bottlenecks: 3, projects: 2 },
            recommendations: [{ recommendation: 'Batch similar tasks' }],
            totalTasks: 123,
            totalProjects: 12,
            analysisTime: 250,
            dataPoints: 4000,
          },
        }),
      );

      const res: any = await tool.execute({
        analysis: { type: 'workflow_analysis' },
      });
      expect(res.success).toBe(true);
      // OMN-200: depth is now reported as 'full' — the analysis always scans the
      // entire task DB (the 1000-cap + its dead 'deep' escape hatch were removed).
      expect(res.data.analysis.depth).toBe('full');
      expect(Array.isArray(res.summary.key_findings)).toBe(true);
    });

    it('extractKeyFindings falls back to default message', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.buildScript.mockReturnValue('script');
      // OMN-139: executeJson returns ScriptResult; wrap V3 envelope
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          ok: true,
          v: '3',
          data: { insights: [], patterns: {}, recommendations: [] },
        }),
      );

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

    it('OMN-200: processes the full task DB — no 1000-cap, no dead deep ternary', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('src/omnifocus/scripts/analytics/workflow-analysis-v3.ts', 'utf-8');
      // The per-task loop must iterate every task: a capped numerator over a full
      // denominator was a ~2.5x understatement of every *Percentage. (OMN-270
      // renamed the raw collection length to allTaskCount — `totalTasks` is now
      // the in-loop non-root census that the percentages divide by.)
      expect(source).toMatch(/const maxTasksToProcess = allTaskCount;/);
      // The cap and its unreachable 'deep' escape hatch are gone.
      expect(source).not.toMatch(/Math\.min\(1000/);
      expect(source).not.toMatch(/analysisDepth === 'deep'/);
    });

    it('OMN-208: caps data.tasks push independently of the full-population loop', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('src/omnifocus/scripts/analytics/workflow-analysis-v3.ts', 'utf-8');
      // Cap constant exists and is a bounded few-hundred figure, not full-DB size.
      expect(source).toMatch(/const MAX_RAW_DATA_TASKS = 500;/);
      // A truncation marker is set once a cap is exceeded, so a future consumer
      // of includeRawData can tell the raw slice is partial.
      expect(source).toMatch(/data\.tasksTruncated = true;/);
      // Omitted-count is keyed off the truncation flag and the actual pushed
      // length (not a second independent cap comparison), so the two can't desync.
      expect(source).toMatch(/data\.tasksOmittedCount = data\.tasksTruncated/);
      // Critical invariant: the aggregate metrics loop must still iterate the FULL
      // population — only the raw data.tasks echo is capped. OMN-200 removed the
      // old 1000-task cap specifically so *Percentage metrics reflect the whole DB;
      // this cap must not reintroduce that regression. (allTaskCount = raw
      // collection length since OMN-270's denominator fix.)
      expect(source).toMatch(/const maxTasksToProcess = allTaskCount;/);
      expect(source).not.toMatch(/maxTasksToProcess = MAX_RAW_DATA_TASKS/);
    });

    it('OMN-233: gates the raw data.tasks push on both a count cap and a byte budget', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('src/omnifocus/scripts/analytics/workflow-analysis-v3.ts', 'utf-8');
      // Byte budget constant exists, is comfortably under the ~261,124-char
      // measured OmniJS bridge INPUT limit (return-path unmeasured — see
      // scripts/measure-bridge-return-limit.ts), and leaves headroom for the
      // rest of the response payload (insights/patterns/recommendations).
      expect(source).toMatch(/const RAW_DATA_BYTE_BUDGET = 150000;/);
      // Push is gated on BOTH conditions: still under the count cap AND still
      // under the byte budget. Neither cap alone is sufficient — count caps
      // don't bound unbounded name/project/tags strings, and a byte-only cap
      // could still admit an unbounded number of tiny records.
      expect(source).toMatch(
        /data\.tasks\.length < MAX_RAW_DATA_TASKS &&\s*\n\s*rawDataBytesUsed \+ rawDataRecordBytes <= RAW_DATA_BYTE_BUDGET/,
      );
      // The running byte tally measures true UTF-8 bytes of the actual record
      // shape that gets pushed — NOT String.length, which counts UTF-16 code
      // units and undercounts CJK/emoji names by 1.5-3x (gate-review finding).
      expect(source).toMatch(/const rawDataRecordBytes = utf8ByteLength\(JSON\.stringify\(rawDataRecord\)\);/);
      expect(source).toMatch(/function utf8ByteLength\(str\)/);
      // Once truncated, the loop stops building/measuring further records
      // (perf: avoid JSON.stringify on records we won't push).
      expect(source).toMatch(/if \(!data\.tasksTruncated\) {/);
      // Omitted-count must reflect whichever cap tripped first (count OR
      // bytes) by diffing against the actual pushed length, not re-deriving
      // from MAX_RAW_DATA_TASKS alone (which would be wrong when the byte
      // budget truncates before the count cap does).
      expect(source).toMatch(
        /data\.tasksOmittedCount = data\.tasksTruncated\s*\n\s*\? rawDataTaskCount - data\.tasks\.length\s*\n\s*: 0;/,
      );
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
      // OMN-139: executeJson returns ScriptResult; mock must match RecurringPatternsSchema
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          totalRecurring: 5,
          patterns: [{ pattern: 'weekly', count: 3 }],
          byProject: [{ project: 'Work', count: 2 }],
          mostCommon: { pattern: 'weekly', count: 3 },
          duration: 250,
        }),
      );

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

    // OMN-123 regression: the real ops-meeting sample, verbatim from the ticket's
    // reproduction block. The old verb-allowlist + greedy preposition strip
    // returned 5 mangled tasks from these clean bullets. All must survive with
    // names intact and nothing dropped silently.
    // NOTE: the ticket prose says "13 items" but its code block lists exactly 12
    // bullets — we match the literal sample (12). Flagged for the owner.
    const OMN_123_SAMPLE = [
      '- Kip: finalize remote access solution for new Mac minis before deployment.',
      '- Coordinate with Dennis Ball for feedback on bookmark files for book processing stations.',
      '- Plan branch-by-branch Mac mini rollout starting with Westgate (oldest, 2016).',
      '- Kip: secure Kensington lock for new microfilm station.',
      '- Coordinate with PEDS supervisors for advance notice before installing new microfilm station; double-check printing.',
      '- Order six self-check scanners and four lobby-style stand models for testing.',
      '- Kip: provide network ports list for blocking Minecraft multiplayer/self-hosting.',
      '- Reorder two CyberPower battery packs.',
      '- Kip: help Joe Harris with Smart App Control blocking his XLS shortcut.',
      '- Lantz: attend Iru AI webinar Thursday June 4th 2026.',
      '- Phone system: confirm shipment dates and build prep timeline for July 20th rollout.',
      '- Evaluate centralized software license tracking including Square proposal.',
    ].join('\n');

    it('OMN-123: extracts all 12 sample bullets — including verbs off the old allowlist', async () => {
      const res: any = await tool.execute({
        analysis: { type: 'parse_meeting_notes', params: { text: OMN_123_SAMPLE } },
      });

      expect(res.success).toBe(true);
      const tasks = res.data.extracted.tasks;
      // Every bullet survives — nothing dropped.
      expect(tasks.length).toBe(12);
      expect(res.data.summary.totalTasks).toBe(12);

      // Lock the list-membership semantics against a regression to verb-gating:
      // these leading verbs were NOT on the old actionVerbs allowlist, so each is
      // proof that candidacy now comes from being a bullet, not from a known verb.
      const joined = tasks.map((t: any) => t.name).join('\n');
      for (const offAllowlistVerb of [
        'finalize',
        'Coordinate',
        'secure',
        'Reorder',
        'provide',
        'attend',
        'confirm',
        'Evaluate',
      ]) {
        expect(joined).toContain(offAllowlistVerb);
      }
    });

    it('OMN-123: a bulleted "X project:" line stays an action — its text never vanishes', async () => {
      const res: any = await tool.execute({
        analysis: {
          type: 'parse_meeting_notes',
          params: { text: '- Marketing project: launch the new site\n- Build the analytics dashboard' },
        },
      });

      expect(res.success).toBe(true);
      // Bullets are actions, not project headers — so the action text is preserved
      // as a task rather than being lost to a phantom empty project.
      const joined = res.data.extracted.tasks.map((t: any) => t.name).join('\n');
      expect(joined).toContain('launch the new site');
      expect(res.data.extracted.unparsed).toHaveLength(0);
    });

    it('OMN-123: preserves mid-sentence objects/proper nouns eaten by the old greedy strip', async () => {
      const res: any = await tool.execute({
        analysis: { type: 'parse_meeting_notes', params: { text: OMN_123_SAMPLE } },
      });

      const names: string[] = res.data.extracted.tasks.map((t: any) => t.name);
      const joined = names.join('\n');
      // "with Westgate", "with PEDS", "for testing" were deleted by the global
      // /\b(by|for|with|from)\s+\w+\b/gi strip. They must survive now.
      expect(joined).toContain('Westgate');
      expect(joined).toContain('PEDS');
      expect(joined).toContain('for testing');
    });

    it('OMN-123: never silently drops a content line — surfaces leftovers in unparsed[]', async () => {
      const res: any = await tool.execute({
        analysis: { type: 'parse_meeting_notes', params: { text: OMN_123_SAMPLE } },
      });

      // Every bullet became a task → nothing left unparsed for this clean sample.
      expect(Array.isArray(res.data.extracted.unparsed)).toBe(true);
      expect(res.data.extracted.unparsed).toHaveLength(0);
      expect(res.data.summary.unparsedCount).toBe(0);
    });

    // Assert on the ASSEMBLED task.suggestedTags (what the user actually sees),
    // not on an internal detector in isolation — there used to be two people-tag
    // detectors and only fixing one left the old shapes leaking into the union.
    const tagsFor = async (line: string): Promise<string[]> => {
      const res: any = await tool.execute({
        analysis: { type: 'parse_meeting_notes', params: { text: `- ${line}` } },
      });
      return res.data.extracted.tasks[0]?.suggestedTags ?? [];
    };

    it('OMN-123: suggestedTags use the vault convention (@waiting-for + @agenda-{Name})', async () => {
      const waiting = await tagsFor('waiting for Dennis to send bookmark files');
      expect(waiting).toContain('@waiting-for');
      expect(waiting).toContain('@agenda-Dennis');

      const agenda = await tagsFor('ask Joe Harris about the XLS shortcut');
      expect(agenda).toContain('@agenda-Joe');
    });

    it('OMN-123: the old non-vault tag shapes never leak into suggestedTags', async () => {
      const waiting = await tagsFor('waiting for Dennis to send bookmark files');
      // No @waiting-for-{name} and no lowercase @agenda-{name} duplicate.
      expect(waiting).not.toContain('@waiting-for-dennis');
      expect(waiting).not.toContain('@agenda-dennis');

      const agenda = await tagsFor('ask Joe Harris about the XLS shortcut');
      expect(agenda).not.toContain('@agenda-joe');

      // The bogus bare "@name" shape from "X will/should/to" must be gone.
      const bare = await tagsFor('Sarah will review the quarterly report');
      expect(bare).not.toContain('@sarah');

      // "task to complete" must NOT yield a spurious @agenda-To (missing \b on "ask").
      const spurious = await tagsFor('task to complete the migration checklist');
      expect(spurious).not.toContain('@agenda-To');

      // A trailing possessive must not bleed into the tag.
      const possessive = await tagsFor("waiting on Dennis's reply");
      expect(possessive).toContain('@agenda-Dennis');
      expect(possessive).not.toContain("@agenda-Dennis's");
    });

    // ========================================================================
    // OMN-124: structured items[] — read-only pre-flight + batch payload
    // ========================================================================
    describe('OMN-124 structured items[]', () => {
      it('builds a preview + batchPayload without touching the DB when validateAgainstExisting=false', async () => {
        const res: any = await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: {
              items: [
                { name: 'Order scanners', project: 'Hardware', tags: ['@errand'], dueDate: '2026-06-20' },
                { name: 'Email Dennis', flagged: true },
              ],
              validateAgainstExisting: false,
            },
          },
        });

        expect(res.success).toBe(true);
        expect(res.data.mode).toBe('structured');
        expect(res.data.items).toHaveLength(2);
        expect(res.data.summary.total).toBe(2);
        expect(res.data.summary.readyToCreate).toBe(2);

        // No DB read happened.
        expect(mockOmni.executeJson).not.toHaveBeenCalled();

        // batchPayload is ready to hand to omnifocus_write { batch }.
        const ops = res.data.batchPayload.operations;
        expect(ops).toHaveLength(2);
        expect(ops[0]).toMatchObject({
          operation: 'create',
          target: 'task',
          data: { name: 'Order scanners', project: 'Hardware', tags: ['@errand'], dueDate: '2026-06-20' },
        });
        expect(ops[1].data).toMatchObject({ name: 'Email Dennis', flagged: true });
      });

      it('does not emit undefined optional fields into batch data', async () => {
        const res: any = await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: { items: [{ name: 'Bare task' }], validateAgainstExisting: false },
          },
        });
        const data = res.data.batchPayload.operations[0].data;
        expect(data).toEqual({ name: 'Bare task' });
      });

      it('validates against the live DB by default: resolves projects, dedupes, classifies tags', async () => {
        // execJson reads run via Promise.all: projects, tags, then ONE incomplete-tasks
        // read PER DISTINCT requested scope (OMN-126 scoped dedup). Two distinct
        // projects here ('hardware', 'Nonexistent Project') → two task reads → 4 calls.
        // Call order: projects, tags, hardware-scoped read, nonexistent-scoped read.
        // OMN-139: executeJson returns ScriptResult; shapes must match per-site schemas:
        //   projects → PROJECTS_LIST_SCHEMA {projects:[...], metadata?}
        //   tags     → TAG_ITEMS_SCHEMA {ok:true, v:'ast', items:[...]}
        //   tasks    → TASKS_LIST_SCHEMA {tasks:[...], metadata?}
        const dbResponses = [
          createScriptSuccess({ projects: [{ name: 'Hardware' }] }),
          createScriptSuccess({ ok: true, v: 'ast', items: [{ name: '@errand' }] }),
          createScriptSuccess({ tasks: [{ name: 'Order scanners', project: 'Hardware' }] }), // 'hardware' scope
          createScriptSuccess({ tasks: [] }), // 'Nonexistent Project' scope
        ];
        let call = 0;
        mockOmni.executeJson.mockImplementation(() => Promise.resolve(dbResponses[call++]));

        const res: any = await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: {
              // validateAgainstExisting omitted → defaults true (also tests the default).
              items: [
                { name: 'Order scanners', project: 'hardware', tags: ['@errand', '@new'] }, // dup + case-insensitive project
                { name: 'Buy lock', project: 'Nonexistent Project' }, // new project
              ],
            },
          },
        });

        expect(res.success).toBe(true);
        // projects + tags + 2 scoped task reads (one per distinct requested project)
        expect(mockOmni.executeJson).toHaveBeenCalledTimes(4);

        const [a, b] = res.data.items;
        // Item A: exact (case-insensitive) project, tag split, flagged duplicate.
        expect(a.project).toMatchObject({ requested: 'hardware', resolved: 'Hardware', match: 'exact' });
        expect(a.tags.existing).toEqual(['@errand']);
        expect(a.tags.new).toEqual(['@new']);
        expect(a.duplicateOf).toMatchObject({ name: 'Order scanners', project: 'Hardware' });
        expect(a.readyToCreate).toBe(false);

        // Item B: unknown project, not a duplicate, ready.
        expect(b.project.match).toBe('none');
        expect(b.duplicateOf).toBeNull();
        expect(b.readyToCreate).toBe(true);

        expect(res.data.summary).toMatchObject({
          total: 2,
          readyToCreate: 1,
          duplicates: 1,
          newProjects: 1,
          newTags: 1,
        });

        // Only the non-duplicate item is in the batch payload.
        expect(res.data.batchPayload.operations).toHaveLength(1);
        expect(res.data.batchPayload.operations[0].data.name).toBe('Buy lock');
      });

      it('OMN-204: surfaces a warnings[] when a pre-flight read fails (no silent degrade)', async () => {
        // projects + tags succeed; the incomplete-tasks read FAILS. Pre-fix, the
        // failure was swallowed (return []) → "no existing tasks → no duplicates",
        // a silent false-negative. Post-fix: a warning is surfaced loudly.
        const dbResponses = [
          createScriptSuccess({ projects: [{ name: 'Hardware' }] }),
          createScriptSuccess({ ok: true, v: 'ast', items: [] }),
          createScriptError("Can't find variable: flattenedTasks", 'list_tasks'),
        ];
        let call = 0;
        mockOmni.executeJson.mockImplementation(() => Promise.resolve(dbResponses[call++]));

        const res: any = await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: { items: [{ name: 'Order scanners', project: 'Hardware' }] },
          },
        });

        expect(res.success).toBe(true);
        expect(Array.isArray(res.data.warnings)).toBe(true);
        // names which pre-flight read failed; dedupe degradation is no longer silent
        expect(res.data.warnings.join(' ')).toMatch(/dedup|incomplete-tasks/i);
        // summary.warnings count stays in lockstep with the surfaced array
        expect(res.data.summary.warnings).toBe(res.data.warnings.length);
      });

      it('OMN-204: warnings[] is empty when every pre-flight read succeeds', async () => {
        const dbResponses = [
          createScriptSuccess({ projects: [{ name: 'Hardware' }] }),
          createScriptSuccess({ ok: true, v: 'ast', items: [] }),
          createScriptSuccess({ tasks: [] }),
        ];
        let call = 0;
        mockOmni.executeJson.mockImplementation(() => Promise.resolve(dbResponses[call++]));

        const res: any = await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: { items: [{ name: 'Buy lock', project: 'Hardware' }] },
          },
        });

        expect(res.success).toBe(true);
        expect(res.data.warnings).toEqual([]);
      });

      it('on a partial project match, dedupes against the create target (requested), not the partial match', async () => {
        // Existing project "Hardware Refresh" partial-matches requested "Hardware";
        // an existing "Order scanners" lives in "Hardware Refresh". Since the task
        // would be created under the *requested* "Hardware" (a different project),
        // it must NOT be flagged a duplicate.
        // OMN-139: shapes must match per-site schemas (see prior test for details)
        const dbResponses = [
          createScriptSuccess({ projects: [{ name: 'Hardware Refresh' }] }),
          createScriptSuccess({ ok: true, v: 'ast', items: [] }),
          createScriptSuccess({ tasks: [{ name: 'Order scanners', project: 'Hardware Refresh' }] }),
        ];
        let call = 0;
        mockOmni.executeJson.mockImplementation(() => Promise.resolve(dbResponses[call++]));

        const res: any = await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: { items: [{ name: 'Order scanners', project: 'Hardware' }] },
          },
        });

        const item = res.data.items[0];
        expect(item.project.match).toBe('partial');
        expect(item.project.resolved).toBe('Hardware Refresh');
        expect(item.duplicateOf).toBeNull();
        expect(item.readyToCreate).toBe(true);
        expect(res.data.batchPayload.operations).toHaveLength(1);
      });

      it('wraps the incomplete-tasks read in the JXA bridge (flattenedTasks is OmniJS-only)', async () => {
        // Regression guard: buildFilteredTasksScript returns a BARE OmniJS body
        // that references `flattenedTasks` — a global that only exists inside the
        // evaluateJavascript bridge. Passing it raw to execJson throws
        // "Can't find variable: flattenedTasks" and silently disabled dedupe in
        // prod (caught only by live verification, since mocks can't see a bad
        // script). The tasks read must go through buildListTasksScriptV4, which
        // embeds the body in the JXA→bridge harness.
        const scripts: string[] = [];
        mockOmni.executeJson.mockImplementation((script: string) => {
          scripts.push(script);
          return Promise.resolve({ tasks: [] });
        });

        await tool.execute({
          analysis: { type: 'parse_meeting_notes', params: { items: [{ name: 'X', project: 'Y' }] } },
        });

        const tasksScript = scripts.find((s) => s.includes('flattenedTasks'));
        expect(tasksScript).toBeDefined();
        // The flattenedTasks body must be embedded inside the evaluateJavascript bridge.
        expect(tasksScript).toContain('evaluateJavascript');
      });

      it('OMN-191: the project-scoped dedup read excludes the project root by construction', async () => {
        // A project root is named identically to its project but is NOT an actionable
        // task — it must not make "create a task named like the project" look like a
        // duplicate. The project-scoped read uses the resolved project's own subtree
        // (project.flattenedTasks), which does NOT include the root (the root is
        // project.task, not a member of flattenedTasks) — root exclusion is structural,
        // no predicate needed.
        const scripts: string[] = [];
        mockOmni.executeJson.mockImplementation((script: string) => {
          scripts.push(script);
          return Promise.resolve(createScriptSuccess({ tasks: [] }));
        });

        await tool.execute({
          analysis: { type: 'parse_meeting_notes', params: { items: [{ name: 'X', project: 'Y' }] } },
        });

        const tasksScript = scripts.find((s) => s.includes('flattenedTasks'));
        expect(tasksScript).toBeDefined();
        expect(tasksScript).toContain('p.flattenedTasks');
        expect(tasksScript).not.toContain('task.project === null');
      });

      it('OMN-126: scopes the dedup read per requested scope — project read + inbox read, not whole-DB', async () => {
        // The candidate read is scoped to the requested project(s) + inbox via one
        // read per distinct scope (the AST rejects project=A OR project=B in a single
        // query, so per-scope reads are used). A named project → a flattenedTasks read
        // narrowed by task.containingProject; an inbox-bound item → a separate
        // inbox.forEach read. The old whole-DB read had neither narrowing clause.
        const scripts: string[] = [];
        // Every mocked read returns a success envelope so the scripts yield
        // well-formed data. The per-scope dedup path runs independently of the
        // projects read — scopeProjects derives from items/defaultProject, not
        // existingProjects — so there is no whole-DB fallback (review ②: a failed
        // projects read degrades only the preview's match labels, never dedup).
        mockOmni.executeJson.mockImplementation((script: string) => {
          scripts.push(script);
          return Promise.resolve(createScriptSuccess({ tasks: [] }));
        });

        await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: {
              items: [
                { name: 'A', project: 'Hardware' }, // named project → project-scoped read
                { name: 'B' }, // no project → inbox-bound → inbox-scoped read
              ],
            },
          },
        });

        // Project-scoped read: the resolved project's own subtree (project.flattenedTasks).
        const projectRead = scripts.find((s) => s.includes('p.flattenedTasks'));
        expect(projectRead).toBeDefined();
        // Inbox-scoped read: a separate inbox.forEach pass for the project-less item.
        const inboxRead = scripts.find((s) => s.includes('inbox.forEach') && s.includes('task.inInbox === true'));
        expect(inboxRead).toBeDefined();
      });

      it('OMN-126: two distinct projects → two project-scoped reads (no contradictory-OR throw)', async () => {
        // Regression guard: a single OR-of-two-projects query throws
        // "Contradictory conditions on field task.containingProject" in the AST. The
        // per-scope-read design avoids that — two distinct projects = two reads.
        let taskReads = 0;
        // Every mocked read returns a success envelope. The per-scope path runs
        // independently of the projects read (scopeProjects derives from
        // items/defaultProject), so there is no whole-DB fallback — see review ②.
        mockOmni.executeJson.mockImplementation((script: string) => {
          if (script.includes('flattenedTasks')) taskReads++;
          return Promise.resolve(createScriptSuccess({ tasks: [] }));
        });

        const res: any = await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: {
              items: [
                { name: 'A', project: 'Hardware' },
                { name: 'B', project: 'Software' },
              ],
            },
          },
        });

        expect(res.success).toBe(true);
        expect(taskReads).toBe(2);
      });

      it('OMN-126: the project-scoped read resolves the project name case-insensitively', async () => {
        // A case-mismatched item.project ('hardware' vs a real 'Hardware') must still
        // find its project. The scoped read embeds the RAW requested name and resolves
        // it case-insensitively inside OmniJS (flattenedProjects scan, both sides
        // lowercased) — so the read needs no separate canonicalization step against the
        // project-names list.
        const scripts: string[] = [];
        mockOmni.executeJson.mockImplementation((script: string) => {
          scripts.push(script);
          return Promise.resolve(createScriptSuccess({ tasks: [] }));
        });

        await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: { items: [{ name: 'Order scanners', project: 'hardware' }] }, // lowercase mismatch
          },
        });

        const projectRead = scripts.find((s) => s.includes('p.flattenedTasks'));
        expect(projectRead).toBeDefined();
        // Raw requested name embedded + case-insensitive resolution (toLowerCase on both
        // sides), so 'hardware' resolves to a real 'Hardware' at runtime.
        expect(projectRead).toContain('hardware');
        expect(projectRead).toContain('toLowerCase');
      });

      it("OMN-126 review ①: project:'' scopes the dedup read to the inbox, not a project named ''", async () => {
        // An empty-string project must be treated as the inbox (null). Otherwise the
        // scoped read filters on a project named '' (zero matches) and silently misses
        // a real inbox duplicate.
        const scripts: string[] = [];
        mockOmni.executeJson.mockImplementation((script: string) => {
          scripts.push(script);
          return Promise.resolve(createScriptSuccess({ tasks: [] }));
        });

        await tool.execute({
          analysis: { type: 'parse_meeting_notes', params: { items: [{ name: 'X', project: '' }] } },
        });

        // Inbox-scoped read present; no project-name narrowing (which would scope on '').
        const inboxRead = scripts.find((s) => s.includes('inbox.forEach') && s.includes('task.inInbox === true'));
        expect(inboxRead).toBeDefined();
        const taskScripts = scripts.filter((s) => s.includes('flattenedTasks'));
        expect(taskScripts.some((s) => s.includes('task.containingProject ==='))).toBe(false);
      });

      it('OMN-126 review ②: a failed projects read does NOT break dedup (the scoped read self-resolves)', async () => {
        // The scoped dedup read resolves the project name itself, so a failed
        // existing-projects read degrades only the preview's project.match — never
        // duplicate detection. (Contrast the pre-rework design, where the read scoped
        // by a name it could not canonicalize and silently missed dups.)
        const scripts: string[] = [];
        let call = 0;
        mockOmni.executeJson.mockImplementation((script: string) => {
          scripts.push(script);
          call++;
          // Call 1 is the projects read — fail it (non-success envelope).
          if (call === 1) return Promise.resolve({});
          return Promise.resolve(createScriptSuccess({ tasks: [{ name: 'Order scanners', project: 'Hardware' }] }));
        });

        const res: any = await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: { items: [{ name: 'Order scanners', project: 'hardware' }] },
          },
        });

        // The dedup read is still the project-scoped self-resolving read (not whole-DB).
        const projectRead = scripts.find((s) => s.includes('p.flattenedTasks'));
        expect(projectRead).toBeDefined();
        // Dedup still works (the scoped read self-resolved 'hardware'; findDuplicateTask
        // compares case-insensitively).
        expect(res.data.items[0].duplicateOf).toBeTruthy();
        expect(res.data.items[0].readyToCreate).toBe(false);
        // The projects-read failure is still surfaced (degrades preview match only).
        expect((res.data.warnings as string[]).some((w) => w.includes('project resolution unavailable'))).toBe(true);
      });

      it('OMN-126 review ③: a single failed scope read NAMES that scope in the warning', async () => {
        // Two named scopes; the 'Software' read fails while 'Hardware' succeeds. The
        // warning must name the failed scope, not blanket "dedupe unavailable" — dedup
        // still worked for Hardware.
        let call = 0;
        mockOmni.executeJson.mockImplementation((script: string) => {
          call++;
          if (call === 1) {
            return Promise.resolve(createScriptSuccess({ projects: [{ name: 'Hardware' }, { name: 'Software' }] }));
          }
          if (script.includes('flattenedTasks')) {
            // Fail only the Software-scoped read (its scope name is embedded literally).
            if (script.includes('Software')) return Promise.resolve({});
            return Promise.resolve(createScriptSuccess({ tasks: [] }));
          }
          return Promise.resolve(createScriptSuccess({ tags: [] }));
        });

        const res: any = await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: {
              items: [
                { name: 'A', project: 'Hardware' },
                { name: 'B', project: 'Software' },
              ],
            },
          },
        });

        const warnings = res.data.warnings as string[];
        const dedupeWarn = warnings.find((w) => w.startsWith('dedupe unavailable'));
        expect(dedupeWarn).toBeDefined();
        expect(dedupeWarn).toContain('Software');
        expect(dedupeWarn).not.toContain('Hardware');
      });

      it('emits a batchPayload that round-trips unchanged through WriteSchema { batch }', async () => {
        const res: any = await tool.execute({
          analysis: {
            type: 'parse_meeting_notes',
            params: {
              items: [
                {
                  name: 'Order scanners',
                  project: 'Hardware',
                  tags: ['@errand'],
                  dueDate: '2026-06-20',
                  deferDate: '2026-06-18 08:00',
                  estimatedMinutes: 30,
                  flagged: true,
                  note: 'six units',
                },
                { name: 'Email Dennis' },
              ],
              validateAgainstExisting: false,
            },
          },
        });

        const parsed = WriteSchema.safeParse({
          mutation: { operation: 'batch', operations: res.data.batchPayload.operations },
        });
        expect(parsed.success).toBe(true);
      });
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
      // OMN-139: executeJson returns ScriptResult; mock must match REVIEWS_LIST_SCHEMA
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          success: true,
          projects: [
            { id: 'p1', name: 'Overdue', nextReviewDate: yesterday },
            { id: 'p2', name: 'Due Today', nextReviewDate: today },
            { id: 'p3', name: 'Due Soon', nextReviewDate: soon },
            { id: 'p4', name: 'No Schedule' },
          ],
        }),
      );

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

    // OMN-256: batch mark_reviewed — the plural path, distinct envelope shape.
    describe('mark_reviewed batch (projectIds, OMN-256)', () => {
      it('marks multiple projects reviewed via projectIds, invalidates caches', async () => {
        mockOmni.buildScript.mockReturnValue('script');
        mockOmni.executeJson.mockResolvedValue(
          createScriptSuccess({
            success: true,
            results: {
              successful: [
                {
                  projectId: 'p1',
                  projectName: 'Alpha',
                  changes: ['Last review date set to 2026-07-01T12:00:00.000Z'],
                  lastReviewDate: '2026-07-01T12:00:00.000Z',
                  nextReviewDate: null,
                },
                {
                  projectId: 'p2',
                  projectName: 'Beta',
                  changes: ['Last review date set to 2026-07-01T12:00:00.000Z'],
                  lastReviewDate: '2026-07-01T12:00:00.000Z',
                  nextReviewDate: null,
                },
              ],
              failed: [],
              summary: { total_requested: 2, successful_count: 2, failed_count: 0 },
            },
            message: 'Batch mark-reviewed completed: 2 successful, 0 failed',
          }),
        );

        const res: any = await tool.execute({
          analysis: { type: 'manage_reviews', params: { operation: 'mark_reviewed', projectIds: ['p1', 'p2'] } },
        });

        expect(res.success).toBe(true);
        expect(res.metadata.operation).toBe('mark_reviewed');
        expect(res.data.batch.results.summary).toEqual({ total_requested: 2, successful_count: 2, failed_count: 0 });
        expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
        expect(mockCache.invalidate).toHaveBeenCalledWith('reviews');
      });

      it('reports an unresolvable id as its own loud failed row (continue-on-error, no silent drop)', async () => {
        mockOmni.buildScript.mockReturnValue('script');
        mockOmni.executeJson.mockResolvedValue(
          createScriptSuccess({
            success: true,
            results: {
              successful: [
                {
                  projectId: 'p1',
                  projectName: 'Alpha',
                  changes: ['Last review date set to 2026-07-01T12:00:00.000Z'],
                  lastReviewDate: '2026-07-01T12:00:00.000Z',
                  nextReviewDate: null,
                },
              ],
              failed: [{ projectId: 'ghost', error: 'Project not found' }],
              summary: { total_requested: 2, successful_count: 1, failed_count: 1 },
            },
            message: 'Batch mark-reviewed completed: 1 successful, 1 failed',
          }),
        );

        const res: any = await tool.execute({
          analysis: { type: 'manage_reviews', params: { operation: 'mark_reviewed', projectIds: ['p1', 'ghost'] } },
        });

        expect(res.success).toBe(true);
        expect(res.data.batch.results.failed).toEqual([{ projectId: 'ghost', error: 'Project not found' }]);
        expect(res.data.batch.results.successful).toHaveLength(1);
      });
    });
  });

  // ==========================================================================
  // Pattern Analysis
  // ==========================================================================
  describe('pattern_analysis', () => {
    // OMN-268: a fetch failure (script timeout/error) must surface as an error
    // envelope — never as success:true with zero-initialized "healthy" findings.
    it('returns an error envelope when the data fetch script fails', async () => {
      mockOmni.executeJson.mockResolvedValue(createScriptError('Script execution timed out', 'timeout after 120000ms'));

      const res: any = await tool.execute({
        analysis: { type: 'pattern_analysis', params: { insights: ['duplicates'] } },
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('EXECUTION_ERROR');
      // No fabricated findings may ride along on the failure
      expect(res.data?.duplicates).toBeUndefined();
    });

    it('returns an error envelope when the fetch returns an unusable shape', async () => {
      mockOmni.executeJson.mockResolvedValue(createScriptSuccess(null));

      const res: any = await tool.execute({
        analysis: { type: 'pattern_analysis' },
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('EXECUTION_ERROR');
      expect(res.data?.deadline_health).toBeUndefined();
    });

    // Round-4 review: analyzeWaitingFor read task.createdDate — a field NO
    // emitter ever wrote (the wire key is creationDate) — so days_waiting was
    // silently always 0 and the >30-day warning escalation could never fire.
    it('waiting_for computes days_waiting from creationDate (red-verified against the createdDate misread)', async () => {
      const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          tasks: [
            {
              id: 'w1',
              name: 'Waiting for vendor quote',
              completed: false,
              flagged: false,
              status: 'available',
              tags: [],
              creationDate: fortyFiveDaysAgo,
              estimatedMinutes: null,
              children: 0,
            },
          ],
          projects: [],
          tags: [],
        }),
      );

      const res: any = await tool.execute({
        analysis: { type: 'pattern_analysis', params: { insights: ['waiting_for'] } },
      });

      const items = res.data.waiting_for.items as Array<{ id: string; days_waiting: number }>;
      expect(items.find((i) => i.id === 'w1')?.days_waiting).toBeGreaterThanOrEqual(44);
    });

    it('still succeeds honestly on a genuinely empty (but fetched) database', async () => {
      mockOmni.executeJson.mockResolvedValue(createScriptSuccess({ tasks: [], projects: [], tags: [] }));

      const res: any = await tool.execute({
        analysis: { type: 'pattern_analysis', params: { insights: ['duplicates'] } },
      });

      expect(res.success).toBe(true);
      expect(res.metadata?.tasks_analyzed).toBe(0);
    });
  });

  // OMN-255: missing_next_actions — active projects with zero available tasks.
  // "Available" is, since OMN-269, the flattened ACTIONABLE_STATUSES descendant
  // count from fetchSlimmedData's OmniJS scan; its ===0 boundary (all this
  // detector consumes) matched JXA numberOfAvailableTasks() 219/219 live.
  describe('pattern_analysis missing_next_actions (OMN-255)', () => {
    const projects = [
      { id: 'p1', name: 'Stalled seq', status: 'active status', taskCount: 2, availableTaskCount: 0, folder: 'Work' },
      { id: 'p2', name: 'Healthy', status: 'active status', taskCount: 1, availableTaskCount: 1, folder: null },
      { id: 'p3', name: 'On hold', status: 'on hold status', taskCount: 1, availableTaskCount: 0, folder: 'Work' },
      { id: 'p4', name: 'All done', status: 'active status', taskCount: 1, availableTaskCount: 0, folder: null },
    ];

    function mockDb() {
      mockOmni.executeJson.mockResolvedValue(createScriptSuccess({ tasks: [], projects, tags: [] }));
    }

    it('reports only active zero-available projects (id, name, folder), excluding on-hold and healthy ones', async () => {
      mockDb();
      const res: any = await tool.execute({
        analysis: { type: 'pattern_analysis', params: { insights: ['missing_next_actions'] } },
      });

      expect(res.success).toBe(true);
      const finding = res.data.missing_next_actions;
      expect(finding).toBeDefined();
      expect(finding.severity).toBe('warning');
      expect(finding.count).toBe(2);
      const items = finding.items as Array<{ id: string; name: string; folder: string | null }>;
      // p2 (has available task) and p3 (on hold) are excluded; p1/p4 reported
      expect(items.map((i) => i.id).sort()).toEqual(['p1', 'p4']);
      const p1 = items.find((i) => i.id === 'p1');
      expect(p1).toMatchObject({ id: 'p1', name: 'Stalled seq', folder: 'Work' });
    });

    it('fails open: an unrecognized status string is treated as active, never silently dropped', async () => {
      // Mirrors safeGetStatus (helpers.ts): normalization defaults to 'active',
      // so status-string drift (new OF version, locale) surfaces the project
      // rather than hiding it from the weekly review.
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          tasks: [],
          projects: [
            { id: 'px', name: 'Drifted status', status: 'mystery rendering', taskCount: 1, availableTaskCount: 0 },
            { id: 'py', name: 'Dropped', status: 'dropped status', taskCount: 1, availableTaskCount: 0 },
            { id: 'pz', name: 'Ambiguous', status: 'active (hold)', taskCount: 1, availableTaskCount: 0 },
          ],
          tags: [],
        }),
      );
      const res: any = await tool.execute({
        analysis: { type: 'pattern_analysis', params: { insights: ['missing_next_actions'] } },
      });

      const ids = (res.data.missing_next_actions.items as Array<{ id: string }>).map((i) => i.id);
      expect(ids).toContain('px'); // unknown → fail open → reported
      expect(ids).not.toContain('py'); // recognized terminal status → excluded
      expect(ids).toContain('pz'); // ambiguous active+hold → active wins (safeGetStatus order)
    });

    // Round-2 review: ProjectData.status is normalized ONCE at the fetch boundary
    // (safeGetStatus vocabulary: active/onHold/done/dropped). These pin the two
    // latent consumer bugs the raw/normalized split had already caused.
    it('dormant_projects excludes done/dropped projects (raw JXA status strings)', async () => {
      const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          tasks: [],
          projects: [
            {
              id: 'd1',
              name: 'Old active',
              status: 'active status',
              taskCount: 1,
              availableTaskCount: 1,
              modificationDate: old,
            },
            {
              id: 'd2',
              name: 'Old done',
              status: 'done status',
              taskCount: 1,
              availableTaskCount: 0,
              modificationDate: old,
            },
            {
              id: 'd3',
              name: 'Old dropped',
              status: 'dropped status',
              taskCount: 1,
              availableTaskCount: 0,
              modificationDate: old,
            },
          ],
          tags: [],
        }),
      );
      const res: any = await tool.execute({
        analysis: { type: 'pattern_analysis', params: { insights: ['dormant_projects'] } },
      });

      const ids = (res.data.dormant_projects.items as Array<{ id: string }>).map((i) => i.id);
      expect(ids).toContain('d1');
      expect(ids).not.toContain('d2');
      expect(ids).not.toContain('d3');
    });

    it('review_gaps sees active and on-hold projects despite raw JXA status strings', async () => {
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          tasks: [],
          projects: [
            { id: 'r1', name: 'Never reviewed active', status: 'active status', taskCount: 1, availableTaskCount: 1 },
            { id: 'r2', name: 'Never reviewed on hold', status: 'on hold status', taskCount: 1, availableTaskCount: 0 },
            { id: 'r3', name: 'Done project', status: 'done status', taskCount: 1, availableTaskCount: 0 },
          ],
          tags: [],
        }),
      );
      const res: any = await tool.execute({
        analysis: { type: 'pattern_analysis', params: { insights: ['review_gaps'] } },
      });

      const never = (res.data.review_gaps.items.never_reviewed as Array<{ id: string }>).map((i) => i.id);
      expect(never).toContain('r1');
      expect(never).toContain('r2');
      expect(never).not.toContain('r3');
    });

    it('wip_limits sees on-hold projects despite raw JXA status strings', async () => {
      const mkTask = (i: number) => ({
        id: `t${i}`,
        name: `task ${i}`,
        completed: false,
        flagged: false,
        status: 'available',
        tags: [],
        projectId: 'w1',
        estimatedMinutes: null,
      });
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          tasks: [1, 2, 3, 4, 5, 6, 7].map(mkTask),
          projects: [
            { id: 'w1', name: 'Overloaded on hold', status: 'on hold status', taskCount: 7, availableTaskCount: 7 },
          ],
          tags: [],
        }),
      );
      const res: any = await tool.execute({
        analysis: { type: 'pattern_analysis', params: { insights: ['wip_limits'] } },
      });

      const over = (res.data.wip_limits.items.projects_over_limit as Array<{ project: string }>).map((p) => p.project);
      expect(over).toContain('Overloaded on hold');
    });

    // OMN-269: the fetch is ONE OmniJS bridge scan. The old pure-JXA loop made
    // ~12 Apple Event round trips per task (~34k on a real DB) and chronically
    // exceeded the 120s script budget; the OmniJS scan runs inside OmniFocus's
    // JS engine (live-probed 2026-07-16: ~11s on a ~2.9k-task DB).
    it('emits a single OmniJS bridge scan, never a per-item JXA loop (OMN-269)', async () => {
      mockDb();
      await tool.execute({
        analysis: { type: 'pattern_analysis', params: { insights: ['duplicates'] } },
      });
      const script = mockOmni.executeJson.mock.calls.at(-1)[0] as string;
      expect(script).toContain('evaluateJavascript');
      // The JXA per-item accessor pattern IS the timeout mechanism — none may remain
      expect(script).not.toContain('doc.flattenedTasks()');
      expect(script).not.toContain('task.completed()');
      expect(script).not.toContain('project.folder()');
      // OmniJS enums don't stringify usefully — status must be mapped explicitly
      expect(script).toContain('Task.Status.Blocked');
      expect(script).toContain('Project.Status.OnHold');
    });

    // OMN-269 supersedes the OMN-255 includeFolder gating: folder is property
    // access in OmniJS (near-zero cost), so it is always emitted (null for
    // root-level projects) regardless of the requested pattern set.
    it('always emits the folder read, for any pattern set', async () => {
      for (const insights of [['missing_next_actions'], ['duplicates']]) {
        mockDb();
        await tool.execute({
          analysis: { type: 'pattern_analysis', params: { insights } },
        });
        const script = mockOmni.executeJson.mock.calls.at(-1)[0] as string;
        expect(script.match(/parentFolder/g)?.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('is included in the default "all" expansion', async () => {
      mockDb();
      const res: any = await tool.execute({ analysis: { type: 'pattern_analysis' } });

      expect(res.data.missing_next_actions).toBeDefined();
      expect(res.metadata.patterns_checked).toContain('missing_next_actions');
    });

    it('reports info severity with an honest empty list when nothing is stalled', async () => {
      mockOmni.executeJson.mockResolvedValue(
        createScriptSuccess({
          tasks: [],
          projects: [{ id: 'p2', name: 'Healthy', status: 'active status', taskCount: 1, availableTaskCount: 1 }],
          tags: [],
        }),
      );
      const res: any = await tool.execute({
        analysis: { type: 'pattern_analysis', params: { insights: ['missing_next_actions'] } },
      });

      const finding = res.data.missing_next_actions;
      expect(finding.severity).toBe('info');
      expect(finding.count).toBe(0);
      expect(finding.items).toEqual([]);
    });
  });

  // ─── ADVERTISED SCHEMA ──────────────────────────────────────────────

  describe('inputSchema (MCP advertisement)', () => {
    it('should use a hand-crafted minimal schema, not the expanded Zod oneOf', () => {
      const schema = tool.inputSchema;

      // Should be a flat object with analysis property, not oneOf with duplicated branches
      const analysis = (schema as any).properties?.analysis;
      expect(analysis).toBeDefined();

      // Should have type enum and loose scope/params objects
      expect(analysis.properties.type).toBeDefined();
      expect(analysis.properties.scope).toEqual({ type: 'object' });
      expect(analysis.properties.params).toEqual({ type: 'object' });

      // Should NOT have oneOf (which duplicates scope across 8 branches)
      expect(analysis.oneOf).toBeUndefined();
    });

    it('should advertise all 8 analysis types', () => {
      const schema = tool.inputSchema as any;
      const typeEnum = schema.properties.analysis.properties.type.enum;
      expect(typeEnum).toEqual(
        expect.arrayContaining([
          'productivity_stats',
          'task_velocity',
          'overdue_analysis',
          'pattern_analysis',
          'workflow_analysis',
          'recurring_tasks',
          'parse_meeting_notes',
          'manage_reviews',
        ]),
      );
      expect(typeEnum).toHaveLength(8);
    });

    it('should require analysis.type', () => {
      const schema = tool.inputSchema as any;
      expect(schema.required).toContain('analysis');
      expect(schema.properties.analysis.required).toContain('type');
    });

    it('should be under 1KB minified', () => {
      const size = JSON.stringify(tool.inputSchema).length;
      expect(size).toBeLessThan(1000);
    });
  });

  // ==========================================================================
  // manage_reviews set_schedule — reviewInterval wiring (OMN-60)
  //
  // Post-OMN-32: SET_REVIEW_SCHEDULE_SCRIPT template was replaced by
  // buildSetReviewScheduleScript(). The OMN-60 invariant — "the requested
  // reviewInterval ends up in the generated script, not hardcoded null" — is
  // now verified by inspecting the script string passed to executeJson, since
  // the builder JSON-serializes the params and bakes them into the OmniJS body.
  // ==========================================================================
  describe('manage_reviews set_schedule reviewInterval wiring (OMN-60)', () => {
    it('passes the requested reviewInterval through to the script (not hardcoded null)', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: { results: { successful: [], failed: [], summary: { successful_count: 0, failed_count: 0 } } },
      });

      await tool.execute({
        analysis: {
          type: 'manage_reviews',
          params: {
            operation: 'set_schedule',
            projectId: 'p1',
            reviewInterval: { unit: 'week', steps: 2 },
          },
        },
      });

      expect(mockOmni.executeJson).toHaveBeenCalledTimes(1);
      const generatedScript = mockOmni.executeJson.mock.calls[0][0] as string;
      // OMN-106: the AST launcher carries the OmniJS body as ONE JSON string
      // literal, so the interval spec appears with escaped quotes.
      expect(generatedScript).toContain('const intervalSpec = {\\"unit\\":\\"week\\",\\"steps\\":2};');
    });

    // OMN-256: set_schedule was already batch-native at the AST layer —
    // this pins that the tool layer now actually widens through projectIds.
    it('OMN-256: passes projectIds through as a real batch, not a 1-element wrap of projectId', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: { results: { successful: [], failed: [], summary: { successful_count: 0, failed_count: 0 } } },
      });

      await tool.execute({
        analysis: {
          type: 'manage_reviews',
          params: {
            operation: 'set_schedule',
            projectIds: ['p1', 'p2', 'p3'],
            reviewInterval: { unit: 'week', steps: 2 },
          },
        },
      });

      expect(mockOmni.executeJson).toHaveBeenCalledTimes(1);
      const generatedScript = mockOmni.executeJson.mock.calls[0][0] as string;
      expect(generatedScript).toContain('const pids = [\\"p1\\",\\"p2\\",\\"p3\\"];');
    });

    it('FAIL LOUD (OMN-106): set_schedule with neither interval nor date refuses without executing', async () => {
      // Replaces the pre-OMN-106 back-compat pin (reviewInterval:null passed
      // through to a script that silently no-opped). Kip's 2026-07-06
      // fail-loud decision: nothing to set means a VALIDATION_ERROR, and no
      // script runs at all.
      mockCache.get.mockReturnValue(null);

      const result = (await tool.execute({
        analysis: {
          type: 'manage_reviews',
          params: { operation: 'set_schedule', projectId: 'p1' },
        },
      })) as { success: boolean; error?: { code?: string } };

      expect(mockOmni.executeJson).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('OMN-273: clear_schedule is no longer an operation — rejected at the schema, nothing executes', async () => {
      // OmniFocus has no "not scheduled for review" state (reviewInterval is
      // non-nullable and nextReviewDate:null just recomputes from the interval),
      // so the operation was dropped entirely rather than kept as a runtime
      // UNSUPPORTED refusal (OMN-41/OMN-58/OMN-106 lineage).
      mockCache.get.mockReturnValue(null);

      await expect(
        tool.execute({
          analysis: {
            type: 'manage_reviews',
            params: { operation: 'clear_schedule', projectId: 'p1' },
          },
        }),
      ).rejects.toThrow(/Invalid parameters/);

      expect(mockOmni.executeJson).not.toHaveBeenCalled();
    });
  });
});

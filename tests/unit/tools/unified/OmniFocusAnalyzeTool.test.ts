import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OmniFocusAnalyzeTool } from '../../../../src/tools/unified/OmniFocusAnalyzeTool.js';
import { WriteSchema } from '../../../../src/tools/unified/schemas/write-schema.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation.js';
import { createScriptSuccess } from '../../../../src/omnifocus/script-result-types.js';

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
              mostOverdue: oldest,
            },
            insights: ['2 overdue tasks found'],
            groupedByUrgency: { critical: [oldest], high: [newer], medium: [], low: [] },
            projectBottlenecks: [
              { name: 'Work', overdueCount: 2, blockedCount: 0, avgDaysOverdue: '26.5', blockageRate: '0.0' },
            ],
            blockedTasks: [],
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
      expect(res.data.analysis.depth).toBe('standard');
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
        // execJson reads run via Promise.all in array order: projects, tags, tasks.
        // OMN-139: executeJson now returns ScriptResult; shapes must match per-site schemas:
        //   projects → PROJECTS_LIST_SCHEMA {projects:[...], metadata?}
        //   tags     → TAG_ITEMS_SCHEMA {ok:true, v:'ast', items:[...]}
        //   tasks    → TASKS_LIST_SCHEMA {tasks:[...], metadata?}
        const dbResponses = [
          createScriptSuccess({ projects: [{ name: 'Hardware' }] }),
          createScriptSuccess({ ok: true, v: 'ast', items: [{ name: '@errand' }] }),
          createScriptSuccess({ tasks: [{ name: 'Order scanners', project: 'Hardware' }] }),
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
        expect(mockOmni.executeJson).toHaveBeenCalledTimes(3);

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

      it('OMN-191: the dedup tasks read excludes project-root rows by default (inherits OMN-153)', async () => {
        // A project root is named identically to its project but is NOT an
        // actionable task — it must not make "create a task named like the
        // project" look like a duplicate. fetchExistingIncompleteTasks routes
        // through buildListTasksScriptV4 -> buildFilteredTasksScript, which applies
        // OMN-153's default project-root exclusion, so root rows never reach dedup.
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
        // OMN-153 predicate: a project root is the only task with task.project !== null,
        // so excluding `task.project === null` rows keeps roots out of the dedup set.
        expect(tasksScript).toContain('task.project === null');
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
      expect(generatedScript).toContain('"reviewInterval":{"unit":"week","steps":2}');
    });

    it('passes reviewInterval: null when none is supplied (back-compat)', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: { results: { successful: [], failed: [], summary: { successful_count: 0, failed_count: 0 } } },
      });

      await tool.execute({
        analysis: {
          type: 'manage_reviews',
          params: { operation: 'set_schedule', projectId: 'p1' },
        },
      });

      expect(mockOmni.executeJson).toHaveBeenCalledTimes(1);
      const generatedScript = mockOmni.executeJson.mock.calls[0][0] as string;
      expect(generatedScript).toContain('"reviewInterval":null');
    });
  });
});

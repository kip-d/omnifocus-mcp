import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowAnalysisTool } from '../../../../src/tools/analytics/WorkflowAnalysisTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation.js';

vi.mock('../../../../src/cache/CacheManager.js', () => ({ CacheManager: vi.fn() }));
vi.mock('../../../../src/omnifocus/OmniAutomation.js', () => ({ OmniAutomation: vi.fn() }));
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() })),
}));

describe('WorkflowAnalysisTool', () => {
  let tool: WorkflowAnalysisTool;
  let mockCache: any;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn(), set: vi.fn() };
    mockOmni = { buildScript: vi.fn(), executeJson: vi.fn() };
    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmni);
    tool = new WorkflowAnalysisTool(mockCache as any);
    (tool as any).omniAutomation = mockOmni;
  });

  it('returns cached results when available', async () => {
    const cached = { insights: [{ insight: 'Cache' }], recommendations: [], patterns: {} };
    mockCache.get.mockReturnValue(cached);

    const res: any = await tool.execute({
      analysisDepth: 'quick',
      focusAreas: ['productivity'],
      includeRawData: false,
      maxInsights: 10,
    } as any);
    expect(res.success).toBe(true);
    expect(res.metadata.from_cache).toBe(true);
  });

  it('handles script error result with structured error', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({ success: false, error: 'Failed', details: 'Test error' });

    const res: any = await tool.execute({} as any);
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('ANALYSIS_FAILED');
  });

  it('returns analytics response with key findings and optional raw data', async () => {
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

    const res: any = await tool.execute({ includeRawData: true } as any);
    expect(res.success).toBe(true);
    expect(res.data.analysis.depth).toBe('standard');
    expect(res.data.data).toBeDefined();
    expect(Array.isArray(res.summary.key_findings)).toBe(true);
  });

  it('workflow analysis script should use task.inInbox for inbox detection', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/omnifocus/scripts/analytics/workflow-analysis-v3.ts', 'utf-8');
    // Should NOT use the manual containingProject check for inbox
    expect(source).not.toMatch(/const inInbox = task\.containingProject === null/);
    // Should use the native OmniFocus property
    expect(source).toMatch(/const inInbox = task\.inInbox/);
  });

  it('extractKeyFindings falls back to default message', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({ insights: [], patterns: {}, recommendations: [] });

    const res: any = await tool.execute({} as any);
    expect(res.success).toBe(true);
    expect(res.summary.key_findings[0]).toMatch(/Analysis completed successfully/);
  });
});

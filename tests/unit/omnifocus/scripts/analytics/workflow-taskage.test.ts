// tests/unit/omnifocus/scripts/analytics/workflow-taskage.test.ts
// OMN-251 (OMN-148 drift D17) — workflow_analysis's taskAge must read the real
// OmniJS date properties (`added`/`modified`). The script previously read
// `task.creationDate`/`task.modificationDate` (JXA names, undefined in OmniJS),
// so every taskAge was 0 and the avgAge>120 project-health penalty never fired
// — the OMN-142 silent-metric-death class.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { WORKFLOW_ANALYSIS_V3 } from '../../../../../src/omnifocus/scripts/analytics/workflow-analysis-v3.js';
import { WORKFLOW_ANALYSIS_V3_SCHEMA } from '../../../../../src/omnifocus/response-schemas/analyze.js';

const DAY = 24 * 60 * 60 * 1000;

interface FakeTask {
  completed: boolean;
  numberOfTasks: number;
  flagged: boolean;
  taskStatus: string;
  dueDate: Date | null;
  deferDate: Date | null;
  added: Date | null;
  modified: Date | null;
  estimatedMinutes: number;
  inInbox: boolean;
  containingProject: { name: string } | null;
  tags: Array<{ name: string }>;
  name: string;
  id: { primaryKey: string };
}

function makeLeafTask(overrides: Partial<FakeTask>): FakeTask {
  return {
    completed: false,
    numberOfTasks: 0,
    flagged: false,
    taskStatus: 'available',
    dueDate: null,
    deferDate: null,
    added: null,
    modified: null,
    estimatedMinutes: 0,
    inInbox: false,
    containingProject: { name: 'Aged Project' },
    tags: [],
    name: 'Fixture task',
    id: { primaryKey: 't1' },
    ...overrides,
  };
}

function runScript(tasks: FakeTask[]): {
  ok: boolean;
  data: { patterns: { workloadDistribution: { byProject: Record<string, { healthScore: number }> } } };
} {
  const options = {
    analysisDepth: 'full',
    focusAreas: ['productivity', 'workload', 'bottlenecks'],
    maxInsights: 15,
    includeRawData: false,
  };
  const script = WORKFLOW_ANALYSIS_V3.replace('{{options}}', JSON.stringify(options));
  const inner = {
    flattenedTasks: tasks,
    flattenedProjects: [
      {
        name: 'Aged Project',
        rootTask: { numberOfTasks: tasks.length, numberOfAvailableTasks: tasks.length, numberOfCompletedTasks: 0 },
      },
    ],
    Task: { Status: { Blocked: 'blocked', Available: 'available' } },
    JSON,
  };
  const outer = {
    Application: () => ({ evaluateJavascript: (src: string) => vm.runInNewContext(src, inner) }),
    JSON,
  };
  return JSON.parse(vm.runInNewContext(script, outer) as string) as ReturnType<typeof runScript>;
}

describe('OMN-251 — taskAge reads the real OmniJS date properties', () => {
  it('a 200-day-old task (via `added`) finally triggers the avgAge>120 health penalty', () => {
    const parsed = runScript([makeLeafTask({ added: new Date(Date.now() - 200 * DAY) })]);
    expect(parsed.ok).toBe(true);
    expect(WORKFLOW_ANALYSIS_V3_SCHEMA.safeParse(parsed).success).toBe(true);
    // Otherwise-healthy project: 100 minus ONLY the stale-age penalty (15).
    // Pre-fix the read was undefined → taskAge 0 → healthScore stayed 100.
    expect(parsed.data.patterns.workloadDistribution.byProject['Aged Project'].healthScore).toBe(85);
  });

  it('falls back to `modified` when `added` is absent (the || fallback, real names)', () => {
    const parsed = runScript([makeLeafTask({ modified: new Date(Date.now() - 200 * DAY) })]);
    expect(parsed.data.patterns.workloadDistribution.byProject['Aged Project'].healthScore).toBe(85);
  });

  it('a fresh task keeps the project unpenalized (no age → no penalty)', () => {
    const parsed = runScript([makeLeafTask({ added: new Date(Date.now() - 3 * DAY) })]);
    expect(parsed.data.patterns.workloadDistribution.byProject['Aged Project'].healthScore).toBe(100);
  });
});

// OMN-291 (D16) — the strategic/problematic deferral VERDICT split is replaced by
// two INDEPENDENT, honestly-named screen counts.
//
// The old rule was `isStrategic = deferDays <= 90 || nameMatchesKeyword`, and
// every deferral was then labelled strategic (good) or problematic (bad). Two
// separate dishonesties: it concluded rather than measured, and it made the two
// signals mutually exclusive when they are orthogonal.
//
// Now: `over90Days` counts how far the deferral reaches, `keywordMatched` counts
// recall-screen hits, and a deferral can be in both, one, or neither. They do NOT
// sum to totalDeferred — this file pins exactly that.
import { describe, it, expect } from 'vitest';
import { WORKFLOW_ANALYSIS_V3 } from '../../../../../src/omnifocus/scripts/analytics/workflow-analysis-v3.js';
import { WORKFLOW_ANALYSIS_V3_SCHEMA } from '../../../../../src/omnifocus/response-schemas/analyze.js';
import { runAnalyticsScript, FAKE_TASK_STATUS } from './run-analytics-script.js';

const DAY = 24 * 60 * 60 * 1000;

interface FakeTask {
  completed: boolean;
  flagged: boolean;
  taskStatus: unknown;
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

// The script recomputes `nowTime` when it runs, which is strictly AFTER this
// helper reads Date.now(). A bare `Date.now() + deferInDays * DAY` therefore
// arrives as `deferInDays * DAY - ε`, and the script's
// `Math.floor((deferDate - nowTime) / DAY)` yields deferInDays - 1. Invisible
// for the 200/10/5 fixtures, fatal exactly on the 90/91 boundary case.
// The cushion makes the helper's contract exact: the script floors to
// deferInDays for any start delay under a minute.
const CLOCK_SKEW_CUSHION = 60 * 1000;

function deferredTask(name: string, deferInDays: number, id: string): FakeTask {
  return {
    completed: false,
    flagged: false,
    taskStatus: FAKE_TASK_STATUS.Available,
    dueDate: null,
    deferDate: new Date(Date.now() + deferInDays * DAY + CLOCK_SKEW_CUSHION),
    added: new Date(Date.now() - DAY),
    modified: null,
    estimatedMinutes: 0,
    inInbox: false,
    containingProject: { name: 'P' },
    tags: [],
    name,
    id: { primaryKey: id },
  };
}

interface Parsed {
  ok: boolean;
  data: {
    patterns: {
      deferralAnalysis: {
        totalDeferred: number;
        over90Days: number;
        keywordMatched: number;
        deferralDetails: Array<{ name: string; deferDays: number; keywordMatched: boolean }>;
      };
      workloadDistribution: {
        byProject: Record<string, { deferrals: { total: number; over90Days: number; keywordMatched: number } }>;
      };
    };
  };
}

function runScript(tasks: FakeTask[]): Parsed {
  return runAnalyticsScript(
    WORKFLOW_ANALYSIS_V3,
    { includeRawData: false },
    { flattenedTasks: tasks, flattenedProjects: [{ name: 'P' }] },
  ) as Parsed;
}

describe('OMN-291 (D16) — deferral screens are independent counts, not a verdict split', () => {
  // One task per quadrant of (over90Days x keywordMatched), plus a second
  // "neither" so the arithmetic below is a real property and not a coincidence
  // of a 4-task fixture where 2 + 2 happens to equal the total.
  const tasks = [
    deferredTask('Renewal of domain', 200, 'both'), // keyword AND >90d
    deferredTask('Quiet long defer', 200, 'longOnly'), // >90d only
    deferredTask('Annual checkup', 10, 'kwOnly'), // keyword only
    deferredTask('Ordinary short defer', 10, 'neither1'), // neither
    deferredTask('Another plain defer', 5, 'neither2'), // neither
  ];

  it('counts both dimensions independently — a deferral can match both or neither', () => {
    const parsed = runScript(tasks);
    expect(parsed.ok).toBe(true);
    expect(WORKFLOW_ANALYSIS_V3_SCHEMA.safeParse(parsed).success).toBe(true);

    const d = parsed.data.patterns.deferralAnalysis;
    expect(d.totalDeferred).toBe(5);
    expect(d.over90Days).toBe(2); // 'both' + 'longOnly'
    expect(d.keywordMatched).toBe(2); // 'both' + 'kwOnly'

    // The decisive property: the screens OVERLAP (one task is in both) and leave
    // a REMAINDER (two tasks are in neither), so they cannot be a partition the
    // way strategic/problematic claimed to be. Under the old rule all 5 would
    // have been forced into exactly one of two buckets summing to 5.
    expect(d.over90Days + d.keywordMatched).toBeLessThan(d.totalDeferred);
  });

  it('the quadrants are directly observable in the per-task detail rows', () => {
    const details = runScript(tasks).data.patterns.deferralAnalysis.deferralDetails;
    const byName = Object.fromEntries(details.map((r) => [r.name, r]));

    // both
    expect(byName['Renewal of domain'].keywordMatched).toBe(true);
    expect(byName['Renewal of domain'].deferDays).toBeGreaterThan(90);
    // >90d only
    expect(byName['Quiet long defer'].keywordMatched).toBe(false);
    expect(byName['Quiet long defer'].deferDays).toBeGreaterThan(90);
    // keyword only
    expect(byName['Annual checkup'].keywordMatched).toBe(true);
    expect(byName['Annual checkup'].deferDays).toBeLessThanOrEqual(90);
    // neither
    expect(byName['Ordinary short defer'].keywordMatched).toBe(false);
    expect(byName['Ordinary short defer'].deferDays).toBeLessThanOrEqual(90);
  });

  it('per-project rows carry the same two screen counts', () => {
    const row = runScript(tasks).data.patterns.workloadDistribution.byProject['P'];
    expect(row.deferrals).toEqual({ total: 5, over90Days: 2, keywordMatched: 2 });
  });

  it('per-task detail rows carry keywordMatched as a candidate marker, never a verdict', () => {
    const details = runScript(tasks).data.patterns.deferralAnalysis.deferralDetails;
    const byName = Object.fromEntries(details.map((r) => [r.name, r]));

    expect(byName['Renewal of domain'].keywordMatched).toBe(true);
    expect(byName['Annual checkup'].keywordMatched).toBe(true);
    expect(byName['Quiet long defer'].keywordMatched).toBe(false);
    expect(byName['Ordinary short defer'].keywordMatched).toBe(false);

    // The old verdict field is gone.
    for (const row of details) {
      expect(row).not.toHaveProperty('isStrategic');
    }
  });

  it('the 90-day boundary is exclusive (>90, not >=90)', () => {
    expect(runScript([deferredTask('x', 90, 'a')]).data.patterns.deferralAnalysis.over90Days).toBe(0);
    expect(runScript([deferredTask('x', 91, 'a')]).data.patterns.deferralAnalysis.over90Days).toBe(1);
  });
});

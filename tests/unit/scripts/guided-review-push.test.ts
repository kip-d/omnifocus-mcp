import { describe, it, expect, vi } from 'vitest';
import {
  buildQueue,
  buildInboxItem,
  decideAction,
  findReviewItems,
  ITEM_PREFIX,
  parseArgs,
  UsageError,
  requireArray,
  requireObject,
  type PatternData,
  type ReviewProject,
} from '../../../scripts/ops/guided-review-push.js';

const slice: ReviewProject[] = [
  { id: 'p1', name: 'Wi-Fi migration', reviewStatus: 'overdue' },
  { id: 'p2', name: 'Newstaff shelf rebuild', reviewStatus: 'due_today' },
  { id: 'p3', name: 'Quarterly budget', reviewStatus: 'scheduled' },
];

const patterns: PatternData = {
  missing_next_actions: {
    items: [
      { id: 'p1', name: 'Wi-Fi migration', folder: 'Library', task_count: 4 },
      { id: 'p3', name: 'Quarterly budget', folder: 'Library', task_count: 2 },
    ],
  },
  deadline_health: {
    items: {
      overdue_count: 1,
      overdue_samples: [{ id: 't9', name: 'Renew catalog cert', project: 'Newstaff shelf rebuild', days_overdue: 2 }],
    },
  },
  waiting_for: {
    items: {
      candidates: [
        {
          id: 't4',
          name: 'Ask Ryan about LDAP',
          project: 'Wi-Fi migration',
          project_id: 'p1',
          screen_reasons: ['waiting_tag'],
          defer_date: '2026-08-20',
        },
      ],
    },
  },
  dormant_projects: { items: [{ id: 'p3', name: 'Quarterly budget', days_dormant: 40 }] },
};

describe('buildQueue', () => {
  it('quick mode keeps only items whose project is overdue/due_today in the review slice, in queue order', () => {
    const q = buildQueue(patterns, slice, 'quick');
    expect(q.total).toBe(3);
    expect(q.perQueue).toEqual({ missing_next_actions: 1, deadline_health: 1, waiting_for: 1 });
    expect(q.top.map((t) => t.name)).toEqual(['Wi-Fi migration', 'Renew catalog cert', 'Ask Ryan about LDAP']);
    expect(q.top[0].reason).toBe('active, 0 available tasks, 4 tasks total');
    expect(q.top[1].reason).toBe('due 2 days ago');
    expect(q.top[2].reason).toBe('waiting_tag; deferred 2026-08-20');
  });

  it('deep mode adds dormant_projects and drops the slice filter', () => {
    const q = buildQueue(patterns, slice, 'deep');
    expect(q.perQueue).toEqual({ missing_next_actions: 2, deadline_health: 1, waiting_for: 1, dormant_projects: 1 });
    expect(q.total).toBe(5);
    expect(q.top).toHaveLength(3);
  });

  it('a task whose project is not in the slice is dropped in quick mode (task rows match by project name)', () => {
    const q = buildQueue(patterns, [slice[0]], 'quick');
    expect(q.perQueue).toEqual({ missing_next_actions: 1, deadline_health: 0, waiting_for: 1 });
  });

  it('marks the deadline count as a floor when the detector capped its samples', () => {
    const capped: PatternData = {
      ...patterns,
      deadline_health: {
        items: { overdue_count: 9, overdue_samples: patterns.deadline_health!.items!.overdue_samples },
      },
    };
    const q = buildQueue(capped, slice, 'deep');
    expect(q.floors).toEqual({ deadline_health: true });
  });

  it('waiting_for capped: flags the floor and, in deep mode, uses candidates_total as the count', () => {
    const capped: PatternData = {
      ...patterns,
      waiting_for: {
        items: {
          screen: { candidates_total: 753, candidates_returned: 1, capped: true },
          candidates: patterns.waiting_for!.items!.candidates,
        },
      },
    };
    const deep = buildQueue(capped, slice, 'deep');
    expect(deep.floors.waiting_for).toBe(true);
    expect(deep.perQueue.waiting_for).toBe(753);

    const quick = buildQueue(capped, slice, 'quick');
    expect(quick.floors.waiting_for).toBe(true);
    // Quick mode can't safely inflate an unfiltered total onto a sliced count —
    // it keeps the filtered row count (1, from the one candidate whose project
    // is in the due slice) but still flags the floor.
    expect(quick.perQueue.waiting_for).toBe(1);
  });

  it('waiting_for uncapped: no floor, row count unchanged', () => {
    const uncapped: PatternData = {
      ...patterns,
      waiting_for: {
        items: {
          screen: { candidates_total: 1, candidates_returned: 1, capped: false },
          candidates: patterns.waiting_for!.items!.candidates,
        },
      },
    };
    const q = buildQueue(uncapped, slice, 'deep');
    expect(q.floors.waiting_for).toBeUndefined();
    expect(q.perQueue.waiting_for).toBe(1);
  });

  it('dormant_projects: count > items.length flags the floor and uses count as the deep-mode total', () => {
    const capped: PatternData = {
      ...patterns,
      dormant_projects: { count: 42, items: patterns.dormant_projects!.items },
    };
    const q = buildQueue(capped, slice, 'deep');
    expect(q.floors.dormant_projects).toBe(true);
    expect(q.perQueue.dormant_projects).toBe(42);
  });

  it('dormant_projects: count === items.length is not a floor', () => {
    const uncapped: PatternData = {
      ...patterns,
      dormant_projects: { count: 1, items: patterns.dormant_projects!.items },
    };
    const q = buildQueue(uncapped, slice, 'deep');
    expect(q.floors.dormant_projects).toBeUndefined();
    expect(q.perQueue.dormant_projects).toBe(1);
  });
});

describe('buildInboxItem', () => {
  it('names the item with the count and writes a ≤10-line note ending with the start line', () => {
    const q = buildQueue(patterns, slice, 'quick');
    const item = buildInboxItem(q, 'quick', new Date('2026-09-01T07:00:00'));
    expect(item.name).toBe(`${ITEM_PREFIX}3 decisions waiting`);
    const lines = item.note.split('\n');
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(lines[0]).toBe('quick review — 2026-09-01');
    expect(lines).toContain('missing_next_actions: 1 · deadline_health: 1 · waiting_for: 1');
    expect(lines).toContain('- Wi-Fi migration — active, 0 available tasks, 4 tasks total');
    expect(lines.at(-1)).toBe('Start: ask Claude for a quick guided review');
  });

  it('uses the singular for one decision', () => {
    const q = buildQueue(
      { ...patterns, missing_next_actions: { items: [] }, waiting_for: { items: { candidates: [] } } },
      slice,
      'quick',
    );
    expect(buildInboxItem(q, 'quick', new Date('2026-09-01T07:00:00')).name).toBe(`${ITEM_PREFIX}1 decision waiting`);
  });

  it('prints a + after a floored count', () => {
    const capped: PatternData = {
      ...patterns,
      deadline_health: {
        items: { overdue_count: 9, overdue_samples: patterns.deadline_health!.items!.overdue_samples },
      },
    };
    const item = buildInboxItem(buildQueue(capped, slice, 'deep'), 'deep', new Date('2026-09-05T07:00:00'));
    expect(item.note.split('\n')[1]).toContain('deadline_health: 1+');
  });

  it('carries the floor into the headline count, not just the per-queue breakdown', () => {
    const capped: PatternData = {
      ...patterns,
      deadline_health: {
        items: { overdue_count: 9, overdue_samples: patterns.deadline_health!.items!.overdue_samples },
      },
    };
    const item = buildInboxItem(buildQueue(capped, slice, 'deep'), 'deep', new Date('2026-09-05T07:00:00'));
    // total = 5 from the existing "deep mode" fixture math, +1 floor marker.
    expect(item.name).toBe(`${ITEM_PREFIX}5+ decisions waiting`);
  });
});

describe('decideAction', () => {
  it('creates when no open review item exists', () => {
    expect(decideAction([], 3)).toEqual({ action: 'create' });
  });
  it('updates the existing open item instead of creating a second one', () => {
    expect(decideAction([{ id: 'x1', name: `${ITEM_PREFIX}5 decisions waiting` }], 3)).toEqual({
      action: 'update',
      id: 'x1',
    });
  });
  it('does nothing when there are zero decisions and no open item (silence is the signal)', () => {
    expect(decideAction([], 0)).toEqual({ action: 'none' });
  });
  it('still updates an existing item to 0 so a stale count never lingers', () => {
    expect(decideAction([{ id: 'x1', name: `${ITEM_PREFIX}5 decisions waiting` }], 0)).toEqual({
      action: 'update',
      id: 'x1',
    });
  });
  it('ignores inbox rows that merely contain the prefix mid-name', () => {
    expect(decideAction([{ id: 'x2', name: `Book: ${ITEM_PREFIX}notes` }], 2)).toEqual({ action: 'create' });
  });
  it('when more than one review item is open, updates only the first (findReviewItems surfaces the rest)', () => {
    const open = [
      { id: 'x1', name: `${ITEM_PREFIX}5 decisions waiting` },
      { id: 'x2', name: `${ITEM_PREFIX}2 decisions waiting` },
    ];
    expect(decideAction(open, 3)).toEqual({ action: 'update', id: 'x1' });
    expect(findReviewItems(open)).toEqual(open);
  });
});

describe('findReviewItems', () => {
  it('returns every open task whose name carries the review prefix, in order', () => {
    const open = [
      { id: 'a', name: `Book: ${ITEM_PREFIX}notes` },
      { id: 'b', name: `${ITEM_PREFIX}5 decisions waiting` },
      { id: 'c', name: 'Unrelated task' },
      { id: 'd', name: `${ITEM_PREFIX}2 decisions waiting` },
    ];
    expect(findReviewItems(open)).toEqual([
      { id: 'b', name: `${ITEM_PREFIX}5 decisions waiting` },
      { id: 'd', name: `${ITEM_PREFIX}2 decisions waiting` },
    ]);
  });
  it('returns an empty array when nothing matches', () => {
    expect(findReviewItems([{ id: 'a', name: 'Unrelated task' }])).toEqual([]);
  });
});

describe('parseArgs', () => {
  it('defaults to quick with a 180s timeout', () => {
    expect(parseArgs(['dist/index.js'])).toEqual({ server: 'dist/index.js', mode: 'quick', timeoutMs: 180_000 });
  });
  it('accepts --mode deep and --timeout', () => {
    expect(parseArgs(['dist/index.js', '--mode', 'deep', '--timeout', '5000'])).toEqual({
      server: 'dist/index.js',
      mode: 'deep',
      timeoutMs: 5000,
    });
  });
  it('rejects a missing server path and an unknown mode as usage errors', () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs(['dist/index.js', '--mode', 'standard'])).toThrow(/quick or deep/);
  });
});

describe('requireArray', () => {
  it('passes through an array, including an empty one', () => {
    expect(requireArray([], 'x')).toEqual([]);
    expect(requireArray([1, 2], 'x')).toEqual([1, 2]);
  });
  it('throws, naming the label, on undefined', () => {
    expect(() => requireArray(undefined, 'manage_reviews: data.projects')).toThrow(
      /manage_reviews: data\.projects.*undefined/,
    );
  });
  it('throws on a non-array value', () => {
    expect(() => requireArray({ not: 'an array' }, 'x')).toThrow(/x.*object/);
    expect(() => requireArray('nope', 'x')).toThrow(/x.*string/);
  });
});

describe('requireObject', () => {
  it('passes through a plain object', () => {
    expect(requireObject({ a: 1 }, 'x')).toEqual({ a: 1 });
  });
  it('throws, naming the label, on undefined', () => {
    expect(() => requireObject(undefined, 'pattern_analysis: data')).toThrow(/pattern_analysis: data.*undefined/);
  });
  it('throws on null and on an array', () => {
    expect(() => requireObject(null, 'x')).toThrow(/x/);
    expect(() => requireObject([1, 2], 'x')).toThrow(/x/);
  });
});

describe('OF_MCP_REVIEW_ITEM_PREFIX override', () => {
  it('is read at import time and flows through ITEM_PREFIX and buildInboxItem', async () => {
    vi.resetModules();
    vi.stubEnv('OF_MCP_REVIEW_ITEM_PREFIX', '__TEST__ Review: ');
    try {
      const mod = await import('../../../scripts/ops/guided-review-push.js');
      expect(mod.ITEM_PREFIX).toBe('__TEST__ Review: ');
      const q = mod.buildQueue({}, [], 'quick');
      const item = mod.buildInboxItem(q, 'quick', new Date('2026-09-01T07:00:00'));
      expect(item.name).toBe('__TEST__ Review: 0 decisions waiting');
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

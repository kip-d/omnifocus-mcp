import { describe, it, expect } from 'vitest';
import {
  buildQueue,
  buildInboxItem,
  decideAction,
  ITEM_PREFIX,
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
});

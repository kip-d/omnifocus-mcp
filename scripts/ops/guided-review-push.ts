#!/usr/bin/env node
/**
 * guided-review-push (OMN-314) — the push half of the guided-decision review
 * layer. Runs the existing detectors unprompted and puts "N decisions waiting"
 * where the user already looks: an OmniFocus INBOX item (decision D1).
 *
 * Deterministic — no model runs here. Counting is the server's job (scan);
 * judging is the user's, in the guided_review session the item points at.
 *
 * Idempotent: one open `Review: …` inbox item is UPDATED, never duplicated.
 * Silent on zero: no decisions → no item created (a daily "nothing to do"
 * entry trains the eye to skip the prefix). An existing item is updated to 0
 * so a stale count never lingers; completing it is the user's act.
 *
 * Usage (prod): npx tsx scripts/ops/guided-review-push.ts <path>/dist/index.js [--mode quick|deep]
 * Env: OF_MCP_REVIEW_ITEM_PREFIX overrides "Review: " (dev server needs "__TEST__ Review: ").
 */
export const ITEM_PREFIX = process.env.OF_MCP_REVIEW_ITEM_PREFIX ?? 'Review: ';
export const startLine = (mode: PushMode): string => `Start: ask Claude for a ${mode} guided review`;

export type PushMode = 'quick' | 'deep';

export interface ReviewProject {
  id: string;
  name: string;
  reviewStatus: string; // overdue | due_today | due_soon | scheduled | no_schedule
}

// Only the fields this script reads; every other detector field is ignored.
export interface PatternData {
  missing_next_actions?: { items?: Array<{ id: string; name: string; folder?: string; task_count?: number }> };
  deadline_health?: {
    items?: {
      overdue_count?: number;
      overdue_samples?: Array<{ id: string; name: string; project?: string; days_overdue: number }>;
    };
  };
  waiting_for?: {
    items?: {
      candidates?: Array<{
        id: string;
        name: string;
        project?: string;
        project_id?: string;
        screen_reasons?: string[];
        defer_date?: string | null;
      }>;
    };
  };
  dormant_projects?: { items?: Array<{ id: string; name: string; days_dormant: number }> };
}

export interface QueueItem {
  queue: string;
  id: string;
  name: string;
  reason: string;
  projectId?: string;
  projectName?: string;
}
export interface Queue {
  total: number;
  perQueue: Record<string, number>;
  /** queue → true when the detector capped its rows, so the count is a floor */
  floors: Record<string, boolean>;
  top: QueueItem[];
}

export const QUEUE_ORDER: Record<PushMode, string[]> = {
  quick: ['missing_next_actions', 'deadline_health', 'waiting_for'],
  deep: ['missing_next_actions', 'deadline_health', 'waiting_for', 'dormant_projects'],
};
const TOP_N = 3;

function extract(patterns: PatternData, queue: string): QueueItem[] {
  switch (queue) {
    case 'missing_next_actions':
      return (patterns.missing_next_actions?.items ?? []).map((p) => ({
        queue,
        id: p.id,
        name: p.name,
        projectId: p.id,
        projectName: p.name,
        reason: `active, 0 available tasks, ${p.task_count ?? 0} tasks total`,
      }));
    case 'deadline_health':
      return (patterns.deadline_health?.items?.overdue_samples ?? []).map((t) => ({
        queue,
        id: t.id,
        name: t.name,
        projectName: t.project,
        reason: `due ${t.days_overdue} day${t.days_overdue === 1 ? '' : 's'} ago`,
      }));
    case 'waiting_for':
      return (patterns.waiting_for?.items?.candidates ?? []).map((t) => ({
        queue,
        id: t.id,
        name: t.name,
        projectId: t.project_id,
        projectName: t.project,
        reason: `${(t.screen_reasons ?? []).join(', ') || 'screen'}${t.defer_date ? `; deferred ${t.defer_date}` : ''}`,
      }));
    case 'dormant_projects':
      return (patterns.dormant_projects?.items ?? []).map((p) => ({
        queue,
        id: p.id,
        name: p.name,
        projectId: p.id,
        projectName: p.name,
        reason: `no change in ${p.days_dormant} days`,
      }));
    default:
      return [];
  }
}

/** Quick mode = only items whose project is due for review today (overdue | due_today). Deep = everything. */
export function buildQueue(patterns: PatternData, slice: ReviewProject[], mode: PushMode): Queue {
  const due = slice.filter((p) => p.reviewStatus === 'overdue' || p.reviewStatus === 'due_today');
  const dueIds = new Set(due.map((p) => p.id));
  const dueNames = new Set(due.map((p) => p.name));
  const inSlice = (i: QueueItem): boolean =>
    mode === 'deep' || (i.projectId ? dueIds.has(i.projectId) : i.projectName ? dueNames.has(i.projectName) : false);

  const perQueue: Record<string, number> = {};
  const floors: Record<string, boolean> = {};
  const all: QueueItem[] = [];
  for (const q of QUEUE_ORDER[mode]) {
    const items = extract(patterns, q).filter(inSlice);
    perQueue[q] = items.length;
    all.push(...items);
  }
  // deadline_health returns at most 5 samples; if the detector saw more, the count above is a floor.
  const dh = patterns.deadline_health?.items;
  if (dh && (dh.overdue_count ?? 0) > (dh.overdue_samples?.length ?? 0)) floors.deadline_health = true;

  return { total: all.length, perQueue, floors, top: all.slice(0, TOP_N) };
}

export function buildInboxItem(queue: Queue, mode: PushMode, now: Date): { name: string; note: string } {
  const n = queue.total;
  const name = `${ITEM_PREFIX}${n} decision${n === 1 ? '' : 's'} waiting`;
  const date = now.toISOString().slice(0, 10);
  const counts = Object.entries(queue.perQueue)
    .map(([q, c]) => `${q}: ${c}${queue.floors[q] ? '+' : ''}`)
    .join(' · ');
  const lines = [
    `${mode} review — ${date}`,
    counts,
    ...queue.top.map((t) => `- ${t.name} — ${t.reason}`),
    startLine(mode),
  ];
  return { name, note: lines.slice(0, 10).join('\n') };
}

export function decideAction(
  openInboxTasks: Array<{ id: string; name: string }>,
  total: number,
): { action: 'create' } | { action: 'update'; id: string } | { action: 'none' } {
  const existing = openInboxTasks.find((t) => t.name.startsWith(ITEM_PREFIX));
  if (existing) return { action: 'update', id: existing.id };
  return total > 0 ? { action: 'create' } : { action: 'none' };
}

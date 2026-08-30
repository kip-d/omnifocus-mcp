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
import { StringDecoder } from 'node:string_decoder';
import { StdioJsonRpcTransport } from '../../tests/integration/helpers/stdio-jsonrpc-transport.js';
import { isRunDirectly } from '../lib/run-directly.js';
// verify-deploy.ts guards main() with isRunDirectly, so importing this is side-effect-free.
import { INIT_TIMEOUT_MS } from '../verify-deploy.js';

const STDERR_TAIL_LIMIT = 64 * 1024;

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
      // analyzeWaitingFor caps candidates LOUDLY (screen.capped) — see
      // OmniFocusAnalyzeTool.ts. candidates_total is the true count seen before
      // capping; candidates_returned/candidates.length is what actually shipped.
      screen?: { candidates_total?: number; candidates_returned?: number; capped?: boolean };
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
  // detectDormantProjects ships `count` (the true total) alongside `items`
  // sliced to 10 — see OmniFocusAnalyzeTool.ts.
  dormant_projects?: { count?: number; items?: Array<{ id: string; name: string; days_dormant: number }> };
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
      return (patterns.waiting_for?.items?.candidates ?? []).map((t) => {
        const screenReason = (t.screen_reasons ?? []).join(', ') || 'screen';
        const deferSuffix = t.defer_date ? `; deferred ${t.defer_date}` : '';
        return {
          queue,
          id: t.id,
          name: t.name,
          projectId: t.project_id,
          projectName: t.project,
          reason: `${screenReason}${deferSuffix}`,
        };
      });
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
  const isDue = (i: QueueItem): boolean => {
    if (i.projectId) return dueIds.has(i.projectId);
    if (i.projectName) return dueNames.has(i.projectName);
    return false;
  };
  const inSlice = (i: QueueItem): boolean => mode === 'deep' || isDue(i);

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

  // waiting_for is capped LOUDLY by the detector (screen.capped) — see
  // analyzeWaitingFor in OmniFocusAnalyzeTool.ts. In deep mode there is no
  // slice filter, so the true total (candidates_total) is a safe stand-in for
  // the returned-row count and replaces it — the honest number ships instead
  // of just what fit in the capped response. In quick mode we can't safely
  // inflate: the un-returned candidates were never checked against the
  // review slice, so their count is kept as the filtered row count, but the
  // floor is still flagged — that number is a known undercount either way.
  const wf = patterns.waiting_for?.items;
  if (wf?.screen) {
    const total = wf.screen.candidates_total ?? 0;
    const returned = wf.screen.candidates_returned ?? (wf.candidates ?? []).length;
    if (wf.screen.capped === true || total > returned) {
      floors.waiting_for = true;
      if (mode === 'deep') perQueue.waiting_for = total;
    }
  }

  // dormant_projects ships `count` (the true total) alongside `items` sliced
  // to 10. It only ever appears in deep mode (see QUEUE_ORDER) — gate on that
  // explicitly rather than relying on the caller to omit the field in quick
  // mode, since a passed-in PatternData can legally carry it either way.
  const dp = patterns.dormant_projects;
  if (mode === 'deep' && dp && typeof dp.count === 'number' && dp.count > (dp.items ?? []).length) {
    floors.dormant_projects = true;
    perQueue.dormant_projects = dp.count;
  }

  // missing_next_actions is NOT capped — detectMissingNextActions in
  // OmniFocusAnalyzeTool.ts returns every stalled active project, unsliced.
  // No floor logic needed for that queue.

  const total = Object.values(perQueue).reduce((sum, n) => sum + n, 0);

  return { total, perQueue, floors, top: all.slice(0, TOP_N) };
}

export function buildInboxItem(queue: Queue, mode: PushMode, now: Date): { name: string; note: string } {
  const n = queue.total;
  // If ANY queue is floored, the total itself is an undercount — carry that
  // into the headline number, not just the per-queue breakdown in the note.
  const anyFloor = Object.values(queue.floors).some(Boolean);
  const isSingular = n === 1 && !anyFloor;
  const name = `${ITEM_PREFIX}${n}${anyFloor ? '+' : ''} decision${isSingular ? '' : 's'} waiting`;
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

/** Every open inbox task whose name carries the review prefix, in list order. */
export function findReviewItems(
  openInboxTasks: Array<{ id: string; name: string }>,
): Array<{ id: string; name: string }> {
  return openInboxTasks.filter((t) => t.name.startsWith(ITEM_PREFIX));
}

export function decideAction(
  openInboxTasks: Array<{ id: string; name: string }>,
  total: number,
): { action: 'create' } | { action: 'update'; id: string } | { action: 'none' } {
  const [existing] = findReviewItems(openInboxTasks);
  if (existing) return { action: 'update', id: existing.id };
  return total > 0 ? { action: 'create' } : { action: 'none' };
}

// ─── driver ─────────────────────────────────────────────────────────────────

export interface PushArgs {
  server: string;
  mode: PushMode;
  timeoutMs: number;
}
export class UsageError extends Error {}

// A missing/malformed field from the MCP response must never silently become
// "0 decisions" — that reads as "nothing waiting" when the truth is "the
// response shape changed and this script can no longer see the data". Throw
// loudly instead, naming the call and the field, so the wrapper logs FAILED
// rather than a confident, wrong zero.
export function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label}: expected an array, got ${value === undefined ? 'undefined' : typeof value}`);
  }
  return value;
}

export function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label}: expected an object, got ${value === undefined ? 'undefined' : typeof value}`);
  }
  return value as Record<string, unknown>;
}

// createTaskResponseV2 (src/utils/response-format.ts) keys the same three
// fields: metadata.truncated is set to `true` (never `false`) when
// applyCountHonesty finds offset+returned < population, and total_count/
// returned_count always accompany it (response-format.ts:130-136,741-746;
// wired for `mode: 'inbox'` task queries at
// src/tools/unified/OmniFocusReadTool.ts:636). Absence of `truncated` is
// therefore unambiguous — it's never explicitly cleared, so a missing field
// means "not truncated", not "unknown". total_count > returned_count is kept
// as a second, independent check in case a future response shape carries the
// counts without the boolean.
export function assertNotTruncated(metadata: unknown, label: string): void {
  if (typeof metadata !== 'object' || metadata === null) return;
  const m = metadata as { truncated?: unknown; total_count?: unknown; returned_count?: unknown };
  const total = typeof m.total_count === 'number' ? m.total_count : undefined;
  const returned = typeof m.returned_count === 'number' ? m.returned_count : undefined;
  const flagged = m.truncated === true;
  const overCount = total !== undefined && returned !== undefined && total > returned;
  if (flagged || overCount) {
    throw new Error(
      `${label}: response was truncated (total_count=${total ?? '?'}, returned_count=${returned ?? '?'}) — ` +
        'narrow the inbox filter (or raise the limit) so the existing Review: item is never missed',
    );
  }
}

export function parseArgs(argv: string[]): PushArgs {
  const [server, ...rest] = argv;
  if (!server) {
    throw new UsageError('usage: guided-review-push.ts <path-to-dist/index.js> [--mode quick|deep] [--timeout <ms>]');
  }
  let mode: PushMode = 'quick';
  let timeoutMs = 180_000;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--mode') {
      const m = rest[++i];
      if (m !== 'quick' && m !== 'deep')
        throw new UsageError(`--mode must be quick or deep (got ${JSON.stringify(m)})`);
      mode = m;
    } else if (rest[i] === '--timeout') {
      timeoutMs = Number(rest[++i]);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        throw new UsageError('--timeout needs a positive number of ms');
    } else {
      throw new UsageError(`unknown argument ${rest[i]}`);
    }
  }
  return { server, mode, timeoutMs };
}

// JSON-RPC payloads are untyped by design here (same as scripts/verify-deploy.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */
async function main(): Promise<void> {
  const { server, mode, timeoutMs } = parseArgs(process.argv.slice(2));
  const transport = new StdioJsonRpcTransport({ serverPath: server });
  transport.start();
  transport.child.once('exit', (code, signal) => {
    transport.rejectAllPending(new Error(`server exited unexpectedly (code ${code}, signal ${signal})`));
  });

  // Failure-only stderr replay, mirroring verify-deploy.ts: keep a bounded
  // tail so a crash surfaces the server's own diagnostics without polluting
  // success output. StringDecoder carries multi-byte UTF-8 sequences split
  // across chunk boundaries.
  let stderrTail = '';
  const stderrDecoder = new StringDecoder('utf8');
  transport.child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + stderrDecoder.write(chunk)).slice(-STDERR_TAIL_LIMIT);
  });
  transport.child.on('error', (e) => {
    transport.rejectAllPending(new Error(`could not spawn server: ${e.message}`));
  });

  const rpc = (method: string, params: unknown, rpcTimeoutMs: number = timeoutMs): Promise<any> =>
    transport.sendRequest({ jsonrpc: '2.0', id: transport.nextId(), method, params }, rpcTimeoutMs);
  const call = async (name: string, args: unknown): Promise<any> => {
    const res = await rpc('tools/call', { name, arguments: args });
    if (res.error) throw new Error(`${name}: JSON-RPC error ${JSON.stringify(res.error)}`);
    const parsed = JSON.parse(res.result.content[0].text);
    if (parsed.success === false) throw new Error(`${name}: ${JSON.stringify(parsed.error ?? parsed)}`);
    return parsed;
  };

  let rpcFailed = false;
  try {
    const init = await rpc(
      'initialize',
      {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'guided-review-push', version: '1.0.0' },
      },
      Math.min(timeoutMs, INIT_TIMEOUT_MS),
    );
    if (init.error) throw new Error(`initialize: ${JSON.stringify(init.error)}`);
    transport.sendNotification('notifications/initialized', {});

    // Refuse a stale build: the same probe verify-deploy uses (buildId + stale flag).
    const version = await call('system', { operation: 'version' });
    const vd = version.data ?? version;
    if (vd.stale === true) {
      throw new Error(`server build is stale (buildId ${vd.buildId}); rebuild before running the push`);
    }

    const reviews = await call('omnifocus_analyze', {
      analysis: { type: 'manage_reviews', params: { operation: 'list_for_review' } },
    });
    const projects = requireArray(reviews.data?.projects, 'manage_reviews list_for_review: data.projects');
    const slice: ReviewProject[] = projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      reviewStatus: p.reviewStatus,
    }));

    const patterns = await call('omnifocus_analyze', {
      analysis: { type: 'pattern_analysis', params: { insights: QUEUE_ORDER[mode] } },
    });
    const patternsData = requireObject(patterns.data, 'pattern_analysis: data');
    const queue = buildQueue(patternsData as PatternData, slice, mode);

    const inbox = await call('omnifocus_read', {
      query: {
        type: 'tasks',
        mode: 'inbox',
        filters: { name: { contains: ITEM_PREFIX.trim() } },
        fields: ['id', 'name'],
        limit: 100,
      },
    });
    // A truncated response could hide the existing Review: item, causing a
    // duplicate to be created — see assertNotTruncated.
    assertNotTruncated(inbox.metadata, 'inbox review-item lookup');
    const open: Array<{ id: string; name: string }> = (inbox.data?.tasks ?? inbox.data?.items ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
    }));

    const decision = decideAction(open, queue.total);
    const item = buildInboxItem(queue, mode, new Date());

    // decideAction updates only the FIRST match — silently, if there happen to
    // be more than one. That's a state the job should never create on its own
    // (idempotent update, not create), but a human deleting/duplicating by
    // hand can produce it, and the wrapper's log is the only place anyone
    // would see it. Warn loudly rather than quietly picking a winner forever.
    const reviewItems = findReviewItems(open);
    if (reviewItems.length > 1) {
      const [kept, ...stale] = reviewItems;
      console.error(
        `guided-review-push: WARNING — ${reviewItems.length} open review items found; ` +
          `updating ${kept.id}, leaving ${stale.map((t) => t.id).join(', ')} stale — delete the extras by hand`,
      );
    }

    if (decision.action === 'none') {
      console.error('guided-review-push: 0 decisions, no open item — nothing to do');
    } else if (decision.action === 'create') {
      const r = await call('omnifocus_write', {
        mutation: { operation: 'create', target: 'task', data: { name: item.name, note: item.note } },
      });
      console.error(`guided-review-push: CREATED ${item.name} (${r.data?.task?.taskId ?? '?'})`);
    } else {
      await call('omnifocus_write', {
        mutation: {
          operation: 'update',
          target: 'task',
          id: decision.id,
          changes: { name: item.name, note: item.note },
        },
      });
      console.error(`guided-review-push: UPDATED ${decision.id} → ${item.name}`);
    }
    console.error(`guided-review-push: ${JSON.stringify(queue.perQueue)}`);
  } catch (e) {
    rpcFailed = true;
    const tail = stderrTail.trim();
    const suffix = tail ? `\n--- server stderr (tail) ---\n${tail}` : '';
    throw new Error(`${(e as Error).message}${suffix}`);
  } finally {
    // On the failure path the caller has already given up waiting (an RPC
    // timed out, errored, or the server died) — kill immediately rather than
    // letting graceful close add its wait on top. Mirrors verify-deploy.ts.
    await transport.close({ graceful: !rpcFailed });
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

if (isRunDirectly(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof UsageError ? e.message : `guided-review-push FAILED: ${(e as Error).message}`);
    process.exit(e instanceof UsageError ? 2 : 1);
  });
}

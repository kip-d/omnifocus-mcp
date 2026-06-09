// src/contracts/ast/mutation/repetition.ts
// Build-time lowering of RepetitionRule → the constructor args for OmniJS
// `new Task.RepetitionRule(rrule, null, scheduleType, anchorDateKey, catchUp)`.
// Replaces the legacy runtime repetition island (mutation-script-builder.ts) — same
// mapping rules, but computed in TS where they are typed and unit-testable, and
// invalid input fails loudly at build time instead of inside evaluateJavascript.
import type { RepetitionRule } from '../../mutations.js';

export interface LoweredRepetitionRule {
  rrule: string;
  scheduleTypePath: string; // OmniJS enum path, emitted via enumRef
  anchorPath: string; // OmniJS enum path, emitted via enumRef
  catchUp: boolean;
}

// Total Records over the contract unions: adding a union member without a map
// entry is a COMPILE error, so the maps can never silently lag the contract.
const FREQ_MAP: Record<RepetitionRule['frequency'], string> = {
  minutely: 'MINUTELY',
  hourly: 'HOURLY',
  daily: 'DAILY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
};

const SCHEDULE_MAP: Record<NonNullable<RepetitionRule['scheduleType']>, string> = {
  regularly: 'Task.RepetitionScheduleType.Regularly',
  'from-completion': 'Task.RepetitionScheduleType.FromCompletion',
  none: 'Task.RepetitionScheduleType.None',
};

const ANCHOR_MAP: Record<NonNullable<RepetitionRule['anchorDateKey']>, string> = {
  'due-date': 'Task.AnchorDateKey.DueDate',
  'defer-date': 'Task.AnchorDateKey.DeferDate',
  'planned-date': 'Task.AnchorDateKey.PlannedDate',
};

export function lowerRepetitionRule(rule: RepetitionRule): LoweredRepetitionRule {
  const freq = FREQ_MAP[rule.frequency];
  // Runtime check kept DESPITE the total Record: input can arrive as never-cast
  // garbage from JS callers (the MCP boundary is untyped) — fail loud at build
  // time, not as `FREQ=undefined` inside evaluateJavascript.
  if (!freq) throw new Error(`Invalid repetition frequency: ${String(rule.frequency)}`);

  // Build ICS RRULE string — order matches legacy: FREQ, INTERVAL, BYDAY, BYMONTHDAY,
  // COUNT, UNTIL, WKST, BYSETPOS
  let rrule = `FREQ=${freq}`;
  if (rule.interval && rule.interval > 1) rrule += `;INTERVAL=${rule.interval}`;
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const byDay = rule.daysOfWeek.map((d) => (d.position ? `${d.position}${d.day}` : d.day)).join(',');
    rrule += `;BYDAY=${byDay}`;
  }
  if (rule.daysOfMonth && rule.daysOfMonth.length > 0) rrule += `;BYMONTHDAY=${rule.daysOfMonth.join(',')}`;
  if (rule.count && rule.count > 0) rrule += `;COUNT=${rule.count}`;
  if (rule.endDate) rrule += `;UNTIL=${rule.endDate.replace(/-/g, '')}`;
  if (rule.weekStart) rrule += `;WKST=${rule.weekStart}`;
  if (rule.setPositions && rule.setPositions.length > 0) rrule += `;BYSETPOS=${rule.setPositions.join(',')}`;

  // scheduleType: explicit field wins; fall back to deriving from deprecated method.
  // method='fixed' (or absent, or 'none') → Regularly
  // method='due-after-completion' | 'defer-after-completion' → FromCompletion
  let scheduleTypePath: string;
  if (rule.scheduleType) {
    // Total Record over the union — the lookup cannot miss, no fallback needed.
    scheduleTypePath = SCHEDULE_MAP[rule.scheduleType];
  } else if (rule.method === 'due-after-completion' || rule.method === 'defer-after-completion') {
    scheduleTypePath = 'Task.RepetitionScheduleType.FromCompletion';
  } else {
    scheduleTypePath = 'Task.RepetitionScheduleType.Regularly';
  }

  // anchorDateKey: explicit field wins; 'defer-after-completion' implies DeferDate anchor.
  let anchorPath: string;
  if (rule.anchorDateKey) {
    // Total Record over the union — the lookup cannot miss, no fallback needed.
    anchorPath = ANCHOR_MAP[rule.anchorDateKey];
  } else if (rule.method === 'defer-after-completion') {
    anchorPath = 'Task.AnchorDateKey.DeferDate';
  } else {
    anchorPath = 'Task.AnchorDateKey.DueDate';
  }

  // catchUpAutomatically defaults to true (legacy: `rule.catchUpAutomatically !== false`)
  return { rrule, scheduleTypePath, anchorPath, catchUp: rule.catchUpAutomatically !== false };
}

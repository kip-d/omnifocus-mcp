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

const FREQ_MAP: Record<string, string> = {
  minutely: 'MINUTELY',
  hourly: 'HOURLY',
  daily: 'DAILY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
};

const SCHEDULE_MAP: Record<string, string> = {
  regularly: 'Task.RepetitionScheduleType.Regularly',
  'from-completion': 'Task.RepetitionScheduleType.FromCompletion',
  none: 'Task.RepetitionScheduleType.None',
};

const ANCHOR_MAP: Record<string, string> = {
  'due-date': 'Task.AnchorDateKey.DueDate',
  'defer-date': 'Task.AnchorDateKey.DeferDate',
  'planned-date': 'Task.AnchorDateKey.PlannedDate',
};

export function lowerRepetitionRule(rule: RepetitionRule): LoweredRepetitionRule {
  const freq = FREQ_MAP[rule.frequency];
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
    scheduleTypePath = SCHEDULE_MAP[rule.scheduleType] ?? 'Task.RepetitionScheduleType.Regularly';
  } else if (rule.method === 'due-after-completion' || rule.method === 'defer-after-completion') {
    scheduleTypePath = 'Task.RepetitionScheduleType.FromCompletion';
  } else {
    scheduleTypePath = 'Task.RepetitionScheduleType.Regularly';
  }

  // anchorDateKey: explicit field wins; 'defer-after-completion' implies DeferDate anchor.
  let anchorPath: string;
  if (rule.anchorDateKey) {
    anchorPath = ANCHOR_MAP[rule.anchorDateKey] ?? 'Task.AnchorDateKey.DueDate';
  } else if (rule.method === 'defer-after-completion') {
    anchorPath = 'Task.AnchorDateKey.DeferDate';
  } else {
    anchorPath = 'Task.AnchorDateKey.DueDate';
  }

  // catchUpAutomatically defaults to true (legacy: `rule.catchUpAutomatically !== false`)
  return { rrule, scheduleTypePath, anchorPath, catchUp: rule.catchUpAutomatically !== false };
}

/**
 * Natural language date parsing and date formatting for OmniFocus CLI.
 *
 * NEVER returns ISO-8601 with Z suffix or T separator.
 * Output format: YYYY-MM-DD or YYYY-MM-DD HH:mm
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DD */
function formatYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Map of day names to JS day indices (0 = Sunday) */
const DAY_NAMES: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// ---------------------------------------------------------------------------
// parseDate
// ---------------------------------------------------------------------------

/**
 * Parse natural language date input into YYYY-MM-DD format.
 *
 * Supported inputs:
 * - YYYY-MM-DD (passthrough)
 * - YYYY-MM-DD HH:mm (passthrough)
 * - today, tomorrow, yesterday
 * - next monday, next tuesday, ... next sunday
 * - in N days
 * - eom / end of month
 * - eow / end of week (next Sunday)
 *
 * @returns YYYY-MM-DD string or null if unparseable
 */
export function parseDate(input: string): string | null {
  const trimmed = input.trim();

  // Passthrough: YYYY-MM-DD HH:mm
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Passthrough: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  const now = new Date();

  // today
  if (lower === 'today') {
    return formatYMD(now);
  }

  // tomorrow
  if (lower === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return formatYMD(d);
  }

  // yesterday
  if (lower === 'yesterday') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return formatYMD(d);
  }

  // next <dayname>
  const nextDayMatch = lower.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (nextDayMatch) {
    const targetDay = DAY_NAMES[nextDayMatch[1]];
    const currentDay = now.getDay();
    let daysAhead = targetDay - currentDay;
    if (daysAhead <= 0) {
      daysAhead += 7;
    }
    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    return formatYMD(d);
  }

  // in N days
  const inDaysMatch = lower.match(/^in\s+(\d+)\s+days?$/);
  if (inDaysMatch) {
    const n = parseInt(inDaysMatch[1], 10);
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return formatYMD(d);
  }

  // end of month / eom
  if (lower === 'eom' || lower === 'end of month') {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return formatYMD(d);
  }

  // end of week / eow (next Sunday)
  if (lower === 'eow' || lower === 'end of week') {
    const currentDay = now.getDay();
    const daysToSunday = currentDay === 0 ? 7 : 7 - currentDay;
    const d = new Date(now);
    d.setDate(d.getDate() + daysToSunday);
    return formatYMD(d);
  }

  return null;
}

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

/** Default times by date type */
const DEFAULT_TIMES: Record<string, string> = {
  due: '17:00',
  defer: '08:00',
  planned: '08:00',
  completion: '12:00',
};

/**
 * Add default time to a date-only string based on date type.
 *
 * - If the input already contains a time (YYYY-MM-DD HH:mm), it is returned unchanged.
 * - If the input is date-only (YYYY-MM-DD), the appropriate default time is appended.
 *
 * @param date - Date string in YYYY-MM-DD or YYYY-MM-DD HH:mm format
 * @param type - The date type: due, defer, planned, or completion
 * @returns Date string with time: YYYY-MM-DD HH:mm
 */
export function formatDate(date: string, type: 'due' | 'defer' | 'planned' | 'completion'): string {
  const trimmed = date.trim();

  // Already has time component
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Date only -- append default time
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed} ${DEFAULT_TIMES[type]}`;
  }

  // Unrecognized format -- return as-is
  return trimmed;
}

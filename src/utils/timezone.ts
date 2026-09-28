/**
 * Timezone utilities for handling user's local time to UTC conversions
 * OmniFocus stores all dates in UTC, but users input dates in their local timezone
 */

import { execSync } from 'child_process';

/**
 * Get the system's current timezone
 * @returns Timezone string (e.g., "America/New_York", "Europe/London")
 */
export function getSystemTimezone(): string {
  try {
    // Method 1: Try macOS systemsetup command
    if (process.platform === 'darwin') {
      try {
        const tz = execSync('systemsetup -gettimezone', { encoding: 'utf8', timeout: 2000 })
          .trim()
          .replace('Time Zone: ', '');
        if (tz && tz !== 'You need administrator access to run this tool... exiting!') {
          return tz;
        }
      } catch {
        // Fall through to other methods
      }
    }

    // Method 2: Use JavaScript's Intl API (more reliable)
    try {
      const resolvedOptions = Intl.DateTimeFormat().resolvedOptions();
      if (resolvedOptions.timeZone) {
        return resolvedOptions.timeZone;
      }
    } catch {
      // Fall through to other methods
    }

    // Method 3: Environment variable
    if (process.env.TZ) {
      return process.env.TZ;
    }

    // Method 4: Read from /etc/localtime symlink (Linux/Unix)
    try {
      const tzPath = execSync('readlink /etc/localtime', { encoding: 'utf8', timeout: 1000 }).trim();
      const match = /zoneinfo\/(.+)$/.exec(tzPath);
      if (match) {
        return match[1];
      }
    } catch {
      // Ignore if readlink fails
    }

    // Method 5: Try Windows timezone (if on Windows)
    if (process.platform === 'win32') {
      try {
        const winTz = execSync('tzutil /g', { encoding: 'utf8', timeout: 1000 }).trim();
        if (winTz) {
          // Note: Windows timezone names need mapping to IANA names, but this is a start
          return winTz;
        }
      } catch {
        // Fall through
      }
    }

    // Final fallback - use UTC offset to guess
    const offset = new Date().getTimezoneOffset();
    console.warn(
      `Could not detect system timezone name. Using UTC offset ${-offset / 60} hours. This may cause date interpretation issues.`,
    );
    return 'UTC';
  } catch (error) {
    console.error('Error detecting timezone:', error);
    return 'UTC';
  }
}

/**
 * Get the current UTC offset for the system timezone
 * @returns Offset in minutes (e.g., -300 for EST, -240 for EDT)
 */
export function getCurrentTimezoneOffset(): number {
  return new Date().getTimezoneOffset();
}

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/;

/**
 * Parse "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" into local-time components, or
 * undefined when the string isn't in that form or names an impossible date/time
 * (2026-02-30, 24:00). Built with the local-time Date constructor, never by parsing
 * the string, so the result is local by definition.
 */
function parseLocalDate(s: string): { date: Date; hasTime: boolean } | undefined {
  const m = LOCAL_DATE_RE.exec(s);
  if (!m) return undefined;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0'].map(Number);
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  const roundTrips =
    date.getFullYear() === y &&
    date.getMonth() === mo - 1 &&
    date.getDate() === d &&
    date.getHours() === h &&
    date.getMinutes() === mi;
  return roundTrips ? { date, hasTime: s.length > 10 } : undefined;
}

/**
 * True for "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" naming a real local date/time — the
 * read-side date filter formats (OMN-332). Stricter than localToUTC, which also
 * tolerates a "T" separator on writes; read filters accept only the two documented
 * forms.
 */
export function isLocalDateString(s: string): boolean {
  return parseLocalDate(s) !== undefined;
}

/**
 * Convert a read-side date filter bound to a UTC ISO instant (OMN-332).
 *
 * Date-only bounds are whole LOCAL days, inclusive: 'start' is 00:00:00.000 local,
 * 'end' is 23:59:59.999 local. A "YYYY-MM-DD HH:mm" bound is that exact local
 * instant for either edge. Throws on anything else — the read schema rejects those
 * first, so a throw here means a caller bypassed validation.
 */
export function localDateBoundToUTC(s: string, edge: 'start' | 'end'): string {
  const parsed = parseLocalDate(s);
  if (!parsed) {
    throw new Error(`Invalid date filter value ${JSON.stringify(s)}: expected "YYYY-MM-DD" or "YYYY-MM-DD HH:mm"`);
  }
  if (!parsed.hasTime && edge === 'end') parsed.date.setHours(23, 59, 59, 999);
  return parsed.date.toISOString();
}

/**
 * Render a date-filter bound for humans (filter_description) as LOCAL
 * "YYYY-MM-DD HH:mm" (OMN-332). Bounds are stored as UTC ISO instants, and printing
 * those raw showed a day-end bound as the next calendar date. A value already in local
 * "YYYY-MM-DD[ HH:mm]" form passes through unchanged (Date(string) would misread a
 * bare date as UTC midnight), as does anything that isn't a parseable date.
 */
export function formatBoundForDisplay(value: string): string {
  if (isLocalDateString(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert a local date/time string to UTC ISO string
 * Handles the user's system timezone automatically
 *
 * @param localDateStr Date string in format "YYYY-MM-DD" or "YYYY-MM-DD HH:mm"
 * @param timezone Optional timezone override (defaults to system timezone)
 * @returns UTC ISO string for use with OmniFocus API
 */
export function localToUTC(
  localDateStr: string,
  context: 'due' | 'defer' | 'planned' | 'completion' | 'generic' = 'generic',
  _timezone?: string,
): string {
  // Parse the input to determine format
  const hasTime = localDateStr.includes(' ') || localDateStr.includes('T');

  let dateStr: string;

  if (!hasTime) {
    // Date only - use context-appropriate default time
    const dueOrDefault = context === 'due' ? '17:00:00' : '12:00:00';
    const defaultTime = context === 'defer' ? '08:00:00' : dueOrDefault;
    dateStr = `${localDateStr}T${defaultTime}`;
  } else {
    // Has time - ensure proper format
    dateStr = localDateStr.replace(' ', 'T');
    if (!dateStr.includes(':00', dateStr.lastIndexOf(':'))) {
      dateStr += ':00'; // Add seconds if missing
    }
  }

  // Create date in local timezone
  const localDate = new Date(dateStr);

  // Check if date is valid
  if (isNaN(localDate.getTime())) {
    const tzInfo = getTimezoneInfo();
    throw new Error(
      `Invalid date format: "${localDateStr}". Expected formats: "YYYY-MM-DD" or "YYYY-MM-DD HH:mm". Current timezone: ${tzInfo.timezone} (${tzInfo.offsetString}). Examples: "2024-01-15" (becomes midnight in ${tzInfo.timezone}) or "2024-01-15 14:30" (becomes 2:30 PM in ${tzInfo.timezone}).`,
    );
  }

  // Convert to UTC
  return localDate.toISOString();
}

/**
 * Get timezone information for display/debugging
 */
export function getTimezoneInfo(): {
  timezone: string;
  offset: number;
  offsetHours: number;
  offsetString: string;
} {
  const timezone = getSystemTimezone();
  const offset = getCurrentTimezoneOffset();
  const offsetHours = -offset / 60; // Negative because getTimezoneOffset returns opposite sign
  const offsetString = `UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}`;

  return {
    timezone,
    offset,
    offsetHours,
    offsetString,
  };
}

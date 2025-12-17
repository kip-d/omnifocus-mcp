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
      const match = tzPath.match(/zoneinfo\/(.+)$/);
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
    const defaultTime = context === 'defer' ? '08:00:00' : context === 'due' ? '17:00:00' : '12:00:00';
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

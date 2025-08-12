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
    console.warn(`Could not detect system timezone name. Using UTC offset ${-offset / 60} hours. This may cause date interpretation issues.`);
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
export function localToUTC(localDateStr: string, _timezone?: string): string {
  // Parse the input to determine format
  const hasTime = localDateStr.includes(' ') || localDateStr.includes('T');

  let dateStr: string;

  if (!hasTime) {
    // Date only - assume start of day in local time
    dateStr = `${localDateStr}T00:00:00`;
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
    throw new Error(`Invalid date format: "${localDateStr}". Expected formats: "YYYY-MM-DD" or "YYYY-MM-DD HH:mm". Current timezone: ${tzInfo.timezone} (${tzInfo.offsetString}). Examples: "2024-01-15" (becomes midnight in ${tzInfo.timezone}) or "2024-01-15 14:30" (becomes 2:30 PM in ${tzInfo.timezone}).`);
  }

  // Convert to UTC
  return localDate.toISOString();
}

/**
 * Convert UTC ISO string to local time display string
 *
 * @param utcStr UTC ISO string from OmniFocus
 * @param format Optional format: 'date', 'datetime', or 'time'
 * @returns Formatted string in user's local time
 */
export function utcToLocal(utcStr: string, format: 'date' | 'datetime' | 'time' = 'datetime'): string {
  const date = new Date(utcStr);

  if (isNaN(date.getTime())) {
    const tzInfo = getTimezoneInfo();
    throw new Error(`Invalid UTC date: "${utcStr}". Expected ISO 8601 format like "2024-01-15T14:30:00.000Z". Current timezone: ${tzInfo.timezone} (${tzInfo.offsetString}) for local conversion.`);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  switch (format) {
    case 'date':
      return `${year}-${month}-${day}`;
    case 'time':
      return `${hour}:${minute}`;
    case 'datetime':
    default:
      return `${year}-${month}-${day} ${hour}:${minute}`;
  }
}

/**
 * Parse a date string that might be in various formats
 * Supports:
 * - ISO format: 2024-01-15T10:30:00Z
 * - Local format: 2024-01-15 10:30
 * - Date only: 2024-01-15
 * - Relative: "tomorrow", "next week" (requires additional parsing)
 *
 * @param dateStr Input date string
 * @returns UTC ISO string or null if invalid
 */
export function parseFlexibleDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  // Check if already in ISO format with timezone
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/)) {
    try {
      return new Date(dateStr).toISOString();
    } catch {
      return null;
    }
  }

  // Try relative date parsing first
  const relativeDateResult = parseRelativeDate(dateStr);
  if (relativeDateResult) {
    return relativeDateResult;
  }

  // Try to parse as local time
  try {
    return localToUTC(dateStr);
  } catch (error) {
    // Enhanced error logging for debugging
    const tzInfo = getTimezoneInfo();
    console.warn(`Failed to parse date "${dateStr}" in timezone ${tzInfo.timezone}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

    return null;
  }
}

/**
 * Parse relative date strings like "tomorrow", "next Monday", etc.
 *
 * @param dateStr Relative date string
 * @returns UTC ISO string or null if not a recognized relative date
 */
export function parseRelativeDate(dateStr: string): string | null {
  const lowerStr = dateStr.toLowerCase().trim();
  const now = new Date();

  // Reset to start of day in LOCAL timezone, then convert to UTC
  // This ensures relative dates respect the user's timezone
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (lowerStr) {
    case 'today':
      return today.toISOString();

    case 'tomorrow': {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString();
    }

    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString();
    }
  }

  // Handle "next [day of week]"
  const nextDayMatch = lowerStr.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (nextDayMatch) {
    const targetDay = nextDayMatch[1];
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDayIndex = dayNames.indexOf(targetDay);

    if (targetDayIndex !== -1) {
      const daysUntilTarget = (targetDayIndex - today.getDay() + 7) % 7;
      const nextDay = new Date(today);
      nextDay.setDate(today.getDate() + (daysUntilTarget || 7)); // If today is the target day, go to next week
      return nextDay.toISOString();
    }
  }

  // Handle "in X days"
  const inDaysMatch = lowerStr.match(/^in\s+(\d+)\s+days?$/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    if (days >= 0 && days <= 365) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + days);
      return futureDate.toISOString();
    }
  }

  // Handle "X days ago"
  const daysAgoMatch = lowerStr.match(/^(\d+)\s+days?\s+ago$/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1], 10);
    if (days >= 0 && days <= 365) {
      const pastDate = new Date(today);
      pastDate.setDate(today.getDate() - days);
      return pastDate.toISOString();
    }
  }

  return null;
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

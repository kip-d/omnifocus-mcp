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
    // Try to get timezone from system
    if (process.platform === 'darwin') {
      // macOS - use systemsetup command
      const tz = execSync('systemsetup -gettimezone', { encoding: 'utf8' })
        .trim()
        .replace('Time Zone: ', '');
      return tz;
    }
    
    // Fallback to environment variable
    if (process.env.TZ) {
      return process.env.TZ;
    }
    
    // Final fallback - read from /etc/localtime symlink
    try {
      const tzPath = execSync('readlink /etc/localtime', { encoding: 'utf8' }).trim();
      // Extract timezone from path like /usr/share/zoneinfo/America/New_York
      const match = tzPath.match(/zoneinfo\/(.+)$/);
      if (match) {
        return match[1];
      }
    } catch {
      // Ignore if readlink fails
    }
    
    // If all else fails, default to UTC
    console.warn('Could not detect system timezone, defaulting to UTC');
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
    throw new Error(`Invalid date format: ${localDateStr}`);
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
    throw new Error(`Invalid UTC date: ${utcStr}`);
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
    return new Date(dateStr).toISOString();
  }
  
  // Try to parse as local time
  try {
    return localToUTC(dateStr);
  } catch {
    // Could implement relative date parsing here in the future
    // For now, return null for unparseable dates
    return null;
  }
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
    offsetString
  };
}
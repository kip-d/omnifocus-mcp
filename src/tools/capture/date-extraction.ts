/**
 * Date extraction from natural language
 *
 * Parses task text for date references and converts them to YYYY-MM-DD format.
 * Supports common patterns like "by Friday", "next Tuesday", "end of month".
 */

interface ExtractedDates {
  dueDate?: string;
  deferDate?: string;
}

/**
 * Extract dates from task text
 *
 * @param text - Task text to analyze
 * @returns Object with dueDate and/or deferDate in YYYY-MM-DD format
 */
export function extractDates(text: string): ExtractedDates {
  const result: ExtractedDates = {};

  // Look for due date indicators
  const dueDateMatch = findDueDate(text);
  if (dueDateMatch) {
    result.dueDate = dueDateMatch;
  }

  // Look for defer date indicators
  const deferDateMatch = findDeferDate(text);
  if (deferDateMatch) {
    result.deferDate = deferDateMatch;
  }

  return result;
}

/**
 * Find due date from text
 */
function findDueDate(text: string): string | undefined {
  const textLower = text.toLowerCase();

  // Pattern: "by [date]", "due [date]", "before [date]", "until [date]"
  const duePhrases = ['by', 'due', 'before', 'until', 'deadline'];

  for (const phrase of duePhrases) {
    const pattern = new RegExp(`\\b${phrase}\\s+([\\w\\s,]+?)(?:\\.|$|,|;)`, 'i');
    const match = textLower.match(pattern);
    if (match) {
      const dateStr = match[1].trim();
      const parsed = parseRelativeDate(dateStr);
      if (parsed) {
        return parsed;
      }
    }
  }

  // Pattern: Direct date reference without preposition
  // "Friday", "next Monday", "this week", "end of month"
  const directDate = parseRelativeDate(textLower);
  if (directDate) {
    return directDate;
  }

  return undefined;
}

/**
 * Find defer date from text
 */
function findDeferDate(text: string): string | undefined {
  const textLower = text.toLowerCase();

  // Pattern: "after [date]", "starting [date]", "not until [date]"
  const deferPhrases = ['after', 'starting', 'not until', 'wait until'];

  for (const phrase of deferPhrases) {
    const pattern = new RegExp(`\\b${phrase}\\s+([\\w\\s,]+?)(?:\\.|$|,|;)`, 'i');
    const match = textLower.match(pattern);
    if (match) {
      const dateStr = match[1].trim();
      const parsed = parseRelativeDate(dateStr);
      if (parsed) {
        return parsed;
      }
    }
  }

  // Pattern: "follow up [with X]" - treat as defer date with natural language date
  if (/\bfollow up\b/i.test(text)) {
    const followUpMatch = text.match(/follow up.*?(next\s+\w+|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (followUpMatch) {
      const parsed = parseRelativeDate(followUpMatch[1]);
      if (parsed) {
        return parsed;
      }
    }
  }

  return undefined;
}

/**
 * Parse relative date expressions to YYYY-MM-DD
 */
function parseRelativeDate(dateStr: string): string | undefined {
  const now = new Date();

  // Today
  if (/\btoday\b/i.test(dateStr)) {
    return formatDate(now);
  }

  // Tomorrow
  if (/\btomorrow\b/i.test(dateStr)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }

  // Day of week (next occurrence)
  const dayOfWeek = parseDayOfWeek(dateStr);
  if (dayOfWeek !== null) {
    const targetDate = getNextDayOfWeek(now, dayOfWeek);
    return formatDate(targetDate);
  }

  // This week / next week
  if (/\bthis week\b/i.test(dateStr)) {
    const endOfWeek = getEndOfWeek(now);
    return formatDate(endOfWeek);
  }

  if (/\bnext week\b/i.test(dateStr)) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const endOfNextWeek = getEndOfWeek(nextWeek);
    return formatDate(endOfNextWeek);
  }

  // End of month
  if (/\bend of (?:the )?month\b/i.test(dateStr) || /\bmonth end\b/i.test(dateStr)) {
    const endOfMonth = getEndOfMonth(now);
    return formatDate(endOfMonth);
  }

  // Next month
  if (/\bnext month\b/i.test(dateStr)) {
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const endOfNextMonth = getEndOfMonth(nextMonth);
    return formatDate(endOfNextMonth);
  }

  // Specific date pattern: "October 15", "Oct 15", "10/15", "2025-10-15"
  const specificDate = parseSpecificDate(dateStr);
  if (specificDate) {
    return formatDate(specificDate);
  }

  return undefined;
}

/**
 * Parse day of week from text
 */
function parseDayOfWeek(text: string): number | null {
  const days = [
    { pattern: /\b(?:next )?sunday\b/i, day: 0 },
    { pattern: /\b(?:next )?monday\b/i, day: 1 },
    { pattern: /\b(?:next )?tuesday\b/i, day: 2 },
    { pattern: /\b(?:next )?wednesday\b/i, day: 3 },
    { pattern: /\b(?:next )?thursday\b/i, day: 4 },
    { pattern: /\b(?:next )?friday\b/i, day: 5 },
    { pattern: /\b(?:next )?saturday\b/i, day: 6 },
  ];

  for (const { pattern, day } of days) {
    if (pattern.test(text)) {
      return day;
    }
  }

  return null;
}

/**
 * Get next occurrence of a day of week
 */
function getNextDayOfWeek(from: Date, targetDay: number): Date {
  const result = new Date(from);
  const currentDay = result.getDay();

  // Calculate days to add
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd <= 0) {
    daysToAdd += 7; // Next week
  }

  result.setDate(result.getDate() + daysToAdd);
  return result;
}

/**
 * Get end of current week (Friday)
 */
function getEndOfWeek(date: Date): Date {
  const result = new Date(date);
  const dayOfWeek = result.getDay();

  // Friday is day 5
  const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 5 + (7 - dayOfWeek);
  result.setDate(result.getDate() + daysUntilFriday);

  return result;
}

/**
 * Get last day of month
 */
function getEndOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0); // Last day of previous month
  return result;
}

/**
 * Parse specific date formats
 */
function parseSpecificDate(dateStr: string): Date | undefined {
  // ISO format: YYYY-MM-DD
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Slash format: MM/DD or MM/DD/YYYY
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const currentYear = new Date().getFullYear();
    return new Date(
      year ? parseInt(year) : currentYear,
      parseInt(month) - 1,
      parseInt(day),
    );
  }

  // Month name format: "October 15", "Oct 15"
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const monthAbbr = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  ];

  for (let i = 0; i < monthNames.length; i++) {
    const fullPattern = new RegExp(`\\b${monthNames[i]}\\s+(\\d{1,2})\\b`, 'i');
    const abbrPattern = new RegExp(`\\b${monthAbbr[i]}\\.?\\s+(\\d{1,2})\\b`, 'i');

    const fullMatch = dateStr.match(fullPattern);
    const abbrMatch = dateStr.match(abbrPattern);

    if (fullMatch || abbrMatch) {
      const match = fullMatch || abbrMatch;
      if (match) {
        const day = parseInt(match[1]);
        const currentYear = new Date().getFullYear();
        return new Date(currentYear, i, day);
      }
    }
  }

  return undefined;
}

/**
 * Format Date object as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayString(): string {
  return formatDate(new Date());
}

/**
 * Get tomorrow's date in YYYY-MM-DD format
 */
export function getTomorrowString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDate(tomorrow);
}

/**
 * Add days to a date string
 */
export function addDays(dateStr: string, days: number): string {
  const parts = dateStr.split('-');
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

/**
 * Context tag detection patterns
 *
 * Analyzes task text and suggests appropriate GTD context tags
 * based on location, time, energy, and people requirements.
 */

interface ContextPattern {
  tag: string;
  keywords: string[];
  pattern?: RegExp;
}

/**
 * Location-based context tags
 */
const LOCATION_CONTEXTS: ContextPattern[] = [
  {
    tag: '@computer',
    keywords: [
      'email',
      'code',
      'program',
      'document',
      'spreadsheet',
      'write',
      'research',
      'online',
      'website',
      'type',
      'draft',
      'edit',
    ],
  },
  {
    tag: '@phone',
    keywords: ['call', 'phone', 'dial', 'ring', 'voice', 'speak'],
  },
  {
    tag: '@office',
    keywords: ['meeting', 'in-person', 'presentation', 'conference room', 'office'],
  },
  {
    tag: '@home',
    keywords: ['personal', 'household', 'family', 'laundry', 'cleaning', 'organize home'],
  },
  {
    tag: '@errands',
    keywords: ['buy', 'purchase', 'pick up', 'drop off', 'store', 'shop', 'get', 'mail', 'post office', 'bank'],
  },
  {
    tag: '@anywhere',
    keywords: ['think', 'brainstorm', 'plan', 'consider', 'decide', 'ponder', 'review notes'],
  },
];

/**
 * Time-based context tags
 */
const TIME_CONTEXTS: ContextPattern[] = [
  {
    tag: '@15min',
    keywords: ['quick', 'brief', 'short', 'fast', 'rapid', 'glance'],
  },
  {
    tag: '@30min',
    keywords: ['call', 'review', 'check', 'scan', 'skim', 'look over'],
  },
  {
    tag: '@1hour',
    keywords: ['meeting', 'discussion', 'session', 'workshop'],
  },
  {
    tag: '@deep-work',
    keywords: ['plan', 'design', 'write', 'analyze', 'create', 'develop', 'strategize', 'architect', 'deep dive'],
  },
];

/**
 * Energy-based context tags
 */
const ENERGY_CONTEXTS: ContextPattern[] = [
  {
    tag: '@high-energy',
    keywords: ['create', 'design', 'build', 'develop', 'write', 'present', 'brainstorm', 'innovate'],
  },
  {
    tag: '@low-energy',
    keywords: ['review', 'read', 'scan', 'organize', 'file', 'sort', 'simple', 'easy', 'routine'],
  },
];

/**
 * Priority-based context tags
 */
const PRIORITY_CONTEXTS: ContextPattern[] = [
  {
    tag: '@urgent',
    keywords: ['asap', 'urgent', 'critical', 'immediately', 'now', 'emergency', 'today'],
    pattern: /\b(asap|urgent|critical|immediately)\b/i,
  },
  {
    tag: '@important',
    keywords: ['must', 'need to', 'essential', 'crucial', 'vital', 'key', 'priority'],
    pattern: /\b(must|need to|essential|crucial)\b/i,
  },
];

/**
 * Detect appropriate context tags for a task
 *
 * @param text - Task text to analyze
 * @returns Array of suggested context tags
 */
export function detectContextTags(text: string): string[] {
  const tags: string[] = [];
  const textLower = text.toLowerCase();

  // Check location contexts
  for (const context of LOCATION_CONTEXTS) {
    if (matchesContext(textLower, context)) {
      tags.push(context.tag);
    }
  }

  // Check time contexts (only add one time tag)
  const timeTag = findBestTimeContext(textLower);
  if (timeTag) {
    tags.push(timeTag);
  }

  // Check energy contexts (only add one energy tag)
  const energyTag = findBestEnergyContext(textLower);
  if (energyTag) {
    tags.push(energyTag);
  }

  // Check priority contexts
  for (const context of PRIORITY_CONTEXTS) {
    if (matchesContext(textLower, context)) {
      tags.push(context.tag);
    }
  }

  // Check people-based patterns
  const peopleTags = detectPeopleTags(text);
  tags.push(...peopleTags);

  // Remove duplicates
  return [...new Set(tags)];
}

/**
 * Check if text matches a context pattern
 */
function matchesContext(text: string, context: ContextPattern): boolean {
  // Check regex pattern if provided
  if (context.pattern && context.pattern.test(text)) {
    return true;
  }

  // Check keywords
  return context.keywords.some((keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(text);
  });
}

/**
 * Find the best matching time context
 */
function findBestTimeContext(text: string): string | null {
  // Check in order of specificity
  for (const context of TIME_CONTEXTS) {
    if (matchesContext(text, context)) {
      return context.tag;
    }
  }
  return null;
}

/**
 * Find the best matching energy context
 */
function findBestEnergyContext(text: string): string | null {
  // High energy takes precedence
  if (matchesContext(text, ENERGY_CONTEXTS[0])) {
    return ENERGY_CONTEXTS[0].tag;
  }
  if (matchesContext(text, ENERGY_CONTEXTS[1])) {
    return ENERGY_CONTEXTS[1].tag;
  }
  return null;
}

/**
 * Detect people-based tags in THIS vault's convention.
 *
 * OMN-123: the previous patterns emitted `@waiting-for-{name}`, lowercase
 * `@agenda-{name}`, and a bare `@{name}` assignee shape — none of which match
 * real tags in this vault and which polluted the tag namespace. The vault uses a
 * flat `@waiting-for` plus a capitalized `@agenda-{Name}`. The bare-`@name` shape
 * is dropped entirely (it fired on ordinary sentences, e.g. "Sarah will review…"
 * → `@sarah`). This is the single source of truth for people tags — the analyze
 * tool no longer has a parallel `detectAssignee`.
 */
function detectPeopleTags(text: string): string[] {
  const tags: string[] = [];
  const commonWords = new Set(['me', 'you', 'us', 'them', 'it', 'this', 'that']);
  const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const isName = (n: string): boolean => !commonWords.has(n.toLowerCase());

  // "waiting for/on X" → flat @waiting-for + the person's agenda tag
  const waiting = /\bwaiting\s+(?:for|on)\s+([a-z][\w'-]*)/i.exec(text);
  if (waiting && isName(waiting[1])) {
    tags.push('@waiting-for');
    tags.push(`@agenda-${capitalize(waiting[1])}`);
  }

  // delegation / agenda cues → @agenda-{Name}. The leading \b prevents "task to"
  // from matching "ask to" → a spurious @agenda-To.
  const agenda = /\b(?:ask|check with|discuss with|talk to|meet with)\s+([a-z][\w'-]*)/i.exec(text);
  if (agenda && isName(agenda[1])) {
    const tag = `@agenda-${capitalize(agenda[1])}`;
    if (!tags.includes(tag)) tags.push(tag);
  }

  return tags;
}

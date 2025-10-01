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
    keywords: ['email', 'code', 'program', 'document', 'spreadsheet', 'write', 'research', 'online', 'website', 'type', 'draft', 'edit'],
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
 * People-based context patterns (dynamic)
 */
const PEOPLE_PATTERNS = [
  {
    // Pattern: "waiting for X" or "waiting on X"
    pattern: /waiting\s+(?:for|on)\s+(\w+)/i,
    tagFormat: (name: string) => `@waiting-for-${name.toLowerCase()}`,
  },
  {
    // Pattern: "ask X", "discuss with X", "talk to X", "check with X"
    pattern: /(?:ask|discuss with|talk to|check with|meet with)\s+(\w+)/i,
    tagFormat: (name: string) => `@agenda-${name.toLowerCase()}`,
  },
  {
    // Pattern: "X to do" (assignee at start)
    pattern: /^(\w+)\s+(?:to|will|should|needs to)\b/i,
    tagFormat: (name: string) => `@${name.toLowerCase()}`,
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
  return context.keywords.some(keyword => {
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
 * Detect people-based tags (waiting for, agenda items, assignees)
 */
function detectPeopleTags(text: string): string[] {
  const tags: string[] = [];

  for (const pattern of PEOPLE_PATTERNS) {
    const match = text.match(pattern.pattern);
    if (match && match[1]) {
      const name = match[1];
      // Filter out common words that aren't names
      const commonWords = ['me', 'you', 'us', 'them', 'it', 'this', 'that'];
      if (!commonWords.includes(name.toLowerCase())) {
        tags.push(pattern.tagFormat(name));
      }
    }
  }

  return tags;
}

/**
 * Get all available context tags
 *
 * Useful for documentation and autocomplete
 */
export function getAvailableContextTags(): {
  location: string[];
  time: string[];
  energy: string[];
  priority: string[];
  people: string[];
} {
  return {
    location: LOCATION_CONTEXTS.map(c => c.tag),
    time: TIME_CONTEXTS.map(c => c.tag),
    energy: ENERGY_CONTEXTS.map(c => c.tag),
    priority: PRIORITY_CONTEXTS.map(c => c.tag),
    people: ['@waiting-for-{name}', '@agenda-{name}', '@{assignee}'],
  };
}

/**
 * Explain why a tag was suggested
 *
 * @param tag - The suggested tag
 * @param text - The task text
 * @returns Explanation of why the tag was suggested
 */
export function explainTagSuggestion(tag: string, text: string): string {
  const textLower = text.toLowerCase();

  // Check location contexts
  const locationContext = LOCATION_CONTEXTS.find(c => c.tag === tag);
  if (locationContext) {
    const matchedKeyword = locationContext.keywords.find(k =>
      new RegExp(`\\b${k}\\b`, 'i').test(textLower)
    );
    return matchedKeyword
      ? `Contains "${matchedKeyword}" which suggests ${tag} context`
      : `Matches ${tag} context pattern`;
  }

  // Check time contexts
  const timeContext = TIME_CONTEXTS.find(c => c.tag === tag);
  if (timeContext) {
    const matchedKeyword = timeContext.keywords.find(k =>
      new RegExp(`\\b${k}\\b`, 'i').test(textLower)
    );
    return matchedKeyword
      ? `"${matchedKeyword}" typically takes ${tag.replace('@', '')}`
      : `Estimated duration: ${tag.replace('@', '')}`;
  }

  // Check energy contexts
  const energyContext = ENERGY_CONTEXTS.find(c => c.tag === tag);
  if (energyContext) {
    const matchedKeyword = energyContext.keywords.find(k =>
      new RegExp(`\\b${k}\\b`, 'i').test(textLower)
    );
    return matchedKeyword
      ? `"${matchedKeyword}" requires ${tag.replace('@', '').replace('-', ' ')}`
      : `Task requires ${tag.replace('@', '').replace('-', ' ')}`;
  }

  // Check priority contexts
  const priorityContext = PRIORITY_CONTEXTS.find(c => c.tag === tag);
  if (priorityContext) {
    const matchedKeyword = priorityContext.keywords.find(k =>
      new RegExp(`\\b${k}\\b`, 'i').test(textLower)
    );
    return matchedKeyword
      ? `Contains "${matchedKeyword}" indicating ${tag.replace('@', '')} priority`
      : `Marked as ${tag.replace('@', '')}`;
  }

  // Check people patterns
  if (tag.startsWith('@waiting-for-')) {
    const name = tag.replace('@waiting-for-', '');
    return `Waiting for ${name} to complete their part`;
  }
  if (tag.startsWith('@agenda-')) {
    const name = tag.replace('@agenda-', '');
    return `Needs discussion with ${name}`;
  }

  return `Suggested based on task content`;
}

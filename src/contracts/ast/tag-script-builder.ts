/**
 * Tag Script Builder - Generates OmniJS scripts for tag queries
 *
 * Tags use a MODE-BASED pattern (field projection) rather than FILTER-BASED
 * pattern (item selection). This reflects OmniFocus tag semantics:
 * - Tags don't have rich filterable properties
 * - Main variation is HOW MUCH data to return
 * - Post-query operations are minimal (sort, exclude empty)
 *
 * @see docs/plans/2025-11-25-phase3-ast-extension-design.md
 */

import type { TagQueryOptions, TagSortBy } from '../tag-options.js';
import { createTagQueryOptions } from '../tag-options.js';
import type { GeneratedScript } from './script-builder.js';

// =============================================================================
// MAIN API
// =============================================================================

/**
 * Build an OmniJS script for tag queries
 *
 * @param options - Tag query options (mode required)
 * @returns Generated script ready for execution
 */
export function buildTagsScript(options: TagQueryOptions): GeneratedScript {
  const opts = createTagQueryOptions(options);

  switch (opts.mode) {
    case 'names':
      return buildTagNamesScript();
    case 'basic':
      return buildBasicTagsScript(opts.sortBy);
    case 'full':
      return buildFullTagsScript(opts);
  }
}

// =============================================================================
// MODE-SPECIFIC BUILDERS
// =============================================================================

/**
 * Build script for 'names' mode - ultra-fast string array
 */
function buildTagNamesScript(): GeneratedScript {
  const script = `
(() => {
  const names = [];
  flattenedTags.forEach(tag => {
    if (tag.name) {
      names.push(tag.name);
    }
  });

  // Sort alphabetically
  names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  return JSON.stringify({
    tags: names,
    count: names.length,
    mode: 'names'
  });
})()
`;

  return {
    script: script.trim(),
    filterDescription: 'all tags (names only)',
    isEmptyFilter: true,
  };
}

/**
 * Build script for 'basic' mode - minimal objects with id + name
 */
function buildBasicTagsScript(sortBy: TagSortBy = 'name'): GeneratedScript {
  const sortCode = generateSortCode('basic', sortBy);

  const script = `
(() => {
  const results = [];

  flattenedTags.forEach(tag => {
    results.push({
      id: tag.id.primaryKey,
      name: tag.name || ''
    });
  });

  // Sort results
  ${sortCode}

  return JSON.stringify({
    tags: results,
    count: results.length,
    mode: 'basic'
  });
})()
`;

  return {
    script: script.trim(),
    filterDescription: 'all tags (basic)',
    isEmptyFilter: true,
  };
}

/**
 * Build script for 'full' mode - complete tag data with optional stats
 */
function buildFullTagsScript(opts: Required<TagQueryOptions>): GeneratedScript {
  const { includeEmpty, sortBy, includeUsageStats } = opts;

  const usageCode = includeUsageStats ? generateUsageStatsCode() : '';
  const filterCode = includeEmpty ? '' : 'if (usage.total === 0) return;';
  const sortCode = generateSortCode('full', sortBy);

  const script = `
(() => {
  const results = [];

  flattenedTags.forEach(tag => {
    ${usageCode}
    ${filterCode}

    const tagData = {
      id: tag.id.primaryKey,
      name: tag.name || '',
      parentId: tag.parent ? tag.parent.id.primaryKey : null,
      parentName: tag.parent ? tag.parent.name : null,
      childrenAreMutuallyExclusive: tag.childrenAreMutuallyExclusive || false
    };

    ${includeUsageStats ? 'tagData.usage = usage;' : ''}

    results.push(tagData);
  });

  // Sort results
  ${sortCode}

  return JSON.stringify({
    tags: results,
    count: results.length,
    mode: 'full',
    includeUsageStats: ${includeUsageStats}
  });
})()
`;

  return {
    script: script.trim(),
    filterDescription: `all tags (full${includeUsageStats ? ' with stats' : ''})`,
    isEmptyFilter: true,
  };
}

// =============================================================================
// HELPER CODE GENERATORS
// =============================================================================

/**
 * Generate usage statistics calculation code for full mode
 */
function generateUsageStatsCode(): string {
  return `
    // Calculate usage statistics
    const tasks = tag.tasks || [];
    let total = 0;
    let active = 0;
    let completed = 0;

    tasks.forEach(task => {
      total++;
      if (task.completed) {
        completed++;
      } else {
        active++;
      }
    });

    const usage = { total, active, completed };
  `;
}

/**
 * Generate sort code based on mode and sort field
 */
function generateSortCode(mode: 'basic' | 'full', sortBy: TagSortBy): string {
  switch (sortBy) {
    case 'name':
      return 'results.sort((a, b) => (a.name || \'\').toLowerCase().localeCompare((b.name || \'\').toLowerCase()));';

    case 'usage':
      if (mode === 'basic') {
        // Basic mode doesn't have usage stats, fall back to name
        return 'results.sort((a, b) => (a.name || \'\').toLowerCase().localeCompare((b.name || \'\').toLowerCase()));';
      }
      return `results.sort((a, b) => {
        const aTotal = a.usage ? a.usage.total : 0;
        const bTotal = b.usage ? b.usage.total : 0;
        return bTotal - aTotal; // Descending
      });`;

    case 'activeTasks':
      if (mode === 'basic') {
        // Basic mode doesn't have usage stats, fall back to name
        return 'results.sort((a, b) => (a.name || \'\').toLowerCase().localeCompare((b.name || \'\').toLowerCase()));';
      }
      return `results.sort((a, b) => {
        const aActive = a.usage ? a.usage.active : 0;
        const bActive = b.usage ? b.usage.active : 0;
        return bActive - aActive; // Descending
      });`;

    default:
      return 'results.sort((a, b) => (a.name || \'\').toLowerCase().localeCompare((b.name || \'\').toLowerCase()));';
  }
}

// =============================================================================
// SINGLE TAG LOOKUP
// =============================================================================

/**
 * Build an OmniJS script for a specific tag by ID
 */
export function buildTagByIdScript(tagId: string): GeneratedScript {
  const script = `
(() => {
  const results = [];
  const targetId = ${JSON.stringify(tagId)};

  flattenedTags.forEach(tag => {
    if (tag.id.primaryKey === targetId) {
      // Calculate usage
      const tasks = tag.tasks || [];
      let total = 0;
      let active = 0;
      let completed = 0;

      tasks.forEach(task => {
        total++;
        if (task.completed) {
          completed++;
        } else {
          active++;
        }
      });

      results.push({
        id: tag.id.primaryKey,
        name: tag.name || '',
        parentId: tag.parent ? tag.parent.id.primaryKey : null,
        parentName: tag.parent ? tag.parent.name : null,
        childrenAreMutuallyExclusive: tag.childrenAreMutuallyExclusive || false,
        usage: { total, active, completed }
      });
    }
  });

  return JSON.stringify({
    tags: results,
    count: results.length,
    mode: 'id_lookup',
    targetId: targetId
  });
})()
`;

  return {
    script: script.trim(),
    filterDescription: `id = ${tagId}`,
    isEmptyFilter: false,
  };
}

/**
 * Build an OmniJS script for a tag by name
 */
export function buildTagByNameScript(tagName: string): GeneratedScript {
  const script = `
(() => {
  const results = [];
  const targetName = ${JSON.stringify(tagName)};

  flattenedTags.forEach(tag => {
    if (tag.name === targetName) {
      // Calculate usage
      const tasks = tag.tasks || [];
      let total = 0;
      let active = 0;
      let completed = 0;

      tasks.forEach(task => {
        total++;
        if (task.completed) {
          completed++;
        } else {
          active++;
        }
      });

      results.push({
        id: tag.id.primaryKey,
        name: tag.name || '',
        parentId: tag.parent ? tag.parent.id.primaryKey : null,
        parentName: tag.parent ? tag.parent.name : null,
        childrenAreMutuallyExclusive: tag.childrenAreMutuallyExclusive || false,
        usage: { total, active, completed }
      });
    }
  });

  return JSON.stringify({
    tags: results,
    count: results.length,
    mode: 'name_lookup',
    targetName: targetName
  });
})()
`;

  return {
    script: script.trim(),
    filterDescription: `name = "${tagName}"`,
    isEmptyFilter: false,
  };
}

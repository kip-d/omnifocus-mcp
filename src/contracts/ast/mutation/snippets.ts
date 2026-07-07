// src/contracts/ast/mutation/snippets.ts
// Single-source registry of OmniJS helper snippets interpolated into
// evaluateJavascript blocks. Lifted from mutation-script-builder.ts (OMN-127
// resolver consts) so every write site shares ONE copy and a declared
// dependency graph (OMN-128).

export interface Snippet {
  readonly source: string;
  readonly deps: readonly string[];
}

const parseFolderPath = `
function parseFolderPath(input) {
  if (input.indexOf(' : ') !== -1) {
    var segs = input.split(' : ');
    for (var i = 0; i < segs.length; i++) {
      segs[i] = segs[i].trim();
      if (segs[i].length === 0) return null;
    }
    return segs;
  }
  if (input.indexOf('/') !== -1) {
    var segs = input.split('/');
    for (var i = 0; i < segs.length; i++) {
      segs[i] = segs[i].trim();
      if (segs[i].length === 0) return null;
    }
    return segs;
  }
  return null;
}`;

const resolveFolderPath = `
function resolveFolderPath(segments) {
  var parent = null;
  var current = null;
  for (var i = 0; i < segments.length; i++) {
    current = null;
    var children = parent ? parent.children : folders;
    for (var j = 0; j < children.length; j++) {
      if (children[j].name === segments[i]) { current = children[j]; break; }
    }
    if (!current) return null;
    parent = current;
  }
  return current;
}`;

const resolveFolderFlexible = `
function resolveFolderFlexible(target) {
  // 1. Try parsing as a path (" : " or "/")
  var pathSegs = parseFolderPath(target);
  if (pathSegs) {
    var found = resolveFolderPath(pathSegs);
    if (found) return found;
  }
  // 2. Try by identifier (id.primaryKey)
  var byId = Folder.byIdentifier(target);
  if (byId) return byId;
  // 3. Fall back to leaf name match
  for (var i = 0; i < flattenedFolders.length; i++) {
    if (flattenedFolders[i].name === target) return flattenedFolders[i];
  }
  return null;
}`;

const parseTagPath = `
function parseTagPath(input) {
  if (input.indexOf(' : ') === -1) return null;
  var segs = input.split(' : ');
  for (var i = 0; i < segs.length; i++) {
    segs[i] = segs[i].trim();
    if (segs[i].length === 0) throw new Error('Invalid tag path: empty segment');
  }
  return segs;
}`;

const resolveOrCreateTagByPath = `
function resolveOrCreateTagByPath(segments) {
  var parent = null;
  var current = null;
  for (var i = 0; i < segments.length; i++) {
    current = null;
    var children = parent ? parent.children : tags;
    for (var j = 0; j < children.length; j++) {
      if (children[j].name === segments[i]) { current = children[j]; break; }
    }
    if (!current) {
      current = parent ? new Tag(segments[i], parent) : new Tag(segments[i], null);
    }
    parent = current;
  }
  return current;
}`;

// Reporting sibling of resolveOrCreateTagByPath (slice 6): same find-or-create
// walk, but returns { tag, created } so the create/tag envelope can echo
// createdSegments (legacy buildCreateTagScript path-island behavior).
const createTagPath = `
function createTagPath(segments) {
  var parent = null;
  var current = null;
  var created = [];
  for (var i = 0; i < segments.length; i++) {
    current = null;
    var children = parent ? parent.children : tags;
    for (var j = 0; j < children.length; j++) {
      if (children[j].name === segments[i]) { current = children[j]; break; }
    }
    if (!current) {
      current = parent ? new Tag(segments[i], parent) : new Tag(segments[i], null);
      created.push(segments[i]);
    }
    parent = current;
  }
  return { tag: current, created: created };
}`;

// Lifted verbatim from OMNIJS_RESOLVE_TAG_PATH const in mutation-script-builder.ts (OMN-128 slice 4).
// Resolve-only walk: returns null on a missing segment rather than creating.
// Used by the 'remove' mode of assignTags — resolves without creating tags.
const resolveTagByPath = `
function resolveTagByPath(segments) {
  var parent = null;
  var current = null;
  for (var i = 0; i < segments.length; i++) {
    current = null;
    var children = parent ? parent.children : tags;
    for (var j = 0; j < children.length; j++) {
      if (children[j].name === segments[i]) { current = children[j]; break; }
    }
    if (!current) return null;
    parent = current;
  }
  return current;
}`;

const resolveProjectFlexible = `
function resolveProjectFlexible(target) {
  var byId = Project.byIdentifier(target);
  if (byId) return byId;
  for (var i = 0; i < flattenedProjects.length; i++) {
    if (flattenedProjects[i].name === target) return flattenedProjects[i];
  }
  return null;
}`;

// Review-interval arithmetic, lifted VERBATIM from the legacy
// mark-project-reviewed.ts template (OMN-106). Unit names are the canonical
// OmniJS plurals (ReviewInterval.unit.name); unknown units fall back to weekly,
// matching legacy behavior byte-for-byte.
const calculateNextReviewDate = `
function calculateNextReviewDate(reviewInterval, fromDate) {
  if (!reviewInterval) {
    return null;
  }
  var date = new Date(fromDate);
  var unitName = reviewInterval.unit ? reviewInterval.unit.name : 'weeks';
  var steps = reviewInterval.steps || 1;
  switch (unitName) {
    case 'days':
      date.setDate(date.getDate() + steps);
      break;
    case 'weeks':
      date.setDate(date.getDate() + (steps * 7));
      break;
    case 'months':
      date.setMonth(date.getMonth() + steps);
      break;
    case 'years':
      date.setFullYear(date.getFullYear() + steps);
      break;
    default:
      date.setDate(date.getDate() + (steps * 7));
  }
  return date;
}`;

// The mark-reviewed mutation body (OMN-106): sets lastReviewDate, optionally
// calculates + sets nextReviewDate from the project's LIVE typed
// reviewInterval, and returns the legacy changes[] strings unchanged (they are
// part of the pinned wire envelope).
const applyMarkReviewed = `
function applyMarkReviewed(project, reviewDateStr, updateNextReviewDate) {
  var reviewDateTime = new Date(reviewDateStr);
  project.lastReviewDate = reviewDateTime;
  var changes = ["Last review date set to " + reviewDateStr];
  if (updateNextReviewDate) {
    var reviewInterval = project.reviewInterval;
    if (reviewInterval) {
      try {
        var nextReviewDateValue = calculateNextReviewDate(reviewInterval, reviewDateTime);
        if (nextReviewDateValue) {
          project.nextReviewDate = nextReviewDateValue;
          changes.push("Next review date calculated and set to " + nextReviewDateValue.toISOString());
        }
      } catch (calcError) {
        changes.push("Warning: Could not calculate next review date: " + calcError.message);
      }
    } else {
      changes.push("Note: No review interval set, next review date not calculated");
    }
  }
  return changes;
}`;

export const SNIPPETS: Record<string, Snippet> = {
  parseFolderPath: { source: parseFolderPath, deps: [] },
  resolveFolderPath: { source: resolveFolderPath, deps: [] },
  resolveFolderFlexible: { source: resolveFolderFlexible, deps: ['parseFolderPath', 'resolveFolderPath'] },
  parseTagPath: { source: parseTagPath, deps: [] },
  resolveOrCreateTagByPath: { source: resolveOrCreateTagByPath, deps: ['parseTagPath'] },
  // Reporting sibling of resolveOrCreateTagByPath (slice 6): returns { tag, created }
  // so the create/tag envelope can echo createdSegments. No deps: walks `tags` directly
  // (does not need parseTagPath — segments arrive pre-split from BUILD time, spec §3).
  createTagPath: { source: createTagPath, deps: [] },
  // Resolve-only sibling of resolveOrCreateTagByPath: walk returns null on a missing
  // segment instead of creating. Used by the assignTags 'remove' mode (OMN-128 slice 4).
  resolveTagByPath: { source: resolveTagByPath, deps: ['parseTagPath'] },
  resolveProjectFlexible: { source: resolveProjectFlexible, deps: [] },
  // OMN-106: review-interval arithmetic + the mark-reviewed mutation body.
  calculateNextReviewDate: { source: calculateNextReviewDate, deps: [] },
  applyMarkReviewed: { source: applyMarkReviewed, deps: ['calculateNextReviewDate'] },
};

export function collectSnippets(keys: readonly string[]): string {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    const snip = SNIPPETS[key];
    if (!snip) throw new Error(`Unknown snippet: ${key}`);
    snip.deps.forEach(visit);
    ordered.push(snip.source);
  };
  keys.forEach(visit);
  return ordered.join('\n');
}

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

// OMN-249: ONE review-date arithmetic body shared by both entry points below —
// a future date-math fix (month-end clamping, leap years) lands once. Expects a
// NORMALIZED plural unit (see normalizeReviewUnit); unknown falls back to
// weekly (the legacy default both templates carried).
const advanceDateByReviewUnit = `
function advanceDateByReviewUnit(date, unit, steps) {
  switch (unit) {
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

// mark_reviewed entry point (OMN-106): thin adapter over the shared body,
// reading the TYPED OmniJS instance dialect (reviewInterval.unit.name).
// Wire behavior pinned by the mark-reviewed vm goldens + the OMN-249 parity
// tests.
const calculateNextReviewDate = `
function calculateNextReviewDate(reviewInterval, fromDate) {
  if (!reviewInterval) {
    return null;
  }
  var unitName = reviewInterval.unit ? reviewInterval.unit.name : 'weeks';
  return advanceDateByReviewUnit(new Date(fromDate), normalizeReviewUnit(unitName), reviewInterval.steps || 1);
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

// Unit-string normalizer for set-review-schedule, lifted from the legacy
// template (OMN-106 PR-2). Singular/plural map, unknown falls back to weeks.
const normalizeReviewUnit = `
function normalizeReviewUnit(unitString) {
  var unitMap = {
    'day': 'days',
    'days': 'days',
    'week': 'weeks',
    'weeks': 'weeks',
    'month': 'months',
    'months': 'months',
    'year': 'years',
    'years': 'years'
  };
  return unitMap[unitString.toLowerCase()] || 'weeks';
}`;

// set_schedule entry point (OMN-106 PR-2): thin adapter over the shared body,
// reading the RAW spec dialect (unit may be singular; missing base date means
// compute from NOW). Wire behavior pinned by the set-review-schedule vm
// goldens + the OMN-249 parity tests.
const calculateNextReviewFromSpec = `
function calculateNextReviewFromSpec(interval, baseDate) {
  var date = baseDate ? new Date(baseDate) : new Date();
  return advanceDateByReviewUnit(date, normalizeReviewUnit(interval.unit || 'week'), interval.steps || 1);
}`;

// The per-project set-review-schedule body (OMN-106 PR-2), lifted from the
// legacy template: strictly-typed reviewInterval read-modify-reassign
// (OMN-41/58/60 — no existing instance means a LOUD per-item failure, OmniJS
// cannot construct one), explicit vs from-now next-review date, read-back
// echo of the PERSISTED interval. Mutates the shared results accumulator.
const applySetReviewSchedule = `
function applySetReviewSchedule(projectId, reviewInterval, nextReviewDateParam, results) {
  var targetProject = Project.byIdentifier(projectId);
  if (!targetProject) {
    results.failed.push({
      projectId: projectId,
      error: "Project not found"
    });
    return;
  }
  try {
    var changes = [];
    if (reviewInterval) {
      var unit = normalizeReviewUnit(reviewInterval.unit);
      var steps = reviewInterval.steps || 1;
      var ri = targetProject.reviewInterval;
      if (ri) {
        ri.steps = steps;
        ri.unit = unit;
        targetProject.reviewInterval = ri;
        changes.push("Review interval set to every " + steps + " " + unit);
      } else {
        results.failed.push({
          projectId: projectId,
          projectName: targetProject.name,
          error: "Project has no existing reviewInterval instance to modify; OmniJS cannot construct one (OMN-41/OMN-58)"
        });
        return;
      }
    }
    var calculatedNextReviewDate = null;
    if (nextReviewDateParam) {
      calculatedNextReviewDate = new Date(nextReviewDateParam);
      targetProject.nextReviewDate = calculatedNextReviewDate;
      changes.push("Next review date set to " + nextReviewDateParam);
    } else if (reviewInterval) {
      calculatedNextReviewDate = calculateNextReviewFromSpec(reviewInterval);
      targetProject.nextReviewDate = calculatedNextReviewDate;
      changes.push("Next review date calculated and set to " + calculatedNextReviewDate.toISOString());
    }
    results.successful.push({
      projectId: projectId,
      projectName: targetProject.name,
      changes: changes,
      reviewInterval: (function() {
        var ri2 = targetProject.reviewInterval;
        return ri2 ? { unit: ri2.unit, steps: ri2.steps } : null;
      })(),
      nextReviewDate: calculatedNextReviewDate ? calculatedNextReviewDate.toISOString() : null
    });
  } catch (updateError) {
    results.failed.push({
      projectId: projectId,
      projectName: targetProject.name,
      error: "Failed to update: " + updateError.message
    });
  }
}`;

// OMN-256: batch mark-reviewed body, mirroring applySetReviewSchedule's
// accumulator shape (results.successful[] / failed[], continue-on-error).
// Delegates the actual lastReviewDate set + optional nextReviewDate advance
// to applyMarkReviewed itself (the single-id body) so the two paths can never
// drift — applyMarkReviewed already mutates the project in place and returns
// the changes[] array; this just reads the persisted values back for the
// batch envelope's richer per-row shape.
const applyMarkReviewedBatch = `
function applyMarkReviewedBatch(projectId, reviewDateStr, updateNextReviewDate, results) {
  var project = Project.byIdentifier(projectId);
  if (!project) {
    results.failed.push({
      projectId: projectId,
      error: "Project not found"
    });
    return;
  }
  try {
    var changes = applyMarkReviewed(project, reviewDateStr, updateNextReviewDate);
    results.successful.push({
      projectId: projectId,
      projectName: project.name,
      changes: changes,
      lastReviewDate: project.lastReviewDate ? project.lastReviewDate.toISOString() : null,
      nextReviewDate: project.nextReviewDate ? project.nextReviewDate.toISOString() : null
    });
  } catch (updateError) {
    results.failed.push({
      projectId: projectId,
      projectName: project.name,
      error: "Failed to update: " + updateError.message
    });
  }
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
  // OMN-249: the ONE shared review-date arithmetic body.
  advanceDateByReviewUnit: { source: advanceDateByReviewUnit, deps: [] },
  // OMN-106: review-interval entry points (thin adapters) + the mark-reviewed mutation body.
  calculateNextReviewDate: {
    source: calculateNextReviewDate,
    deps: ['normalizeReviewUnit', 'advanceDateByReviewUnit'],
  },
  applyMarkReviewed: { source: applyMarkReviewed, deps: ['calculateNextReviewDate'] },
  // OMN-106 PR-2: set-review-schedule batch body + its helpers.
  normalizeReviewUnit: { source: normalizeReviewUnit, deps: [] },
  calculateNextReviewFromSpec: {
    source: calculateNextReviewFromSpec,
    deps: ['normalizeReviewUnit', 'advanceDateByReviewUnit'],
  },
  applySetReviewSchedule: {
    source: applySetReviewSchedule,
    deps: ['normalizeReviewUnit', 'calculateNextReviewFromSpec'],
  },
  // OMN-256: batch mark-reviewed body — delegates to applyMarkReviewed (which
  // transitively pulls in calculateNextReviewDate) so the two never drift.
  applyMarkReviewedBatch: { source: applyMarkReviewedBatch, deps: ['applyMarkReviewed'] },
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

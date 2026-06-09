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

const resolveProjectFlexible = `
function resolveProjectFlexible(target) {
  var byId = Project.byIdentifier(target);
  if (byId) return byId;
  for (var i = 0; i < flattenedProjects.length; i++) {
    if (flattenedProjects[i].name === target) return flattenedProjects[i];
  }
  return null;
}`;

export const SNIPPETS: Record<string, Snippet> = {
  parseFolderPath: { source: parseFolderPath, deps: [] },
  resolveFolderPath: { source: resolveFolderPath, deps: [] },
  resolveFolderFlexible: { source: resolveFolderFlexible, deps: ['parseFolderPath', 'resolveFolderPath'] },
  parseTagPath: { source: parseTagPath, deps: [] },
  resolveOrCreateTagByPath: { source: resolveOrCreateTagByPath, deps: ['parseTagPath'] },
  resolveProjectFlexible: { source: resolveProjectFlexible, deps: [] },
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

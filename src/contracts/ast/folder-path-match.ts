/**
 * OMN-167 — shared `Parent : Child` folder-path matcher (subtree semantics).
 *
 * Single source of truth for folder-path matching across both codegen layers:
 *   - tasks-side: synthetic `task.folderMatch` emitter (`types.ts`)
 *   - projects-side: `filter-generator.ts` `folderName` block (upgraded from
 *     direct-parent substring to subtree path)
 *
 * Keeping one emitter means the tasks↔projects folder recipe stays identical and
 * the generated OmniJS can never silently diverge between the two layers
 * (`feedback_dry_preference`; the OMN-46/87 divergence-risk shape).
 *
 * Parent relationships (`Folder.parent`) are readable ONLY in OmniJS — the bridge
 * is required, which both codegen paths already satisfy.
 */

// OMN-218: accept BOTH `:` and `/` as segment separators. The `folders` query
// EMITS `/`-joined paths and the WRITE path (`resolveFolderFlexible`) accepts `/`,
// so the read filter must round-trip its own output. `:` stays first-party too
// (OmniFocus Shortcuts/URL convention — see reference_of_folder_path_separator_conventions).
const FOLDER_PATH_SEPARATOR = /[:/]/;

/**
 * Parse a user folder path into lowercased, trimmed segments (leaf last).
 *
 * `"Development"`             → `['development']`        (bare name = single-segment path)
 * `"Personal : Bills"`        → `['personal', 'bills']`  (leaf segment last)
 * `"Personal/Bills"`          → `['personal', 'bills']`  (OMN-218: `/` is a separator too)
 *
 * Throws on an empty segment (`" : B"`, `"A : "`, `"A : : B"`, `"/B"`, `"A//B"`) so the
 * compiler can surface a steering VALIDATION_ERROR rather than silently matching nothing.
 *
 * Limitation: a literal `:` OR `/` in a folder name is not escapable — a folder named
 * `"A/B"` or `"A:B"` parses as two segments. Documented, acceptable (no existing escape
 * mechanism; rare) — and symmetric with the write-side `parseFolderPath`.
 *
 * NOTE: distinct from the WRITE-side `parseFolderPath` in `mutation/snippets.ts` —
 * that is an OmniJS-string snippet with a different contract (spaced `' : '` OR `/`,
 * returns null for a bare name). The names were deliberately disambiguated (OMN-167
 * review) so a future "align these" refactor doesn't merge two divergent contracts.
 */
export function parseFolderFilterPath(path: string): string[] {
  const segments = path.split(FOLDER_PATH_SEPARATOR).map((s) => s.trim().toLowerCase());
  if (segments.some((s) => s.length === 0)) {
    throw new Error(
      `Invalid folder path "${path}": segments cannot be empty. Use "Parent : Child" or "Parent/Child" with non-empty names.`,
    );
  }
  return segments;
}

/**
 * Emit an OmniJS boolean expression that is `true` iff the ancestor chain starting
 * at `leafFolderExpr` (a `Folder | null` expression) passes THROUGH a folder matching
 * `path` — subtree semantics (the pinned folder or any descendant of it).
 *
 * Segments are baked in as a JSON literal array (data, never interpolated into an
 * unquoted/comment position) so a quote or backslash in a folder name round-trips
 * safely (`nested_template_backtick_hazard` discipline).
 *
 * For a single-segment path this collapses to "any ancestor folder name ⊇ segment".
 * For a multi-segment path it anchors the leaf segment at each ancestor and verifies
 * the remaining (parent) segments walking up; matches if any anchor satisfies the
 * full path.
 */
export function emitFolderPathMatch(leafFolderExpr: string, path: string): string {
  const segsLiteral = JSON.stringify(parseFolderFilterPath(path));
  return emitFolderChainPredicate(leafFolderExpr, segsLiteral);
}

/**
 * Shared per-folder chain predicate (OMN-218): an OmniJS boolean expression that is
 * `true` iff the ancestor chain starting at `startFolderExpr` passes THROUGH a folder
 * matching the baked-in `segsLiteral` (a JSON literal array of lowercased segments).
 *
 * Single source of truth for BOTH the row matcher (`emitFolderPathMatch`) and the
 * existence guard (`emitFolderExistsGuard`) so the two can never diverge — a folder
 * "resolves" iff a row under it could match. Kept as one template literal so the
 * embedded `''` OmniJS empty-string literals don't fight the lint quote rule;
 * whitespace in the generated source is irrelevant.
 */
function emitFolderChainPredicate(startFolderExpr: string, segsLiteral: string): string {
  return `(() => { const segs = ${segsLiteral}; let a = (${startFolderExpr}); while (a) { let f = a, ok = true; for (let i = segs.length - 1; i >= 0; i--) { if (!f || !((f.name || '').toLowerCase().includes(segs[i]))) { ok = false; break; } f = f.parent; } if (ok) return true; a = a.parent; } return false; })()`;
}

/**
 * Emit an OmniJS boolean expression that is `true` iff `flattenedFolders` contains at
 * least one folder whose ancestry matches `path` — i.e. the folder reference RESOLVES.
 *
 * OMN-218 fix (b): the read `folder` filter is a per-row predicate that silently returns
 * `false` when nothing matches, so an unresolvable folder reference is indistinguishable
 * from a genuinely empty folder. Callers use this guard to fail LOUDLY (FOLDER_NOT_FOUND)
 * before the row loop, mirroring the write path's `"Folder not found"` guard.
 *
 * Uses the SAME per-folder chain predicate as `emitFolderPathMatch`, so:
 *   - the path resolves iff at least one row could match it (no semantic drift), and
 *   - an existing-but-empty folder still RESOLVES (it is itself in `flattenedFolders`),
 *     keeping "empty ≠ unresolvable".
 */
export function emitFolderExistsGuard(path: string): string {
  const segsLiteral = JSON.stringify(parseFolderFilterPath(path));
  return `flattenedFolders.some((__omn218f) => ${emitFolderChainPredicate('__omn218f', segsLiteral)})`;
}

/**
 * Emit a complete OmniJS guard STATEMENT for the top of a read script's row loop:
 * if `path` resolves to no folder, `return` a `{ error:true, ... }` envelope carrying
 * `details.code === 'FOLDER_NOT_FOUND'` — instead of iterating and returning an empty set.
 *
 * OMN-218 fix (b). The `code` rides in `details` (not top-level) because the wire error
 * dialect (`detectKnownErrorShape`, `{error:true}` branch) preserves only `message` +
 * `details`; the tool layer maps `details.code === 'FOLDER_NOT_FOUND'` → a NOT_FOUND error.
 * Shared by both read builders (tasks + projects) so the envelope shape can't drift.
 *
 * Callers must emit this ONLY for a non-empty string folder PATH — never for `folder:null`
 * (top-level), which is a different flag and must keep returning empty-set success.
 */
export function emitFolderNotFoundGuard(path: string): string {
  const message = `Folder not found: ${path}. Verify the folder exists; both ':' and '/' separators are accepted.`;
  return `if (!(${emitFolderExistsGuard(path)})) { return JSON.stringify({ error: true, message: ${JSON.stringify(
    message,
  )}, details: { code: 'FOLDER_NOT_FOUND', folder: ${JSON.stringify(path)} } }); }`;
}

/** A filter shape carrying a string-keyed folder-path field plus optional OR branches of itself. */
type FilterWithFolderAndOr<K extends string> = { orBranches?: FilterWithFolderAndOr<K>[] } & {
  [P in K]?: string | boolean | null;
};

/**
 * Recursively collect every distinct non-empty string folder-PATH value referenced
 * anywhere in `filter` — the top-level `key` plus `key` on every (possibly nested)
 * `orBranches` entry. Boolean/null values (e.g. `folderTopLevel`, `folder: null`) are
 * ignored — only string paths need an existence check.
 */
function collectFolderPaths<K extends string>(filter: FilterWithFolderAndOr<K> | undefined, key: K): string[] {
  if (!filter) return [];
  const paths: string[] = [];
  const top = filter[key];
  if (typeof top === 'string' && top.length > 0) paths.push(top);
  if (Array.isArray(filter.orBranches)) {
    for (const branch of filter.orBranches) {
      paths.push(...collectFolderPaths(branch, key));
    }
  }
  return paths;
}

/**
 * Emit the FOLDER_NOT_FOUND guard for every distinct folder path referenced ANYWHERE in
 * `filter` — the top-level filter and any (possibly nested) `orBranches` entries.
 *
 * OMN-218 (review round 2): a folder value nested in an OR branch — e.g.
 * `{ OR: [{ folder: "Typo" }, { flagged: true }] }` — used to be invisible to the guard
 * (only the top-level key was checked), so an unresolvable folder inside an OR branch
 * silently contributed zero matches instead of failing loudly. Single source of truth
 * for the "does this filter reference a folder path?" question, so tasks-list,
 * projects-list, tasks-count, and inbox all derive the guard identically — no triplicated
 * ternaries to drift out of sync.
 *
 * `key` is `'folder'` for task filters, `'folderName'` for project filters.
 */
export function emitFolderNotFoundGuardsForFilter<K extends string>(
  filter: FilterWithFolderAndOr<K> | undefined,
  key: K,
): string {
  const uniquePaths = [...new Set(collectFolderPaths(filter, key))];
  return uniquePaths.map((path) => emitFolderNotFoundGuard(path)).join('\n');
}

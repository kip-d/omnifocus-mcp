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

const FOLDER_PATH_SEPARATOR = ':';

/**
 * Parse a user folder path into lowercased, trimmed segments (leaf last).
 *
 * `"Development"`          → `['development']`        (bare name = single-segment path)
 * `"Personal : Bills"`     → `['personal', 'bills']`  (leaf segment last)
 *
 * Throws on an empty segment (`" : B"`, `"A : "`, `"A : : B"`) so the compiler can
 * surface a steering VALIDATION_ERROR rather than silently matching nothing.
 *
 * Limitation: a literal `:` in a folder name is not escapable — a folder named
 * `"A:B"` parses as two segments. Documented, acceptable (no existing escape
 * mechanism; rare).
 */
export function parseFolderPath(path: string): string[] {
  const segments = path.split(FOLDER_PATH_SEPARATOR).map((s) => s.trim().toLowerCase());
  if (segments.some((s) => s.length === 0)) {
    throw new Error(
      `Invalid folder path "${path}": segments cannot be empty. Use "Parent : Child" with non-empty names.`,
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
  const segs = parseFolderPath(path);
  const segsLiteral = JSON.stringify(segs);
  // One template literal (not concatenated parts) so the embedded OmniJS `''`
  // empty-string literals don't fight the lint quote rule. Whitespace in the
  // generated source is irrelevant.
  return `(() => { const segs = ${segsLiteral}; let a = (${leafFolderExpr}); while (a) { let f = a, ok = true; for (let i = segs.length - 1; i >= 0; i--) { if (!f || !((f.name || '').toLowerCase().includes(segs[i]))) { ok = false; break; } f = f.parent; } if (ok) return true; a = a.parent; } return false; })()`;
}

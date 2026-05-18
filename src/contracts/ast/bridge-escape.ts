/** Escape a string for safe embedding inside a JXA backtick template literal. */
export function escapeTemplateString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/**
 * Make a human filter description safe inside a single-line `//` comment within
 * a bridge template. escapeTemplateString handles backtick/${ /backslash but
 * NOT newlines; a CR/LF (or other control char) would split the `//` line and
 * break the OmniJS parse even after whole-source escaping. Collapse any run of
 * C0 control chars (incl. CR/LF/tab) and DEL to one space; trim.
 */
export function sanitizeForScriptComment(desc: string): string {
  // eslint-disable-next-line no-control-regex
  return desc.replace(/[\x00-\x1f\x7f]+/g, ' ').trim();
}

/**
 * Escape ONLY the JS template-literal hazards (backtick and ${) — NOT
 * backslash. Use on a value already produced by JSON.stringify (whose
 * backslashes are final); adding backslash-escaping here would double-escape
 * and corrupt the literal. For raw (non-JSON-stringified) text use
 * escapeTemplateString instead.
 */
export function escapeTemplateLiteralHazards(s: string): string {
  return s.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/** Escape a string for safe embedding inside a JXA backtick template literal. */
export function escapeTemplateString(str: string): string {
  return escapeTemplateLiteralHazards(str.replace(/\\/g, '\\\\'));
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

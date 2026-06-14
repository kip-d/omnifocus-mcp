/**
 * OMN-129: the read side now crosses the JXA→OmniJS boundary exactly as the write
 * side does — `app.evaluateJavascript(${JSON.stringify(program)})` — so the program
 * rides inside a single JSON string literal. JSON.stringify escapes every quote,
 * backslash, newline, control char, and unicode per the JS spec, which deletes the
 * nested-backtick + hand-rolled-escaper mechanism behind OMN-111/113 outright. The
 * old `escapeTemplateString` / `escapeTemplateLiteralHazards` helpers are therefore
 * retired; this module now carries only the comment-line guard below.
 *
 * sanitizeForScriptComment is STILL load-bearing after the boundary fix: the
 * boundary JSON.stringify protects the OUTER JS string literal, but the inner OmniJS
 * that OmniFocus compiles sees the separator restored. A raw line terminator inside a
 * `// Filter:` comment would split it into live code even with the JSON.stringify
 * boundary in place — so line terminators must still be scrubbed before they reach a
 * comment line.
 */

/**
 * Make a human filter description safe inside a single-line `//` comment within a
 * bridge program. Any JS LineTerminator would split the `//` line and break (or
 * inject into) the OmniJS the bridge compiles — and JS has FOUR: CR, LF, U+2028
 * (line separator) and U+2029 (paragraph separator). JSON.stringify at the boundary
 * leaves U+2028/U+2029 literal (they are not JSON control chars) and they are valid
 * inside the OUTER string literal, so they slip past the boundary and only bite when
 * OmniFocus compiles the inner program — exactly the OMN-111/113 comment channel via
 * a Unicode separator (surfaced by the OMN-129 fuzz). Collapse any run of C0 control
 * chars (incl. CR/LF/tab), DEL, and U+2028/U+2029 to one space; trim.
 */
export function sanitizeForScriptComment(desc: string): string {
  // eslint-disable-next-line no-control-regex
  return desc.replace(/[\x00-\x1f\x7f\u2028\u2029]+/g, ' ').trim();
}

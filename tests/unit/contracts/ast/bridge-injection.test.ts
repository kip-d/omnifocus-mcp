import { describe, it, expect } from 'vitest';
import {
  buildFilteredProjectsScript,
  buildProjectByIdScript,
  buildExportTasksScript,
  buildFilteredFoldersScript,
  buildTaskCountScript,
} from '../../../../src/contracts/ast/script-builder.js';
import { buildListTasksScriptV4 } from '../../../../src/omnifocus/scripts/tasks/list-tasks-ast.js';

const NL = String.fromCharCode(10); // a real newline
const BS = 'a\\b'; // literal single backslash: the 3-char string a \ b
const HOSTILE = ['a`b', 'a${x}b', 'a' + NL + 'b', BS];

function parses(script: string): boolean {
  try {
    new Function(script);
    return true;
  } catch {
    return false;
  }
}

// A parse-only check (`new Function`) only sees the OUTER JXA wrapper — the
// inner OmniJS is an opaque string to it, so it ONLY catches the backtick
// structural break. The ${x} (eval-time) and newline (comment-split) channels
// are invisible to parse alone. So additionally assert the hostile payload
// never appears RAW in the generated script — only in escaped/sanitized form.
// That assertion is what gives genuine RED→GREEN for the ${ and \n channels.
function assertSafe(script: string, v: string) {
  expect(parses(script)).toBe(true); // backtick structural channel
  if (v === 'a`b') {
    expect(script.includes('a`b')).toBe(false); // no raw unescaped backtick payload
    expect(script.includes('a\\`b')).toBe(true); // present only as \`
  } else if (v === 'a${x}b') {
    expect(script.includes('a${x}b')).toBe(false); // no raw live ${x}
    expect(script.includes('a\\${x}b')).toBe(true); // present only as \${x}
  } else if (v.includes(NL)) {
    expect(script.includes('a' + NL + 'b')).toBe(false); // no raw LF-bearing payload
    // (comment channel → sanitized to "a b"; predicate channel → JSON-escaped "a\\nb")
  } else if (v === BS) {
    // A literal backslash round-trips through TWO correct escape layers:
    //   1. JSON.stringify(predicate value)  : a\b   → a\\b   (JSON doubling)
    //   2. escapeTemplateString(whole src)  : a\\b  → a\\\\b (template doubling)
    // So quadruple-backslash in the generated TEXT is the CORRECT single-pass
    // result, not corruption. The double-escape *bug* signature would be a
    // further doubling to EIGHT backslashes — assert that never appears.
    // `parses()` above is the load-bearing check: any escape that unbalanced
    // the outer template literal would have thrown there.
    expect(script.includes('a\\\\\\\\\\\\\\\\b')).toBe(false); // no 8x (double-escape)
  }
}

describe('OMN-65: bridge builders survive hostile filter strings', () => {
  for (const v of [...HOSTILE, 'benign_abc']) {
    const tag = JSON.stringify(v);
    // comment-channel + predicate-channel builders (free text via `text`):
    it(`buildTaskCountScript text=${tag}`, () => assertSafe(buildTaskCountScript({ text: v }).script, v));
    it(`buildFilteredProjectsScript text=${tag}`, () => assertSafe(buildFilteredProjectsScript({ text: v }).script, v));
    // ExportFilter exposes free text as `search` (NOT `text` — TS2353 otherwise):
    it(`buildExportTasksScript search=${tag}`, () => assertSafe(buildExportTasksScript({ search: v }).script, v));
    // predicate-only builders (no in-body comment channel):
    // OMN-170 S2: folders filter free text via `filter.name` (the old `search`
    // string option was removed; the name predicate routes through the same
    // escapeTemplateString-wrapped omniJsSource).
    it(`buildFilteredFoldersScript name=${tag}`, () =>
      assertSafe(buildFilteredFoldersScript({ filter: { name: v, nameOperator: 'CONTAINS' } }).script, v));
    it(`buildProjectByIdScript projectId=${tag}`, () => assertSafe(buildProjectByIdScript(v).script, v));
  }
});

// OMN-66: the list-tasks-ast.ts path was scoped OUT of OMN-65 because its
// backtick/${ vectors are already neutralized by the whole-source
// escapeTemplateString wrap at list-tasks-ast.ts:89. But that wrap
// deliberately does NOT touch CR/LF/control chars — so a raw newline in
// the user `text` filter could still split the `// Filter:` comment line.
// Exercise the production entry point (buildListTasksScriptV4) so the test
// runs against the wrapped form OmniFocus actually executes, not the
// inner unwrapped builder output. Covers both the general-filter and
// inbox routes since they share generateMatchesFilterBlock.
describe('OMN-66: list-tasks-ast comment channel survives hostile filter strings', () => {
  for (const v of [...HOSTILE, 'benign_abc']) {
    const tag = JSON.stringify(v);
    it(`buildListTasksScriptV4 general filter text=${tag}`, () =>
      assertSafe(buildListTasksScriptV4({ filter: { text: v } }), v));
    it(`buildListTasksScriptV4 inbox mode text=${tag}`, () =>
      assertSafe(buildListTasksScriptV4({ filter: { text: v }, mode: 'inbox' }), v));
  }
});

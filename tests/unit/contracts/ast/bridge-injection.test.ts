import { describe, it, expect } from 'vitest';
import {
  buildFilteredProjectsScript,
  buildProjectByIdScript,
  buildExportTasksScript,
  buildFilteredFoldersScript,
  buildTaskCountScript,
} from '../../../../src/contracts/ast/script-builder.js';

const NL = String.fromCharCode(10); // a real newline
const HOSTILE = ['a`b', 'a${x}b', 'a' + NL + 'b'];

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
    it(`buildFilteredFoldersScript search=${tag}`, () =>
      assertSafe(buildFilteredFoldersScript({ search: v }).script, v));
    it(`buildProjectByIdScript projectId=${tag}`, () => assertSafe(buildProjectByIdScript(v).script, v));
  }
});

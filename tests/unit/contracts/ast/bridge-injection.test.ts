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

// OMN-129: the read side now crosses the JXA→OmniJS boundary the same way the
// write side does — `app.evaluateJavascript(${JSON.stringify(program)})` — so the
// program rides inside a JSON string literal, not a hand-escaped nested backtick.
// Recover every program string that the generated JXA hands across the boundary
// (recursing, since list-tasks nests one program inside another). A JSON-string
// argument is the proof the retrofit landed; the old backtick boundary passed an
// `omniJsScript` identifier and yields nothing here.
function recoverInnerPrograms(script: string): string[] {
  const out: string[] = [];
  const marker = 'evaluateJavascript(';
  let i = 0;
  while ((i = script.indexOf(marker, i)) !== -1) {
    let j = i + marker.length;
    while (j < script.length && /\s/.test(script[j]!)) j++;
    if (script[j] !== '"') {
      i = j; // not a JSON-string argument (e.g. the old `evaluateJavascript(omniJsScript)`)
      continue;
    }
    // Read one JSON string literal starting at j, honoring \" escapes.
    let k = j + 1;
    let lit = '"';
    while (k < script.length) {
      const ch = script[k]!;
      lit += ch;
      if (ch === '\\') {
        lit += script[k + 1] ?? '';
        k += 2;
        continue;
      }
      if (ch === '"') {
        k++;
        break;
      }
      k++;
    }
    try {
      const inner = JSON.parse(lit);
      out.push(inner);
      out.push(...recoverInnerPrograms(inner)); // nested boundary (list-tasks)
    } catch {
      // not a recoverable JSON string; skip
    }
    i = k;
  }
  return out;
}

// Under the JSON.stringify(program) boundary, backtick and ${ are inert — they
// live inside a JSON string literal and again inside an OmniJS string literal, so
// neither can break structure. `parses` is therefore the structural oracle for
// those channels. The newline/comment channel still has teeth: the boundary
// JSON.stringify escapes the OUTER string, but the inner OmniJS that OmniFocus
// compiles sees the LF restored — a raw LF in a `// Filter:` comment would split
// it into live code. sanitizeForScriptComment is what keeps that payload
// single-line, so we assert it against the RECOVERED inner program (where the LF
// is unescaped), not the outer text (where the boundary escaping hides it).
function assertSafe(script: string, _v: string) {
  expect(parses(script)).toBe(true); // outer structural validity (all channels)

  const inners = recoverInnerPrograms(script);
  expect(inners.length).toBeGreaterThan(0); // boundary is the JSON-string form

  for (const inner of inners) {
    expect(parses(inner)).toBe(true); // each recovered program is itself valid JS
    // OMN-111/113 comment channel: the hostile LF-bearing payload must not survive
    // contiguously into the compiled program (sanitized to a space in the comment,
    // JSON-escaped to `a\nb` in the predicate string).
    expect(inner.includes('a' + NL + 'b')).toBe(false);
  }
}

describe('OMN-65/OMN-129: bridge builders survive hostile filter strings', () => {
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
    // omniJsSource that now crosses via JSON.stringify).
    it(`buildFilteredFoldersScript name=${tag}`, () =>
      assertSafe(buildFilteredFoldersScript({ filter: { name: v, nameOperator: 'CONTAINS' } }).script, v));
    it(`buildProjectByIdScript projectId=${tag}`, () => assertSafe(buildProjectByIdScript(v).script, v));
  }
});

// OMN-66: the list-tasks-ast.ts path nests one program inside another (the JXA
// wrapper hands buildFilteredTasksScript's output across the boundary, and that
// output crosses a second boundary internally). recoverInnerPrograms recurses, so
// both levels are validated. The newline/comment channel is the live concern:
// JSON.stringify guards the outer literals, sanitizeForScriptComment guards the
// `// Filter:` line. Covers the general-filter and inbox routes.
describe('OMN-66/OMN-129: list-tasks-ast survives hostile filter strings', () => {
  for (const v of [...HOSTILE, 'benign_abc']) {
    const tag = JSON.stringify(v);
    it(`buildListTasksScriptV4 general filter text=${tag}`, () =>
      assertSafe(buildListTasksScriptV4({ filter: { text: v } }), v));
    it(`buildListTasksScriptV4 inbox mode text=${tag}`, () =>
      assertSafe(buildListTasksScriptV4({ filter: { text: v }, mode: 'inbox' }), v));
  }
});

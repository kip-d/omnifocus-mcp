import { describe, it, expect } from 'vitest';
import {
  buildFilteredProjectsScript,
  buildTaskCountScript,
  buildFilteredFoldersScript,
} from '../../../../src/contracts/ast/script-builder.js';
import { buildTagsScript } from '../../../../src/contracts/ast/tag-script-builder.js';
import { buildListTasksScriptV4 } from '../../../../src/omnifocus/scripts/tasks/list-tasks-ast.js';
import { dispatchMutation, emitProgram } from '../../../../src/contracts/ast/mutation/index.js';
import { SNIPPETS } from '../../../../src/contracts/ast/mutation/snippets.js';
import { recoverInnerPrograms } from '../../../utils/recover-bridge-program.js';

// OMN-129 (JesKingDev CONCERNS.md, Security Considerations): JSON.stringify escapes
// quoting/structural hazards but does NOT strip Unicode direction-control or
// zero-width characters — they survive into generated source. Existing coverage
// (bridge-injection.test.ts) targets the backtick/${/newline vectors; this file
// covers the directional / zero-width / line-separator class across the read
// boundary and the tag-path parsers that feed script generation. The safety
// contract is: these chars must ride as inert string DATA (script parses, recovered
// program parses, char round-trips) — never break structure or become code.
//
// This file surfaced a real, pre-existing gap: U+2028/U+2029 (the JS line/paragraph
// separators) are not C0 control chars, so JSON.stringify leaves them literal and
// they pass the boundary, but they ARE JS LineTerminators — an un-scrubbed one in a
// `// Filter:` comment splits it into live code when OmniFocus compiles the program.
// The fix extended sanitizeForScriptComment to strip them (see bridge-escape.ts).

// Built via charCode so no invisible / irregular-whitespace literals live in this
// source file (and the chars survive editing/transform unchanged).
const cc = (hex: number): string => String.fromCharCode(hex);
const HAZARDS: ReadonlyArray<readonly [string, string]> = [
  ['RLO U+202E', cc(0x202e)], // right-to-left override (directional)
  ['LRI U+2066', cc(0x2066)], // left-to-right isolate (directional)
  ['ZWSP U+200B', cc(0x200b)], // zero-width space
  ['ZWJ U+200D', cc(0x200d)], // zero-width joiner
  ['BOM U+FEFF', cc(0xfeff)], // zero-width no-break space
  ['LS U+2028', cc(0x2028)], // line separator
  ['PS U+2029', cc(0x2029)], // paragraph separator
];

function parses(script: string): boolean {
  try {
    new Function(script);
    return true;
  } catch {
    return false;
  }
}

describe('OMN-129: read boundary survives Unicode direction-control / zero-width chars', () => {
  for (const [label, ch] of HAZARDS) {
    const term = 'a' + ch + 'b';

    const cases: ReadonlyArray<readonly [string, string]> = [
      ['buildFilteredProjectsScript', buildFilteredProjectsScript({ text: term }).script],
      ['buildTaskCountScript', buildTaskCountScript({ text: term }).script],
      [
        'buildFilteredFoldersScript',
        buildFilteredFoldersScript({ filter: { name: term, nameOperator: 'CONTAINS' } }).script,
      ],
      ['buildTagsScript(basic)', buildTagsScript({ mode: 'basic', name: term, nameOperator: 'CONTAINS' }).script],
      ['buildListTasksScriptV4', buildListTasksScriptV4({ filter: { text: term } })],
    ];

    for (const [builder, script] of cases) {
      it(`${builder} — ${label} rides as inert data`, () => {
        // Outer JXA wrapper parses (structural channel).
        expect(parses(script)).toBe(true);
        // Every recovered OmniJS program parses and carries the term verbatim — the
        // char survived as a string value, not as code that broke the program. For the
        // comment-bearing builders (FilteredProjects/TaskCount/ListTasks) parses(inner)
        // is the assertion that bit on U+2028/U+2029 before the sanitize fix: an
        // unscrubbed separator split the `// Filter:` line, orphaning the closing quote
        // into a syntax error. For the predicate-only builders (folders/tags) there is
        // no comment channel, so parses(inner) confirms inertness inside string literals
        // and the round-trip below is the load-bearing data-fidelity check.
        const inners = recoverInnerPrograms(script);
        expect(inners.length).toBeGreaterThan(0);
        for (const inner of inners) {
          expect(parses(inner)).toBe(true);
        }
        // At least one recovered program preserves the exact term (data fidelity).
        expect(inners.some((p) => p.includes(term))).toBe(true);
      });
    }
  }
});

describe('OMN-129: parseTagPath runtime snippet handles Unicode hazards without injection', () => {
  // The snippet runs inside OmniFocus; it uses no OmniFocus globals, so it can be
  // exercised directly in Node via `new Function`.
  const parseTagPath = new Function(`${SNIPPETS.parseTagPath!.source}\nreturn parseTagPath;`)() as (
    input: string,
  ) => string[] | null;

  for (const [label, ch] of HAZARDS) {
    it(`splits a path whose segment carries ${label} and preserves the char`, () => {
      const segs = parseTagPath('Parent : Chi' + ch + 'ld');
      expect(segs).toEqual(['Parent', 'Chi' + ch + 'ld']);
    });
  }

  it('a non-whitespace zero-width segment is not treated as empty', () => {
    // ZWSP is a real codepoint, not stripped by .trim(), so the segment is non-empty.
    const zwsp = cc(0x200b);
    const segs = parseTagPath('Parent : ' + zwsp);
    expect(segs).toEqual(['Parent', zwsp]);
  });
});

describe('OMN-129: build-time tag-path parsing emits hazard chars as inert data', () => {
  for (const [label, ch] of HAZARDS) {
    it(`create/tag with a ${label}-bearing name emits a parseable program carrying the char`, async () => {
      const name = 'a' + ch + 'b';
      const program = await dispatchMutation('create/tag', { tagName: name });
      const omnijs = emitProgram(program);
      // The emitted OmniJS parses (the char is inside JSON.stringify'd string literals).
      expect(parses(omnijs)).toBe(true);
      expect(omnijs.includes(name)).toBe(true);
    });
  }
});

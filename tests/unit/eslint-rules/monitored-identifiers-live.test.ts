import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// OMN-54 meta-check: every identifier annotated with `// MONITORS: ...` in
// eslint-rules/index.js must have at least one non-import occurrence in src/.
//
// A monitored identifier with zero src/ occurrences means either the rule is
// dead (codebase migrated away — rule silently produces zero diagnostics) or
// the symbol was renamed/removed without the rule being updated. Either way,
// the lint rule is enforcing nothing real. This test fails loudly when that
// happens. Precedent: PR #3 / commit f2d04e8 (metadata-snake-case listed only
// V1 builder names while the codebase was fully on V2; rule produced zero
// diagnostics until V2 names were added).
//
// AST-parsing the rule file was rejected in favor of explicit annotations —
// authors of new rules opt in by adding a `// MONITORS:` comment next to the
// monitored Set/RegExp/Map. The convention is documented in eslint-rules/index.js.

const REPO_ROOT = join(fileURLToPath(import.meta.url), '../../../..');
const RULE_FILE = join(REPO_ROOT, 'eslint-rules/index.js');
const SRC_DIR = join(REPO_ROOT, 'src');

function extractMonitoredIdentifiers(ruleFileContents: string): string[] {
  const out: string[] = [];
  const re = /\/\/\s*MONITORS:\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ruleFileContents)) !== null) {
    for (const raw of m[1].split(',')) {
      const id = raw.trim();
      if (id) out.push(id);
    }
  }
  return out;
}

function* walkTypescriptFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTypescriptFiles(full);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      yield full;
    }
  }
}

// Lines whose trimmed form matches this pattern are interior members of a
// multi-line `import { … } from …` or `export { … } from …` block, e.g.:
//   import {
//     createErrorResponseV2,            // ← matches
//     type StandardResponseV2,          // ← matches
//     createSuccessResponseV2 as alias, // ← matches
//   } from '../../utils/response-format.js';
// Real usages never look like a bare identifier on its own line — they
// involve `=`, `(`, `.`, `:`, `<`, `extends`, etc.
const BARE_IMPORT_MEMBER = /^(?:type\s+)?[\w$]+(?:\s+as\s+[\w$]+)?\s*,?\s*(?:\/\/.*)?$/;

function hasNonImportOccurrence(identifier: string, srcDir: string): boolean {
  const re = new RegExp(`\\b${identifier}\\b`);
  for (const file of walkTypescriptFiles(srcDir)) {
    const contents = readFileSync(file, 'utf8');
    if (!re.test(contents)) continue;
    for (const line of contents.split('\n')) {
      if (!re.test(line)) continue;
      const trimmed = line.trim();
      // Skip ES module import/re-export headers, `from '…'` continuations,
      // and bare-identifier interior lines of multi-line import/export braces.
      // None of these represent real usage; the rule is dead even if a stray
      // import lingers.
      if (
        trimmed.startsWith('import ') ||
        trimmed.startsWith('export {') ||
        trimmed.startsWith('export * ') ||
        trimmed.startsWith('export type {') ||
        trimmed.startsWith('} from ') ||
        trimmed.startsWith('from ') ||
        BARE_IMPORT_MEMBER.test(trimmed)
      ) {
        continue;
      }
      return true;
    }
  }
  return false;
}

describe('OMN-54: eslint-rules monitored-identifier meta-check', () => {
  const ruleSource = readFileSync(RULE_FILE, 'utf8');
  const monitored = extractMonitoredIdentifiers(ruleSource);

  it('rule file declares at least one MONITORS annotation', () => {
    // Sanity guard: if every annotation gets accidentally deleted, the test
    // would otherwise pass with zero work — vacuous green. Require ≥1 so the
    // check can't disappear silently. Today there are 3 monitored sets in
    // eslint-rules/index.js (RESPONSE_CONTRACT_TYPES, VALID_SINK,
    // METADATA_ARG_INDEX); 9 identifiers total.
    expect(monitored.length).toBeGreaterThan(0);
  });

  for (const id of monitored) {
    it(`monitored identifier "${id}" has at least one non-import occurrence in src/`, () => {
      const live = hasNonImportOccurrence(id, SRC_DIR);
      if (!live) {
        throw new Error(
          `Monitored ESLint-rule identifier "${id}" has zero non-import occurrences in src/. ` +
            'Either the rule is dead (codebase migrated away — rule produces zero diagnostics) ' +
            'or the symbol was renamed/removed without updating eslint-rules/index.js. ' +
            'Update or remove the // MONITORS: annotation in eslint-rules/index.js.',
        );
      }
      expect(live).toBe(true);
    });
  }
});

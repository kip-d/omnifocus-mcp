import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const filesRequiringEscapedJoins = [
  // All files that previously needed this check have been archived or deleted:
  // - minimal-tag-bridge.ts: deleted 2026-01-04 (unused, tag logic now inline in mutation-script-builder)
  // - list-tasks-omnijs.ts: archived 2025-12-17 (replaced by AST-powered list-tasks-ast.ts)
  // - update-task-v3.ts: archived 2025-12-17 (replaced by AST mutation builder)
  // - analyze-recurring-tasks.ts: archived 2025-12-18 (replaced by AST-powered analyze-recurring-tasks-ast.ts)
];

describe('JXA script join escaping', () => {
  const forbiddenPattern = /\.join\((['"])\\n\1\)/g;

  it('guard pattern is documented for future scripts', () => {
    // This test ensures the guard pattern remains documented.
    // When adding new JXA scripts with .join() calls, add them to
    // filesRequiringEscapedJoins to verify they use '\\n' not '\n'
    expect(forbiddenPattern.source).toContain('join');
  });

  for (const relativePath of filesRequiringEscapedJoins) {
    it(`uses double-escaped newline joiner in ${relativePath}`, () => {
      const filePath = path.resolve(process.cwd(), relativePath);
      const contents = readFileSync(filePath, 'utf8');
      const matches = contents.match(forbiddenPattern);
      expect(matches ?? []).toHaveLength(0);
    });
  }
});

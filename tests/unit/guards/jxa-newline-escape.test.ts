import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const filesRequiringEscapedJoins = [
  'src/omnifocus/scripts/recurring/analyze-recurring-tasks.ts',
  'src/omnifocus/scripts/shared/minimal-tag-bridge.ts',
  'src/omnifocus/scripts/tasks/list-tasks.ts',
  'src/omnifocus/scripts/tasks/update-task.ts',
];

describe('JXA script join escaping', () => {
  const forbiddenPattern = /\.join\((['"])\\n\1\)/g;

  for (const relativePath of filesRequiringEscapedJoins) {
    it(`uses double-escaped newline joiner in ${relativePath}`, () => {
      const filePath = path.resolve(process.cwd(), relativePath);
      const contents = readFileSync(filePath, 'utf8');
      const matches = contents.match(forbiddenPattern);
      expect(matches ?? []).toHaveLength(0);
    });
  }
});

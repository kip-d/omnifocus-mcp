// tests/unit/diagnostics/analyze-cli-golden.test.ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Drives the CLI against a fixture HOME so output is deterministic.
function runCli(homeOverride: string): string {
  return execFileSync('npx', ['tsx', 'scripts/analyze-tool-failures.ts', '--days=3650'], {
    env: { ...process.env, HOME: homeOverride },
    encoding: 'utf-8',
  });
}

describe('analyze-failures CLI output is behavior-preserving', () => {
  it('produces identical output before/after the module refactor (golden)', () => {
    const home = mkdtempSync(join(tmpdir(), 'omn37-'));
    const dir = join(home, '.omnifocus-mcp', 'tool-failures');
    mkdirSync(dir, { recursive: true });
    const rows = [
      {
        timestamp: '2026-05-18T10:00:00.000Z',
        tool: 'omnifocus_write',
        errorType: 'VALIDATION_ERROR',
        errorMessage: 'name: Required for task a1b2c3d4e5',
        validationErrors: [{ path: ['name'], message: 'Required' }],
        inputArgs: { flagged: true },
        schemaDescription: 'd',
      },
      {
        timestamp: '2026-05-18T11:00:00.000Z',
        tool: 'omnifocus_write',
        errorType: 'VALIDATION_ERROR',
        errorMessage: 'name: Required for task f9e8d7c6b5',
        validationErrors: [{ path: ['name'], message: 'Required' }],
        inputArgs: { flagged: false },
        schemaDescription: 'd',
      },
    ];
    writeFileSync(join(dir, 'failures-2026-05-18.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    expect(runCli(home)).toMatchSnapshot();
  });
});

// tests/unit/diagnostics/marker-script.test.ts
//
// Verifies that scripts/mcp-failure-marker.sh:
//  1. Appends exactly one ISO8601<TAB>tool line per invocation.
//  2. Does NOT contain `claude -p` (must never spawn an agent).
//
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const SCRIPT = resolve(process.cwd(), 'scripts/mcp-failure-marker.sh');

describe('mcp-failure-marker.sh', () => {
  it('does NOT contain `claude -p` (must never spawn an agent)', () => {
    const src = readFileSync(SCRIPT, 'utf-8');
    expect(src).not.toMatch(/claude\s+-p/);
  });

  it('appends exactly one ISO8601<TAB>tool line per invocation', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'omn37-marker-'));
    const markerFile = join(tmpDir, 'fresh-failures.tsv');

    execFileSync('bash', [SCRIPT, 'omnifocus_read'], {
      env: { ...process.env, OMN37_MARKER: markerFile },
    });

    expect(existsSync(markerFile)).toBe(true);
    const lines = readFileSync(markerFile, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(1);

    // Each line must be ISO8601<TAB>tool
    const [ts, tool] = lines[0].split('\t');
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(tool).toBe('omnifocus_read');
  });

  it('appends a second line on the second call (never overwrites)', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'omn37-marker2-'));
    const markerFile = join(tmpDir, 'fresh-failures.tsv');

    execFileSync('bash', [SCRIPT, 'omnifocus_write'], {
      env: { ...process.env, OMN37_MARKER: markerFile },
    });
    execFileSync('bash', [SCRIPT, 'omnifocus_analyze'], {
      env: { ...process.env, OMN37_MARKER: markerFile },
    });

    const lines = readFileSync(markerFile, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('omnifocus_write');
    expect(lines[1]).toContain('omnifocus_analyze');
  });
});

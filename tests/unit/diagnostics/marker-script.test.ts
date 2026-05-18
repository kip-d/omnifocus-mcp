// tests/unit/diagnostics/marker-script.test.ts
//
// Verifies that scripts/mcp-failure-marker.sh:
//  1. Reads tool_name from the stdin JSON payload (the way Claude Code's
//     command-type hook runner actually invokes it — NOT a positional arg).
//  2. Appends exactly one ISO8601<TAB>tool line per invocation.
//  3. Never spawns an agent (`claude -p` absent from the script source).
//  4. Fails silently (exit 0, no throw) on empty / non-JSON stdin.
//
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const SCRIPT = resolve(process.cwd(), 'scripts/mcp-failure-marker.sh');

// Drive the script the way the real hook runner does: JSON piped to stdin.
function runHook(payload: object, markerFile: string): void {
  execFileSync('bash', [SCRIPT], {
    input: JSON.stringify(payload),
    env: { ...process.env, OMN37_MARKER: markerFile },
  });
}

describe('mcp-failure-marker.sh', () => {
  it('does NOT contain `claude -p` (must never spawn an agent)', () => {
    const src = readFileSync(SCRIPT, 'utf-8');
    expect(src).not.toMatch(/claude\s+-p/);
  });

  it('reads tool_name from stdin JSON and appends one ISO8601<TAB>tool line', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'omn37-marker-'));
    const markerFile = join(tmpDir, 'fresh-failures.tsv');

    runHook({ hook_event_name: 'PostToolUse', tool_name: 'mcp__omnifocus__omnifocus_read' }, markerFile);

    expect(existsSync(markerFile)).toBe(true);
    const lines = readFileSync(markerFile, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(1);

    const [ts, tool] = lines[0].split('\t');
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(tool).toBe('mcp__omnifocus__omnifocus_read');
  });

  it('appends a second line on the second call (never overwrites)', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'omn37-marker2-'));
    const markerFile = join(tmpDir, 'fresh-failures.tsv');

    runHook({ hook_event_name: 'PostToolUse', tool_name: 'mcp__omnifocus__omnifocus_write' }, markerFile);
    runHook({ hook_event_name: 'PostToolUse', tool_name: 'mcp__omnifocus__omnifocus_analyze' }, markerFile);

    const lines = readFileSync(markerFile, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('mcp__omnifocus__omnifocus_write');
    expect(lines[1]).toContain('mcp__omnifocus__omnifocus_analyze');
  });

  it('fails silently on empty stdin: exits 0, appends an empty tool field, does not throw', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'omn37-marker-empty-'));
    const markerFile = join(tmpDir, 'fresh-failures.tsv');

    // Empty stdin — must not throw (execFileSync throws on non-zero exit).
    expect(() =>
      execFileSync('bash', [SCRIPT], {
        input: '',
        env: { ...process.env, OMN37_MARKER: markerFile },
      }),
    ).not.toThrow();

    const lines = readFileSync(markerFile, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(1);
    // Timestamp present, tool field empty (script appends the row, does not skip).
    const [ts, tool] = lines[0].split('\t');
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(tool ?? '').toBe('');
  });

  it('fails silently on non-JSON stdin: exits 0, does not throw', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'omn37-marker-junk-'));
    const markerFile = join(tmpDir, 'fresh-failures.tsv');

    expect(() =>
      execFileSync('bash', [SCRIPT], {
        input: 'this is not json {{{',
        env: { ...process.env, OMN37_MARKER: markerFile },
      }),
    ).not.toThrow();
  });
});

/**
 * Integration tests for analytics and system commands (stats, version, doctor, cache).
 *
 * Runs the built CLI binary against real OmniFocus to verify end-to-end behavior.
 * Requires OmniFocus to be running and the project to be built (`npm run build`).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_DIR = resolve(import.meta.dirname, '..', '..', '..');
const CLI_ENTRY = resolve(CLI_DIR, 'dist', 'index.js');

/** Run CLI with an array of arguments (avoids split-on-space quoting issues). */
function run(args: string[]): string {
  return execFileSync('node', [CLI_ENTRY, ...args], {
    cwd: CLI_DIR,
    encoding: 'utf-8',
    timeout: 120_000,
  });
}

describe('Analytics and system commands', () => {
  it('omnifocus stats returns productivity metrics', () => {
    const output = run(['stats', '--format', 'json']);
    const result = JSON.parse(output);
    // Result should have stats fields from the productivityStats bridge script
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  }, 120_000);

  it('omnifocus version returns version info', () => {
    const output = run(['version', '--format', 'json']);
    const result = JSON.parse(output);
    expect(result.cli).toBe('0.1.0');
    expect(result.node).toBeDefined();
  });

  it('omnifocus doctor runs diagnostics', () => {
    const output = run(['doctor', '--format', 'json']);
    const result = JSON.parse(output);
    expect(typeof result.omnifocusRunning).toBe('boolean');
    expect(typeof result.osascriptAvailable).toBe('boolean');
  });

  it('omnifocus cache shows cache info', () => {
    const output = run(['cache', '--format', 'json']);
    const result = JSON.parse(output);
    expect(result.cacheDir).toBeDefined();
  });
});

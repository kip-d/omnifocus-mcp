/**
 * Integration tests for read commands.
 *
 * Runs the built CLI binary against real OmniFocus to verify end-to-end behavior.
 * Requires OmniFocus to be running and the project to be built (`npm run build`).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_DIR = resolve(import.meta.dirname, '..', '..', '..');
const CLI_ENTRY = resolve(CLI_DIR, 'dist', 'index.js');

// Task listing iterates ALL flattenedTasks() -- generous timeout
const TASK_TIMEOUT = 120_000;

function run(args: string): string {
  return execFileSync('node', [CLI_ENTRY, ...args.split(' ')], {
    cwd: CLI_DIR,
    encoding: 'utf-8',
    timeout: TASK_TIMEOUT,
  });
}

describe('Read commands integration', () => {
  // -------------------------------------------------------------------------
  // tasks
  // -------------------------------------------------------------------------

  it(
    'tasks --format json --limit 3 returns JSON array',
    () => {
      const output = run('tasks --format json --limit 3');
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeLessThanOrEqual(3);
      if (parsed.length > 0) {
        expect(parsed[0]).toHaveProperty('id');
        expect(parsed[0]).toHaveProperty('name');
      }
    },
    TASK_TIMEOUT,
  );

  it(
    'tasks --count returns a number',
    () => {
      const output = run('tasks --count --limit 100');
      const num = parseInt(output.trim(), 10);
      expect(Number.isNaN(num)).toBe(false);
      expect(num).toBeGreaterThanOrEqual(0);
    },
    TASK_TIMEOUT,
  );

  it(
    'tasks --flagged --format json returns only flagged tasks',
    () => {
      const output = run('tasks --flagged --format json --limit 10');
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      for (const task of parsed) {
        expect(task.flagged).toBe(true);
      }
    },
    TASK_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // projects
  // -------------------------------------------------------------------------

  it('projects --format json returns JSON array', () => {
    const output = run('projects --format json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    if (parsed.length > 0) {
      expect(parsed[0]).toHaveProperty('id');
      expect(parsed[0]).toHaveProperty('name');
    }
  }, 30_000);

  // -------------------------------------------------------------------------
  // tags
  // -------------------------------------------------------------------------

  it('tags --format json returns JSON array', () => {
    const output = run('tags --format json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    if (parsed.length > 0) {
      expect(parsed[0]).toHaveProperty('id');
      expect(parsed[0]).toHaveProperty('name');
    }
  }, 30_000);

  // -------------------------------------------------------------------------
  // folders
  // -------------------------------------------------------------------------

  it('folders --format json returns JSON array', () => {
    const output = run('folders --format json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    if (parsed.length > 0) {
      expect(parsed[0]).toHaveProperty('id');
      expect(parsed[0]).toHaveProperty('name');
    }
  }, 30_000);
});

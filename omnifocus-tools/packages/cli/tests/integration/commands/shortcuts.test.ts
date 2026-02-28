/**
 * Integration tests for GTD shortcut commands.
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

// `today` runs two full task scans (due-soon + flagged). OmniFocus serializes
// JXA requests, so it takes roughly double the single-scan time.
const DOUBLE_SCAN_TIMEOUT = 240_000;

function run(args: string, timeout = TASK_TIMEOUT): string {
  return execFileSync('node', [CLI_ENTRY, ...args.split(' ')], {
    cwd: CLI_DIR,
    encoding: 'utf-8',
    timeout,
  });
}

describe('Shortcut commands integration', () => {
  // -------------------------------------------------------------------------
  // inbox
  // -------------------------------------------------------------------------

  it(
    'inbox --format json returns tasks with null project',
    () => {
      const output = run('inbox --format json --limit 10');
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      for (const task of parsed) {
        expect(task.project).toBeNull();
      }
    },
    TASK_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // flagged
  // -------------------------------------------------------------------------

  it(
    'flagged --format json returns only flagged tasks',
    () => {
      const output = run('flagged --format json --limit 10');
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      for (const task of parsed) {
        expect(task.flagged).toBe(true);
      }
    },
    TASK_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // overdue
  // -------------------------------------------------------------------------

  it(
    'overdue --format json returns tasks with past due dates',
    () => {
      const output = run('overdue --format json --limit 10');
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      const today = new Date().toISOString().slice(0, 10);
      for (const task of parsed) {
        // Every overdue task must have a dueDate before today
        expect(task.dueDate).toBeDefined();
        expect(task.dueDate).not.toBeNull();
        expect(task.dueDate.slice(0, 10) <= today).toBe(true);
      }
    },
    TASK_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // today
  // -------------------------------------------------------------------------

  it(
    'today --format json returns array',
    () => {
      const output = run('today --format json', DOUBLE_SCAN_TIMEOUT);
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      // May be empty -- that's fine. Verify structure if non-empty.
      if (parsed.length > 0) {
        expect(parsed[0]).toHaveProperty('id');
        expect(parsed[0]).toHaveProperty('name');
      }
    },
    DOUBLE_SCAN_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // upcoming
  // -------------------------------------------------------------------------

  it(
    'upcoming --days 7 --format json returns array',
    () => {
      const output = run('upcoming --days 7 --format json');
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      // May be empty -- that's fine. Verify structure if non-empty.
      if (parsed.length > 0) {
        expect(parsed[0]).toHaveProperty('id');
        expect(parsed[0]).toHaveProperty('name');
      }
    },
    TASK_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // review
  // -------------------------------------------------------------------------

  it(
    'review --format json returns active projects',
    () => {
      const output = run('review --format json');
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      if (parsed.length > 0) {
        expect(parsed[0]).toHaveProperty('id');
        expect(parsed[0]).toHaveProperty('name');
      }
    },
    TASK_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // suggest
  // -------------------------------------------------------------------------

  it(
    'suggest --limit 5 --format json returns available tasks',
    () => {
      const output = run('suggest --limit 5 --format json');
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeLessThanOrEqual(5);
      if (parsed.length > 0) {
        expect(parsed[0]).toHaveProperty('id');
        expect(parsed[0]).toHaveProperty('name');
      }
    },
    TASK_TIMEOUT,
  );
});

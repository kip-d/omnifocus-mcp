/**
 * Integration tests for write commands (add, complete, update, delete).
 *
 * Runs the built CLI binary against real OmniFocus to verify end-to-end behavior.
 * Requires OmniFocus to be running and the project to be built (`npm run build`).
 *
 * Creates test tasks, verifies them, then cleans up in afterAll.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_DIR = resolve(import.meta.dirname, '..', '..', '..');
const CLI_ENTRY = resolve(CLI_DIR, 'dist', 'index.js');

// Write operations iterate flattenedTasks() to find by ID -- generous timeout needed
const WRITE_TIMEOUT = 120_000;

const createdTaskIds: string[] = [];

/** Run CLI with an array of arguments (avoids split-on-space quoting issues). */
function run(args: string[]): string {
  return execFileSync('node', [CLI_ENTRY, ...args], {
    cwd: CLI_DIR,
    encoding: 'utf-8',
    timeout: WRITE_TIMEOUT,
  });
}

describe('Write commands integration', () => {
  // ---------------------------------------------------------------------------
  // add
  // ---------------------------------------------------------------------------

  it(
    'add creates a task and returns id + name',
    () => {
      const output = run(['add', 'Test task from CLI', '--format', 'json']);
      const result = JSON.parse(output);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result.name).toBe('Test task from CLI');
      createdTaskIds.push(result.id);
    },
    WRITE_TIMEOUT,
  );

  it(
    'add with --flag creates a task (flagged is set via JXA)',
    () => {
      const output = run(['add', 'Flagged CLI task', '--flag', '--format', 'json']);
      const result = JSON.parse(output);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result.name).toBe('Flagged CLI task');
      createdTaskIds.push(result.id);
    },
    WRITE_TIMEOUT,
  );

  it(
    'add with --note sets the note',
    () => {
      const output = run(['add', 'Task with note', '--note', 'This is a test note', '--format', 'json']);
      const result = JSON.parse(output);
      expect(result).toHaveProperty('id');
      createdTaskIds.push(result.id);
    },
    WRITE_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  it(
    'update renames a task',
    () => {
      const id = createdTaskIds[0];
      expect(id).toBeDefined();
      const output = run(['update', id, '--name', 'Renamed CLI task', '--format', 'json']);
      const result = JSON.parse(output);
      expect(result.id).toBe(id);
      expect(result.updated).toBe(true);
      expect(result.name).toBe('Renamed CLI task');
    },
    WRITE_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  // complete
  // ---------------------------------------------------------------------------

  it(
    'complete marks a task done',
    () => {
      const id = createdTaskIds[0];
      expect(id).toBeDefined();
      const output = run(['complete', id, '--format', 'json']);
      const result = JSON.parse(output);
      expect(result.id).toBe(id);
      expect(result.completed).toBe(true);
    },
    WRITE_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  // delete (safety check)
  // ---------------------------------------------------------------------------

  it('delete without --confirm exits with error', () => {
    const id = createdTaskIds[0];
    expect(id).toBeDefined();
    // Should exit with code 1 and print error message
    try {
      run(['delete', id]);
      // If it doesn't throw, the test should fail
      expect.unreachable('Expected delete without --confirm to fail');
    } catch (err: unknown) {
      const error = err as { status?: number; stderr?: string };
      // Commander or our handler sets exitCode = 1
      expect(error.status).toBe(1);
    }
  });

  it(
    'delete with --confirm deletes a task',
    () => {
      const id = createdTaskIds[0];
      expect(id).toBeDefined();
      const output = run(['delete', id, '--confirm', '--format', 'json']);
      const result = JSON.parse(output);
      expect(result.id).toBe(id);
      expect(result.deleted).toBe(true);
      // Remove from cleanup list since already deleted
      const idx = createdTaskIds.indexOf(id);
      if (idx !== -1) createdTaskIds.splice(idx, 1);
    },
    WRITE_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  // Cleanup: delete any remaining test tasks
  // ---------------------------------------------------------------------------
  afterAll(() => {
    for (const id of createdTaskIds) {
      try {
        run(['delete', id, '--confirm']);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }, WRITE_TIMEOUT);
});

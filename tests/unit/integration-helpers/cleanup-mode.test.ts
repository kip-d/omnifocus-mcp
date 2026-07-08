/**
 * OMN-186 Phase 2 — per-run fixture epoch: fullCleanup cleanup-mode gating.
 *
 * Kip's FIXTURE_PROFILE=1 run attributed 134s of the 216s fixture overhead to
 * 15 per-file `fullCleanup()` afterAll sweeps, each paying two whole-DB
 * everywhere-scans (orphaned tasks, orphaned projects) plus a sandbox-folder
 * delete/recreate that the next file's ensureSandboxFolder must undo. Phase 2
 * scopes those per-file sweeps: while an integration run is live (the OMN-143
 * lock is held — the run IS the epoch), a `scope: 'auto'` fullCleanup keeps
 * only the steps inter-file isolation needs (inbox tasks, sandbox projects,
 * sandbox subfolders, test tags) and defers the everywhere-scans and folder
 * delete to the ONE explicit `scope: 'full'` sweep in globalTeardown.
 *
 * The behavioral pin: each cleanup step is exactly one osascript spawn, so
 * mode is observable as spawn count — full = 7, scoped = 4 — and the scoped
 * spawn set must be a subset of the full set (scoped runs a strict subset of
 * the steps, never different ones).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ scripts: [] as string[] }));

vi.mock('child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile = Object.assign(
    () => {
      throw new Error('callback-style execFile not expected — sandbox-manager uses the promisified form');
    },
    {
      [promisify.custom]: (_cmd: string, args: string[]) => {
        h.scripts.push(args[args.length - 1]);
        // Shape satisfies every step: numeric `deleted` is falsy-safe for the
        // boolean-shaped deleteSandboxFolder result, `errors` empty for the rest.
        return Promise.resolve({ stdout: '{"deleted":0,"errors":[]}', stderr: '' });
      },
    },
  );
  return { execFile };
});

import { fullCleanup, resolveCleanupMode } from '../../integration/helpers/sandbox-manager.js';

describe('resolveCleanupMode (OMN-186 Phase 2)', () => {
  it('explicit full scope is always full, run live or not', () => {
    expect(resolveCleanupMode('full', true)).toBe('full');
    expect(resolveCleanupMode('full', false)).toBe('full');
  });

  it('auto scope is scoped only while a run is live', () => {
    expect(resolveCleanupMode('auto', true)).toBe('scoped');
    expect(resolveCleanupMode('auto', false)).toBe('full');
  });
});

describe('fullCleanup step gating (OMN-186 Phase 2)', () => {
  beforeEach(() => {
    h.scripts.length = 0;
  });

  it('full scope runs all 7 cleanup steps', async () => {
    const report = await fullCleanup({ scope: 'full', isRunLive: () => true });
    expect(h.scripts).toHaveLength(7);
    expect(report.errors).toEqual([]);
  });

  it('auto scope during a live run skips the everywhere-scans and the sandbox-folder delete', async () => {
    await fullCleanup({ scope: 'full', isRunLive: () => true });
    const fullScripts = [...h.scripts];
    h.scripts.length = 0;

    const report = await fullCleanup({ isRunLive: () => true });
    expect(h.scripts).toHaveLength(4);
    // Scoped runs a strict subset of the full steps — never different scripts.
    for (const script of h.scripts) {
      expect(fullScripts).toContain(script);
    }
    // The three skipped scripts are the whole-DB scans + folder delete.
    const skipped = fullScripts.filter((s) => !h.scripts.includes(s));
    expect(skipped).toHaveLength(3);
    expect(report.errors).toEqual([]);
  });

  it('auto scope with no live run behaves as full (manual/REPL callers unchanged)', async () => {
    await fullCleanup({ isRunLive: () => false });
    expect(h.scripts).toHaveLength(7);
  });
});

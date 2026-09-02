import { describe, it, expect, vi, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';
import { DiagnosticOmniAutomation } from '../../../src/omnifocus/DiagnosticOmniAutomation.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

function makeMockProcess() {
  return Object.assign(new EventEmitter(), {
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
}

/**
 * OMN-321: DiagnosticOmniAutomation (used by SystemTool) spawns osascript on
 * its own path. It must share the SAME process-wide queue as OmniAutomation,
 * or a diagnostics call becomes a side door around the serialization.
 */
describe('DiagnosticOmniAutomation shares the osascript queue (OMN-321)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not spawn a diagnostic script while a regular script is still running', async () => {
    const procRegular = makeMockProcess();
    const procDiag = makeMockProcess();
    vi.mocked(spawn)
      .mockReturnValueOnce(procRegular as any)
      .mockReturnValueOnce(procDiag as any);

    const regular = new OmniAutomation(100000, 1000);
    const diag = new DiagnosticOmniAutomation(100000, 1000);

    const pRegular = regular.execute('JSON.stringify({ kind: "regular" })');
    const pDiag = diag.execute('JSON.stringify({ kind: "diag" })');

    await new Promise((r) => setImmediate(r));
    expect(spawn).toHaveBeenCalledTimes(1);

    procRegular.stdout.emit('data', JSON.stringify({ kind: 'regular' }));
    procRegular.emit('close', 0);
    await expect(pRegular).resolves.toEqual({ kind: 'regular' });

    await new Promise((r) => setImmediate(r));
    expect(spawn).toHaveBeenCalledTimes(2);

    procDiag.stdout.emit('data', JSON.stringify({ kind: 'diag' }));
    procDiag.emit('close', 0);
    await expect(pDiag).resolves.toEqual({ kind: 'diag' });
  });
});

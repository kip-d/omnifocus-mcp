import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GeneratedScript } from '../../../src/scripts/types.js';
import { ExecStrategy } from '../../../src/scripts/types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Track calls for assertions
let mockWriteFileSync: ReturnType<typeof vi.fn>;
let mockUnlinkSync: ReturnType<typeof vi.fn>;
let mockMkdirSync: ReturnType<typeof vi.fn>;
let mockExecFileSync: ReturnType<typeof vi.fn>;
let mockRandomUUID: ReturnType<typeof vi.fn>;

vi.mock('node:fs', () => ({
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => mockRandomUUID(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScript(overrides: Partial<GeneratedScript> = {}): GeneratedScript {
  return {
    source: '(() => { return JSON.stringify({ ok: true }); })()',
    strategy: ExecStrategy.JXA_DIRECT,
    description: 'Test script',
    ...overrides,
  };
}

// Dynamic import so mocks are wired up first
async function getExecutor() {
  const mod = await import('../../../src/scripts/executor.js');
  return mod.ScriptExecutor;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScriptExecutor', () => {
  beforeEach(() => {
    mockWriteFileSync = vi.fn();
    mockUnlinkSync = vi.fn();
    mockMkdirSync = vi.fn();
    mockExecFileSync = vi.fn();
    mockRandomUUID = vi.fn().mockReturnValue('test-uuid-1234');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Temp file handling
  // -------------------------------------------------------------------------

  describe('temp file management', () => {
    it('creates temp directory before writing', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('{"ok": true}');

      await ScriptExecutor.execute(makeScript());

      expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining('omnifocus-cli'), { recursive: true });
    });

    it('writes script source to temp file ending in .js', async () => {
      const ScriptExecutor = await getExecutor();
      const script = makeScript({ source: 'my-script-source' });
      mockExecFileSync.mockReturnValue('{"ok": true}');

      await ScriptExecutor.execute(script);

      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringMatching(/test-uuid-1234\.js$/), 'my-script-source');
    });

    it('cleans up temp file after successful execution', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('{"ok": true}');

      await ScriptExecutor.execute(makeScript());

      expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringMatching(/test-uuid-1234\.js$/));
    });

    it('cleans up temp file even on error', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockImplementation(() => {
        throw new Error('osascript failed');
      });

      await expect(ScriptExecutor.execute(makeScript())).rejects.toThrow();

      expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringMatching(/test-uuid-1234\.js$/));
    });

    it('does not throw if temp file cleanup fails', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('{"ok": true}');
      mockUnlinkSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      // Should not throw despite cleanup failure
      const result = await ScriptExecutor.execute(makeScript());
      expect(result).toEqual({ ok: true });
    });
  });

  // -------------------------------------------------------------------------
  // osascript invocation
  // -------------------------------------------------------------------------

  describe('osascript invocation', () => {
    it('calls osascript with -l JavaScript and temp file path', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('{"ok": true}');

      await ScriptExecutor.execute(makeScript());

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'osascript',
        ['-l', 'JavaScript', expect.stringMatching(/test-uuid-1234\.js$/)],
        expect.objectContaining({
          timeout: 120_000,
          encoding: 'utf-8',
        }),
      );
    });

    it('passes timeout of 120000ms', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('{"ok": true}');

      await ScriptExecutor.execute(makeScript());

      const options = mockExecFileSync.mock.calls[0][2];
      expect(options.timeout).toBe(120_000);
    });

    it('sets maxBuffer to 10MB', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('{"ok": true}');

      await ScriptExecutor.execute(makeScript());

      const options = mockExecFileSync.mock.calls[0][2];
      expect(options.maxBuffer).toBe(10 * 1024 * 1024);
    });

    it('uses pipe for all stdio channels', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('{"ok": true}');

      await ScriptExecutor.execute(makeScript());

      const options = mockExecFileSync.mock.calls[0][2];
      expect(options.stdio).toEqual(['pipe', 'pipe', 'pipe']);
    });
  });

  // -------------------------------------------------------------------------
  // JSON parsing
  // -------------------------------------------------------------------------

  describe('JSON output parsing', () => {
    it('parses JSON output correctly', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('{"tasks": [{"id": "abc"}], "total": 1}');

      const result = await ScriptExecutor.execute<{ tasks: { id: string }[]; total: number }>(makeScript());

      expect(result).toEqual({ tasks: [{ id: 'abc' }], total: 1 });
    });

    it('trims whitespace from output before parsing', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('  \n{"ok": true}\n  ');

      const result = await ScriptExecutor.execute(makeScript());
      expect(result).toEqual({ ok: true });
    });

    it('handles Buffer output (converts to string)', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue(Buffer.from('{"ok": true}'));

      const result = await ScriptExecutor.execute(makeScript());
      expect(result).toEqual({ ok: true });
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws on empty output', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('');

      await expect(ScriptExecutor.execute(makeScript({ description: 'empty test' }))).rejects.toThrow(
        'Script returned empty output: empty test',
      );
    });

    it('throws on whitespace-only output', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('   \n  ');

      await expect(ScriptExecutor.execute(makeScript({ description: 'whitespace test' }))).rejects.toThrow(
        'Script returned empty output: whitespace test',
      );
    });

    it('throws on invalid JSON output', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('not json at all');

      await expect(ScriptExecutor.execute(makeScript({ description: 'bad json' }))).rejects.toThrow(
        'Script returned invalid JSON: bad json',
      );
    });

    it('throws on script-level error (error: true, message: "...")', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('{"error": true, "message": "Task not found"}');

      await expect(ScriptExecutor.execute(makeScript())).rejects.toThrow('Task not found');
    });

    it('does not throw when error is false', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('{"error": false, "message": "all good"}');

      const result = await ScriptExecutor.execute(makeScript());
      expect(result).toEqual({ error: false, message: 'all good' });
    });

    it('does not throw when error is true but message is missing', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockReturnValue('{"error": true}');

      const result = await ScriptExecutor.execute(makeScript());
      expect(result).toEqual({ error: true });
    });

    it('throws on timeout (killed process)', async () => {
      const ScriptExecutor = await getExecutor();
      const err = new Error('TIMEOUT') as Error & { killed: boolean };
      err.killed = true;
      mockExecFileSync.mockImplementation(() => {
        throw err;
      });

      await expect(ScriptExecutor.execute(makeScript({ description: 'slow script' }))).rejects.toThrow(
        'Script timeout (120000ms): slow script',
      );
    });

    it('throws on timeout (SIGTERM signal)', async () => {
      const ScriptExecutor = await getExecutor();
      const err = new Error('SIGTERM') as Error & { signal: string };
      err.signal = 'SIGTERM';
      mockExecFileSync.mockImplementation(() => {
        throw err;
      });

      await expect(ScriptExecutor.execute(makeScript({ description: 'killed script' }))).rejects.toThrow(
        'Script timeout (120000ms): killed script',
      );
    });

    it('re-throws other errors from execFileSync', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockImplementation(() => {
        throw new Error('osascript: command not found');
      });

      await expect(ScriptExecutor.execute(makeScript())).rejects.toThrow('osascript: command not found');
    });

    it('wraps non-Error throws', async () => {
      const ScriptExecutor = await getExecutor();
      mockExecFileSync.mockImplementation(() => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      });

      await expect(ScriptExecutor.execute(makeScript({ description: 'weird error' }))).rejects.toThrow(
        'Script execution failed: weird error',
      );
    });
  });
});

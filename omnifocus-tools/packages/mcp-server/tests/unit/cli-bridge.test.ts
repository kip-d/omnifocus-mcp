import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock child_process before importing callCli
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { callCli } from '../../src/cli-bridge.js';
import { execFile } from 'node:child_process';

const mockExecFile = vi.mocked(execFile);

describe('callCli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls node with CLI entry and --format json', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, '{"tasks":[]}', '');
      return {} as any;
    });

    await callCli(['tasks', '--flagged']);
    expect(mockExecFile).toHaveBeenCalledWith(
      'node',
      expect.arrayContaining(['tasks', '--flagged', '--format', 'json']),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns parsed JSON', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, '{"tasks":[{"id":"1"}]}', '');
      return {} as any;
    });

    const result = await callCli(['tasks']);
    expect(result).toEqual({ tasks: [{ id: '1' }] });
  });

  it('throws on CLI error', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(new Error('Command failed'), '', 'Error message');
      return {} as any;
    });

    await expect(callCli(['tasks'])).rejects.toThrow('CLI error');
  });

  it('throws on invalid JSON', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, 'not json', '');
      return {} as any;
    });

    await expect(callCli(['tasks'])).rejects.toThrow('invalid JSON');
  });
});

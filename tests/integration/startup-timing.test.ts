import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = join(repoRoot, 'dist', 'index.js');

function runServerOnce(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.stdin.end(); // EOF → graceful exit after startup
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('server did not exit within 20s'));
    }, 20_000);
    child.on('close', () => {
      clearTimeout(timer);
      resolve(stderr);
    });
    child.on('error', reject);
  });
}

describe('startup timing line (integration)', () => {
  it('emits exactly one STARTUP COMPLETE [stdio] line whose phases sum to total', async () => {
    const stderr = await runServerOnce();
    const matches = stderr.match(/STARTUP COMPLETE .*\[stdio\]/g) ?? [];
    expect(matches).toHaveLength(1);
    const line = matches[0]!;
    const total = Number(line.match(/COMPLETE (\d+)ms/)![1]);
    const parts = [...line.matchAll(/(?:load|init|perms|warm|register|ready) (\d+)/g)].map((m) => Number(m[1]));
    expect(parts).toHaveLength(6);
    expect(Math.abs(parts.reduce((a, b) => a + b, 0) - total)).toBeLessThanOrEqual(6);
  }, 25_000);
});

import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

// Resolve the CLI entry point relative to this package
const CLI_ENTRY = resolve(import.meta.dirname, '..', '..', 'cli', 'dist', 'index.js');

/**
 * Call the omnifocus CLI and return parsed JSON result.
 * This is the ONLY interface between MCP server and CLI.
 */
export function callCli(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(
      'node',
      [CLI_ENTRY, ...args, '--format', 'json'],
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`CLI error: ${error.message}${stderr ? `\n${stderr}` : ''}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`CLI returned invalid JSON: ${stdout.slice(0, 200)}`));
        }
      },
    );
  });
}

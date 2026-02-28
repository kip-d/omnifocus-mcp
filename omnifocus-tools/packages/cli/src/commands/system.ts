/**
 * System commands: version, doctor (diagnostics), and cache management.
 */

import type { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { FileCache } from '../cache/file-cache.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';

const CACHE_DIR = join(homedir(), '.omnifocus-cli', 'cache');

export function registerSystemCommands(program: Command): void {
  program
    .command('version')
    .description('Version information')
    .action((_opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const info = {
        cli: '0.1.0',
        node: process.version,
      };
      console.log(formatOutput(info, (globals.format ?? 'text') as OutputFormat));
    });

  program
    .command('doctor')
    .description('Connection diagnostics')
    .action(async (_opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const results: Record<string, unknown> = {};

      // Check osascript works
      try {
        execFileSync('osascript', ['-l', 'JavaScript', '-e', '"ok"'], { timeout: 5000 });
        results.osascriptAvailable = true;
      } catch {
        results.osascriptAvailable = false;
      }

      // Check OmniFocus is running
      try {
        const output = execFileSync('osascript', ['-l', 'JavaScript', '-e', 'Application("OmniFocus").running()'], {
          encoding: 'utf-8',
          timeout: 5000,
        });
        results.omnifocusRunning = String(output).trim() === 'true';
      } catch {
        results.omnifocusRunning = false;
      }

      console.log(formatOutput(results, (globals.format ?? 'text') as OutputFormat));
    });

  program
    .command('cache')
    .description('Cache management')
    .option('--clear', 'Clear all cached data')
    .action((opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const cache = new FileCache(CACHE_DIR);
      if (opts.clear) {
        cache.clear();
        console.log('Cache cleared');
      } else {
        console.log(formatOutput({ cacheDir: CACHE_DIR }, (globals.format ?? 'text') as OutputFormat));
      }
    });
}

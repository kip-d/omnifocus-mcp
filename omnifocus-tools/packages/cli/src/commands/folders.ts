/**
 * `omnifocus folders` command -- list all folders with hierarchy.
 *
 * Generates a JXA script via ScriptBuilder, executes it, and formats the output.
 */

import type { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';

export function registerFoldersCommand(program: Command): void {
  program
    .command('folders')
    .description('List all folders')
    .action(async (_opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};

      const script = ScriptBuilder.listFolders();
      const result = await ScriptExecutor.execute<{ folders: unknown[]; total: number }>(script);

      const format = (globals.format ?? 'text') as OutputFormat;
      const formatOpts = {
        fields: globals.fields ? globals.fields.split(',').map((f: string) => f.trim()) : undefined,
        quiet: globals.quiet ?? false,
      };

      const output = formatOutput(result.folders, format, formatOpts);
      console.log(output);
    });
}

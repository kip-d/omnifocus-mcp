/**
 * `omnifocus tags` command -- list all tags.
 *
 * Generates a JXA script via ScriptBuilder, executes it, and formats the output.
 */

import type { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';

export function registerTagsCommand(program: Command): void {
  program
    .command('tags')
    .description('List all tags')
    .action(async (_opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};

      const script = ScriptBuilder.listTags();
      const result = await ScriptExecutor.execute<{ tags: unknown[]; total: number }>(script);

      const format = (globals.format ?? 'text') as OutputFormat;
      const formatOpts = {
        fields: globals.fields ? globals.fields.split(',').map((f: string) => f.trim()) : undefined,
        quiet: globals.quiet ?? false,
      };

      const output = formatOutput(result.tags, format, formatOpts);
      console.log(output);
    });
}

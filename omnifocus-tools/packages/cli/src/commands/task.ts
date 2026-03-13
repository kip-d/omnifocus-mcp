/**
 * `omnifocus task <id>` command -- get a single task by ID.
 *
 * Generates a JXA script via ScriptBuilder, executes it, and formats the output.
 */

import type { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';

export function registerTaskCommand(program: Command): void {
  program
    .command('task <id>')
    .description('Get a single task by ID')
    .action(async (id: string, _opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};

      const script = ScriptBuilder.getTask(id);
      const result = await ScriptExecutor.execute<{ task: Record<string, unknown> | null; error?: string }>(script);

      if (!result.task) {
        console.error(result.error ?? 'Task not found');
        process.exitCode = 1;
        return;
      }

      const format = (globals.format ?? 'text') as OutputFormat;
      const formatOpts = {
        fields: globals.fields ? globals.fields.split(',').map((f: string) => f.trim()) : undefined,
        quiet: globals.quiet ?? false,
      };

      const output = formatOutput(result.task, format, formatOpts);
      console.log(output);
    });
}

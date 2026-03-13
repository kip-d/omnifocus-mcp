/**
 * `omnifocus delete <id>` command -- delete a task (requires --confirm).
 *
 * Generates a JXA script via ScriptBuilder, executes it, and formats the output.
 * Requires --confirm flag as a safety guard for destructive operations.
 */

import type { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';

export function registerDeleteCommand(program: Command): void {
  program
    .command('delete <id>')
    .description('Delete a task (requires --confirm)')
    .option('--confirm', 'Confirm deletion')
    .action(async (id: string, opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};

      if (!opts.confirm) {
        console.error('Error: --confirm flag required for destructive operations');
        process.exitCode = 1;
        return;
      }

      const script = ScriptBuilder.deleteTask(id);
      const result = await ScriptExecutor.execute(script);
      console.log(formatOutput(result, (globals.format ?? 'text') as OutputFormat));
    });
}

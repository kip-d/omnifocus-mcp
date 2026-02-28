/**
 * `omnifocus complete <id>` command -- mark a task as complete.
 *
 * Generates a JXA script via ScriptBuilder, executes it, and formats the output.
 */

import type { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';

export function registerCompleteCommand(program: Command): void {
  program
    .command('complete <id>')
    .description('Mark a task as complete')
    .action(async (id: string, _opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const script = ScriptBuilder.completeTask(id);
      const result = await ScriptExecutor.execute(script);
      console.log(formatOutput(result, (globals.format ?? 'text') as OutputFormat));
    });
}

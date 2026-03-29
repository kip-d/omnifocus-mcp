/**
 * `omnifocus add <name>` command -- create a new task.
 *
 * Builds TaskCreateData from CLI options, generates a JXA script via ScriptBuilder,
 * executes it, and formats the output.
 */

import type { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';
import { parseDate, formatDate } from '../utils/dates.js';
import type { TaskCreateData } from '../scripts/types.js';

/** Commander `collect` helper: accumulate repeatable option values into an array. */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerAddCommand(program: Command): void {
  program
    .command('add <name>')
    .description('Create a new task')
    .option('--project <name>', 'Assign to project')
    .option('--tag <name>', 'Add tag (repeatable)', collect, [])
    .option('--due <date>', 'Due date')
    .option('--defer <date>', 'Defer date')
    .option('--planned <date>', 'Planned date')
    .option('--flag', 'Flag the task')
    .option('--note <text>', 'Task note')
    .option('--estimate <minutes>', 'Time estimate in minutes')
    .action(async (name: string, opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};

      const data: TaskCreateData = { name };
      if (opts.project) data.project = opts.project;
      if (opts.tag?.length > 0) data.tags = opts.tag;
      if (opts.flag) data.flagged = true;
      if (opts.note) data.note = opts.note;
      if (opts.estimate) data.estimatedMinutes = parseInt(opts.estimate, 10);

      if (opts.due) {
        const parsed = parseDate(opts.due);
        data.dueDate = parsed ? formatDate(parsed, 'due') : opts.due;
      }
      if (opts.defer) {
        const parsed = parseDate(opts.defer);
        data.deferDate = parsed ? formatDate(parsed, 'defer') : opts.defer;
      }
      if (opts.planned) {
        const parsed = parseDate(opts.planned);
        data.plannedDate = parsed ? formatDate(parsed, 'planned') : opts.planned;
      }

      const script = ScriptBuilder.createTask(data);
      const result = await ScriptExecutor.execute(script);
      console.log(formatOutput(result, (globals.format ?? 'text') as OutputFormat));
    });
}

/**
 * `omnifocus update <id>` command -- update a task's properties.
 *
 * Builds TaskUpdateChanges from CLI options, generates a JXA script via ScriptBuilder,
 * executes it, and formats the output.
 */

import type { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';
import { parseDate, formatDate } from '../utils/dates.js';
import type { TaskUpdateChanges } from '../scripts/types.js';

/** Commander `collect` helper: accumulate repeatable option values into an array. */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerUpdateCommand(program: Command): void {
  program
    .command('update <id>')
    .description('Update a task')
    .option('--name <name>', 'New name')
    .option('--note <text>', 'New note')
    .option('--flag', 'Flag the task')
    .option('--unflag', 'Unflag the task')
    .option('--due <date>', 'Set due date')
    .option('--clear-due', 'Clear due date')
    .option('--defer <date>', 'Set defer date')
    .option('--clear-defer', 'Clear defer date')
    .option('--planned <date>', 'Set planned date')
    .option('--clear-planned', 'Clear planned date')
    .option('--estimate <minutes>', 'Time estimate in minutes')
    .option('--clear-estimate', 'Clear time estimate')
    .option('--tag <name>', 'Set tags (repeatable, replaces existing)', collect, [])
    .option('--add-tag <name>', 'Add tag (repeatable)', collect, [])
    .option('--remove-tag <name>', 'Remove tag (repeatable)', collect, [])
    .action(async (id: string, opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};

      const changes: TaskUpdateChanges = {};

      if (opts.name) changes.name = opts.name;
      if (opts.note) changes.note = opts.note;
      if (opts.flag) changes.flagged = true;
      if (opts.unflag) changes.flagged = false;

      if (opts.due) {
        const parsed = parseDate(opts.due);
        changes.dueDate = parsed ? formatDate(parsed, 'due') : opts.due;
      }
      if (opts.clearDue) changes.dueDate = null;

      if (opts.defer) {
        const parsed = parseDate(opts.defer);
        changes.deferDate = parsed ? formatDate(parsed, 'defer') : opts.defer;
      }
      if (opts.clearDefer) changes.deferDate = null;

      if (opts.planned) {
        const parsed = parseDate(opts.planned);
        changes.plannedDate = parsed ? formatDate(parsed, 'planned') : opts.planned;
      }
      if (opts.clearPlanned) changes.plannedDate = null;

      if (opts.estimate) changes.estimatedMinutes = parseInt(opts.estimate, 10);
      if (opts.clearEstimate) changes.estimatedMinutes = null;

      if (opts.tag?.length > 0) changes.tags = opts.tag;
      if (opts.addTag?.length > 0) changes.addTags = opts.addTag;
      if (opts.removeTag?.length > 0) changes.removeTags = opts.removeTag;

      const script = ScriptBuilder.updateTask(id, changes);
      const result = await ScriptExecutor.execute(script);
      console.log(formatOutput(result, (globals.format ?? 'text') as OutputFormat));
    });
}

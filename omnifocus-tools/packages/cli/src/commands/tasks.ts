/**
 * `omnifocus tasks` command -- list tasks with filtering.
 *
 * Builds a TaskFilter from CLI options, generates a JXA script via ScriptBuilder,
 * executes it, and formats the output.
 */

import type { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';
import { parseDate } from '../utils/dates.js';
import type { TaskFilter } from '../scripts/types.js';

/** Commander `collect` helper: accumulate repeatable --tag values into an array. */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerTasksCommand(program: Command): void {
  program
    .command('tasks')
    .description('List tasks with optional filters')
    .option('--project <name>', 'Filter by project name')
    .option('--tag <name>', 'Filter by tag (repeatable)', collect, [])
    .option('--tag-mode <mode>', 'Tag match mode: any, all, none', 'any')
    .option('--flagged', 'Only flagged tasks')
    .option('--available', 'Only available (not blocked) tasks')
    .option('--blocked', 'Only blocked tasks')
    .option('--due-before <date>', 'Due before date')
    .option('--due-after <date>', 'Due after date')
    .option('--defer-before <date>', 'Defer date before')
    .option('--defer-after <date>', 'Defer date after')
    .option('--planned-before <date>', 'Planned date before')
    .option('--planned-after <date>', 'Planned date after')
    .option('--search <text>', 'Search name and note')
    .option('--completed', 'Include completed tasks')
    .option('--since <date>', 'Completed/modified since date')
    .option('--count', 'Return count only')
    .action(async (opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};

      // Build TaskFilter from options
      const filter: TaskFilter = {};

      if (opts.project !== undefined) filter.project = opts.project;
      if (opts.tag && opts.tag.length > 0) filter.tag = opts.tag;
      if (opts.tagMode && opts.tagMode !== 'any') filter.tagMode = opts.tagMode;
      if (opts.flagged) filter.flagged = true;
      if (opts.available) filter.available = true;
      if (opts.blocked) filter.blocked = true;
      if (opts.search) filter.search = opts.search;
      if (opts.completed) filter.completed = true;
      if (opts.count) filter.countTotal = true;

      // Date filters -- parse natural language
      if (opts.dueBefore) filter.dueBefore = parseDate(opts.dueBefore) ?? opts.dueBefore;
      if (opts.dueAfter) filter.dueAfter = parseDate(opts.dueAfter) ?? opts.dueAfter;
      if (opts.deferBefore) filter.deferBefore = parseDate(opts.deferBefore) ?? opts.deferBefore;
      if (opts.deferAfter) filter.deferAfter = parseDate(opts.deferAfter) ?? opts.deferAfter;
      if (opts.plannedBefore) filter.plannedBefore = parseDate(opts.plannedBefore) ?? opts.plannedBefore;
      if (opts.plannedAfter) filter.plannedAfter = parseDate(opts.plannedAfter) ?? opts.plannedAfter;
      if (opts.since) filter.since = parseDate(opts.since) ?? opts.since;

      // Global options
      if (globals.limit) filter.limit = parseInt(globals.limit, 10);
      if (globals.offset) filter.offset = parseInt(globals.offset, 10);
      if (globals.fields) filter.fields = globals.fields.split(',').map((f: string) => f.trim());
      if (globals.sort) {
        const [field, direction] = globals.sort.split(':');
        filter.sort = { field, direction: (direction as 'asc' | 'desc') || 'asc' };
      }

      const script = ScriptBuilder.listTasks(filter);
      const result = await ScriptExecutor.execute<{ tasks: unknown[]; total: number }>(script);

      const format = (globals.format ?? 'text') as OutputFormat;
      const formatOpts = {
        fields: filter.fields,
        quiet: globals.quiet ?? false,
      };

      if (opts.count) {
        const output = formatOutput({ count: result.total }, format, formatOpts);
        console.log(output);
      } else {
        const output = formatOutput(result.tasks, format, formatOpts);
        console.log(output);
      }
    });
}

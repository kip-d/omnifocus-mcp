/**
 * GTD shortcut commands -- convenience aliases with preset filters.
 *
 * Each shortcut builds a TaskFilter (or ProjectFilter) via ScriptBuilder,
 * executes it, and formats the output using the same pattern as read commands.
 *
 * Commands: inbox, today, overdue, flagged, upcoming, review, suggest
 */

import type { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';
import type { TaskFilter, ProjectFilter } from '../scripts/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** YYYY-MM-DD for today */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** YYYY-MM-DD for N days from now */
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

interface TaskResult {
  tasks: Record<string, unknown>[];
  total: number;
}

/** Extract global CLI options from the parent command */
function globals(cmd: Command): Record<string, string | boolean | undefined> {
  return (cmd.parent?.opts() ?? {}) as Record<string, string | boolean | undefined>;
}

/** Parse global limit, defaulting to provided value */
function globalLimit(g: Record<string, string | boolean | undefined>, fallback: number): number {
  return g.limit ? parseInt(String(g.limit), 10) : fallback;
}

/** Parse global fields list */
function globalFields(g: Record<string, string | boolean | undefined>): string[] | undefined {
  return g.fields
    ? String(g.fields)
        .split(',')
        .map((f) => f.trim())
    : undefined;
}

/** Parse global sort */
function globalSort(
  g: Record<string, string | boolean | undefined>,
): { field: string; direction: 'asc' | 'desc' } | undefined {
  if (!g.sort) return undefined;
  const [field, direction] = String(g.sort).split(':');
  return { field, direction: (direction as 'asc' | 'desc') || 'asc' };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerShortcutCommands(program: Command): void {
  // -------------------------------------------------------------------------
  // inbox -- tasks with no project
  // -------------------------------------------------------------------------
  program
    .command('inbox')
    .description('Show inbox tasks (no project assigned)')
    .action(async (_opts, cmd) => {
      const g = globals(cmd);
      const filter: TaskFilter = {
        project: null,
        limit: globalLimit(g, 25),
        fields: globalFields(g),
        sort: globalSort(g),
      };

      const script = ScriptBuilder.listTasks(filter);
      const result = await ScriptExecutor.execute<TaskResult>(script);

      const format = (g.format ?? 'text') as OutputFormat;
      console.log(formatOutput(result.tasks, format, { fields: filter.fields, quiet: !!g.quiet }));
    });

  // -------------------------------------------------------------------------
  // today -- due within 3 days OR flagged (merge + deduplicate)
  // -------------------------------------------------------------------------
  program
    .command('today')
    .description('Tasks due within 3 days OR flagged')
    .action(async (_opts, cmd) => {
      const g = globals(cmd);
      const fields = globalFields(g);
      const threeDaysOut = daysFromNow(3);

      // Two separate queries -- merge and deduplicate by ID
      const dueScript = ScriptBuilder.listTasks({
        dueBefore: threeDaysOut,
        limit: 500,
        fields,
      });
      const flaggedScript = ScriptBuilder.listTasks({
        flagged: true,
        limit: 500,
        fields,
      });

      const [dueResult, flaggedResult] = await Promise.all([
        ScriptExecutor.execute<TaskResult>(dueScript),
        ScriptExecutor.execute<TaskResult>(flaggedScript),
      ]);

      const seen = new Set<string>();
      const merged: Record<string, unknown>[] = [];
      for (const task of [...dueResult.tasks, ...flaggedResult.tasks]) {
        const id = task.id as string;
        if (!seen.has(id)) {
          seen.add(id);
          merged.push(task);
        }
      }

      // Apply global limit
      const limit = globalLimit(g, 25);
      const limited = merged.slice(0, limit);

      const format = (g.format ?? 'text') as OutputFormat;
      console.log(formatOutput(limited, format, { fields, quiet: !!g.quiet }));
    });

  // -------------------------------------------------------------------------
  // overdue -- tasks past due date, sorted by dueDate asc
  // -------------------------------------------------------------------------
  program
    .command('overdue')
    .description('Tasks past their due date')
    .action(async (_opts, cmd) => {
      const g = globals(cmd);
      const filter: TaskFilter = {
        dueBefore: todayStr(),
        limit: globalLimit(g, 25),
        fields: globalFields(g),
        sort: globalSort(g) ?? { field: 'dueDate', direction: 'asc' },
      };

      const script = ScriptBuilder.listTasks(filter);
      const result = await ScriptExecutor.execute<TaskResult>(script);

      const format = (g.format ?? 'text') as OutputFormat;
      console.log(formatOutput(result.tasks, format, { fields: filter.fields, quiet: !!g.quiet }));
    });

  // -------------------------------------------------------------------------
  // flagged -- flagged tasks
  // -------------------------------------------------------------------------
  program
    .command('flagged')
    .description('Flagged tasks')
    .action(async (_opts, cmd) => {
      const g = globals(cmd);
      const filter: TaskFilter = {
        flagged: true,
        limit: globalLimit(g, 25),
        fields: globalFields(g),
        sort: globalSort(g),
      };

      const script = ScriptBuilder.listTasks(filter);
      const result = await ScriptExecutor.execute<TaskResult>(script);

      const format = (g.format ?? 'text') as OutputFormat;
      console.log(formatOutput(result.tasks, format, { fields: filter.fields, quiet: !!g.quiet }));
    });

  // -------------------------------------------------------------------------
  // upcoming -- tasks due within N days (default 14)
  // -------------------------------------------------------------------------
  program
    .command('upcoming')
    .description('Tasks due within N days (default 14)')
    .option('--days <n>', 'Number of days ahead', '14')
    .action(async (opts, cmd) => {
      const g = globals(cmd);
      const days = parseInt(opts.days, 10) || 14;
      const filter: TaskFilter = {
        dueBefore: daysFromNow(days),
        limit: globalLimit(g, 25),
        fields: globalFields(g),
        sort: globalSort(g) ?? { field: 'dueDate', direction: 'asc' },
      };

      const script = ScriptBuilder.listTasks(filter);
      const result = await ScriptExecutor.execute<TaskResult>(script);

      const format = (g.format ?? 'text') as OutputFormat;
      console.log(formatOutput(result.tasks, format, { fields: filter.fields, quiet: !!g.quiet }));
    });

  // -------------------------------------------------------------------------
  // review -- projects due for review (lists active projects)
  // -------------------------------------------------------------------------
  program
    .command('review')
    .description('Projects due for review (active projects)')
    .action(async (_opts, cmd) => {
      const g = globals(cmd);
      const filter: ProjectFilter = {
        status: 'active',
        limit: g.limit ? parseInt(String(g.limit), 10) : 100,
        fields: g.fields
          ? String(g.fields)
              .split(',')
              .map((f) => f.trim())
          : undefined,
      };

      const script = ScriptBuilder.listProjects(filter);
      const result = await ScriptExecutor.execute<{ projects: Record<string, unknown>[]; total: number }>(script);

      const format = (g.format ?? 'text') as OutputFormat;
      console.log(formatOutput(result.projects, format, { fields: filter.fields, quiet: !!g.quiet }));
    });

  // -------------------------------------------------------------------------
  // suggest -- smart task suggestions (available tasks, sorted by dueDate)
  // -------------------------------------------------------------------------
  program
    .command('suggest')
    .description('Smart task suggestions (available, sorted by due date)')
    .option('--limit <n>', 'Maximum suggestions')
    .action(async (opts, cmd) => {
      const g = globals(cmd);
      // Local --limit overrides global --limit
      const limit = opts.limit ? parseInt(opts.limit, 10) : globalLimit(g, 10);
      const filter: TaskFilter = {
        available: true,
        limit,
        fields: globalFields(g),
        sort: globalSort(g) ?? { field: 'dueDate', direction: 'asc' },
      };

      const script = ScriptBuilder.listTasks(filter);
      const result = await ScriptExecutor.execute<TaskResult>(script);

      const format = (g.format ?? 'text') as OutputFormat;
      console.log(formatOutput(result.tasks, format, { fields: filter.fields, quiet: !!g.quiet }));
    });
}

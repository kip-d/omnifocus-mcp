/**
 * `omnifocus projects` command -- list projects with optional filtering.
 *
 * Builds a ProjectFilter from CLI options, generates a JXA script via ScriptBuilder,
 * executes it, and formats the output.
 */

import type { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';
import type { ProjectFilter } from '../scripts/types.js';

export function registerProjectsCommand(program: Command): void {
  program
    .command('projects')
    .description('List projects')
    .option('--status <status>', 'Filter by status: active, done, dropped, all')
    .option('--folder <name>', 'Filter by folder name')
    .action(async (opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};

      const filter: ProjectFilter = {};

      if (opts.status) filter.status = opts.status as ProjectFilter['status'];
      if (opts.folder) filter.folder = opts.folder;
      if (globals.limit) filter.limit = parseInt(globals.limit, 10);
      if (globals.fields) filter.fields = globals.fields.split(',').map((f: string) => f.trim());

      const script = ScriptBuilder.listProjects(filter);
      const result = await ScriptExecutor.execute<{ projects: unknown[]; total: number }>(script);

      const format = (globals.format ?? 'text') as OutputFormat;
      const formatOpts = {
        fields: filter.fields,
        quiet: globals.quiet ?? false,
      };

      const output = formatOutput(result.projects, format, formatOpts);
      console.log(output);
    });
}

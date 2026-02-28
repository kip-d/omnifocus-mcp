/**
 * `omnifocus stats` command -- productivity statistics.
 *
 * Calls ScriptBuilder.productivityStats() with optional date range and groupBy.
 * Uses OmniJS bridge for bulk access to completion data.
 */

import type { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput } from '../output/formatter.js';
import type { OutputFormat } from '../output/formatter.js';
import { parseDate } from '../utils/dates.js';
import type { ProductivityStatsParams } from '../scripts/types.js';

export function registerStatsCommand(program: Command): void {
  program
    .command('stats')
    .description('Productivity statistics')
    .option('--group-by <period>', 'Group by: day, week, month')
    .option('--start <date>', 'Start date for range')
    .option('--end <date>', 'End date for range')
    .action(async (opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const params: ProductivityStatsParams = {};

      if (opts.groupBy) params.groupBy = opts.groupBy;
      if (opts.start && opts.end) {
        params.dateRange = {
          start: parseDate(opts.start) ?? opts.start,
          end: parseDate(opts.end) ?? opts.end,
        };
      }

      const script = ScriptBuilder.productivityStats(params);
      const result = await ScriptExecutor.execute(script);
      console.log(formatOutput(result, (globals.format ?? 'text') as OutputFormat));
    });
}

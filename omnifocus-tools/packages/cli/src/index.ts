#!/usr/bin/env node
import { Command, Option } from 'commander';

const program = new Command();

program
  .name('omnifocus')
  .description('OmniFocus GTD CLI')
  .version('0.1.0')
  .addOption(
    new Option('--format <type>', 'Output format: text, json, csv, markdown')
      .choices(['text', 'json', 'csv', 'markdown'])
      .default('text'),
  )
  .option('--fields <fields>', 'Comma-separated field names')
  .option('--limit <n>', 'Maximum results', '25')
  .option('--offset <n>', 'Skip first N results', '0')
  .option('--sort <field:dir>', 'Sort by field:asc or field:desc')
  .option('--quiet', 'Suppress headers');

program.parse();

export { program };

#!/usr/bin/env node
import { Command, Option } from 'commander';
import { registerTasksCommand } from './commands/tasks.js';
import { registerTaskCommand } from './commands/task.js';
import { registerProjectsCommand } from './commands/projects.js';
import { registerTagsCommand } from './commands/tags.js';
import { registerFoldersCommand } from './commands/folders.js';

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

// Register read commands
registerTasksCommand(program);
registerTaskCommand(program);
registerProjectsCommand(program);
registerTagsCommand(program);
registerFoldersCommand(program);

program.parse();

export { program };

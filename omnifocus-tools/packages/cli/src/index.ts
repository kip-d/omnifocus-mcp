#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program.name('omnifocus').description('OmniFocus GTD CLI').version('0.1.0');

program.parse();

#!/usr/bin/env node
// Build-time stamp: capture git metadata into dist/build-info.json so the version
// endpoint reports the LOADED artifact, not the request-time checkout. Never fails
// the build — git errors degrade to "unknown".
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const opt = { encoding: 'utf8', cwd: projectRoot };
// eslint-disable-next-line sonarjs/os-command -- hardcoded git commands, no user input
const git = (cmd) => execSync(cmd, opt).trim();

let info;
try {
  let dirty = false;
  try {
    dirty = git('git status --porcelain').length > 0;
  } catch {
    /* assume clean */
  }
  info = {
    hash: git('git rev-parse --short HEAD'),
    branch: git('git rev-parse --abbrev-ref HEAD'),
    commitDate: git('git show -s --format=%ci HEAD'),
    commitMessage: git('git show -s --format=%s HEAD'),
    dirty,
    timestamp: new Date().toISOString(),
  };
} catch {
  info = {
    hash: 'unknown',
    branch: 'unknown',
    commitDate: 'unknown',
    commitMessage: 'unknown',
    dirty: false,
    timestamp: new Date().toISOString(),
  };
}

const distDir = join(projectRoot, 'dist');
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Stamped dist/build-info.json: ${info.hash}${info.dirty ? '-dirty' : ''}`);

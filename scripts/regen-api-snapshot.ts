#!/usr/bin/env node
/**
 * Regenerate the vendored OmniFocus API snapshot (OMN-328).
 *
 *   npm run api:regen                      export from the running OmniFocus via the JXA bridge
 *   npm run api:regen -- --from <file>     use a saved raw export (offline runs, tests)
 *   npm run api:regen -- --api-dir <dir>   write somewhere other than src/omnifocus/api
 *
 * Steps: export, prepend the regen header, drop `?` on optional parameters that precede a required one
 * (TS1016), format with prettier, write OmniFocus-<version>-d.ts, repoint the OmniFocus.d.ts symlink,
 * delete snapshots older than the previous one, and print the member diff against the previous snapshot.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { isRunDirectly } from './lib/run-directly.js';
import { addHeader, diffSnapshots, formatDiff, normalizeText, parseExportInfo } from './lib/api-snapshot.js';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_API_DIR = join(PROJECT_ROOT, 'src', 'omnifocus', 'api');
const SYMLINK = 'OmniFocus.d.ts';
const SNAPSHOT_FILE = /^OmniFocus-(.+)-d\.ts$/;

export interface Args {
  from: string | null;
  apiDir: string;
}

export class UsageError extends Error {}

export function parseArgs(argv: string[]): Args {
  const args: Args = { from: null, apiDir: DEFAULT_API_DIR };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--from' || flag === '--api-dir') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new UsageError(`${flag} needs a value`);
      if (flag === '--from') args.from = resolve(value);
      else args.apiDir = resolve(value);
    } else {
      throw new UsageError(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

/** Compare dotted version strings numerically (4.10.1 > 4.9). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function exportFromOmniFocus(): string {
  return execFileSync(
    'osascript',
    ['-l', 'JavaScript', '-e', 'Application("OmniFocus").evaluateJavascript("app.getTypeScriptDeclarations()")'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
}

export async function buildSnapshot(raw: string, filepath: string): Promise<{ version: string; content: string }> {
  const { version } = parseExportInfo(raw);
  const text = normalizeText(addHeader(raw.replace(/\r\n/g, '\n').replace(/\n*$/, '\n')));
  // Always use the repo's prettier config, even when --api-dir points outside the tree.
  const config = (await resolveConfig(join(DEFAULT_API_DIR, 'x.ts'))) ?? {};
  return { version, content: await format(text, { ...config, filepath }) };
}

function listVersions(apiDir: string): string[] {
  return readdirSync(apiDir)
    .map((f) => SNAPSHOT_FILE.exec(f)?.[1])
    .filter((v): v is string => v !== undefined)
    .sort(compareVersions);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const raw = args.from ? readFileSync(args.from, 'utf8') : exportFromOmniFocus();
  const { version: newVersion } = parseExportInfo(raw);
  const fileFor = (v: string) => join(args.apiDir, `OmniFocus-${v}-d.ts`);

  // Previous snapshot = what the symlink pointed at, unless that is the version being regenerated.
  const linkPath = join(args.apiDir, SYMLINK);
  const linked = existsSync(linkPath) ? SNAPSHOT_FILE.exec(readlinkSync(linkPath))?.[1] : undefined;
  const others = listVersions(args.apiDir).filter((v) => v !== newVersion);
  const previous = linked && linked !== newVersion ? linked : others[others.length - 1];

  const { content } = await buildSnapshot(raw, fileFor(newVersion));
  writeFileSync(fileFor(newVersion), content);

  try {
    unlinkSync(linkPath);
  } catch {
    // no existing symlink
  }
  symlinkSync(`OmniFocus-${newVersion}-d.ts`, linkPath);

  // Retention: keep current + previous, delete everything older.
  for (const v of listVersions(args.apiDir)) {
    if (v !== newVersion && v !== previous) {
      rmSync(fileFor(v));
      console.log(`Removed older snapshot OmniFocus-${v}-d.ts`);
    }
  }

  console.log(`Wrote ${fileFor(newVersion)}`);
  if (previous) {
    console.log(formatDiff(previous, newVersion, diffSnapshots(readFileSync(fileFor(previous), 'utf8'), content)));
  } else {
    console.log('No previous snapshot to diff against.');
  }
  console.log('Next: npx tsc --noEmit -p tsconfig.json');
}

if (isRunDirectly(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}

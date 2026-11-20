#!/usr/bin/env node
/**
 * Regenerate the vendored OmniFocus API snapshot (OMN-328).
 *
 *   npm run api:regen                      export from the running OmniFocus via the JXA bridge
 *   npm run api:regen -- --from <file>     use a saved raw export (offline runs, tests)
 *   npm run api:regen -- --api-dir <dir>   write somewhere other than src/omnifocus/api
 *   npm run api:regen -- --force           allow an export older than the current snapshot (never deletes newer ones)
 *
 * Steps: export, prepend the regen header, drop `?` on optional parameters that precede a required one
 * (TS1016), format with prettier, write OmniFocus-<version>-d.ts, repoint the OmniFocus.d.ts symlink,
 * delete snapshots older than the previous one, and print the member diff against the previous snapshot.
 */

import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { isRunDirectly } from './lib/run-directly.js';
import {
  addHeader,
  compareVersions,
  diffSnapshots,
  formatDiff,
  normalizeText,
  parseExportInfo,
  selectPreviousVersion,
  selectRetentionDeletions,
} from './lib/api-snapshot.js';

export { compareVersions };

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_API_DIR = join(PROJECT_ROOT, 'src', 'omnifocus', 'api');
const SYMLINK = 'OmniFocus.d.ts';
const SNAPSHOT_FILE = /^OmniFocus-(.+)-d\.ts$/;

export interface Args {
  from: string | null;
  apiDir: string;
  force: boolean;
}

export class UsageError extends Error {}

export function parseArgs(argv: string[]): Args {
  const args: Args = { from: null, apiDir: DEFAULT_API_DIR, force: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--force') {
      args.force = true;
      continue;
    }
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

const EXPORT_TIMEOUT_MS = 60_000;

function exportFromOmniFocus(): string {
  try {
    return execFileSync(
      'osascript',
      ['-l', 'JavaScript', '-e', 'Application("OmniFocus").evaluateJavascript("app.getTypeScriptDeclarations()")'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: EXPORT_TIMEOUT_MS },
    );
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'ETIMEDOUT') {
      throw new Error(
        `OmniFocus did not answer within ${EXPORT_TIMEOUT_MS / 1000}s. It is likely not responding or blocked by a dialog; ` +
          'dismiss any dialog (or restart OmniFocus) and retry, or use --from <raw-export>.',
      );
    }
    throw err;
  }
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

/**
 * Atomically point `linkPath` at `target`: build the new link under a temp name in the same directory, then
 * rename it over the old one. A failure leaves the existing link intact (and removes the temp link).
 */
export function repointSymlink(linkPath: string, target: string): void {
  const tmp = `${linkPath}.tmp-${process.pid}`;
  try {
    unlinkSync(tmp);
  } catch {
    // no stale temp link
  }
  symlinkSync(target, tmp);
  try {
    renameSync(tmp, linkPath);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // already gone
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const raw = args.from ? readFileSync(args.from, 'utf8') : exportFromOmniFocus();
  const { version: newVersion } = parseExportInfo(raw);
  const fileFor = (v: string) => join(args.apiDir, `OmniFocus-${v}-d.ts`);

  // Previous snapshot = what the symlink pointed at, unless that is the version being regenerated.
  // The link may be absent, or a regular file (core.symlinks=false, archives); only a real symlink is readable.
  const linkPath = join(args.apiDir, SYMLINK);
  let linked: string | undefined;
  try {
    if (lstatSync(linkPath).isSymbolicLink()) linked = SNAPSHOT_FILE.exec(readlinkSync(linkPath))?.[1];
    else
      console.error(
        `${SYMLINK} is a regular file, not a symlink; falling back to the highest other snapshot. The symlink will be recreated.`,
      );
  } catch {
    // no existing link
  }
  const others = listVersions(args.apiDir).filter((v) => v !== newVersion);
  const previous = selectPreviousVersion(linked, others, newVersion);

  // Everything that can fail is read and validated BEFORE the first write, so a failure leaves the tree untouched.
  if (previous !== undefined && compareVersions(newVersion, previous) < 0 && !args.force) {
    throw new Error(
      `Export is OmniFocus ${newVersion}, older than the current snapshot ${previous}. ` +
        'Refusing to replace a newer snapshot; pass --force to regenerate from an older app anyway.',
    );
  }
  const { content } = await buildSnapshot(raw, fileFor(newVersion));
  const diffText =
    previous !== undefined
      ? formatDiff(previous, newVersion, diffSnapshots(readFileSync(fileFor(previous), 'utf8'), content))
      : 'No previous snapshot to diff against.';
  const deletions = selectRetentionDeletions(listVersions(args.apiDir), newVersion, previous);

  writeFileSync(fileFor(newVersion), content);

  repointSymlink(linkPath, `OmniFocus-${newVersion}-d.ts`);

  // Retention: keep current + previous, delete only versions older than previous.
  for (const v of deletions) {
    rmSync(fileFor(v));
    console.log(`Removed older snapshot OmniFocus-${v}-d.ts`);
  }

  console.log(`Wrote ${fileFor(newVersion)}`);
  console.log(diffText);
  console.log('Next: npx tsc --noEmit -p tsconfig.json');
}

if (isRunDirectly(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}

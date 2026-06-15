import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface LoadedBuild {
  hash: string;
  branch: string;
  commitDate: string;
  commitMessage: string;
  dirty: boolean;
  timestamp: string;
  buildId: string;
}

export const DEV_SENTINEL: LoadedBuild = {
  hash: 'dev-unstamped',
  branch: 'unknown',
  commitDate: 'unknown',
  commitMessage: 'unknown',
  dirty: false,
  timestamp: 'unknown',
  buildId: 'dev-unstamped',
};

let cache: LoadedBuild | undefined;

function doRead(): LoadedBuild {
  try {
    // build-info.json sits beside this module's compiled output: dist/build-info.json.
    // This module compiles to dist/utils/build-info.js → one level up is dist/.
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const buildInfoPath = join(scriptDir, '..', 'build-info.json');
    if (!existsSync(buildInfoPath)) return DEV_SENTINEL;
    const raw = JSON.parse(readFileSync(buildInfoPath, 'utf8')) as Partial<LoadedBuild>;
    const hash = raw.hash ?? 'unknown';
    const dirty = Boolean(raw.dirty);
    return {
      hash,
      branch: raw.branch ?? 'unknown',
      commitDate: raw.commitDate ?? 'unknown',
      commitMessage: raw.commitMessage ?? 'unknown',
      dirty,
      timestamp: raw.timestamp ?? 'unknown',
      buildId: `${hash}${dirty ? '-dirty' : ''}`,
    };
  } catch {
    return DEV_SENTINEL;
  }
}

/**
 * Returns the build metadata stamped into dist/ at compile time, read ONCE and
 * memoized. The first call (warmed at process start by version.ts) captures the
 * loaded artifact; later disk rebuilds do not change the returned value — that is
 * what lets the version endpoint detect a stale process.
 */
export function readLoadedBuild(): LoadedBuild {
  if (cache) return cache;
  cache = doRead();
  return cache;
}

/** Test-only: clear the memoized value so each test reads fresh. */
export function __resetBuildInfoCacheForTests(): void {
  cache = undefined;
}

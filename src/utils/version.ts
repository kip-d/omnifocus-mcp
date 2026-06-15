import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readLoadedBuild } from './build-info.js';

export interface VersionInfo {
  name: string;
  version: string;
  description: string;
  build: {
    hash: string;
    branch: string;
    commitDate: string;
    commitMessage: string;
    dirty: boolean;
    timestamp: string;
    buildId: string;
  };
  runtime: {
    node: string;
    platform: string;
    arch: string;
  };
  git: {
    repository: string;
    homepage: string;
  };
  checkout: { hash: string };
  stale: boolean;
  warning?: string;
  process: { startedAt: string; uptimeSeconds: number };
}

interface PackageJson {
  name: string;
  version: string;
  description: string;
  repository?: { url?: string };
  homepage?: string;
}

// Captured once, at process start: makes buildId reflect load-time, not first-request time.
const PROCESS_STARTED_AT = new Date(Date.now() - process.uptime() * 1000).toISOString();
// Warm the memoized loaded-build read at module load (process start).
readLoadedBuild();

function resolveProjectRoot(): string {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  // dist/utils/version.js → project root is two levels up.
  return join(scriptDir, '..', '..');
}

function readCheckoutHash(projectRoot: string): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: projectRoot }).trim();
  } catch {
    return 'unknown';
  }
}

// Request-time git, used ONLY for the dev fallback so dev output stays useful.
function readRequestTimeBuild(projectRoot: string): VersionInfo['build'] {
  const opt = { encoding: 'utf8' as const, cwd: projectRoot };
  let hash = 'unknown';
  let branch = 'unknown';
  let commitDate = 'unknown';
  let commitMessage = 'unknown';
  let dirty = false;
  try {
    hash = execSync('git rev-parse --short HEAD', opt).trim();
    branch = execSync('git rev-parse --abbrev-ref HEAD', opt).trim();
    commitDate = execSync('git show -s --format=%ci HEAD', opt).trim();
    commitMessage = execSync('git show -s --format=%s HEAD', opt).trim();
    try {
      dirty = execSync('git status --porcelain', opt).trim().length > 0;
    } catch {
      /* assume clean */
    }
  } catch {
    /* defaults */
  }
  return {
    hash,
    branch,
    commitDate,
    commitMessage,
    dirty,
    timestamp: new Date().toISOString(),
    buildId: 'dev-unstamped',
  };
}

export function getVersionInfo(): VersionInfo {
  const projectRoot = resolveProjectRoot();
  const packagePath = join(projectRoot, 'package.json');
  if (!existsSync(packagePath)) {
    throw new Error(`Cannot find package.json at ${packagePath}.`);
  }
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as PackageJson;

  const loaded = readLoadedBuild();
  const isDev = loaded.buildId === 'dev-unstamped';

  const build: VersionInfo['build'] = isDev
    ? readRequestTimeBuild(projectRoot)
    : {
        hash: loaded.hash,
        branch: loaded.branch,
        commitDate: loaded.commitDate,
        commitMessage: loaded.commitMessage,
        dirty: loaded.dirty,
        timestamp: loaded.timestamp,
        buildId: loaded.buildId,
      };

  const checkoutHash = readCheckoutHash(projectRoot);
  const stale = !isDev && checkoutHash !== 'unknown' && loaded.hash !== checkoutHash;
  const warning = stale
    ? `stale process: loaded build ${loaded.hash} but checkout is ${checkoutHash} — restart the server`
    : undefined;

  return {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    build,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    git: {
      repository: packageJson.repository?.url || 'unknown',
      homepage: packageJson.homepage || 'unknown',
    },
    checkout: { hash: checkoutHash },
    stale,
    ...(warning ? { warning } : {}),
    process: { startedAt: PROCESS_STARTED_AT, uptimeSeconds: process.uptime() },
  };
}

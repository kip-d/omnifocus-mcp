import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
}

export function getVersionInfo(): VersionInfo {
  // Get package.json version - find project root using script location
  // This works regardless of what working directory the process was started from
  const scriptPath = fileURLToPath(import.meta.url);
  const scriptDir = dirname(scriptPath);

  // From dist/utils/version.js, go up to project root
  // script location: dist/utils/version.js
  // project root: go up 2 levels (../.. from dist/utils)
  const projectRoot = join(scriptDir, '..', '..');
  const packagePath = join(projectRoot, 'package.json');

  if (!existsSync(packagePath)) {
    throw new Error(`Cannot find package.json at ${packagePath}. Script location: ${scriptPath}`);
  }

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

  // Get git information
  let gitCommitHash = 'unknown';
  let gitBranch = 'unknown';
  let gitCommitDate = 'unknown';
  let gitCommitMessage = 'unknown';
  let gitDirty = false;

  try {
    // Run git commands from the project root directory
    const gitOptions = { encoding: 'utf8' as const, cwd: projectRoot };

    // Get current commit hash
    gitCommitHash = execSync('git rev-parse HEAD', gitOptions).trim();

    // Get short commit hash
    const shortHash = execSync('git rev-parse --short HEAD', gitOptions).trim();

    // Get current branch
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', gitOptions).trim();

    // Get commit date
    gitCommitDate = execSync('git show -s --format=%ci HEAD', gitOptions).trim();

    // Get commit message
    gitCommitMessage = execSync('git show -s --format=%s HEAD', gitOptions).trim();

    // Check if working directory is dirty
    try {
      const status = execSync('git status --porcelain', gitOptions).trim();
      gitDirty = status.length > 0;
    } catch (e) {
      // If git status fails, assume clean
    }

    gitCommitHash = shortHash; // Use short hash for display
  } catch (error) {
    // If git commands fail, use defaults
  }

  // Get build timestamp
  const buildTimestamp = new Date().toISOString();

  // Get Node.js version
  const nodeVersion = process.version;

  // Get platform information
  const platform = process.platform;
  const arch = process.arch;

  return {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    build: {
      hash: gitCommitHash,
      branch: gitBranch,
      commitDate: gitCommitDate,
      commitMessage: gitCommitMessage,
      dirty: gitDirty,
      timestamp: buildTimestamp,
      buildId: `${gitCommitHash}${gitDirty ? '-dirty' : ''}`,
    },
    runtime: {
      node: nodeVersion,
      platform: platform,
      arch: arch,
    },
    git: {
      repository: packageJson.repository?.url || 'unknown',
      homepage: packageJson.homepage || 'unknown',
    },
  };
}

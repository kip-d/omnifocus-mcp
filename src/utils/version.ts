import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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
  // Get package.json version - find project root
  // Try current directory first, then parent directory (for dist builds)
  let packagePath = join(process.cwd(), 'package.json');
  if (!existsSync(packagePath)) {
    // If we're likely in the dist directory, go up one level
    const parentPath = join(process.cwd(), '..', 'package.json');
    if (existsSync(parentPath)) {
      packagePath = parentPath;
    } else {
      throw new Error(`Cannot find package.json in current directory (${process.cwd()}) or parent directory`);
    }
  }
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  
  // Get git information
  let gitCommitHash = 'unknown';
  let gitBranch = 'unknown';
  let gitCommitDate = 'unknown';
  let gitCommitMessage = 'unknown';
  let gitDirty = false;
  
  try {
    // Get current commit hash
    gitCommitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    
    // Get short commit hash
    const shortHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    
    // Get current branch
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    
    // Get commit date
    gitCommitDate = execSync('git show -s --format=%ci HEAD', { encoding: 'utf8' }).trim();
    
    // Get commit message
    gitCommitMessage = execSync('git show -s --format=%s HEAD', { encoding: 'utf8' }).trim();
    
    // Check if working directory is dirty
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
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
      buildId: `${gitCommitHash}${gitDirty ? '-dirty' : ''}`
    },
    runtime: {
      node: nodeVersion,
      platform: platform,
      arch: arch
    },
    git: {
      repository: packageJson.repository?.url || 'unknown',
      homepage: packageJson.homepage || 'unknown'
    }
  };
}
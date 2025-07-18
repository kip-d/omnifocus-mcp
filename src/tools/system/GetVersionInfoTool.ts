import { BaseTool } from '../base.js';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

export class GetVersionInfoTool extends BaseTool {
  name = 'get_version_info';
  description = 'Get version information including git commit hash and build details';
  
  inputSchema = {
    type: 'object' as const,
    properties: {},
  };

  async execute(): Promise<any> {
    try {
      // Get package.json version
      const packagePath = join(process.cwd(), 'package.json');
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
        this.logger.warn('Failed to get git information:', error);
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
    } catch (error) {
      return this.handleError(error);
    }
  }
}
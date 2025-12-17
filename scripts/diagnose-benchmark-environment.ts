#!/usr/bin/env node
/**
 * Diagnostic script to gather OmniFocus database state for benchmark analysis
 * Run this on each machine to compare what's different
 */

import { execSync } from 'child_process';
import { cpus, totalmem } from 'os';

interface DiagnosticData {
  hardware: {
    machine: string;
    cpu: string;
    cores: number;
    memory: string;
    nodeVersion: string;
  };
  omnifocus: {
    totalTasks: number;
    activeTasks: number;
    completedTasks: number;
    todayTasks: number;
    overdueTasks: number;
    flaggedTasks: number;
    totalProjects: number;
    activeProjects: number;
    totalTags: number;
  };
  timing: {
    timestamp: string;
    timezoneOffset: number;
  };
}

async function gatherDiagnostics(): Promise<DiagnosticData> {
  console.error('Gathering hardware information...');

  const hardware = {
    machine: `${process.platform} ${process.arch}`,
    cpu: cpus()[0].model,
    cores: cpus().length,
    memory: `${Math.round(totalmem() / 1024 ** 3)} GB`,
    nodeVersion: process.version,
  };

  console.error('Querying OmniFocus database state...');

  // Build the project first
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: '/Users/kip/src/omnifocus-mcp' });
  } catch (error) {
    console.error('Warning: Build failed, using existing dist/');
  }

  const mcpPath = '/Users/kip/src/omnifocus-mcp/dist/index.js';

  // Helper to call MCP tools
  const callTool = (toolName: string, args: Record<string, any>): any => {
    // MCP requires initialization handshake before tool calls
    const initMessage = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'diagnostic-script',
          version: '1.0.0',
        },
      },
    });

    const toolMessage = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    });

    try {
      // Send both initialization and tool call in one stdin stream
      const output = execSync(`echo '${initMessage}\n${toolMessage}' | node ${mcpPath}`, {
        encoding: 'utf-8',
        timeout: 120000, // 2 minute timeout
      });

      // Parse MCP response - look for id: 2 (the tool call response)
      const lines = output.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          // Look for the tool call response (id: 2)
          if (parsed.id === 2 && parsed.result?.content?.[0]?.text) {
            return JSON.parse(parsed.result.content[0].text);
          }
        } catch {
          continue;
        }
      }
      return null;
    } catch (error: any) {
      console.error(`Tool ${toolName} failed:`, error.message);
      return null;
    }
  };

  // Gather OmniFocus stats
  console.error('  - Total tasks...');
  const allTasksResult = callTool('tasks', { mode: 'all', limit: '1', details: 'false', fastSearch: 'true' });

  console.error('  - Active tasks...');
  const activeTasksResult = callTool('tasks', { mode: 'available', limit: '1', details: 'false', fastSearch: 'true' });

  console.error('  - Today tasks...');
  const todayTasksResult = callTool('tasks', { mode: 'today', limit: '1', details: 'false', fastSearch: 'true' });

  console.error('  - Overdue tasks...');
  const overdueTasksResult = callTool('tasks', { mode: 'overdue', limit: '1', details: 'false', fastSearch: 'true' });

  console.error('  - Flagged tasks...');
  const flaggedTasksResult = callTool('tasks', { mode: 'flagged', limit: '1', details: 'false', fastSearch: 'true' });

  console.error('  - Projects...');
  const projectsResult = callTool('projects', { operation: 'list', limit: '1', details: 'false' });

  console.error('  - Tags...');
  const tagsResult = callTool('tags', {
    operation: 'list',
    sortBy: 'name',
    includeEmpty: 'false',
    includeUsageStats: 'false',
    includeTaskCounts: 'false',
    fastMode: 'true',
    namesOnly: 'true',
  });

  const omnifocus = {
    totalTasks: allTasksResult?.metadata?.totalCount ?? 0,
    activeTasks: activeTasksResult?.metadata?.totalCount ?? 0,
    completedTasks: 0, // Will calculate
    todayTasks: todayTasksResult?.metadata?.totalCount ?? 0,
    overdueTasks: overdueTasksResult?.metadata?.totalCount ?? 0,
    flaggedTasks: flaggedTasksResult?.metadata?.totalCount ?? 0,
    totalProjects: projectsResult?.metadata?.totalCount ?? 0,
    activeProjects: projectsResult?.metadata?.activeCount ?? 0,
    totalTags: Array.isArray(tagsResult?.data) ? tagsResult.data.length : 0,
  };

  omnifocus.completedTasks = omnifocus.totalTasks - omnifocus.activeTasks;

  return {
    hardware,
    omnifocus,
    timing: {
      timestamp: new Date().toISOString(),
      timezoneOffset: new Date().getTimezoneOffset(),
    },
  };
}

// Main execution
gatherDiagnostics()
  .then((data) => {
    console.log('\n=== DIAGNOSTIC RESULTS ===\n');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n=== END DIAGNOSTICS ===\n');
  })
  .catch((error) => {
    console.error('Diagnostic failed:', error);
    process.exit(1);
  });

#!/usr/bin/env npx tsx
/**
 * Cache Warming Diagnostics
 *
 * Measures individual cache warming operations to identify bottlenecks.
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';

interface WarmingResult {
  operation: string;
  duration: number;
  success: boolean;
}

let mcpProcess: any = null;
let requestId = 1;

function startMCPServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Starting MCP server with cache warming...');
    mcpProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env } // Cache warming enabled by default
    });

    const startTime = performance.now();
    let serverReady = false;

    mcpProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      // Only show JSON-RPC responses
      if (output.trim().startsWith('{')) {
        console.log('[JSON-RPC]', output.trim());
      }
    });

    mcpProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString();

      // Look for cache warming completion in stderr (where logs actually go)
      if (output.includes('Cache warming completed')) {
        const match = output.match(/(\d+)\/(\d+) operations succeeded in (\d+)ms/);
        if (match) {
          const [, successCount, totalCount, totalTime] = match;
          console.log(`\n✓ Cache warming: ${successCount}/${totalCount} operations in ${totalTime}ms\n`);
        }
        if (!serverReady) {
          serverReady = true;
          const totalDuration = performance.now() - startTime;
          console.log(`✓ Server startup complete in ${totalDuration.toFixed(0)}ms\n`);
          resolve();
        }
      }

      // Look for individual operation timings
      if (output.includes('cache warmed in') || output.includes('ms ✓') || output.includes('ms ✗')) {
        const match = output.match(/•\s+(\w+):\s+(\d+)ms\s+(✓|✗)/);
        if (match) {
          const [, operation, duration, status] = match;
          console.log(`  → ${operation}: ${duration}ms ${status}`);
        }
      }

      // Show warnings/errors
      if (output.includes('WARN') || output.includes('ERROR')) {
        console.error('[WARN/ERROR]', output.trim());
      }
    });

    mcpProcess.on('error', reject);

    // Send initialize after server starts
    setTimeout(() => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'diagnostic', version: '1.0.0' }
        }
      };
      mcpProcess.stdin.write(JSON.stringify(initRequest) + '\n');
    }, 100);

    setTimeout(() => {
      if (!serverReady) {
        console.error('\n✗ Server startup timeout after 300s');
        reject(new Error('Server startup timeout'));
      }
    }, 300000); // 5 minute timeout to allow for cache warming (server has 240s timeout)
  });
}

function stopMCPServer(): void {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpProcess = null;
  }
}

async function main() {
  console.log('OmniFocus MCP Cache Warming Diagnostics');
  console.log('========================================\n');

  try {
    await startMCPServer();

    console.log('\nServer started successfully. Check the output above for cache warming timings.\n');

    // Keep server alive briefly to ensure all logs are captured
    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    console.error('Diagnostic failed:', error);
    process.exit(1);
  } finally {
    stopMCPServer();
  }
}

main();

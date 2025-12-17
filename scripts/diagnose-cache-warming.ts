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
const warmingResults: WarmingResult[] = [];
let actualTotalTime: number | null = null;

function startMCPServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Starting MCP server with cache warming...');
    mcpProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }, // Cache warming enabled by default
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

      // Look for individual operation timings FIRST (format: "• operation: 123ms ✓")
      // Parse all lines in this chunk to capture all operations
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('•') && (line.includes('ms ✓') || line.includes('ms ✗'))) {
          const match = line.match(/•\s+([\w_]+):\s+(\d+)ms\s+(✓|✗)/);
          if (match) {
            const [, operation, duration, status] = match;
            warmingResults.push({
              operation,
              duration: parseInt(duration, 10),
              success: status === '✓',
            });
          }
        }
      }

      // Look for cache warming completion in stderr (where logs actually go)
      if (output.includes('Cache warming completed')) {
        const match = output.match(/(\d+)\/(\d+) operations succeeded in (\d+)ms/);
        if (match) {
          const [, successCount, totalCount, totalTime] = match;
          actualTotalTime = parseInt(totalTime, 10);
          console.log(`\n✓ Cache warming: ${successCount}/${totalCount} operations in ${totalTime}ms\n`);
        }
        if (!serverReady) {
          serverReady = true;
          const totalDuration = performance.now() - startTime;
          console.log(`✓ Server startup complete in ${totalDuration.toFixed(0)}ms\n`);
          resolve();
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
          clientInfo: { name: 'diagnostic', version: '1.0.0' },
        },
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

function stopMCPServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!mcpProcess) {
      resolve();
      return;
    }

    console.log('\nShutting down MCP server gracefully...');

    // Close stdin to signal graceful shutdown per MCP spec
    try {
      mcpProcess.stdin.end();
    } catch (e) {
      // stdin already closed, that's fine
    }

    // Wait for server to exit gracefully (it will wait for pending operations)
    const gracefulExitTimeout = setTimeout(() => {
      console.log('⚠️  Server did not exit gracefully within 5s, sending SIGTERM...');
      mcpProcess.kill('SIGTERM');

      // Last resort: force kill after another 2s
      setTimeout(() => {
        if (!mcpProcess.killed) {
          console.log('⚠️  Server did not respond to SIGTERM, sending SIGKILL...');
          mcpProcess.kill('SIGKILL');
        }
        mcpProcess = null;
        resolve();
      }, 2000);
    }, 5000);

    // If server exits naturally, clear the timeout
    mcpProcess.once('exit', (exitCode: number | null) => {
      clearTimeout(gracefulExitTimeout);
      if (exitCode === 0) {
        console.log('✓ Server exited gracefully');
      } else {
        console.log(`⚠️  Server exited with code ${exitCode}`);
      }
      mcpProcess = null;
      resolve();
    });
  });
}

async function main() {
  console.log('OmniFocus MCP Cache Warming Diagnostics');
  console.log('========================================\n');

  try {
    await startMCPServer();

    // Keep server alive briefly to ensure all logs are captured
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Display breakdown of cache warming operations
    console.log('\n📊 Cache Warming Breakdown:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (warmingResults.length === 0) {
      console.log('⚠️  No cache warming operations detected');
    } else {
      // Sort by duration (slowest first)
      const sorted = [...warmingResults].sort((a, b) => b.duration - a.duration);

      const slowest = sorted[0].duration;
      for (const result of sorted) {
        const statusIcon = result.success ? '✓' : '✗';
        // Scale bars relative to slowest operation (max 100 chars)
        const barLength = Math.ceil((result.duration / slowest) * 100);
        const bar = '█'.repeat(barLength);
        console.log(
          `  ${statusIcon} ${result.operation.padEnd(15)} ${result.duration.toString().padStart(6)}ms  ${bar}`,
        );
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Use actual total time (operations run in parallel!)
      if (actualTotalTime !== null) {
        console.log(`  Actual total (parallel): ${actualTotalTime}ms across ${warmingResults.length} operations`);
        const summed = warmingResults.reduce((sum, r) => sum + r.duration, 0);
        console.log(`  If sequential: ${summed}ms (${(summed / actualTotalTime).toFixed(1)}x slower)`);
      } else {
        const summed = warmingResults.reduce((sum, r) => sum + r.duration, 0);
        console.log(`  Sequential time: ${summed}ms across ${warmingResults.length} operations`);
        console.log(`  ⚠️  Actual parallel time not captured`);
      }

      console.log(`  Success rate: ${warmingResults.filter((r) => r.success).length}/${warmingResults.length}`);
    }

    await stopMCPServer();
    console.log('\n✓ Diagnostics complete');
    process.exit(0);
  } catch (error) {
    console.error('Diagnostic failed:', error);
    await stopMCPServer();
    process.exit(1);
  }
}

main();

#!/usr/bin/env npx tsx
/**
 * Detailed Analytics Benchmarking Script
 *
 * Tests individual analytics operations with detailed timing to identify
 * optimization opportunities and measure improvements.
 *
 * Usage:
 *   npm run build && npx tsx scripts/benchmark-analytics.ts
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';

interface BenchmarkResult {
  operation: string;
  avgTime: number;
  minTime: number;
  maxTime: number;
  iterations: number;
  details?: any;
}

// MCP server process
let mcpProcess: any = null;
let requestId = 1;

function startMCPServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    mcpProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_CACHE_WARMING: 'true' },
    });

    let initReceived = false;

    mcpProcess.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          if (response.id === 1 && !initReceived) {
            initReceived = true;
            resolve();
          }
        } catch (e) {
          // Ignore non-JSON output (logs)
        }
      }
    });

    mcpProcess.stderr.on('data', (data: Buffer) => {
      // Ignore stderr (logs)
    });

    mcpProcess.on('error', (error: Error) => {
      reject(error);
    });

    // Send initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'benchmark', version: '1.0.0' },
      },
    };

    mcpProcess.stdin.write(JSON.stringify(initRequest) + '\n');

    setTimeout(() => {
      if (!initReceived) {
        reject(new Error('MCP server initialization timeout'));
      }
    }, 10000);
  });
}

function stopMCPServer(): void {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpProcess = null;
  }
}

async function callTool(toolName: string, args: any): Promise<{ time: number; result: any }> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const startTime = performance.now();

    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    let responseReceived = false;

    const timeout = setTimeout(() => {
      if (!responseReceived) {
        reject(new Error(`Tool ${toolName} timed out after 60s`));
      }
    }, 60000);

    const dataHandler = (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          if (response.id === id) {
            responseReceived = true;
            clearTimeout(timeout);
            const endTime = performance.now();
            mcpProcess.stdout.off('data', dataHandler);

            const time = endTime - startTime;
            resolve({ time, result: response.result });
          }
        } catch (e) {
          // Ignore non-JSON output
        }
      }
    };

    mcpProcess.stdout.on('data', dataHandler);
    mcpProcess.stdin.write(JSON.stringify(request) + '\n');
  });
}

async function benchmarkOperation(
  name: string,
  toolName: string,
  args: any,
  iterations: number = 3,
): Promise<BenchmarkResult> {
  console.log(`\n  Running: ${name}...`);

  const times: number[] = [];
  let lastResult: any = null;

  for (let i = 0; i < iterations; i++) {
    const { time, result } = await callTool(toolName, args);
    times.push(time);
    lastResult = result;

    // Small delay between iterations
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  console.log(`    Avg: ${avgTime.toFixed(0)}ms, Min: ${minTime.toFixed(0)}ms, Max: ${maxTime.toFixed(0)}ms`);

  return {
    operation: name,
    avgTime,
    minTime,
    maxTime,
    iterations,
    details: lastResult,
  };
}

function formatResults(results: BenchmarkResult[]): void {
  console.log('\n\n=== Detailed Analytics Benchmark Results ===\n');

  console.log('Operation                                | Avg Time  | Min Time  | Max Time  | Iterations');
  console.log('----------------------------------------|-----------|-----------|-----------|------------');

  for (const result of results) {
    const opName = result.operation.padEnd(39);
    const avg = `${Math.round(result.avgTime)}ms`.padStart(9);
    const min = `${Math.round(result.minTime)}ms`.padStart(9);
    const max = `${Math.round(result.maxTime)}ms`.padStart(9);
    const iter = result.iterations.toString().padStart(10);

    console.log(`${opName} | ${avg} | ${min} | ${max} | ${iter}`);
  }
}

async function main() {
  console.log('OmniFocus MCP Detailed Analytics Benchmarks');
  console.log('===========================================\n');

  const results: BenchmarkResult[] = [];

  try {
    console.log('Starting MCP server (NO_CACHE_WARMING=true)...');
    await startMCPServer();
    console.log('✓ MCP server ready\n');

    console.log('Running detailed benchmarks...');

    // Tags benchmarks
    console.log('\n--- Tags Benchmarks ---');

    results.push(
      await benchmarkOperation('Tags (names only)', 'tags', {
        operation: 'list',
        sortBy: 'name',
        includeEmpty: 'true',
        includeUsageStats: 'false',
        includeTaskCounts: 'false',
        fastMode: 'false',
        namesOnly: 'true',
      }),
    );

    results.push(
      await benchmarkOperation('Tags (fast mode)', 'tags', {
        operation: 'list',
        sortBy: 'name',
        includeEmpty: 'true',
        includeUsageStats: 'false',
        includeTaskCounts: 'false',
        fastMode: 'true',
        namesOnly: 'false',
      }),
    );

    results.push(
      await benchmarkOperation('Tags (full mode, no usage stats)', 'tags', {
        operation: 'list',
        sortBy: 'name',
        includeEmpty: 'true',
        includeUsageStats: 'false',
        includeTaskCounts: 'false',
        fastMode: 'false',
        namesOnly: 'false',
      }),
    );

    results.push(
      await benchmarkOperation('Tags (full mode, with usage stats)', 'tags', {
        operation: 'list',
        sortBy: 'name',
        includeEmpty: 'true',
        includeUsageStats: 'true',
        includeTaskCounts: 'false',
        fastMode: 'false',
        namesOnly: 'false',
      }),
    );

    // Productivity stats benchmarks
    console.log('\n--- Productivity Stats Benchmarks ---');

    results.push(
      await benchmarkOperation('Productivity stats (week, no details)', 'productivity_stats', {
        period: 'week',
        includeProjectStats: 'false',
        includeTagStats: 'false',
      }),
    );

    results.push(
      await benchmarkOperation('Productivity stats (week, with projects)', 'productivity_stats', {
        period: 'week',
        includeProjectStats: 'true',
        includeTagStats: 'false',
      }),
    );

    results.push(
      await benchmarkOperation('Productivity stats (week, with tags)', 'productivity_stats', {
        period: 'week',
        includeProjectStats: 'false',
        includeTagStats: 'true',
      }),
    );

    results.push(
      await benchmarkOperation('Productivity stats (week, full details)', 'productivity_stats', {
        period: 'week',
        includeProjectStats: 'true',
        includeTagStats: 'true',
      }),
    );

    // Task velocity benchmarks
    console.log('\n--- Task Velocity Benchmarks ---');

    results.push(
      await benchmarkOperation('Task velocity (7 days)', 'task_velocity', {
        days: '7',
        groupBy: 'day',
        includeWeekends: 'true',
      }),
    );

    results.push(
      await benchmarkOperation('Task velocity (30 days)', 'task_velocity', {
        days: '30',
        groupBy: 'day',
        includeWeekends: 'true',
      }),
    );

    formatResults(results);

    console.log('\n\n=== Performance Analysis ===\n');

    // Tags comparison
    const tagsNamesOnly = results.find((r) => r.operation.includes('names only'));
    const tagsFast = results.find((r) => r.operation.includes('fast mode'));
    const tagsFullNoStats = results.find((r) => r.operation.includes('no usage stats'));
    const tagsFullWithStats = results.find((r) => r.operation.includes('with usage stats'));

    if (tagsNamesOnly && tagsFast && tagsFullNoStats) {
      const fastVsNamesOnly = (((tagsFast.avgTime - tagsNamesOnly.avgTime) / tagsNamesOnly.avgTime) * 100).toFixed(1);
      const fullVsFast = (((tagsFullNoStats.avgTime - tagsFast.avgTime) / tagsFast.avgTime) * 100).toFixed(1);

      console.log('Tags Performance:');
      console.log(
        `  Fast mode vs Names only: +${fastVsNamesOnly}% slower (${tagsFast.avgTime.toFixed(0)}ms vs ${tagsNamesOnly.avgTime.toFixed(0)}ms)`,
      );
      console.log(
        `  Full mode vs Fast mode: +${fullVsFast}% slower (${tagsFullNoStats.avgTime.toFixed(0)}ms vs ${tagsFast.avgTime.toFixed(0)}ms)`,
      );
      console.log(`  → Parent hierarchy adds ${(tagsFullNoStats.avgTime - tagsFast.avgTime).toFixed(0)}ms overhead`);
    }

    if (tagsFullWithStats && tagsFullNoStats) {
      const statsOverhead = (
        ((tagsFullWithStats.avgTime - tagsFullNoStats.avgTime) / tagsFullNoStats.avgTime) *
        100
      ).toFixed(1);
      console.log(
        `  Usage stats adds +${statsOverhead}% (${(tagsFullWithStats.avgTime - tagsFullNoStats.avgTime).toFixed(0)}ms) - already optimized with OmniJS bridge`,
      );
    }

    // Productivity stats comparison
    const statsNoDetails = results.find((r) => r.operation.includes('no details'));
    const statsWithProjects = results.find((r) => r.operation.includes('with projects'));
    const statsWithTags = results.find((r) => r.operation.includes('with tags'));
    const statsFull = results.find((r) => r.operation.includes('full details'));

    if (statsNoDetails && statsWithProjects && statsWithTags && statsFull) {
      console.log('\nProductivity Stats Performance:');
      console.log(`  Base overhead: ${statsNoDetails.avgTime.toFixed(0)}ms (task iteration bottleneck)`);
      console.log(`  + Project stats: +${(statsWithProjects.avgTime - statsNoDetails.avgTime).toFixed(0)}ms`);
      console.log(`  + Tag stats: +${(statsWithTags.avgTime - statsNoDetails.avgTime).toFixed(0)}ms`);
      console.log(`  Full details: ${statsFull.avgTime.toFixed(0)}ms total`);
      console.log(`  → Main bottleneck: Task iteration (lines 146-180 in productivity-stats.ts)`);
    }

    console.log('\n📊 Benchmark complete!\n');
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  } finally {
    stopMCPServer();
  }
}

main();

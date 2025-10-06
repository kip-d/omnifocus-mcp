#!/usr/bin/env node
/**
 * Performance Benchmark Script
 *
 * Validates claimed performance improvements from CHANGELOG.md
 * Uses same pattern as test-as-claude-desktop.js for reliability
 *
 * Usage: npm run benchmark
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { performance } from 'perf_hooks';
import * as os from 'os';

interface BenchmarkResult {
  operation: string;
  iterations: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  percentile95: number;
}

let requestId = 1;
const times: Record<string, number[]> = {};
let benchmarkStartTime = 0;
const results: BenchmarkResult[] = [];

// Spawn server once - with or without cache warming based on BENCHMARK_MODE env var
// BENCHMARK_MODE=cold - No cache warming (measures cold-start performance)
// BENCHMARK_MODE=warm - With cache warming (measures production performance)
const benchmarkMode = process.env.BENCHMARK_MODE || 'cold';
const enableCacheWarming = benchmarkMode === 'warm';

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],  // Pipe stderr so we can detect cache warming completion
  env: {
    ...process.env,
    NO_CACHE_WARMING: enableCacheWarming ? 'false' : 'true',
    OMNIFOCUS_SCRIPT_TIMEOUT: '240000',  // 240 second (4 minute) timeout (vs default 120s)
  },
});

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity,
});

// Track cache warming completion and timing
let cacheWarmingComplete = !enableCacheWarming; // If disabled, consider it "complete"
let cacheWarmingStartTime = 0;
let cacheWarmingDuration = 0;

if (server.stderr) {
  server.stderr.on('data', (data) => {
    const output = data.toString();
    // Forward stderr to console in debug mode
    if (process.env.DEBUG) {
      process.stderr.write(output);
    }

    // Track cache warming start
    if (output.includes('Starting cache warming')) {
      cacheWarmingStartTime = performance.now();
    }

    // Track cache warming completion
    if (output.includes('Cache warming completed')) {
      cacheWarmingDuration = performance.now() - cacheWarmingStartTime;
      cacheWarmingComplete = true;
      console.log(`  ✓ Cache warming completed in ${cacheWarmingDuration.toFixed(0)}ms\n`);
    }
  });
}

const sendRequest = (method: string, params: Record<string, unknown> = {}) => {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId++,
  };
  server.stdin.write(JSON.stringify(request) + '\n');
};

const sendToolCall = (name: string, args: Record<string, unknown> = {}) => {
  benchmarkStartTime = performance.now();
  sendRequest('tools/call', { name, arguments: args });
};

const recordTime = (label: string, time: number) => {
  if (!times[label]) times[label] = [];
  times[label].push(time);
};

const calculateStats = (label: string, times: number[]): BenchmarkResult => {
  const sorted = [...times].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);

  return {
    operation: label,
    iterations: times.length,
    avgTime: times.reduce((a, b) => a + b, 0) / times.length,
    minTime: sorted[0],
    maxTime: sorted[sorted.length - 1],
    percentile95: sorted[p95Index] || sorted[sorted.length - 1],
  };
};

const getSystemInfo = (): string => {
  const cpus = os.cpus();
  const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(0);

  return `Hardware Information:
  Machine: ${os.platform()} ${os.arch()}
  CPU: ${cpus[0]?.model || 'Unknown'}
  Cores: ${cpus.length}
  Memory: ${totalMem} GB
  Node Version: ${process.version}
`;
};

const cleanup = (code: number = 0) => {
  server.stdin.end();
  setTimeout(() => process.exit(code), 1000);
};

const displayResults = () => {
  console.log('\n\n=== Benchmark Results ===\n');
  console.log('Operation                    | Avg Time  | Min Time  | Max Time  | P95 Time  | Iterations');
  console.log('----------------------------|-----------|-----------|-----------|-----------|------------');

  for (const label of Object.keys(times)) {
    if (times[label] && times[label].length > 0) {
      const stats = calculateStats(label, times[label]);
      const op = stats.operation.padEnd(28);
      console.log(
        `${op}| ${stats.avgTime.toFixed(0).padStart(8)}ms | ${stats.minTime.toFixed(0).padStart(8)}ms | ${stats.maxTime.toFixed(0).padStart(8)}ms | ${stats.percentile95.toFixed(0).padStart(8)}ms | ${stats.iterations.toString().padStart(10)}`
      );
      results.push(stats);
    }
  }

  // Performance comparisons
  console.log('\n\n=== Performance Comparisons ===\n');

  const tagsNamesOnly = times['Tags (names only)'];
  const tagsFull = times['Tags (full mode)'];

  if (tagsNamesOnly && tagsFull) {
    const avgNamesOnly = tagsNamesOnly.reduce((a, b) => a + b, 0) / tagsNamesOnly.length;
    const avgFull = tagsFull.reduce((a, b) => a + b, 0) / tagsFull.length;
    const improvement = ((avgFull - avgNamesOnly) / avgFull) * 100;

    console.log(`Tags (namesOnly vs full): ${improvement.toFixed(1)}% faster (${avgFull.toFixed(0)}ms → ${avgNamesOnly.toFixed(0)}ms)`);
  }

  const tagsFast = times['Tags (fast mode)'];
  if (tagsFast && tagsFull) {
    const avgFast = tagsFast.reduce((a, b) => a + b, 0) / tagsFast.length;
    const avgFull = tagsFull.reduce((a, b) => a + b, 0) / tagsFull.length;
    const improvement = ((avgFull - avgFast) / avgFull) * 100;

    console.log(`Tags (fast vs full): ${improvement.toFixed(1)}% faster (${avgFull.toFixed(0)}ms → ${avgFast.toFixed(0)}ms)`);
  }

  // Cache warming info
  if (enableCacheWarming && cacheWarmingDuration > 0) {
    console.log(`\nCache warming: ${cacheWarmingDuration.toFixed(0)}ms (${(cacheWarmingDuration / 1000).toFixed(1)}s)`);
  }

  console.log('\n📊 Benchmark complete!');
};

rl.on('line', (line) => {
  let response;
  try {
    response = JSON.parse(line);
  } catch (e) {
    return; // Ignore non-JSON
  }

  switch (response.id) {
    case 1: {
      // Initialize response
      console.log('OmniFocus MCP Performance Benchmarks');
      console.log('=====================================\n');
      console.log(getSystemInfo());

      if (enableCacheWarming) {
        console.log('\nMode: WARMED CACHE (production performance)');
        console.log('Waiting for cache warming to complete...\n');

        // Poll for cache warming completion
        const checkInterval = setInterval(() => {
          if (cacheWarmingComplete) {
            clearInterval(checkInterval);
            console.log('Running benchmarks...\n');
            process.stdout.write('  Running: Today\'s tasks... ');
            sendToolCall('tasks', { mode: 'today', limit: '25', details: 'false' });
          }
        }, 500);
      } else {
        console.log('\nMode: COLD CACHE (first-run performance)');
        console.log('Cache warming disabled for this run.\n');
        console.log('Running benchmarks...\n');

        // Start first test immediately
        process.stdout.write('  Running: Today\'s tasks... ');
        sendToolCall('tasks', { mode: 'today', limit: '25', details: 'false' });
      }
      break;
    }

    case 2: {
      // Today's tasks
      const elapsed = performance.now() - benchmarkStartTime;
      recordTime('Today\'s tasks', elapsed);
      console.log(`${elapsed.toFixed(0)}ms`);

      process.stdout.write('  Running: Overdue tasks... ');
      sendToolCall('tasks', { mode: 'overdue', limit: '25', details: 'false' });
      break;
    }

    case 3: {
      // Overdue tasks
      const elapsed = performance.now() - benchmarkStartTime;
      recordTime('Overdue tasks', elapsed);
      console.log(`${elapsed.toFixed(0)}ms`);

      process.stdout.write('  Running: Upcoming tasks... ');
      sendToolCall('tasks', { mode: 'upcoming', daysAhead: '7', limit: '25', details: 'false' });
      break;
    }

    case 4: {
      // Upcoming tasks
      const elapsed = performance.now() - benchmarkStartTime;
      recordTime('Upcoming tasks', elapsed);
      console.log(`${elapsed.toFixed(0)}ms`);

      process.stdout.write('  Running: Project statistics... ');
      sendToolCall('projects', { operation: 'stats', limit: '25', details: 'false' });
      break;
    }

    case 5: {
      // Project statistics
      const elapsed = performance.now() - benchmarkStartTime;
      recordTime('Project statistics', elapsed);
      console.log(`${elapsed.toFixed(0)}ms`);

      process.stdout.write('  Running: Tags (names only)... ');
      sendToolCall('tags', { operation: 'list', namesOnly: 'true', sortBy: 'name', includeEmpty: 'false', includeUsageStats: 'false', includeTaskCounts: 'false', fastMode: 'false' });
      break;
    }

    case 6: {
      // Tags (names only)
      const elapsed = performance.now() - benchmarkStartTime;
      recordTime('Tags (names only)', elapsed);
      console.log(`${elapsed.toFixed(0)}ms`);

      process.stdout.write('  Running: Tags (fast mode)... ');
      sendToolCall('tags', { operation: 'list', namesOnly: 'false', sortBy: 'name', includeEmpty: 'false', includeUsageStats: 'false', includeTaskCounts: 'false', fastMode: 'true' });
      break;
    }

    case 7: {
      // Tags (fast mode)
      const elapsed = performance.now() - benchmarkStartTime;
      recordTime('Tags (fast mode)', elapsed);
      console.log(`${elapsed.toFixed(0)}ms`);

      process.stdout.write('  Running: Tags (full mode)... ');
      sendToolCall('tags', { operation: 'list', namesOnly: 'false', sortBy: 'name', includeEmpty: 'false', includeUsageStats: 'true', includeTaskCounts: 'false', fastMode: 'false' });
      break;
    }

    case 8: {
      // Tags (full mode)
      const elapsed = performance.now() - benchmarkStartTime;
      recordTime('Tags (full mode)', elapsed);
      console.log(`${elapsed.toFixed(0)}ms`);

      process.stdout.write('  Running: Productivity stats... ');
      sendToolCall('productivity_stats', { period: 'week', includeProjectStats: 'false', includeTagStats: 'false' });
      break;
    }

    case 9: {
      // Productivity stats
      const elapsed = performance.now() - benchmarkStartTime;
      recordTime('Productivity stats', elapsed);
      console.log(`${elapsed.toFixed(0)}ms`);

      process.stdout.write('  Running: Task velocity... ');
      sendToolCall('task_velocity', { days: '7', groupBy: 'day', includeWeekends: 'false' });
      break;
    }

    case 10: {
      // Task velocity - final test
      const elapsed = performance.now() - benchmarkStartTime;
      recordTime('Task velocity', elapsed);
      console.log(`${elapsed.toFixed(0)}ms`);

      // All tests complete
      displayResults();
      cleanup(0);
      break;
    }

    default: {
      // Unexpected response
      console.error(`\n❌ Unexpected response ID: ${response.id}`);
      cleanup(1);
    }
  }
});

server.on('error', (err) => {
  console.error(`Server error: ${err.message}`);
  cleanup(1);
});

server.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Server exited with code ${code}`);
    process.exit(code || 1);
  }
});

// Start handshake
sendRequest('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: {
    name: 'benchmark-test',
    version: '2.2.0',
  },
});

// Timeout (generous for cold cache queries - 10 tests * 180s max each = 30 minutes)
setTimeout(() => {
  console.error('\n❌ Benchmark timed out after 30 minutes');
  cleanup(1);
}, 1800000);

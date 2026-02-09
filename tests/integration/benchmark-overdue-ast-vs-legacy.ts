/**
 * Benchmark: Legacy overdue script vs AST-generated overdue query
 *
 * Compares performance and result parity between the hand-concatenated
 * OmniJS bridge script and the AST builder approach.
 *
 * Run: npx tsx tests/integration/benchmark-overdue-ast-vs-legacy.ts
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT } from '../../src/omnifocus/scripts/date-range-queries.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '../../dist/index.js');

const ITERATIONS = 3;
const LIMIT = 50;

interface BenchmarkResult {
  approach: string;
  taskCount: number;
  timings: number[];
  minMs: number;
  avgMs: number;
  maxMs: number;
  error?: string;
  /** Script-only execution time from MCP metadata (excludes server startup) */
  scriptTimings?: number[];
}

// --- Legacy approach: run the overdue script directly via osascript ---

function runLegacyOverdue(limit: number): { taskCount: number; timeMs: number; error?: string } {
  const script = GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT.replace('{{limit}}', String(limit)).replace(
    '{{includeCompleted}}',
    'false',
  );

  const tmpFile = join(tmpdir(), `benchmark-legacy-overdue-${Date.now()}.js`);
  writeFileSync(tmpFile, script, 'utf-8');

  const start = performance.now();
  try {
    const output = execSync(`osascript -l JavaScript "${tmpFile}"`, {
      timeout: 60000,
      encoding: 'utf-8',
    });
    const elapsed = performance.now() - start;
    unlinkSync(tmpFile);
    const data = JSON.parse(output);
    if (data.error) {
      return { taskCount: 0, timeMs: elapsed, error: data.message };
    }
    return { taskCount: data.tasks?.length ?? 0, timeMs: elapsed };
  } catch (e: unknown) {
    const elapsed = performance.now() - start;
    try {
      unlinkSync(tmpFile);
    } catch {
      /* cleanup best-effort */
    }
    return { taskCount: 0, timeMs: elapsed, error: (e as Error).message?.slice(0, 200) };
  }
}

// --- AST approach: run via MCP tool call using shell pipe ---

function runASTOverdue(limit: number): { taskCount: number; timeMs: number; scriptTimeMs?: number; error?: string } {
  // Build the MCP messages as a shell heredoc
  const initMsg = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'benchmark', version: '1.0.0' },
    },
  });

  const initializedMsg = JSON.stringify({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });

  const toolCallMsg = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'omnifocus_read',
      arguments: {
        query: {
          type: 'tasks',
          mode: 'overdue',
          limit,
        },
      },
    },
  });

  // Write messages to a temp file for clean piping
  const inputFile = join(tmpdir(), `benchmark-mcp-input-${Date.now()}.txt`);
  writeFileSync(inputFile, `${initMsg}\n${initializedMsg}\n${toolCallMsg}\n`, 'utf-8');

  const start = performance.now();
  try {
    const output = execSync(`cat "${inputFile}" | node "${serverPath}" 2>/dev/null`, {
      timeout: 60000,
      encoding: 'utf-8',
    });
    const elapsed = performance.now() - start;
    unlinkSync(inputFile);

    // Parse the last JSON line (tool call response — init response is first)
    const lines = output.split('\n').filter((l) => l.trim());
    const toolResponse = lines.length >= 2 ? lines[1] : lines[0];

    if (!toolResponse) {
      return { taskCount: 0, timeMs: elapsed, error: 'No response' };
    }

    const response = JSON.parse(toolResponse);
    if (response.error) {
      return { taskCount: 0, timeMs: elapsed, error: response.error.message };
    }

    const content = response.result?.content?.[0];
    if (content?.type === 'text') {
      const data = JSON.parse(content.text);
      const tasks = data.data?.tasks || data.data?.items || data.tasks || [];
      const scriptTimeMs = data.metadata?.query_time_ms;
      return { taskCount: tasks.length, timeMs: elapsed, scriptTimeMs };
    }
    return { taskCount: 0, timeMs: elapsed, error: 'Unexpected response format' };
  } catch (e: unknown) {
    const elapsed = performance.now() - start;
    try {
      unlinkSync(inputFile);
    } catch {
      /* cleanup best-effort */
    }
    return { taskCount: 0, timeMs: elapsed, error: (e as Error).message?.slice(0, 200) };
  }
}

// --- Measure MCP server startup cost ---

function measureStartupCost(): number {
  const initMsg = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'startup-bench', version: '1.0.0' },
    },
  });

  const inputFile = join(tmpdir(), `benchmark-startup-${Date.now()}.txt`);
  writeFileSync(inputFile, `${initMsg}\n`, 'utf-8');

  const start = performance.now();
  try {
    execSync(`cat "${inputFile}" | node "${serverPath}" 2>/dev/null`, {
      timeout: 15000,
      encoding: 'utf-8',
    });
    const elapsed = performance.now() - start;
    unlinkSync(inputFile);
    return elapsed;
  } catch {
    /* startup measurement failed */
    try {
      unlinkSync(inputFile);
    } catch {
      /* cleanup best-effort */
    }
    return 0;
  }
}

// --- Main benchmark ---

function main() {
  console.log('='.repeat(70));
  console.log('  Benchmark: Legacy Overdue Script vs AST Builder');
  console.log('='.repeat(70));
  console.log(`  Iterations: ${ITERATIONS}   Limit: ${LIMIT}`);
  console.log();

  // Measure startup cost
  console.log('Measuring MCP server startup cost (init only, no tool call)...');
  const startupTimings: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = measureStartupCost();
    console.log(`  Run ${i + 1}: ${t.toFixed(0)}ms`);
    startupTimings.push(t);
  }
  const avgStartup = startupTimings.reduce((a, b) => a + b, 0) / startupTimings.length;
  console.log(`  Avg startup: ${avgStartup.toFixed(0)}ms\n`);

  // Legacy benchmark
  console.log('Running legacy overdue script (direct osascript)...');
  const legacyResult: BenchmarkResult = {
    approach: 'Legacy (OmniJS bridge, hand-concatenated)',
    taskCount: 0,
    timings: [],
    minMs: Infinity,
    avgMs: 0,
    maxMs: 0,
  };

  for (let i = 0; i < ITERATIONS; i++) {
    const r = runLegacyOverdue(LIMIT);
    console.log(
      `  Run ${i + 1}: ${r.timeMs.toFixed(0)}ms, ${r.taskCount} tasks${r.error ? ` (ERROR: ${r.error})` : ''}`,
    );
    legacyResult.timings.push(r.timeMs);
    legacyResult.taskCount = r.taskCount;
    if (r.error) legacyResult.error = r.error;
  }

  legacyResult.minMs = Math.min(...legacyResult.timings);
  legacyResult.maxMs = Math.max(...legacyResult.timings);
  legacyResult.avgMs = legacyResult.timings.reduce((a, b) => a + b, 0) / legacyResult.timings.length;

  // AST benchmark
  console.log('\nRunning AST overdue query (via MCP server)...');
  const astResult: BenchmarkResult = {
    approach: 'AST (buildListTasksScriptV4)',
    taskCount: 0,
    timings: [],
    minMs: Infinity,
    avgMs: 0,
    maxMs: 0,
  };

  astResult.scriptTimings = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const r = runASTOverdue(LIMIT);
    const scriptNote = r.scriptTimeMs ? `, script: ${r.scriptTimeMs.toFixed(0)}ms` : '';
    console.log(
      `  Run ${i + 1}: ${r.timeMs.toFixed(0)}ms total${scriptNote}, ${r.taskCount} tasks${r.error ? ` (ERROR: ${r.error})` : ''}`,
    );
    astResult.timings.push(r.timeMs);
    if (r.scriptTimeMs) astResult.scriptTimings.push(r.scriptTimeMs);
    astResult.taskCount = r.taskCount;
    if (r.error) astResult.error = r.error;
  }

  astResult.minMs = Math.min(...astResult.timings);
  astResult.maxMs = Math.max(...astResult.timings);
  astResult.avgMs = astResult.timings.reduce((a, b) => a + b, 0) / astResult.timings.length;

  // Compute script-only stats for AST
  const scriptTimings = astResult.scriptTimings || [];
  const hasScriptTimings = scriptTimings.length > 0;
  const avgScript = hasScriptTimings ? scriptTimings.reduce((a, b) => a + b, 0) / scriptTimings.length : 0;
  const minScript = hasScriptTimings ? Math.min(...scriptTimings) : 0;
  const maxScript = hasScriptTimings ? Math.max(...scriptTimings) : 0;

  // Print comparison
  console.log('\n' + '='.repeat(70));
  console.log('  Results');
  console.log('='.repeat(70));
  console.log();

  const pad = (s: string, n: number) => s.padEnd(n);
  const numPad = (n: number) => n.toFixed(0).padStart(8);

  console.log(`${pad('Metric', 24)} ${pad('Legacy', 12)} ${pad('AST total', 12)} ${pad('AST script', 12)}`);
  console.log('-'.repeat(62));
  console.log(
    `${pad('Task count', 24)} ${numPad(legacyResult.taskCount)}     ${numPad(astResult.taskCount)}     ${numPad(astResult.taskCount)}`,
  );
  console.log(
    `${pad('Min (ms)', 24)} ${numPad(legacyResult.minMs)}     ${numPad(astResult.minMs)}     ${hasScriptTimings ? numPad(minScript) : '     n/a'}`,
  );
  console.log(
    `${pad('Avg (ms)', 24)} ${numPad(legacyResult.avgMs)}     ${numPad(astResult.avgMs)}     ${hasScriptTimings ? numPad(avgScript) : '     n/a'}`,
  );
  console.log(
    `${pad('Max (ms)', 24)} ${numPad(legacyResult.maxMs)}     ${numPad(astResult.maxMs)}     ${hasScriptTimings ? numPad(maxScript) : '     n/a'}`,
  );
  console.log(`${pad('MCP startup (avg)', 24)} ${pad('n/a', 12)} ${numPad(avgStartup)}     ${pad('—', 12)}`);

  if (hasScriptTimings) {
    const overhead = astResult.avgMs - avgScript;
    console.log();
    console.log('  AST overhead breakdown:');
    console.log(`    Server startup (avg):     ${avgStartup.toFixed(0)}ms`);
    console.log(`    Script execution (avg):   ${avgScript.toFixed(0)}ms`);
    console.log(`    Routing/parsing (avg):    ${Math.max(0, overhead - avgStartup).toFixed(0)}ms`);
    console.log(`    Total overhead (avg):     ${overhead.toFixed(0)}ms`);
  }

  console.log();
  if (legacyResult.taskCount !== astResult.taskCount) {
    console.log(`  ⚠ Task count mismatch: legacy=${legacyResult.taskCount}, AST=${astResult.taskCount}`);
    console.log('    (Minor differences expected: AST filters by task.completed, legacy also checks project status)');
  } else {
    console.log('  ✓ Task counts match');
  }

  if (legacyResult.error) console.log(`\n  Legacy errors: ${legacyResult.error}`);
  if (astResult.error) console.log(`\n  AST errors: ${astResult.error}`);

  console.log();
}

main();

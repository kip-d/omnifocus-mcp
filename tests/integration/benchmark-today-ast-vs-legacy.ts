/**
 * Benchmark: Legacy today's agenda script vs AST-generated today query
 *
 * Compares performance and result counts between the hand-concatenated
 * OmniJS bridge script (TODAYS_AGENDA_SCRIPT) and the AST builder approach
 * with todayMode OR logic.
 *
 * NOTE: The AST version uses different filter rules than legacy:
 * - Legacy: overdue OR due_today OR flagged (no tag status filter, no dropped filter)
 * - AST:    due_soon (≤3 days) OR flagged, plus tagStatusValid + dropped: false
 * Task count differences are expected and documented.
 *
 * Run: npx tsx tests/integration/benchmark-today-ast-vs-legacy.ts
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

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
  scriptTimings?: number[];
  categories?: { overdue: number; dueToday: number; dueSoon: number; flagged: number };
}

// --- Legacy approach: inline the deleted TODAYS_AGENDA_SCRIPT with options baked in ---

function buildLegacyTodayScript(limit: number): string {
  // This is the exact legacy script from todays-agenda.ts (deleted 2026-02-09)
  // with {{options}} and {{fields}} replaced by concrete values.
  return `
  (() => {
    const app = Application('OmniFocus');
    const options = {"includeOverdue":true,"includeFlagged":true,"includeAvailable":true,"includeDetails":false,"limit":${limit}};
    const fields = [];

    try {
      const includeOverdue = options.includeOverdue !== false;
      const includeFlagged = options.includeFlagged !== false;
      const includeDetails = options.includeDetails === true;
      const maxTasks = options.limit || 25;
      const fieldsJson = JSON.stringify(fields);

      const omniScript = '(' +
        '(() => {' +
          'const tasks = [];' +
          'const today = new Date();' +
          'today.setHours(0, 0, 0, 0);' +
          'const tomorrow = new Date(today);' +
          'tomorrow.setDate(tomorrow.getDate() + 1);' +
          'const todayTime = today.getTime();' +
          'const tomorrowTime = tomorrow.getTime();' +
          '' +
          'const includeOverdue = ' + includeOverdue + ';' +
          'const includeFlagged = ' + includeFlagged + ';' +
          'const includeDetails = ' + includeDetails + ';' +
          'const maxTasks = ' + maxTasks + ';' +
          'const fields = ' + fieldsJson + ';' +
          '' +
          'function shouldIncludeField(name) {' +
            'return !fields || fields.length === 0 || fields.includes(name);' +
          '}' +
          '' +
          'let overdueCount = 0;' +
          'let dueTodayCount = 0;' +
          'let flaggedCount = 0;' +
          'let processedCount = 0;' +
          'const seenIds = {};' +
          '' +
          'flattenedTasks.forEach(task => {' +
            'if (tasks.length >= maxTasks) return;' +
            'processedCount++;' +
            '' +
            'if (task.completed) return;' +
            '' +
            'const proj = task.containingProject;' +
            'if (proj && (proj.status === Project.Status.Done || proj.status === Project.Status.Dropped)) return;' +
            '' +
            'const taskId = task.id.primaryKey;' +
            'if (seenIds[taskId]) return;' +
            '' +
            'let shouldInclude = false;' +
            'let reason = "";' +
            'let daysOverdue = 0;' +
            '' +
            'const isFlagged = includeFlagged && task.flagged;' +
            '' +
            'const dueDate = task.dueDate;' +
            'let dueDateStr = null;' +
            'if (dueDate) {' +
              'dueDateStr = dueDate.toISOString();' +
              'const dueTime = dueDate.getTime();' +
              '' +
              'if (dueTime < todayTime) {' +
                'if (includeOverdue) {' +
                  'shouldInclude = true;' +
                  'reason = "overdue";' +
                  'daysOverdue = Math.floor((todayTime - dueTime) / 86400000);' +
                  'overdueCount++;' +
                '}' +
              '} else if (dueTime < tomorrowTime) {' +
                'shouldInclude = true;' +
                'reason = "due_today";' +
                'dueTodayCount++;' +
              '}' +
            '}' +
            '' +
            'if (!shouldInclude && isFlagged) {' +
              'shouldInclude = true;' +
              'reason = "flagged";' +
              'flaggedCount++;' +
            '}' +
            '' +
            'if (shouldInclude) {' +
              'seenIds[taskId] = true;' +
              'const taskObj = { reason: reason };' +
              '' +
              'if (shouldIncludeField("id")) taskObj.id = taskId;' +
              'if (shouldIncludeField("name")) taskObj.name = task.name;' +
              'if (daysOverdue > 0) taskObj.daysOverdue = daysOverdue;' +
              'if (dueDateStr && shouldIncludeField("dueDate")) taskObj.dueDate = dueDateStr;' +
              'if (isFlagged && shouldIncludeField("flagged")) taskObj.flagged = true;' +
              '' +
              'if (shouldIncludeField("tags") && task.tags && task.tags.length > 0) {' +
                'taskObj.tags = task.tags.map(t => t.name);' +
              '}' +
              '' +
              'if ((includeDetails || shouldIncludeField("project") || shouldIncludeField("projectId")) && proj) {' +
                'if (shouldIncludeField("project")) taskObj.project = proj.name;' +
                'if (shouldIncludeField("projectId")) taskObj.projectId = proj.id.primaryKey;' +
              '}' +
              '' +
              'if ((includeDetails || shouldIncludeField("note"))) {' +
                'taskObj.note = task.note || "";' +
              '}' +
              '' +
              'tasks.push(taskObj);' +
            '}' +
          '});' +
          '' +
          'return JSON.stringify({' +
            'ok: true,' +
            'v: "1",' +
            'data: {' +
              'tasks: tasks,' +
              'overdueCount: overdueCount,' +
              'dueTodayCount: dueTodayCount,' +
              'flaggedCount: flaggedCount,' +
              'processedCount: processedCount,' +
              'totalTasks: flattenedTasks.length,' +
              'optimizationUsed: "omnijs_bridge_fast"' +
            '}' +
          '});' +
        '})()' +
      ')';

      return app.evaluateJavascript(omniScript);

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '1',
        error: {
          code: 'TODAY_OMNIJS_FAILED',
          message: (error && (error.message || error.toString())) || 'Unknown error',
          details: "Failed in OmniJS bridge today's agenda query"
        }
      });
    }
  })();
  `;
}

function runLegacyToday(limit: number): {
  taskCount: number;
  timeMs: number;
  categories?: { overdue: number; dueToday: number; flagged: number };
  error?: string;
} {
  const script = buildLegacyTodayScript(limit);

  const tmpFile = join(tmpdir(), `benchmark-legacy-today-${Date.now()}.js`);
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
    if (data.ok === false) {
      return { taskCount: 0, timeMs: elapsed, error: data.error?.message };
    }
    const inner = data.data || data;
    return {
      taskCount: inner.tasks?.length ?? 0,
      timeMs: elapsed,
      categories: {
        overdue: inner.overdueCount ?? 0,
        dueToday: inner.dueTodayCount ?? 0,
        flagged: inner.flaggedCount ?? 0,
      },
    };
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

// --- AST approach: run via MCP tool call ---

function runASTToday(limit: number): {
  taskCount: number;
  timeMs: number;
  scriptTimeMs?: number;
  categories?: { overdue: number; dueSoon: number; flagged: number };
  error?: string;
} {
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
          mode: 'today',
          limit,
        },
      },
    },
  });

  const inputFile = join(tmpdir(), `benchmark-mcp-today-${Date.now()}.txt`);
  writeFileSync(inputFile, `${initMsg}\n${initializedMsg}\n${toolCallMsg}\n`, 'utf-8');

  const start = performance.now();
  try {
    const output = execSync(`cat "${inputFile}" | node "${serverPath}" 2>/dev/null`, {
      timeout: 60000,
      encoding: 'utf-8',
    });
    const elapsed = performance.now() - start;
    unlinkSync(inputFile);

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
      const tasks = data.data?.tasks || data.tasks || [];
      const meta = data.metadata || {};
      return {
        taskCount: tasks.length,
        timeMs: elapsed,
        scriptTimeMs: meta.query_time_ms,
        categories: {
          overdue: meta.overdue_count ?? 0,
          dueSoon: meta.due_soon_count ?? 0,
          flagged: meta.flagged_count ?? 0,
        },
      };
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

  const inputFile = join(tmpdir(), `benchmark-startup-today-${Date.now()}.txt`);
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
  console.log('  Benchmark: Legacy Today Script vs AST Builder (todayMode)');
  console.log('='.repeat(70));
  console.log(`  Iterations: ${ITERATIONS}   Limit: ${LIMIT}`);
  console.log();
  console.log('  Filter differences:');
  console.log('    Legacy:  overdue OR due_today OR flagged');
  console.log('    AST:     due_soon (≤3 days) OR flagged + tagStatusValid + !dropped');
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
  console.log('Running legacy today script (direct osascript)...');
  const legacyResult: BenchmarkResult = {
    approach: 'Legacy (OmniJS bridge, hand-concatenated)',
    taskCount: 0,
    timings: [],
    minMs: Infinity,
    avgMs: 0,
    maxMs: 0,
  };

  for (let i = 0; i < ITERATIONS; i++) {
    const r = runLegacyToday(LIMIT);
    const catNote = r.categories
      ? ` [overdue=${r.categories.overdue}, dueToday=${r.categories.dueToday}, flagged=${r.categories.flagged}]`
      : '';
    console.log(
      `  Run ${i + 1}: ${r.timeMs.toFixed(0)}ms, ${r.taskCount} tasks${catNote}${r.error ? ` (ERROR: ${r.error})` : ''}`,
    );
    legacyResult.timings.push(r.timeMs);
    legacyResult.taskCount = r.taskCount;
    if (r.categories) legacyResult.categories = { ...r.categories, dueSoon: 0 };
    if (r.error) legacyResult.error = r.error;
  }

  legacyResult.minMs = Math.min(...legacyResult.timings);
  legacyResult.maxMs = Math.max(...legacyResult.timings);
  legacyResult.avgMs = legacyResult.timings.reduce((a, b) => a + b, 0) / legacyResult.timings.length;

  // AST benchmark
  console.log('\nRunning AST today query (via MCP server)...');
  const astResult: BenchmarkResult = {
    approach: 'AST (buildListTasksScriptV4 + todayMode)',
    taskCount: 0,
    timings: [],
    minMs: Infinity,
    avgMs: 0,
    maxMs: 0,
  };

  astResult.scriptTimings = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const r = runASTToday(LIMIT);
    const scriptNote = r.scriptTimeMs ? `, script: ${r.scriptTimeMs.toFixed(0)}ms` : '';
    const catNote = r.categories
      ? ` [overdue=${r.categories.overdue}, dueSoon=${r.categories.dueSoon}, flagged=${r.categories.flagged}]`
      : '';
    console.log(
      `  Run ${i + 1}: ${r.timeMs.toFixed(0)}ms total${scriptNote}, ${r.taskCount} tasks${catNote}${r.error ? ` (ERROR: ${r.error})` : ''}`,
    );
    astResult.timings.push(r.timeMs);
    if (r.scriptTimeMs) astResult.scriptTimings.push(r.scriptTimeMs);
    astResult.taskCount = r.taskCount;
    if (r.categories) astResult.categories = { ...r.categories, dueToday: 0 };
    if (r.error) astResult.error = r.error;
  }

  astResult.minMs = Math.min(...astResult.timings);
  astResult.maxMs = Math.max(...astResult.timings);
  astResult.avgMs = astResult.timings.reduce((a, b) => a + b, 0) / astResult.timings.length;

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

  // Category comparison
  console.log();
  console.log('  Category breakdown:');
  if (legacyResult.categories) {
    console.log(
      `    Legacy:  overdue=${legacyResult.categories.overdue}, due_today=${legacyResult.categories.dueToday}, flagged=${legacyResult.categories.flagged}`,
    );
  }
  if (astResult.categories) {
    console.log(
      `    AST:     overdue=${astResult.categories.overdue}, due_soon=${astResult.categories.dueSoon}, flagged=${astResult.categories.flagged}`,
    );
  }

  console.log();
  if (legacyResult.taskCount !== astResult.taskCount) {
    const diff = astResult.taskCount - legacyResult.taskCount;
    const direction = diff > 0 ? 'more' : 'fewer';
    console.log(
      `  ⚠ Task count differs: legacy=${legacyResult.taskCount}, AST=${astResult.taskCount} (${Math.abs(diff)} ${direction})`,
    );
    console.log('    Expected: AST uses due_soon (≤3 days) instead of due_today,');
    console.log('    plus tagStatusValid filter and dropped exclusion.');
  } else {
    console.log('  ✓ Task counts match');
  }

  if (legacyResult.error) console.log(`\n  Legacy errors: ${legacyResult.error}`);
  if (astResult.error) console.log(`\n  AST errors: ${astResult.error}`);

  console.log();
}

main();

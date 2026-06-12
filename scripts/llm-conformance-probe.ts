#!/usr/bin/env tsx
/**
 * LLM Conformance Probe — local-model support evaluation (OMN-121)
 *
 * Measures how reliably a given Ollama model can drive the unified MCP tools via NATIVE
 * tool-calling, with NO fallback substitution and NO execution. This is the "support
 * contract" tool: a model that scores below the bar is below spec, not a server bug.
 *
 * Unlike tests/integration/real-llm-integration.test.ts (which has fallback maps that mask
 * model failures, and is gated/exploratory), this probe grades the model's RAW tool call:
 *   1. Present the REAL advertised tool schemas (pulled from the running server's
 *      tools/list) to the model as Ollama tools.
 *   2. Capture the model's first tool_call.
 *   3. Grade: did it call a tool? the RIGHT tool? are the arguments schema-valid against
 *      the server's strict Zod schema? (Pure validation — no tool execution, no OmniFocus,
 *      no writes.)
 *
 * Because grading is schema validation only, the probe is side-effect-free and does not
 * need OmniFocus running. It reflects exactly what a real MCP client would send the server.
 *
 * Usage:
 *   npx tsx scripts/llm-conformance-probe.ts llama3.1:8b
 *   npx tsx scripts/llm-conformance-probe.ts llama3.1:8b qwen2.5:7b qwen2.5:3b phi3.5:3.8b
 *   REAL_LLM_MODEL=llama3.1:8b npx tsx scripts/llm-conformance-probe.ts
 *   OLLAMA_HOST=http://host:11434 npx tsx scripts/llm-conformance-probe.ts llama3.1:8b > report.md
 *
 * Ollama lifecycle (OMN-163): attaches to a running server when one is reachable; otherwise,
 * for a localhost OLLAMA_HOST only, starts `ollama serve` itself and stops it at exit (an
 * unreachable remote host is an error — the probe never manages a remote server). Probed
 * models are unloaded at exit regardless of who started the server, so their RAM is
 * recovered immediately instead of after Ollama's keep-alive. Chat requests cap the context
 * window at a measured default (PROBE_NUM_CTX overrides; sizing rationale in
 * scripts/lib/ollama-lifecycle.ts) — without the cap, Ollama sizes the KV cache to the
 * model's full advertised context (131k for llama3.1 → 21 GB resident for the 8b).
 *
 * Output: a Markdown conformance report to stdout (redirect to a file), progress to stderr.
 */

import { spawn, type ChildProcess } from 'child_process';
import { Ollama, type Tool, type ToolCall } from 'ollama';
import { isLocalhostOllamaHost, resolveNumCtx } from './lib/ollama-lifecycle.js';
import type { ZodTypeAny } from 'zod';
import { ReadSchema } from '../src/tools/unified/schemas/read-schema.js';
import { WriteSchema } from '../src/tools/unified/schemas/write-schema.js';
import { AnalyzeSchema } from '../src/tools/unified/schemas/analyze-schema.js';
import { SystemToolSchema } from '../src/tools/system/SystemTool.js';
import { parseWithNormalization } from '../src/tools/normalization/normalize-input.js';

// ── Grading config ──────────────────────────────────────────────────────────

/** Map each advertised MCP tool to the strict boundary schema the server validates against. */
const SCHEMA_BY_TOOL: Record<string, ZodTypeAny> = {
  omnifocus_read: ReadSchema,
  omnifocus_write: WriteSchema,
  omnifocus_analyze: AnalyzeSchema,
  system: SystemToolSchema,
};

interface ConformanceCase {
  id: string;
  prompt: string;
  /** Tool name(s) that count as a correct selection for this intent. */
  expect: string[];
  note: string;
}

/**
 * Representative requests across the tool surface. A handful are deliberately
 * nesting-stressful (status/date filters, count-only, search-by-name, tags on create) —
 * those are where small models most often malform the envelope.
 */
const CASES: ConformanceCase[] = [
  { id: 'today', prompt: 'What should I work on today?', expect: ['omnifocus_read'], note: 'today perspective' },
  {
    id: 'overdue',
    prompt: 'Show me my overdue tasks.',
    expect: ['omnifocus_read', 'omnifocus_analyze'],
    note: 'overdue read or analysis',
  },
  { id: 'flagged', prompt: 'List my flagged tasks.', expect: ['omnifocus_read'], note: 'flagged mode/filter' },
  { id: 'inbox', prompt: 'What is in my inbox?', expect: ['omnifocus_read'], note: 'inbox (project:null)' },
  { id: 'projects', prompt: 'List all my projects.', expect: ['omnifocus_read'], note: 'type:projects' },
  { id: 'tags', prompt: 'Show me all my tags.', expect: ['omnifocus_read'], note: 'type:tags' },
  {
    id: 'count-active',
    prompt: 'How many active tasks do I have?',
    expect: ['omnifocus_read'],
    note: 'countOnly + status filter',
  },
  {
    id: 'search-name',
    prompt: 'Find tasks with "invoice" in the name.',
    expect: ['omnifocus_read'],
    note: 'filters.name.contains (nesting)',
  },
  {
    id: 'upcoming',
    prompt: 'What tasks are due in the next 7 days?',
    expect: ['omnifocus_read'],
    note: 'upcoming + daysAhead',
  },
  {
    id: 'due-before',
    prompt: 'Show tasks due before 2026-07-01.',
    expect: ['omnifocus_read'],
    note: 'filters.dueDate.before (nesting)',
  },
  {
    id: 'productivity',
    prompt: 'How productive was I this week?',
    expect: ['omnifocus_analyze'],
    note: 'productivity_stats',
  },
  {
    id: 'overdue-analysis',
    prompt: 'Analyze why my tasks are piling up overdue.',
    expect: ['omnifocus_analyze'],
    note: 'overdue_analysis (params:{})',
  },
  {
    id: 'velocity',
    prompt: 'What is my task completion velocity over time?',
    expect: ['omnifocus_analyze'],
    note: 'task_velocity',
  },
  {
    id: 'create-task',
    prompt: 'Create a task called "Buy milk".',
    expect: ['omnifocus_write'],
    note: 'create task (mutation nesting)',
  },
  {
    id: 'create-task-tags',
    prompt: 'Add a task "Email Bob" tagged work and urgent.',
    expect: ['omnifocus_write'],
    note: 'create with tags array',
  },
  {
    id: 'create-project',
    prompt: 'Create a new project named "Home Renovation".',
    expect: ['omnifocus_write'],
    note: 'create target:project',
  },
  {
    id: 'complete',
    prompt: 'Mark task with id abc123 as complete.',
    expect: ['omnifocus_write'],
    note: 'complete + id',
  },
  {
    id: 'flag-update',
    prompt: 'Flag the task with id xyz789.',
    expect: ['omnifocus_write'],
    note: 'update changes.flagged',
  },
  {
    id: 'version',
    prompt: 'What version of the OmniFocus server is running?',
    expect: ['system'],
    note: 'system version',
  },
];

// ── MCP server (tools/list only — no execution) ─────────────────────────────

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

class McpServer {
  private proc: ChildProcess;
  private buf = '';
  private nextId = 1;
  private pending = new Map<number, (msg: Record<string, unknown>) => void>();

  constructor() {
    this.proc = spawn('node', ['dist/index.js'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout?.on('data', (d: Buffer) => {
      this.buf += d.toString();
      const lines = this.buf.split('\n');
      this.buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const msg = JSON.parse(line) as { id?: number };
          if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
            this.pending.get(msg.id)!(msg as Record<string, unknown>);
            this.pending.delete(msg.id);
          }
        } catch {
          /* not a complete JSON line yet */
        }
      }
    });
  }

  private send(method: string, params?: unknown): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out`)), 30000);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      this.proc.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async listTools(): Promise<McpTool[]> {
    await this.send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'conformance-probe', version: '1.0.0' },
    });
    const res = await this.send('tools/list');
    const result = res.result as { tools: McpTool[] };
    return result.tools;
  }

  stop(): void {
    this.proc.kill();
  }
}

// ── Ollama lifecycle (OMN-163) ───────────────────────────────────────────────

interface OllamaLifecycle {
  startedByUs: boolean;
  serveProc?: ChildProcess;
}

async function isReachable(ollama: Ollama): Promise<boolean> {
  try {
    await ollama.list();
    return true;
  } catch {
    return false;
  }
}

/**
 * Attach to a running Ollama, or — for a localhost host only — start `ollama serve`
 * ourselves and record that we own it. We never manage a remote server.
 */
async function ensureOllama(ollama: Ollama, host: string): Promise<OllamaLifecycle> {
  if (await isReachable(ollama)) return { startedByUs: false };
  if (!isLocalhostOllamaHost(host)) {
    process.stderr.write(
      `Ollama not reachable at ${host}. That host is remote, so the probe will not start it — ` +
        'start it there and re-run.\n',
    );
    process.exit(2);
  }
  process.stderr.write('Ollama not running — starting `ollama serve` (will be stopped at exit) …\n');
  const stderrTail: string[] = [];
  const proc = spawn('ollama', ['serve'], { stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr?.on('data', (d: Buffer) => {
    stderrTail.push(d.toString());
    if (stderrTail.length > 20) stderrTail.shift();
  });
  let spawnError: Error | undefined;
  proc.on('error', (err) => {
    spawnError = err;
  });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !spawnError) {
    if (await isReachable(ollama)) return { startedByUs: true, serveProc: proc };
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill('SIGTERM');
  const reason = spawnError
    ? `${String(spawnError)} (is the ollama CLI installed and on PATH?)`
    : `not ready after 15s. ollama serve output:\n${stderrTail.join('')}`;
  process.stderr.write(`Failed to start ollama serve: ${reason}\n`);
  process.exit(2);
}

/**
 * Unload a model immediately (keep_alive: 0) so its RAM is recovered now rather than
 * after Ollama's keep-alive window. Done regardless of who started the server — this is
 * where most of the memory lives. (Deliberately NOT set per-request: that would reload
 * the model between every case.)
 */
async function unloadModel(ollama: Ollama, model: string): Promise<void> {
  try {
    // An empty prompt with keep_alive: 0 unloads without generating.
    await ollama.generate({ model, prompt: '', keep_alive: 0 });
  } catch (err) {
    process.stderr.write(`! failed to unload ${model}: ${String(err)} — it will unload after the keep-alive\n`);
  }
}

// ── Grading ─────────────────────────────────────────────────────────────────

type Outcome = 'pass' | 'no_tool_call' | 'wrong_tool' | 'schema_invalid' | 'model_error';

interface CaseResult {
  caseId: string;
  outcome: Outcome;
  toolCalled?: string;
  /** Top Zod issues (path + message) when schema_invalid. */
  issues?: string[];
  /** OMN-122: leniencies the normalize-then-strict layer applied to make this pass. */
  normalizedVia?: string[];
  detail?: string;
}

function gradeToolCall(c: ConformanceCase, call: ToolCall | undefined): CaseResult {
  if (!call) return { caseId: c.id, outcome: 'no_tool_call' };
  const name = call.function.name;
  if (!c.expect.includes(name)) {
    return { caseId: c.id, outcome: 'wrong_tool', toolCalled: name };
  }
  const schema = SCHEMA_BY_TOOL[name];
  if (!schema) return { caseId: c.id, outcome: 'wrong_tool', toolCalled: name, detail: 'no schema registered' };

  // Ollama returns arguments as a parsed object; tolerate a stringified payload too.
  let args: unknown = call.function.arguments;
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      return { caseId: c.id, outcome: 'schema_invalid', toolCalled: name, issues: ['arguments not valid JSON'] };
    }
  }
  // OMN-122: grade against the server's REAL front door — strict schema first, then
  // the normalize-then-strict layer. A pass that needed normalization is still a pass
  // (the server would accept it), and we record which leniencies were load-bearing.
  const result = parseWithNormalization(schema, args, name);
  if (result.success) {
    return {
      caseId: c.id,
      outcome: 'pass',
      toolCalled: name,
      normalizedVia: result.applied.length ? result.applied : undefined,
    };
  }
  const issues = result.error!.issues.slice(0, 4).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { caseId: c.id, outcome: 'schema_invalid', toolCalled: name, issues };
}

// ── Per-model run ────────────────────────────────────────────────────────────

interface ModelReport {
  model: string;
  available: boolean;
  results: CaseResult[];
  error?: string;
}

async function probeModel(ollama: Ollama, model: string, tools: Tool[], numCtx: number): Promise<ModelReport> {
  const results: CaseResult[] = [];
  for (const c of CASES) {
    process.stderr.write(`  [${model}] ${c.id} … `);
    try {
      const res = await ollama.chat({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an OmniFocus assistant. Use the provided tools to fulfill the request. ' +
              'Call exactly one tool with correctly structured arguments.',
          },
          { role: 'user', content: c.prompt },
        ],
        tools,
        stream: false,
        // num_ctx caps the KV cache (OMN-163) — without it Ollama allocates for the
        // model's full advertised context. Default + sizing rationale: lib/ollama-lifecycle.ts.
        options: { temperature: 0, num_ctx: numCtx },
      });
      const call = res.message.tool_calls?.[0];
      const graded = gradeToolCall(c, call);
      results.push(graded);
      process.stderr.write(`${graded.outcome}${graded.toolCalled ? ` (${graded.toolCalled})` : ''}\n`);
    } catch (err) {
      results.push({ caseId: c.id, outcome: 'model_error', detail: String(err) });
      process.stderr.write('model_error\n');
    }
  }
  return { model, available: true, results };
}

// ── Reporting ────────────────────────────────────────────────────────────────

function pct(n: number, d: number): string {
  return d === 0 ? '0%' : `${Math.round((100 * n) / d)}%`;
}

function renderReport(reports: ModelReport[]): string {
  const lines: string[] = [];
  lines.push('# LLM Conformance Probe Report');
  lines.push('');
  lines.push(`Cases: ${CASES.length}. Native tool-calling, strict-schema grading, no fallback, no execution.`);
  lines.push('A "pass" = the model called the expected tool AND its arguments passed the server\'s strict Zod schema.');
  lines.push('');
  lines.push(
    "> Caveat: each case is a **single sample** (n=1), graded on the model's **first** tool_call, " +
      'from **one run** at temperature 0 (near-greedy, not bit-reproducible). Treat each percentage as a ' +
      'point estimate, not a stable benchmark — a model near a schema-validity boundary can flip a case ' +
      'between runs. Re-run to gauge variance before quoting a number.',
  );
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Model | Pass | (of which normalized) | Wrong tool | Schema invalid | No tool call | Errors | Score |');
  lines.push('|-------|------|----------------------|-----------|----------------|--------------|--------|-------|');
  for (const r of reports) {
    if (!r.available) {
      lines.push(`| ${r.model} | — | — | — | — | — | — | UNAVAILABLE (${r.error ?? ''}) |`);
      continue;
    }
    const tally = (o: Outcome) => r.results.filter((x) => x.outcome === o).length;
    const pass = tally('pass');
    const normalized = r.results.filter((x) => x.outcome === 'pass' && x.normalizedVia).length;
    lines.push(
      `| ${r.model} | ${pass} | ${normalized} | ${tally('wrong_tool')} | ${tally('schema_invalid')} | ${tally('no_tool_call')} | ${tally('model_error')} | **${pct(pass, CASES.length)}** |`,
    );
  }
  lines.push('');

  // Per-model detail
  for (const r of reports) {
    if (!r.available) continue;
    lines.push(`## ${r.model} — per-case`);
    lines.push('');
    lines.push('| Case | Outcome | Tool called | Detail |');
    lines.push('|------|---------|-------------|--------|');
    for (const res of r.results) {
      const detail = res.normalizedVia
        ? `normalized via: ${res.normalizedVia.join(', ')}`
        : res.issues
          ? res.issues.join('; ')
          : (res.detail ?? '');
      const toolCell = (res.toolCalled ?? '—').replace(/\|/g, '\\|');
      lines.push(`| ${res.caseId} | ${res.outcome} | ${toolCell} | ${detail.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');

    // OMN-122: which leniencies were load-bearing for this model (audit signal).
    const normVia = r.results.filter((x) => x.normalizedVia).flatMap((x) => x.normalizedVia ?? []);
    if (normVia.length) {
      const counts = new Map<string, number>();
      for (const n of normVia) counts.set(n, (counts.get(n) ?? 0) + 1);
      lines.push(`### ${r.model} — normalizations applied (OMN-122)`);
      lines.push('');
      for (const [name, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`- (${n}×) ${name}`);
      }
      lines.push('');
    }

    // Aggregate the malformation patterns — the signal for whether a normalize-then-strict
    // layer is worth building, and which leniencies would be load-bearing.
    const schemaIssues = r.results.filter((x) => x.outcome === 'schema_invalid').flatMap((x) => x.issues ?? []);
    if (schemaIssues.length) {
      const counts = new Map<string, number>();
      for (const i of schemaIssues) counts.set(i, (counts.get(i) ?? 0) + 1);
      lines.push(`### ${r.model} — top schema-invalid patterns`);
      lines.push('');
      for (const [issue, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
        lines.push(`- (${n}×) ${issue}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const models = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (models.length === 0 && process.env.REAL_LLM_MODEL) models.push(process.env.REAL_LLM_MODEL);
  if (models.length === 0) {
    process.stderr.write(
      'Usage: npx tsx scripts/llm-conformance-probe.ts <model> [model ...]\n' +
        '       (or set REAL_LLM_MODEL). Requires `npm run build` first; a localhost Ollama is\n' +
        '       started automatically when not already running.\n',
    );
    process.exit(2);
  }

  let numCtx: number;
  try {
    numCtx = resolveNumCtx(process.env.PROBE_NUM_CTX);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }

  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const ollama = new Ollama({ host });
  const lifecycle = await ensureOllama(ollama, host);

  // Teardown must run on normal exit AND on interrupt: unload every probed model
  // (the RAM), then stop the server only if we started it (never the user's).
  const probedModels = new Set<string>();
  let toreDown = false;
  const teardown = async (): Promise<void> => {
    if (toreDown) return;
    toreDown = true;
    for (const m of probedModels) await unloadModel(ollama, m);
    if (lifecycle.startedByUs && lifecycle.serveProc) {
      lifecycle.serveProc.kill('SIGTERM');
      process.stderr.write('Stopped the `ollama serve` this probe started.\n');
    }
  };
  process.on('SIGINT', () => void teardown().finally(() => process.exit(130)));
  process.on('SIGTERM', () => void teardown().finally(() => process.exit(143)));
  // Last resort if we exit without teardown (uncaught throw): don't orphan a server
  // we spawned. kill() is sync-safe in an exit handler; model unload is not possible here.
  process.on('exit', () => {
    if (lifecycle.startedByUs) lifecycle.serveProc?.kill('SIGTERM');
  });

  try {
    // Which requested models are present?
    const list = await ollama.list();
    const installed = new Set(list.models.map((m) => m.name));

    process.stderr.write('Starting MCP server for tools/list …\n');
    const server = new McpServer();
    let tools: Tool[];
    try {
      // Brief settle for the spawned server before the first request.
      await new Promise((r) => setTimeout(r, 1500));
      const mcpTools = await server.listTools();
      tools = mcpTools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema as Tool['function']['parameters'],
        },
      }));
      process.stderr.write(`Advertised tools: ${mcpTools.map((t) => t.name).join(', ')}\n`);
    } finally {
      server.stop();
    }

    const reports: ModelReport[] = [];
    for (const model of models) {
      if (!installed.has(model)) {
        process.stderr.write(`! ${model} not installed (ollama pull ${model}) — skipping\n`);
        reports.push({ model, available: false, results: [], error: 'not installed' });
        continue;
      }
      process.stderr.write(`Probing ${model} (num_ctx=${numCtx}) …\n`);
      probedModels.add(model);
      reports.push(await probeModel(ollama, model, tools, numCtx));
    }

    process.stdout.write(renderReport(reports) + '\n');
  } finally {
    await teardown();
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { callCli } from './cli-bridge.js';

const server = new McpServer({
  name: 'omnifocus',
  version: '0.1.0',
});

// Type coercion helpers (Claude Desktop sends strings for everything)
const coerceNumber = z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]).pipe(z.number());
const coerceBoolean = z.union([z.boolean(), z.string().transform((v) => v === 'true')]).pipe(z.boolean());

// --- omnifocus_read ---
server.tool(
  'omnifocus_read',
  'Query tasks, projects, tags, folders, and GTD views',
  {
    command: z.enum([
      'tasks',
      'task',
      'projects',
      'tags',
      'folders',
      'inbox',
      'today',
      'overdue',
      'flagged',
      'upcoming',
      'review',
      'suggest',
    ]),
    id: z.string().optional(),
    project: z.string().optional(),
    tag: z.string().optional(),
    flagged: coerceBoolean.optional(),
    dueBefore: z.string().optional(),
    dueAfter: z.string().optional(),
    available: coerceBoolean.optional(),
    search: z.string().optional(),
    completed: coerceBoolean.optional(),
    countOnly: coerceBoolean.optional(),
    fields: z.string().optional(),
    limit: coerceNumber.optional(),
    offset: coerceNumber.optional(),
    sort: z.string().optional(),
    daysAhead: coerceNumber.optional(),
    tagMode: z.enum(['any', 'all', 'none']).optional(),
  },
  async (params) => {
    const args: string[] = [params.command];

    if (params.id) args.push(params.id);
    if (params.project) args.push('--project', params.project);
    if (params.tag) args.push('--tag', params.tag);
    if (params.flagged) args.push('--flagged');
    if (params.dueBefore) args.push('--due-before', params.dueBefore);
    if (params.dueAfter) args.push('--due-after', params.dueAfter);
    if (params.available) args.push('--available');
    if (params.search) args.push('--search', params.search);
    if (params.completed) args.push('--completed');
    if (params.countOnly) args.push('--count');
    if (params.fields) args.push('--fields', params.fields);
    if (params.limit !== undefined) args.push('--limit', String(params.limit));
    if (params.offset !== undefined) args.push('--offset', String(params.offset));
    if (params.sort) args.push('--sort', params.sort);
    if (params.daysAhead !== undefined) args.push('--days', String(params.daysAhead));
    if (params.tagMode) args.push('--tag-mode', params.tagMode);

    const result = await callCli(args);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  },
);

// --- omnifocus_write ---
server.tool(
  'omnifocus_write',
  'Create, update, complete, or delete tasks',
  {
    operation: z.enum(['add', 'complete', 'update', 'delete']),
    id: z.string().optional(),
    name: z.string().optional(),
    project: z.string().optional(),
    tags: z.array(z.string()).optional(),
    dueDate: z.string().optional(),
    deferDate: z.string().optional(),
    plannedDate: z.string().optional(),
    clearDueDate: coerceBoolean.optional(),
    clearDeferDate: coerceBoolean.optional(),
    clearPlannedDate: coerceBoolean.optional(),
    flagged: coerceBoolean.optional(),
    note: z.string().optional(),
    estimatedMinutes: coerceNumber.optional(),
  },
  async (params) => {
    const args: string[] = [params.operation];

    if (params.operation === 'add' && params.name) args.push(params.name);
    if (params.id) args.push(params.id);
    if (params.project) args.push('--project', params.project);
    if (params.tags) for (const t of params.tags) args.push('--tag', t);
    if (params.dueDate) args.push('--due', params.dueDate);
    if (params.deferDate) args.push('--defer', params.deferDate);
    if (params.plannedDate) args.push('--planned', params.plannedDate);
    if (params.flagged) args.push('--flag');
    if (params.note) args.push('--note', params.note);
    if (params.estimatedMinutes !== undefined) args.push('--estimate', String(params.estimatedMinutes));
    if (params.clearDueDate) args.push('--clear-due');
    if (params.clearDeferDate) args.push('--clear-defer');
    if (params.clearPlannedDate) args.push('--clear-planned');
    if (params.operation === 'delete') args.push('--confirm');

    const result = await callCli(args);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  },
);

// --- omnifocus_analyze ---
server.tool(
  'omnifocus_analyze',
  'Productivity statistics and analysis',
  {
    groupBy: z.enum(['day', 'week', 'month']).optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  },
  async (params) => {
    const args: string[] = ['stats'];
    if (params.groupBy) args.push('--group-by', params.groupBy);
    if (params.start) args.push('--start', params.start);
    if (params.end) args.push('--end', params.end);
    const result = await callCli(args);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  },
);

// --- system ---
server.tool(
  'system',
  'Version info, diagnostics, and cache management',
  {
    operation: z.enum(['version', 'diagnostics', 'cache']),
    cacheAction: z.enum(['stats', 'clear']).optional(),
  },
  async (params) => {
    const args: string[] = [];
    if (params.operation === 'version') args.push('version');
    else if (params.operation === 'diagnostics') args.push('doctor');
    else if (params.operation === 'cache') {
      args.push('cache');
      if (params.cacheAction === 'clear') args.push('--clear');
    }
    const result = await callCli(args);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  },
);

// --- Startup ---
const transport = new StdioServerTransport();

// Graceful shutdown
process.stdin.on('end', async () => {
  await server.close();
  process.exit(0);
});

await server.connect(transport);

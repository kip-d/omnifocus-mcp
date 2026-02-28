# Clean-Room OmniFocus CLI + MCP Server — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI-first OmniFocus GTD assistant (`omnifocus` CLI) with a thin MCP wrapper, replacing the current 122-file server with ~30 files across 3 layers.

**Architecture:** Three layers — CLI (all capabilities, ScriptBuilder + JXA/OmniJS execution), MCP Server (thin wrapper calling CLI binary), Skills (GTD methodology in Agent Skills format). See `docs/plans/2026-02-28-clean-room-reimplementation-design.md` for full design spec.

**Tech Stack:** TypeScript, commander.js (CLI), @modelcontextprotocol/sdk (MCP), vitest (tests), zod (validation), chrono-node (date parsing), npm workspaces (monorepo)

**Reference docs (read before starting any JXA work):**
- `docs/dev/JXA-VS-OMNIJS-PATTERNS.md` — JXA method calls vs OmniJS property access
- `docs/dev/LESSONS_LEARNED.md` — serialization bugs, performance baselines, bridge context rules

---

## Phase 1: Foundation

### Task 1: Monorepo Scaffold

Create the monorepo structure with npm workspaces, TypeScript configs, and vitest.

**Files:**
- Create: `omnifocus-tools/package.json`
- Create: `omnifocus-tools/tsconfig.base.json`
- Create: `omnifocus-tools/vitest.config.ts`
- Create: `omnifocus-tools/.gitignore`
- Create: `omnifocus-tools/packages/cli/package.json`
- Create: `omnifocus-tools/packages/cli/tsconfig.json`
- Create: `omnifocus-tools/packages/cli/src/index.ts`
- Create: `omnifocus-tools/packages/mcp-server/package.json`
- Create: `omnifocus-tools/packages/mcp-server/tsconfig.json`
- Create: `omnifocus-tools/packages/mcp-server/src/index.ts`

**Step 1: Create root monorepo**

```json
// omnifocus-tools/package.json
{
  "name": "omnifocus-tools",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "typecheck": "tsc --build"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.2.4",
    "@types/node": "^24.0.3"
  }
}
```

```json
// omnifocus-tools/tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

```typescript
// omnifocus-tools/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/tests/unit/**/*.test.ts'],
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/tests/integration/**/*.test.ts'],
          testTimeout: 180000,
          // Sequential — OmniFocus can't handle concurrent osascript
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
```

**Step 2: Create CLI package**

```json
// omnifocus-tools/packages/cli/package.json
{
  "name": "@omnifocus/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "omnifocus": "dist/index.js" },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "commander": "^13.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "@types/node": "^24.0.3"
  }
}
```

```json
// omnifocus-tools/packages/cli/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

```typescript
// omnifocus-tools/packages/cli/src/index.ts
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('omnifocus')
  .description('OmniFocus GTD CLI')
  .version('0.1.0');

program.parse();
```

**Step 3: Create MCP server package (stub)**

```json
// omnifocus-tools/packages/mcp-server/package.json
{
  "name": "@omnifocus/mcp-server",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.1",
    "@omnifocus/cli": "workspace:*",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "@types/node": "^24.0.3"
  }
}
```

```typescript
// omnifocus-tools/packages/mcp-server/src/index.ts
// Stub — implemented in Phase 5
console.log('@omnifocus/mcp-server stub');
```

**Step 4: Verify build works**

Run: `cd omnifocus-tools && npm install && npm run build`
Expected: Clean build, no errors

**Step 5: Verify vitest runs**

Run: `cd omnifocus-tools && npx vitest run`
Expected: "No test files found" (no tests yet)

**Step 6: Commit**

```bash
git add omnifocus-tools/
git commit -m "feat: scaffold monorepo with cli and mcp-server packages"
```

---

### Task 2: ScriptBuilder Core

The heart of the system. Encodes the JXA/OmniJS execution strategy matrix and generates safe scripts with a single injection point (PARAMS object). ~200 lines.

**Critical reference:** Read `docs/dev/JXA-VS-OMNIJS-PATTERNS.md` and `docs/dev/LESSONS_LEARNED.md` before writing any code.

**Files:**
- Create: `packages/cli/src/scripts/script-builder.ts`
- Create: `packages/cli/src/scripts/types.ts`
- Test: `packages/cli/tests/unit/scripts/script-builder.test.ts`

**Step 1: Write types**

```typescript
// packages/cli/src/scripts/types.ts

/** Execution strategy based on empirical JXA/OmniJS testing */
export enum ExecStrategy {
  /** Property reads via JXA method calls — fast, simple */
  JXA_DIRECT = 'jxa_direct',
  /** Complex writes, bulk ops, parent traversal via evaluateJavascript() */
  OMNIJS_BRIDGE = 'omnijs_bridge',
  /** JXA for creation, bridge for complex properties (tags, plannedDate, etc.) */
  HYBRID = 'hybrid',
}

/** Parameters to inject into a script */
export type ScriptParams = Record<string, unknown>;

/** A generated script ready for execution */
export interface GeneratedScript {
  /** The JavaScript source code */
  source: string;
  /** Which execution strategy to use */
  strategy: ExecStrategy;
  /** Human-readable description for logging */
  description: string;
}

/** Filter operators for task queries */
export interface TaskFilter {
  project?: string | null;        // null = inbox
  tag?: string | string[];
  tagMode?: 'any' | 'all' | 'none';
  flagged?: boolean;
  completed?: boolean;
  available?: boolean;
  blocked?: boolean;
  search?: string;
  dueBefore?: string;             // YYYY-MM-DD or YYYY-MM-DD HH:mm
  dueAfter?: string;
  deferBefore?: string;
  deferAfter?: string;
  plannedBefore?: string;
  plannedAfter?: string;
  since?: string;                 // For completed tasks
  limit?: number;
  offset?: number;
  sort?: { field: string; direction: 'asc' | 'desc' };
  fields?: string[];
}
```

**Step 2: Write failing tests for ScriptBuilder**

```typescript
// packages/cli/tests/unit/scripts/script-builder.test.ts
import { describe, it, expect } from 'vitest';
import { ScriptBuilder } from '../../../src/scripts/script-builder.js';
import { ExecStrategy } from '../../../src/scripts/types.js';

describe('ScriptBuilder', () => {
  describe('listTasks', () => {
    it('generates JXA_DIRECT script for simple task reads', () => {
      const result = ScriptBuilder.listTasks({});
      expect(result.strategy).toBe(ExecStrategy.JXA_DIRECT);
      expect(result.source).toContain('const PARAMS =');
      expect(result.source).toContain('doc.flattenedTasks()');
      expect(result.source).not.toContain('whose');
      expect(result.source).not.toContain('where');
    });

    it('injects params via single JSON.stringify injection point', () => {
      const result = ScriptBuilder.listTasks({ flagged: true, limit: 10 });
      expect(result.source).toContain('const PARAMS =');
      // PARAMS should contain our filter values
      const paramsMatch = result.source.match(/const PARAMS = ({.*?});/s);
      expect(paramsMatch).not.toBeNull();
      const params = JSON.parse(paramsMatch![1]);
      expect(params.flagged).toBe(true);
      expect(params.limit).toBe(10);
    });

    it('never uses whose() or where()', () => {
      const result = ScriptBuilder.listTasks({ project: 'Work', flagged: true });
      expect(result.source).not.toMatch(/\.whose\s*\(/);
      expect(result.source).not.toMatch(/\.where\s*\(/);
    });

    it('uses direct iteration with filter checks', () => {
      const result = ScriptBuilder.listTasks({ flagged: true });
      expect(result.source).toContain('for (');
      expect(result.source).toContain('flagged');
    });

    it('applies limit via PARAMS not string interpolation', () => {
      const result = ScriptBuilder.listTasks({ limit: 5 });
      // limit should be in PARAMS, not interpolated into loop
      expect(result.source).toContain('PARAMS.limit');
    });

    it('handles null project as inbox query', () => {
      const result = ScriptBuilder.listTasks({ project: null });
      expect(result.source).toContain('PARAMS.project');
      const paramsMatch = result.source.match(/const PARAMS = ({.*?});/s);
      const params = JSON.parse(paramsMatch![1]);
      expect(params.project).toBeNull();
    });
  });

  describe('getTask', () => {
    it('generates JXA_DIRECT script for single task', () => {
      const result = ScriptBuilder.getTask('abc123');
      expect(result.strategy).toBe(ExecStrategy.JXA_DIRECT);
      expect(result.source).toContain('PARAMS.id');
    });
  });

  describe('createTask', () => {
    it('generates JXA_DIRECT for simple task', () => {
      const result = ScriptBuilder.createTask({ name: 'Test task' });
      expect(result.strategy).toBe(ExecStrategy.JXA_DIRECT);
    });

    it('generates HYBRID for task with tags', () => {
      const result = ScriptBuilder.createTask({
        name: 'Test task',
        tags: ['work', 'computer'],
      });
      expect(result.strategy).toBe(ExecStrategy.HYBRID);
      expect(result.source).toContain('evaluateJavascript');
    });

    it('generates HYBRID for task with plannedDate', () => {
      const result = ScriptBuilder.createTask({
        name: 'Test task',
        plannedDate: '2026-03-15',
      });
      expect(result.strategy).toBe(ExecStrategy.HYBRID);
    });
  });

  describe('updateTask', () => {
    it('generates JXA_DIRECT for simple property updates', () => {
      const result = ScriptBuilder.updateTask('abc123', { name: 'New name' });
      expect(result.strategy).toBe(ExecStrategy.JXA_DIRECT);
    });

    it('generates OMNIJS_BRIDGE for tag updates', () => {
      const result = ScriptBuilder.updateTask('abc123', {
        tags: ['new-tag'],
      });
      expect(result.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
    });
  });

  describe('completeTask', () => {
    it('generates JXA_DIRECT script', () => {
      const result = ScriptBuilder.completeTask('abc123');
      expect(result.strategy).toBe(ExecStrategy.JXA_DIRECT);
    });
  });

  describe('deleteTask', () => {
    it('generates JXA_DIRECT script', () => {
      const result = ScriptBuilder.deleteTask('abc123');
      expect(result.strategy).toBe(ExecStrategy.JXA_DIRECT);
    });
  });

  describe('listProjects', () => {
    it('generates JXA_DIRECT script', () => {
      const result = ScriptBuilder.listProjects({});
      expect(result.strategy).toBe(ExecStrategy.JXA_DIRECT);
    });
  });

  describe('listTags', () => {
    it('generates JXA_DIRECT script', () => {
      const result = ScriptBuilder.listTags();
      expect(result.strategy).toBe(ExecStrategy.JXA_DIRECT);
    });
  });

  describe('safety', () => {
    it('escapes special characters in string params', () => {
      const result = ScriptBuilder.listTasks({
        search: 'test "quotes" and \\backslash',
      });
      // JSON.stringify handles escaping — verify it parses back
      const paramsMatch = result.source.match(/const PARAMS = ({.*?});/s);
      const params = JSON.parse(paramsMatch![1]);
      expect(params.search).toBe('test "quotes" and \\backslash');
    });

    it('never has template placeholders like {{}}', () => {
      const result = ScriptBuilder.createTask({
        name: 'Test',
        tags: ['work'],
        plannedDate: '2026-03-15',
      });
      expect(result.source).not.toContain('{{');
      expect(result.source).not.toContain('}}');
    });
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `cd omnifocus-tools && npx vitest run --project unit`
Expected: FAIL — cannot find module `script-builder.js`

**Step 4: Implement ScriptBuilder**

```typescript
// packages/cli/src/scripts/script-builder.ts
import { ExecStrategy, type GeneratedScript, type ScriptParams, type TaskFilter } from './types.js';

/**
 * Generates JXA/OmniJS scripts with a single injection point (PARAMS object).
 *
 * Design principles:
 * - All external data enters via JSON.stringify(params) — one injection point
 * - No template placeholders ({{}}), no string interpolation of user values
 * - Strategy chosen from empirically tested decision matrix
 * - Never uses whose()/where() (25+ second timeout)
 * - JXA uses method calls: task.name(), task.id()
 * - OmniJS uses property access: task.name, task.id.primaryKey
 */
export class ScriptBuilder {
  /** Generate script to list/filter tasks */
  static listTasks(filter: TaskFilter): GeneratedScript {
    const params: ScriptParams = { ...filter };
    return {
      strategy: ExecStrategy.JXA_DIRECT,
      description: `list tasks (${Object.keys(filter).join(', ') || 'all'})`,
      source: this.wrapJxa(params, LIST_TASKS_BODY),
    };
  }

  /** Generate script to get a single task by ID */
  static getTask(id: string): GeneratedScript {
    return {
      strategy: ExecStrategy.JXA_DIRECT,
      description: `get task ${id}`,
      source: this.wrapJxa({ id }, GET_TASK_BODY),
    };
  }

  /** Generate script to create a task */
  static createTask(data: {
    name: string;
    note?: string;
    project?: string;
    tags?: string[];
    dueDate?: string;
    deferDate?: string;
    plannedDate?: string;
    flagged?: boolean;
    estimatedMinutes?: number;
  }): GeneratedScript {
    const needsBridge = !!(data.tags?.length || data.plannedDate);
    return {
      strategy: needsBridge ? ExecStrategy.HYBRID : ExecStrategy.JXA_DIRECT,
      description: `create task "${data.name}"`,
      source: needsBridge
        ? this.wrapJxa(data, CREATE_TASK_HYBRID_BODY)
        : this.wrapJxa(data, CREATE_TASK_SIMPLE_BODY),
    };
  }

  /** Generate script to update a task */
  static updateTask(id: string, changes: Record<string, unknown>): GeneratedScript {
    const needsBridge = !!(changes.tags || changes.plannedDate || changes.repetitionRule);
    return {
      strategy: needsBridge ? ExecStrategy.OMNIJS_BRIDGE : ExecStrategy.JXA_DIRECT,
      description: `update task ${id}`,
      source: needsBridge
        ? this.wrapJxa({ id, ...changes }, UPDATE_TASK_BRIDGE_BODY)
        : this.wrapJxa({ id, ...changes }, UPDATE_TASK_SIMPLE_BODY),
    };
  }

  /** Generate script to complete a task */
  static completeTask(id: string): GeneratedScript {
    return {
      strategy: ExecStrategy.JXA_DIRECT,
      description: `complete task ${id}`,
      source: this.wrapJxa({ id }, COMPLETE_TASK_BODY),
    };
  }

  /** Generate script to delete a task */
  static deleteTask(id: string): GeneratedScript {
    return {
      strategy: ExecStrategy.JXA_DIRECT,
      description: `delete task ${id}`,
      source: this.wrapJxa({ id }, DELETE_TASK_BODY),
    };
  }

  /** Generate script to list projects */
  static listProjects(filter: { folder?: string; status?: string }): GeneratedScript {
    return {
      strategy: ExecStrategy.JXA_DIRECT,
      description: 'list projects',
      source: this.wrapJxa(filter, LIST_PROJECTS_BODY),
    };
  }

  /** Generate script to list tags */
  static listTags(): GeneratedScript {
    return {
      strategy: ExecStrategy.JXA_DIRECT,
      description: 'list tags',
      source: this.wrapJxa({}, LIST_TAGS_BODY),
    };
  }

  /** Generate script to list folders */
  static listFolders(): GeneratedScript {
    return {
      strategy: ExecStrategy.JXA_DIRECT,
      description: 'list folders',
      source: this.wrapJxa({}, LIST_FOLDERS_BODY),
    };
  }

  // --- Analytics scripts (OmniJS bridge for bulk data) ---

  /** Generate script for productivity stats */
  static productivityStats(params: { period?: string; since?: string }): GeneratedScript {
    return {
      strategy: ExecStrategy.OMNIJS_BRIDGE,
      description: 'productivity stats',
      source: this.wrapJxa(params, PRODUCTIVITY_STATS_BODY),
    };
  }

  // --- Private helpers ---

  /**
   * Wrap a script body in a JXA IIFE with PARAMS injection.
   * This is the SINGLE injection point — all external data enters here.
   */
  private static wrapJxa(params: ScriptParams, body: string): string {
    return `(() => {
  const PARAMS = ${JSON.stringify(params)};
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
${body}
})()`;
  }
}

// --- Script bodies ---
// Each body assumes PARAMS, app, and doc are in scope.
// JXA context: use method calls — task.name(), task.id()
// Never use whose()/where() — iterate with for loops.

const LIST_TASKS_BODY = `
  const allTasks = doc.flattenedTasks();
  const results = [];
  const limit = PARAMS.limit || 25;
  const offset = PARAMS.offset || 0;
  let matched = 0;
  let skipped = 0;

  for (let i = 0; i < allTasks.length; i++) {
    const t = allTasks[i];

    // Skip completed unless requested
    if (!PARAMS.completed && t.completed()) continue;

    // Filter: project (null = inbox)
    if (PARAMS.project !== undefined) {
      const proj = t.containingProject();
      if (PARAMS.project === null) {
        if (proj) continue;
      } else {
        if (!proj || proj.name() !== PARAMS.project) continue;
      }
    }

    // Filter: flagged
    if (PARAMS.flagged === true && !t.flagged()) continue;

    // Filter: available
    if (PARAMS.available === true && t.blocked()) continue;

    // Filter: blocked
    if (PARAMS.blocked === true && !t.blocked()) continue;

    // Filter: tag
    if (PARAMS.tag) {
      const taskTags = t.tags();
      const tagNames = taskTags ? taskTags.map(tg => tg.name()) : [];
      const wanted = Array.isArray(PARAMS.tag) ? PARAMS.tag : [PARAMS.tag];
      const mode = PARAMS.tagMode || 'any';
      if (mode === 'any' && !wanted.some(w => tagNames.includes(w))) continue;
      if (mode === 'all' && !wanted.every(w => tagNames.includes(w))) continue;
      if (mode === 'none' && wanted.some(w => tagNames.includes(w))) continue;
    }

    // Filter: search text
    if (PARAMS.search) {
      const searchLower = PARAMS.search.toLowerCase();
      const name = t.name() || '';
      const note = t.note() || '';
      if (!name.toLowerCase().includes(searchLower) && !note.toLowerCase().includes(searchLower)) continue;
    }

    // Filter: due date range
    if (PARAMS.dueBefore || PARAMS.dueAfter) {
      const due = t.dueDate();
      if (!due) continue;
      if (PARAMS.dueBefore && due >= new Date(PARAMS.dueBefore)) continue;
      if (PARAMS.dueAfter && due <= new Date(PARAMS.dueAfter)) continue;
    }

    // Filter: defer date range
    if (PARAMS.deferBefore || PARAMS.deferAfter) {
      const defer = t.deferDate();
      if (!defer) continue;
      if (PARAMS.deferBefore && defer >= new Date(PARAMS.deferBefore)) continue;
      if (PARAMS.deferAfter && defer <= new Date(PARAMS.deferAfter)) continue;
    }

    // Pagination
    if (skipped < offset) { skipped++; continue; }
    if (results.length >= limit) break;

    // Build result object — all properties via method calls (JXA)
    const task = {};
    task.id = t.id();
    task.name = t.name();
    task.completed = t.completed();
    task.flagged = t.flagged();
    task.blocked = t.blocked();

    const dueDate = t.dueDate();
    task.dueDate = dueDate ? dueDate.toISOString() : null;

    const deferDate = t.deferDate();
    task.deferDate = deferDate ? deferDate.toISOString() : null;

    const plannedDate = t.plannedDate();
    task.plannedDate = plannedDate ? plannedDate.toISOString() : null;

    const project = t.containingProject();
    task.project = project ? project.name() : null;
    task.projectId = project ? project.id() : null;

    const tags = t.tags();
    task.tags = tags ? tags.map(tg => tg.name()) : [];

    task.note = t.note() || '';
    task.estimatedMinutes = t.estimatedMinutes() || null;

    const added = t.creationDate();
    task.added = added ? added.toISOString() : null;

    const modified = t.modificationDate();
    task.modified = modified ? modified.toISOString() : null;

    matched++;
    results.push(task);
  }

  // Sort if requested
  if (PARAMS.sort) {
    const field = PARAMS.sort.field;
    const dir = PARAMS.sort.direction === 'desc' ? -1 : 1;
    results.sort((a, b) => {
      const av = a[field], bv = b[field];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  return JSON.stringify({ tasks: results, total: matched });
`;

const GET_TASK_BODY = `
  const allTasks = doc.flattenedTasks();
  for (let i = 0; i < allTasks.length; i++) {
    const t = allTasks[i];
    if (t.id() !== PARAMS.id) continue;

    const task = {};
    task.id = t.id();
    task.name = t.name();
    task.completed = t.completed();
    task.flagged = t.flagged();
    task.blocked = t.blocked();
    task.note = t.note() || '';
    task.estimatedMinutes = t.estimatedMinutes() || null;

    const dueDate = t.dueDate();
    task.dueDate = dueDate ? dueDate.toISOString() : null;
    const deferDate = t.deferDate();
    task.deferDate = deferDate ? deferDate.toISOString() : null;
    const plannedDate = t.plannedDate();
    task.plannedDate = plannedDate ? plannedDate.toISOString() : null;
    const completionDate = t.completionDate();
    task.completionDate = completionDate ? completionDate.toISOString() : null;

    const project = t.containingProject();
    task.project = project ? project.name() : null;
    task.projectId = project ? project.id() : null;

    const tags = t.tags();
    task.tags = tags ? tags.map(tg => tg.name()) : [];

    const rule = t.repetitionRule();
    task.repetitionRule = rule || null;

    const added = t.creationDate();
    task.added = added ? added.toISOString() : null;
    const modified = t.modificationDate();
    task.modified = modified ? modified.toISOString() : null;

    return JSON.stringify({ task });
  }
  return JSON.stringify({ error: true, message: "Task not found: " + PARAMS.id });
`;

const CREATE_TASK_SIMPLE_BODY = `
  // JXA Direct — simple properties only (no tags, no plannedDate)
  const props = { name: PARAMS.name };
  if (PARAMS.note) props.note = PARAMS.note;
  if (PARAMS.flagged) props.flagged = PARAMS.flagged;
  if (PARAMS.dueDate) props.dueDate = new Date(PARAMS.dueDate);
  if (PARAMS.deferDate) props.deferDate = new Date(PARAMS.deferDate);
  if (PARAMS.estimatedMinutes) props.estimatedMinutes = PARAMS.estimatedMinutes;

  const task = app.Task(props);

  // Place in project or inbox
  if (PARAMS.project) {
    const projects = doc.flattenedProjects();
    for (let i = 0; i < projects.length; i++) {
      if (projects[i].name() === PARAMS.project) {
        projects[i].tasks.push(task);
        break;
      }
    }
  } else {
    doc.inboxTasks.push(task);
  }

  return JSON.stringify({
    task: { id: task.id(), name: task.name() }
  });
`;

const CREATE_TASK_HYBRID_BODY = `
  // Hybrid — create in JXA, use bridge for tags/plannedDate
  const props = { name: PARAMS.name };
  if (PARAMS.note) props.note = PARAMS.note;
  if (PARAMS.flagged) props.flagged = PARAMS.flagged;
  if (PARAMS.dueDate) props.dueDate = new Date(PARAMS.dueDate);
  if (PARAMS.deferDate) props.deferDate = new Date(PARAMS.deferDate);
  if (PARAMS.estimatedMinutes) props.estimatedMinutes = PARAMS.estimatedMinutes;

  const task = app.Task(props);

  if (PARAMS.project) {
    const projects = doc.flattenedProjects();
    for (let i = 0; i < projects.length; i++) {
      if (projects[i].name() === PARAMS.project) {
        projects[i].tasks.push(task);
        break;
      }
    }
  } else {
    doc.inboxTasks.push(task);
  }

  const taskId = task.id();

  // Bridge for complex properties (tags, plannedDate)
  const bridgeParams = JSON.stringify({
    taskId: taskId,
    tags: PARAMS.tags || [],
    plannedDate: PARAMS.plannedDate || null,
  });

  app.evaluateJavascript(\`
    (() => {
      const BP = \${bridgeParams};
      const task = Task.byIdentifier(BP.taskId);
      if (!task) return JSON.stringify({error: "task not found after creation"});

      if (BP.tags && BP.tags.length > 0) {
        task.clearTags();
        BP.tags.forEach(name => {
          const tag = flattenedTags.byName(name);
          if (tag) task.addTag(tag);
          else task.addTag(new Tag(name));
        });
      }

      if (BP.plannedDate) {
        task.plannedDate = new Date(BP.plannedDate);
      }

      return JSON.stringify({success: true});
    })()
  \`);

  return JSON.stringify({
    task: { id: taskId, name: task.name() }
  });
`;

const UPDATE_TASK_SIMPLE_BODY = `
  // JXA Direct — simple property updates
  const allTasks = doc.flattenedTasks();
  for (let i = 0; i < allTasks.length; i++) {
    const t = allTasks[i];
    if (t.id() !== PARAMS.id) continue;

    if (PARAMS.name !== undefined) t.name = PARAMS.name;
    if (PARAMS.note !== undefined) t.note = PARAMS.note;
    if (PARAMS.flagged !== undefined) t.flagged = PARAMS.flagged;
    if (PARAMS.dueDate !== undefined) t.dueDate = PARAMS.dueDate ? new Date(PARAMS.dueDate) : null;
    if (PARAMS.deferDate !== undefined) t.deferDate = PARAMS.deferDate ? new Date(PARAMS.deferDate) : null;
    if (PARAMS.estimatedMinutes !== undefined) t.estimatedMinutes = PARAMS.estimatedMinutes;

    return JSON.stringify({
      task: { id: t.id(), name: t.name() }
    });
  }
  return JSON.stringify({ error: true, message: "Task not found: " + PARAMS.id });
`;

const UPDATE_TASK_BRIDGE_BODY = `
  // OmniJS Bridge — complex property updates (tags, plannedDate, repetition)
  const bridgeParams = JSON.stringify({
    id: PARAMS.id,
    tags: PARAMS.tags,
    plannedDate: PARAMS.plannedDate,
    clearPlannedDate: PARAMS.clearPlannedDate,
    name: PARAMS.name,
    note: PARAMS.note,
    flagged: PARAMS.flagged,
    dueDate: PARAMS.dueDate,
    clearDueDate: PARAMS.clearDueDate,
    deferDate: PARAMS.deferDate,
    clearDeferDate: PARAMS.clearDeferDate,
  });

  const result = app.evaluateJavascript(\`
    (() => {
      const BP = \${bridgeParams};
      const task = Task.byIdentifier(BP.id);
      if (!task) return JSON.stringify({error: true, message: "Task not found: " + BP.id});

      if (BP.name !== undefined) task.name = BP.name;
      if (BP.note !== undefined) task.note = BP.note;
      if (BP.flagged !== undefined) task.flagged = BP.flagged;

      if (BP.clearDueDate) task.dueDate = null;
      else if (BP.dueDate !== undefined) task.dueDate = BP.dueDate ? new Date(BP.dueDate) : null;

      if (BP.clearDeferDate) task.deferDate = null;
      else if (BP.deferDate !== undefined) task.deferDate = BP.deferDate ? new Date(BP.deferDate) : null;

      if (BP.clearPlannedDate) task.plannedDate = null;
      else if (BP.plannedDate !== undefined) task.plannedDate = BP.plannedDate ? new Date(BP.plannedDate) : null;

      if (BP.tags !== undefined) {
        task.clearTags();
        BP.tags.forEach(name => {
          const tag = flattenedTags.byName(name);
          if (tag) task.addTag(tag);
          else task.addTag(new Tag(name));
        });
      }

      return JSON.stringify({
        task: { id: task.id.primaryKey, name: task.name }
      });
    })()
  \`);

  return result;
`;

const COMPLETE_TASK_BODY = `
  const allTasks = doc.flattenedTasks();
  for (let i = 0; i < allTasks.length; i++) {
    const t = allTasks[i];
    if (t.id() !== PARAMS.id) continue;
    t.markComplete();
    return JSON.stringify({
      task: { id: t.id(), name: t.name(), completed: true }
    });
  }
  return JSON.stringify({ error: true, message: "Task not found: " + PARAMS.id });
`;

const DELETE_TASK_BODY = `
  const allTasks = doc.flattenedTasks();
  for (let i = 0; i < allTasks.length; i++) {
    const t = allTasks[i];
    if (t.id() !== PARAMS.id) continue;
    const name = t.name();
    app.delete(t);
    return JSON.stringify({
      deleted: { id: PARAMS.id, name: name }
    });
  }
  return JSON.stringify({ error: true, message: "Task not found: " + PARAMS.id });
`;

const LIST_PROJECTS_BODY = `
  const allProjects = doc.flattenedProjects();
  const results = [];

  for (let i = 0; i < allProjects.length; i++) {
    const p = allProjects[i];
    const status = p.status();
    if (PARAMS.status && status !== PARAMS.status) continue;

    const project = {};
    project.id = p.id();
    project.name = p.name();
    project.status = status;
    project.flagged = p.flagged();

    const folder = p.folder();
    project.folder = folder ? folder.name() : null;

    const dueDate = p.dueDate();
    project.dueDate = dueDate ? dueDate.toISOString() : null;

    project.note = p.note() || '';
    project.sequential = p.sequential();

    results.push(project);
  }

  return JSON.stringify({ projects: results });
`;

const LIST_TAGS_BODY = `
  const allTags = doc.flattenedTags();
  const results = [];

  for (let i = 0; i < allTags.length; i++) {
    const tg = allTags[i];
    results.push({
      id: tg.id(),
      name: tg.name(),
      available: tg.availableTaskCount(),
    });
  }

  return JSON.stringify({ tags: results });
`;

const LIST_FOLDERS_BODY = `
  // Build folder hierarchy via traversal (folder.parent() fails in JXA)
  function processFolder(folder, parentPath) {
    const name = folder.name();
    const path = parentPath ? parentPath + ' / ' + name : name;
    const result = { id: folder.id(), name: name, path: path };
    results.push(result);

    const children = folder.folders();
    for (let j = 0; j < children.length; j++) {
      processFolder(children[j], path);
    }
  }

  const results = [];
  const topFolders = doc.folders();
  for (let i = 0; i < topFolders.length; i++) {
    processFolder(topFolders[i], '');
  }

  return JSON.stringify({ folders: results });
`;

const PRODUCTIVITY_STATS_BODY = `
  // OmniJS Bridge — bulk data access avoids N round-trips
  const result = app.evaluateJavascript(\`
    (() => {
      const now = new Date();
      const tasks = flattenedTasks;
      let active = 0, completed = 0, overdue = 0, flagged = 0, inbox = 0;

      tasks.forEach(t => {
        if (t.completed) {
          completed++;
        } else {
          active++;
          if (t.flagged) flagged++;
          if (!t.containingProject) inbox++;
          const due = t.dueDate;
          if (due && due < now) overdue++;
        }
      });

      return JSON.stringify({
        stats: { active, completed, overdue, flagged, inbox, total: active + completed }
      });
    })()
  \`);
  return result;
`;
```

**Step 5: Run tests to verify they pass**

Run: `cd omnifocus-tools && npx vitest run --project unit`
Expected: All ScriptBuilder tests PASS

**Step 6: Commit**

```bash
git add packages/cli/src/scripts/ packages/cli/tests/
git commit -m "feat: implement ScriptBuilder with execution strategy matrix"
```

---

### Task 3: JXA Execution Engine

Runs generated scripts via `osascript`. Writes scripts to temp files (never passes via `-e` flag). Handles timeouts and error parsing.

**Files:**
- Create: `packages/cli/src/scripts/executor.ts`
- Test: `packages/cli/tests/unit/scripts/executor.test.ts`
- Test: `packages/cli/tests/integration/scripts/executor.test.ts`

**Step 1: Write failing unit tests**

```typescript
// packages/cli/tests/unit/scripts/executor.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScriptExecutor } from '../../../src/scripts/executor.js';
import { ExecStrategy } from '../../../src/scripts/types.js';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';

vi.mock('node:child_process');
vi.mock('node:fs');

describe('ScriptExecutor', () => {
  const mockExecFileSync = vi.mocked(child_process.execFileSync);
  const mockWriteFileSync = vi.mocked(fs.writeFileSync);
  const mockUnlinkSync = vi.mocked(fs.unlinkSync);
  const mockMkdirSync = vi.mocked(fs.mkdirSync);

  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdirSync.mockReturnValue(undefined);
  });

  it('writes script to temp file before execution', async () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"tasks":[]}'));

    await ScriptExecutor.execute({
      source: 'return "hello"',
      strategy: ExecStrategy.JXA_DIRECT,
      description: 'test',
    });

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.js'),
      'return "hello"',
    );
  });

  it('executes via osascript -l JavaScript', async () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"result":"ok"}'));

    await ScriptExecutor.execute({
      source: 'return "hello"',
      strategy: ExecStrategy.JXA_DIRECT,
      description: 'test',
    });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'osascript',
      ['-l', 'JavaScript', expect.stringContaining('.js')],
      expect.objectContaining({ timeout: 120000 }),
    );
  });

  it('cleans up temp file after execution', async () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{}'));

    await ScriptExecutor.execute({
      source: 'return "hello"',
      strategy: ExecStrategy.JXA_DIRECT,
      description: 'test',
    });

    expect(mockUnlinkSync).toHaveBeenCalled();
  });

  it('parses JSON output', async () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"tasks":[{"id":"1"}]}'));

    const result = await ScriptExecutor.execute({
      source: 'return JSON.stringify({tasks:[{id:"1"}]})',
      strategy: ExecStrategy.JXA_DIRECT,
      description: 'test',
    });

    expect(result).toEqual({ tasks: [{ id: '1' }] });
  });

  it('throws on timeout', async () => {
    mockExecFileSync.mockImplementation(() => {
      const err = new Error('timeout') as any;
      err.killed = true;
      err.signal = 'SIGTERM';
      throw err;
    });

    await expect(
      ScriptExecutor.execute({
        source: 'return "slow"',
        strategy: ExecStrategy.JXA_DIRECT,
        description: 'test',
      }),
    ).rejects.toThrow(/timeout/i);
  });

  it('throws on script error with message', async () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from('{"error":true,"message":"Task not found: xyz"}'),
    );

    await expect(
      ScriptExecutor.execute({
        source: 'return JSON.stringify({error:true,message:"Task not found: xyz"})',
        strategy: ExecStrategy.JXA_DIRECT,
        description: 'test',
      }),
    ).rejects.toThrow('Task not found: xyz');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd omnifocus-tools && npx vitest run --project unit -- executor`
Expected: FAIL — cannot find module `executor.js`

**Step 3: Implement ScriptExecutor**

```typescript
// packages/cli/src/scripts/executor.ts
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { GeneratedScript } from './types.js';

const TEMP_DIR = join(tmpdir(), 'omnifocus-cli');
const DEFAULT_TIMEOUT = 120_000; // 2 minutes

export class ScriptExecutor {
  /**
   * Execute a generated script via osascript and return parsed JSON result.
   *
   * - Writes script to temp file (never passes via -e flag)
   * - Cleans up temp file after execution
   * - Parses JSON output
   * - Detects script-level errors ({error: true, message: "..."})
   */
  static async execute<T = unknown>(script: GeneratedScript): Promise<T> {
    mkdirSync(TEMP_DIR, { recursive: true });
    const tempFile = join(TEMP_DIR, `${randomUUID()}.js`);

    try {
      writeFileSync(tempFile, script.source);

      const output = execFileSync(
        'osascript',
        ['-l', 'JavaScript', tempFile],
        {
          timeout: DEFAULT_TIMEOUT,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      const trimmed = (typeof output === 'string' ? output : output.toString()).trim();
      if (!trimmed) {
        throw new Error(`Script returned empty output: ${script.description}`);
      }

      const parsed = JSON.parse(trimmed);

      // Check for script-level errors
      if (parsed && parsed.error === true && parsed.message) {
        throw new Error(parsed.message);
      }

      return parsed as T;
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        throw new Error(`Script returned invalid JSON: ${script.description}`);
      }
      if (err instanceof Error) {
        if ((err as any).killed || (err as any).signal === 'SIGTERM') {
          throw new Error(`Script timeout (${DEFAULT_TIMEOUT}ms): ${script.description}`);
        }
        throw err;
      }
      throw new Error(`Script execution failed: ${script.description}`);
    } finally {
      try { unlinkSync(tempFile); } catch { /* ignore cleanup errors */ }
    }
  }
}
```

**Step 4: Run unit tests to verify they pass**

Run: `cd omnifocus-tools && npx vitest run --project unit -- executor`
Expected: All executor unit tests PASS

**Step 5: Write integration test (requires OmniFocus)**

```typescript
// packages/cli/tests/integration/scripts/executor.test.ts
import { describe, it, expect } from 'vitest';
import { ScriptBuilder } from '../../../src/scripts/script-builder.js';
import { ScriptExecutor } from '../../../src/scripts/executor.js';

describe('ScriptExecutor integration', () => {
  it('can list tasks from OmniFocus', async () => {
    const script = ScriptBuilder.listTasks({ limit: 5 });
    const result = await ScriptExecutor.execute<{ tasks: unknown[] }>(script);
    expect(result).toHaveProperty('tasks');
    expect(Array.isArray(result.tasks)).toBe(true);
  }, 30000);

  it('can list projects from OmniFocus', async () => {
    const script = ScriptBuilder.listProjects({});
    const result = await ScriptExecutor.execute<{ projects: unknown[] }>(script);
    expect(result).toHaveProperty('projects');
    expect(Array.isArray(result.projects)).toBe(true);
  }, 30000);

  it('can list tags from OmniFocus', async () => {
    const script = ScriptBuilder.listTags();
    const result = await ScriptExecutor.execute<{ tags: unknown[] }>(script);
    expect(result).toHaveProperty('tags');
    expect(Array.isArray(result.tags)).toBe(true);
  }, 30000);
});
```

**Step 6: Run integration tests**

Run: `cd omnifocus-tools && npx vitest run --project integration`
Expected: All integration tests PASS (OmniFocus must be running)

**Step 7: Commit**

```bash
git add packages/cli/src/scripts/executor.ts packages/cli/tests/
git commit -m "feat: implement JXA script executor with temp file execution"
```

---

### Task 4: Date Parsing and File Cache

Natural language date parsing (tomorrow, next monday, etc.) and file-based TTL cache.

**Files:**
- Create: `packages/cli/src/utils/dates.ts`
- Create: `packages/cli/src/cache/file-cache.ts`
- Test: `packages/cli/tests/unit/utils/dates.test.ts`
- Test: `packages/cli/tests/unit/cache/file-cache.test.ts`

**Step 1: Write failing date tests**

```typescript
// packages/cli/tests/unit/utils/dates.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseDate, formatDate } from '../../../src/utils/dates.js';

describe('parseDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes through YYYY-MM-DD format', () => {
    expect(parseDate('2026-03-15')).toBe('2026-03-15');
  });

  it('passes through YYYY-MM-DD HH:mm format', () => {
    expect(parseDate('2026-03-15 17:00')).toBe('2026-03-15 17:00');
  });

  it('parses "today"', () => {
    expect(parseDate('today')).toBe('2026-03-01');
  });

  it('parses "tomorrow"', () => {
    expect(parseDate('tomorrow')).toBe('2026-03-02');
  });

  it('parses "next monday"', () => {
    // 2026-03-01 is a Sunday, next Monday is 2026-03-02
    const result = parseDate('next monday');
    expect(result).toMatch(/^2026-03-0[2-9]$/);
  });

  it('returns null for unparseable input', () => {
    expect(parseDate('not a date')).toBeNull();
  });

  it('never returns ISO-8601 with Z suffix', () => {
    const result = parseDate('2026-03-15');
    expect(result).not.toContain('Z');
    expect(result).not.toContain('T');
  });
});

describe('formatDate', () => {
  it('formats due date with 5pm default', () => {
    expect(formatDate('2026-03-15', 'due')).toBe('2026-03-15 17:00');
  });

  it('formats defer date with 8am default', () => {
    expect(formatDate('2026-03-15', 'defer')).toBe('2026-03-15 08:00');
  });

  it('formats planned date with 8am default', () => {
    expect(formatDate('2026-03-15', 'planned')).toBe('2026-03-15 08:00');
  });

  it('preserves explicit time', () => {
    expect(formatDate('2026-03-15 14:30', 'due')).toBe('2026-03-15 14:30');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd omnifocus-tools && npx vitest run --project unit -- dates`
Expected: FAIL

**Step 3: Implement date parsing**

```typescript
// packages/cli/src/utils/dates.ts

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
const YYYY_MM_DD_HHMM = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

const DEFAULT_TIMES: Record<string, string> = {
  due: '17:00',
  defer: '08:00',
  planned: '08:00',
  completion: '12:00',
};

/**
 * Parse a date string (natural language or formatted) to YYYY-MM-DD or YYYY-MM-DD HH:mm.
 * Returns null if unparseable.
 * Never returns ISO-8601 with Z suffix.
 */
export function parseDate(input: string): string | null {
  const trimmed = input.trim().toLowerCase();

  // Already formatted
  if (YYYY_MM_DD_HHMM.test(input.trim())) return input.trim();
  if (YYYY_MM_DD.test(input.trim())) return input.trim();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Common natural language
  if (trimmed === 'today') return formatYMD(today);
  if (trimmed === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return formatYMD(d);
  }
  if (trimmed === 'yesterday') {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return formatYMD(d);
  }

  // "next <day>"
  const nextDayMatch = trimmed.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (nextDayMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const target = dayNames.indexOf(nextDayMatch[1]);
    const d = new Date(today);
    const current = d.getDay();
    let daysUntil = target - current;
    if (daysUntil <= 0) daysUntil += 7;
    d.setDate(d.getDate() + daysUntil);
    return formatYMD(d);
  }

  // "in N days"
  const inDaysMatch = trimmed.match(/^in\s+(\d+)\s+days?$/);
  if (inDaysMatch) {
    const d = new Date(today);
    d.setDate(d.getDate() + parseInt(inDaysMatch[1], 10));
    return formatYMD(d);
  }

  // "end of month"
  if (trimmed === 'end of month' || trimmed === 'eom') {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return formatYMD(d);
  }

  // "end of week" (Friday)
  if (trimmed === 'end of week' || trimmed === 'eow') {
    const d = new Date(today);
    const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilFriday);
    return formatYMD(d);
  }

  return null;
}

/**
 * Add default time to a date string based on date type.
 * Due dates: 5pm, Defer dates: 8am, Planned dates: 8am
 */
export function formatDate(date: string, type: 'due' | 'defer' | 'planned' | 'completion'): string {
  if (YYYY_MM_DD_HHMM.test(date)) return date;
  if (YYYY_MM_DD.test(date)) return `${date} ${DEFAULT_TIMES[type]}`;
  return date;
}

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

**Step 4: Run date tests**

Run: `cd omnifocus-tools && npx vitest run --project unit -- dates`
Expected: PASS

**Step 5: Write failing cache tests**

```typescript
// packages/cli/tests/unit/cache/file-cache.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileCache } from '../../../src/cache/file-cache.js';
import * as fs from 'node:fs';

vi.mock('node:fs');

describe('FileCache', () => {
  const mockReadFileSync = vi.mocked(fs.readFileSync);
  const mockWriteFileSync = vi.mocked(fs.writeFileSync);
  const mockExistsSync = vi.mocked(fs.existsSync);
  const mockMkdirSync = vi.mocked(fs.mkdirSync);
  const mockUnlinkSync = vi.mocked(fs.unlinkSync);
  const mockReaddirSync = vi.mocked(fs.readdirSync);

  let cache: FileCache;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdirSync.mockReturnValue(undefined);
    cache = new FileCache('/tmp/test-cache');
  });

  it('returns null for cache miss', () => {
    mockExistsSync.mockReturnValue(false);
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('returns cached value within TTL', () => {
    const cached = { data: 'test', expires: Date.now() + 60000 };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(cached));

    expect(cache.get('key')).toEqual('test');
  });

  it('returns null for expired cache entry', () => {
    const cached = { data: 'test', expires: Date.now() - 1000 };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(cached));

    expect(cache.get('key')).toBeNull();
  });

  it('writes cache entry with TTL', () => {
    cache.set('key', { hello: 'world' }, 300000);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('key.json'),
      expect.any(String),
    );

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written.data).toEqual({ hello: 'world' });
    expect(written.expires).toBeGreaterThan(Date.now());
  });

  it('clears all cache entries', () => {
    mockReaddirSync.mockReturnValue(['a.json', 'b.json'] as any);
    mockUnlinkSync.mockReturnValue(undefined);

    cache.clear();

    expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
  });
});
```

**Step 6: Run cache tests to verify they fail**

Run: `cd omnifocus-tools && npx vitest run --project unit -- file-cache`
Expected: FAIL

**Step 7: Implement FileCache**

```typescript
// packages/cli/src/cache/file-cache.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface CacheEntry<T> {
  data: T;
  expires: number;
}

/** TTL defaults in milliseconds */
export const CACHE_TTLS = {
  projects: 5 * 60 * 1000,    // 5 minutes
  tags: 10 * 60 * 1000,       // 10 minutes
  folders: 10 * 60 * 1000,    // 10 minutes
  analytics: 60 * 60 * 1000,  // 1 hour
  // tasks: not cached (always fresh)
} as const;

export class FileCache {
  constructor(private readonly cacheDir: string) {
    mkdirSync(cacheDir, { recursive: true });
  }

  get<T>(key: string): T | null {
    const file = this.filePath(key);
    if (!existsSync(file)) return null;

    try {
      const raw = readFileSync(file, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(raw);
      if (Date.now() > entry.expires) return null;
      return entry.data;
    } catch {
      return null;
    }
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    const entry: CacheEntry<T> = { data, expires: Date.now() + ttlMs };
    // Use writeFileSync — fs.promises hangs in MCP context (see LESSONS_LEARNED.md)
    writeFileSync(this.filePath(key), JSON.stringify(entry));
  }

  clear(): void {
    try {
      const files = readdirSync(this.cacheDir);
      for (const file of files) {
        try { unlinkSync(join(this.cacheDir, file)); } catch { /* ignore */ }
      }
    } catch { /* cache dir may not exist */ }
  }

  private filePath(key: string): string {
    // Sanitize key for filesystem
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.cacheDir, `${safe}.json`);
  }
}
```

**Step 8: Run all unit tests**

Run: `cd omnifocus-tools && npx vitest run --project unit`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add packages/cli/src/utils/ packages/cli/src/cache/ packages/cli/tests/
git commit -m "feat: add date parsing and file-based cache"
```

---

## Phase 2: CLI Read Commands

### Task 5: CLI Framework and Output Formatting

Set up commander.js with output formatting (text, JSON, CSV, markdown).

**Files:**
- Create: `packages/cli/src/output/formatter.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/unit/output/formatter.test.ts`

**Step 1: Write failing formatter tests**

```typescript
// packages/cli/tests/unit/output/formatter.test.ts
import { describe, it, expect } from 'vitest';
import { formatOutput } from '../../../src/output/formatter.js';

describe('formatOutput', () => {
  const tasks = [
    { id: '1', name: 'Buy milk', dueDate: '2026-03-15', flagged: true, tags: ['errands'] },
    { id: '2', name: 'Write report', dueDate: null, flagged: false, tags: ['work'] },
  ];

  it('formats as JSON', () => {
    const result = formatOutput(tasks, 'json');
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(tasks);
  });

  it('formats as text (default, LLM-friendly)', () => {
    const result = formatOutput(tasks, 'text');
    expect(result).toContain('Buy milk');
    expect(result).toContain('Write report');
    // Text format should be concise, scannable
    expect(result.split('\n').length).toBeLessThan(20);
  });

  it('formats as markdown table', () => {
    const result = formatOutput(tasks, 'markdown');
    expect(result).toContain('|');
    expect(result).toContain('Buy milk');
  });

  it('selects specific fields', () => {
    const result = formatOutput(tasks, 'text', { fields: ['name', 'dueDate'] });
    expect(result).toContain('Buy milk');
    expect(result).not.toContain('errands');
  });

  it('handles empty results', () => {
    const result = formatOutput([], 'text');
    expect(result).toContain('No results');
  });

  it('formats count-only output', () => {
    const result = formatOutput({ count: 42 }, 'text');
    expect(result).toContain('42');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd omnifocus-tools && npx vitest run --project unit -- formatter`
Expected: FAIL

**Step 3: Implement formatter**

```typescript
// packages/cli/src/output/formatter.ts

export type OutputFormat = 'text' | 'json' | 'csv' | 'markdown';

interface FormatOptions {
  fields?: string[];
  quiet?: boolean;
}

export function formatOutput(
  data: unknown,
  format: OutputFormat,
  options?: FormatOptions,
): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }

  // Count-only
  if (data && typeof data === 'object' && 'count' in data) {
    return String((data as { count: number }).count);
  }

  // Array of records
  if (!Array.isArray(data) || data.length === 0) {
    return format === 'json' ? '[]' : 'No results';
  }

  // Filter fields if specified
  const records = options?.fields
    ? data.map((item: Record<string, unknown>) =>
        Object.fromEntries(options.fields!.map(f => [f, item[f]])))
    : data;

  if (format === 'markdown') return formatMarkdown(records);
  if (format === 'csv') return formatCsv(records);
  return formatText(records, options?.quiet);
}

function formatText(records: Record<string, unknown>[], quiet?: boolean): string {
  const lines: string[] = [];
  for (const record of records) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined || value === '') continue;
      if (Array.isArray(value)) {
        if (value.length > 0) parts.push(`${key}: ${value.join(', ')}`);
      } else if (typeof value === 'boolean') {
        if (value) parts.push(key);
      } else {
        parts.push(`${key}: ${value}`);
      }
    }
    lines.push(parts.join('  |  '));
  }
  return lines.join('\n');
}

function formatMarkdown(records: Record<string, unknown>[]): string {
  if (records.length === 0) return 'No results';
  const keys = Object.keys(records[0]);
  const header = `| ${keys.join(' | ')} |`;
  const separator = `| ${keys.map(() => '---').join(' | ')} |`;
  const rows = records.map(r =>
    `| ${keys.map(k => formatCell(r[k])).join(' | ')} |`
  );
  return [header, separator, ...rows].join('\n');
}

function formatCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) return '';
  const keys = Object.keys(records[0]);
  const header = keys.join(',');
  const rows = records.map(r =>
    keys.map(k => csvEscape(formatCell(r[k]))).join(',')
  );
  return [header, ...rows].join('\n');
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
```

**Step 4: Run tests**

Run: `cd omnifocus-tools && npx vitest run --project unit -- formatter`
Expected: PASS

**Step 5: Update CLI entry point with global options**

```typescript
// packages/cli/src/index.ts
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('omnifocus')
  .description('OmniFocus GTD CLI')
  .version('0.1.0')
  .option('--format <type>', 'Output format: text, json, csv, markdown', 'text')
  .option('--fields <fields>', 'Comma-separated field names')
  .option('--limit <n>', 'Maximum results (default 25)', '25')
  .option('--offset <n>', 'Skip first N results', '0')
  .option('--sort <field:dir>', 'Sort by field:asc or field:desc')
  .option('--quiet', 'Suppress headers');

// Commands registered in Phase 2 tasks
// For now, output help
program.parse();
```

**Step 6: Commit**

```bash
git add packages/cli/src/ packages/cli/tests/
git commit -m "feat: add output formatter and CLI global options"
```

---

### Task 6: Read Commands (tasks, task, projects, tags, folders)

Wire the ScriptBuilder + Executor into CLI commands.

**Files:**
- Create: `packages/cli/src/commands/tasks.ts`
- Create: `packages/cli/src/commands/task.ts`
- Create: `packages/cli/src/commands/projects.ts`
- Create: `packages/cli/src/commands/tags.ts`
- Create: `packages/cli/src/commands/folders.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/integration/commands/read-commands.test.ts`

**Step 1: Write integration tests for read commands**

```typescript
// packages/cli/tests/integration/commands/read-commands.test.ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

const CLI = 'node dist/index.js';

function run(args: string): string {
  return execFileSync('node', ['dist/index.js', ...args.split(' ')], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    timeout: 30000,
  });
}

describe('CLI read commands', () => {
  it('omnifocus tasks --format json returns array', () => {
    const output = run('tasks --format json --limit 3');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('omnifocus tasks --count returns number', () => {
    const output = run('tasks --count');
    expect(parseInt(output.trim())).toBeGreaterThanOrEqual(0);
  });

  it('omnifocus tasks --flagged filters correctly', () => {
    const output = run('tasks --flagged --format json --limit 50');
    const tasks = JSON.parse(output);
    for (const task of tasks) {
      expect(task.flagged).toBe(true);
    }
  });

  it('omnifocus projects --format json returns array', () => {
    const output = run('projects --format json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('omnifocus tags --format json returns array', () => {
    const output = run('tags --format json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('omnifocus folders --format json returns array', () => {
    const output = run('folders --format json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
```

**Step 2: Implement tasks command**

```typescript
// packages/cli/src/commands/tasks.ts
import { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput, type OutputFormat } from '../output/formatter.js';
import { parseDate } from '../utils/dates.js';
import type { TaskFilter } from '../scripts/types.js';

export function registerTasksCommand(program: Command): void {
  program
    .command('tasks')
    .description('Query tasks with filters')
    .option('--project <name>', 'Filter by project name')
    .option('--tag <name>', 'Filter by tag (repeatable)', collect, [])
    .option('--tag-mode <mode>', 'Tag match mode: any, all, none', 'any')
    .option('--flagged', 'Only flagged tasks')
    .option('--available', 'Only available (not blocked) tasks')
    .option('--blocked', 'Only blocked tasks')
    .option('--due-before <date>', 'Due before date')
    .option('--due-after <date>', 'Due after date')
    .option('--defer-before <date>', 'Deferred before date')
    .option('--defer-after <date>', 'Deferred after date')
    .option('--planned-before <date>', 'Planned before date')
    .option('--planned-after <date>', 'Planned after date')
    .option('--search <text>', 'Search task name and note')
    .option('--completed', 'Include completed tasks')
    .option('--since <date>', 'Completed since date')
    .option('--count', 'Return count only')
    .action(async (opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const filter: TaskFilter = {};

      if (opts.project !== undefined) filter.project = opts.project;
      if (opts.tag?.length > 0) { filter.tag = opts.tag; filter.tagMode = opts.tagMode; }
      if (opts.flagged) filter.flagged = true;
      if (opts.available) filter.available = true;
      if (opts.blocked) filter.blocked = true;
      if (opts.dueBefore) filter.dueBefore = parseDate(opts.dueBefore) ?? opts.dueBefore;
      if (opts.dueAfter) filter.dueAfter = parseDate(opts.dueAfter) ?? opts.dueAfter;
      if (opts.deferBefore) filter.deferBefore = parseDate(opts.deferBefore) ?? opts.deferBefore;
      if (opts.deferAfter) filter.deferAfter = parseDate(opts.deferAfter) ?? opts.deferAfter;
      if (opts.plannedBefore) filter.plannedBefore = parseDate(opts.plannedBefore) ?? opts.plannedBefore;
      if (opts.plannedAfter) filter.plannedAfter = parseDate(opts.plannedAfter) ?? opts.plannedAfter;
      if (opts.search) filter.search = opts.search;
      if (opts.completed) filter.completed = true;
      if (opts.since) filter.since = parseDate(opts.since) ?? opts.since;

      filter.limit = parseInt(globals.limit, 10) || 25;
      filter.offset = parseInt(globals.offset, 10) || 0;

      if (globals.sort) {
        const [field, direction] = globals.sort.split(':');
        filter.sort = { field, direction: (direction as 'asc' | 'desc') || 'asc' };
      }

      if (globals.fields) {
        filter.fields = globals.fields.split(',');
      }

      const script = ScriptBuilder.listTasks(filter);
      const result = await ScriptExecutor.execute<{ tasks: unknown[]; total: number }>(script);

      if (opts.count) {
        console.log(formatOutput({ count: result.total }, globals.format as OutputFormat));
      } else {
        console.log(formatOutput(
          result.tasks,
          globals.format as OutputFormat,
          { fields: filter.fields, quiet: globals.quiet },
        ));
      }
    });
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
```

**Step 3: Implement remaining read commands** (task, projects, tags, folders — same pattern as tasks)

Create `packages/cli/src/commands/task.ts`, `projects.ts`, `tags.ts`, `folders.ts` following the same pattern: parse options, build filter, call ScriptBuilder, execute, format output.

**Step 4: Register all commands in index.ts**

```typescript
// packages/cli/src/index.ts — updated
#!/usr/bin/env node
import { Command } from 'commander';
import { registerTasksCommand } from './commands/tasks.js';
import { registerTaskCommand } from './commands/task.js';
import { registerProjectsCommand } from './commands/projects.js';
import { registerTagsCommand } from './commands/tags.js';
import { registerFoldersCommand } from './commands/folders.js';

const program = new Command();

program
  .name('omnifocus')
  .description('OmniFocus GTD CLI')
  .version('0.1.0')
  .option('--format <type>', 'Output format: text, json, csv, markdown', 'text')
  .option('--fields <fields>', 'Comma-separated field names')
  .option('--limit <n>', 'Maximum results', '25')
  .option('--offset <n>', 'Skip first N results', '0')
  .option('--sort <field:dir>', 'Sort by field:asc or field:desc')
  .option('--quiet', 'Suppress headers');

registerTasksCommand(program);
registerTaskCommand(program);
registerProjectsCommand(program);
registerTagsCommand(program);
registerFoldersCommand(program);

program.parse();
```

**Step 5: Build and run integration tests**

Run: `cd omnifocus-tools && npm run build && npx vitest run --project integration -- read-commands`
Expected: All read command tests PASS

**Step 6: Commit**

```bash
git add packages/cli/src/ packages/cli/tests/
git commit -m "feat: implement CLI read commands (tasks, projects, tags, folders)"
```

---

### Task 7: GTD Shortcut Commands

Convenience aliases that call the task query with preset filters.

**Files:**
- Create: `packages/cli/src/commands/shortcuts.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/integration/commands/shortcuts.test.ts`

**Step 1: Write integration tests**

```typescript
// packages/cli/tests/integration/commands/shortcuts.test.ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

function run(args: string): string {
  return execFileSync('node', ['dist/index.js', ...args.split(' ')], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    timeout: 30000,
  });
}

describe('GTD shortcut commands', () => {
  it('omnifocus inbox returns tasks without project', () => {
    const output = run('inbox --format json');
    const tasks = JSON.parse(output);
    for (const task of tasks) {
      expect(task.project).toBeNull();
    }
  });

  it('omnifocus flagged returns only flagged tasks', () => {
    const output = run('flagged --format json');
    const tasks = JSON.parse(output);
    for (const task of tasks) {
      expect(task.flagged).toBe(true);
    }
  });

  it('omnifocus overdue returns tasks past due', () => {
    const output = run('overdue --format json');
    const tasks = JSON.parse(output);
    const now = new Date();
    for (const task of tasks) {
      if (task.dueDate) {
        expect(new Date(task.dueDate).getTime()).toBeLessThan(now.getTime());
      }
    }
  });

  it('omnifocus today returns due-soon or flagged tasks', () => {
    const output = run('today --format json');
    // Should return results without error
    const tasks = JSON.parse(output);
    expect(Array.isArray(tasks)).toBe(true);
  });

  it('omnifocus upcoming --days 7 returns tasks due within 7 days', () => {
    const output = run('upcoming --days 7 --format json');
    const tasks = JSON.parse(output);
    expect(Array.isArray(tasks)).toBe(true);
  });
});
```

**Step 2: Implement shortcut commands**

```typescript
// packages/cli/src/commands/shortcuts.ts
import { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput, type OutputFormat } from '../output/formatter.js';

export function registerShortcutCommands(program: Command): void {
  // inbox
  program
    .command('inbox')
    .description('Tasks with no project (GTD inbox)')
    .action(async (_opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const script = ScriptBuilder.listTasks({
        project: null,
        limit: parseInt(globals.limit, 10) || 25,
      });
      const result = await ScriptExecutor.execute<{ tasks: unknown[] }>(script);
      console.log(formatOutput(result.tasks, globals.format as OutputFormat));
    });

  // today
  program
    .command('today')
    .description('Due within 3 days OR flagged')
    .action(async (_opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const now = new Date();
      const threeDaysOut = new Date(now);
      threeDaysOut.setDate(threeDaysOut.getDate() + 3);
      const dueBefore = threeDaysOut.toISOString().slice(0, 10);

      // Get overdue + due within 3 days
      const dueScript = ScriptBuilder.listTasks({
        dueBefore,
        limit: 500,
      });
      const dueResult = await ScriptExecutor.execute<{ tasks: any[] }>(dueScript);

      // Get flagged
      const flaggedScript = ScriptBuilder.listTasks({
        flagged: true,
        limit: 500,
      });
      const flaggedResult = await ScriptExecutor.execute<{ tasks: any[] }>(flaggedScript);

      // Merge and deduplicate by ID
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const task of [...dueResult.tasks, ...flaggedResult.tasks]) {
        if (!seen.has(task.id)) {
          seen.add(task.id);
          merged.push(task);
        }
      }

      console.log(formatOutput(merged, globals.format as OutputFormat));
    });

  // overdue
  program
    .command('overdue')
    .description('Tasks past their due date')
    .action(async (_opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const now = new Date().toISOString().slice(0, 10);
      const script = ScriptBuilder.listTasks({
        dueBefore: now,
        sort: { field: 'dueDate', direction: 'asc' },
        limit: parseInt(globals.limit, 10) || 100,
      });
      const result = await ScriptExecutor.execute<{ tasks: unknown[] }>(script);
      console.log(formatOutput(result.tasks, globals.format as OutputFormat));
    });

  // flagged
  program
    .command('flagged')
    .description('Flagged tasks')
    .action(async (_opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const script = ScriptBuilder.listTasks({
        flagged: true,
        limit: parseInt(globals.limit, 10) || 100,
      });
      const result = await ScriptExecutor.execute<{ tasks: unknown[] }>(script);
      console.log(formatOutput(result.tasks, globals.format as OutputFormat));
    });

  // upcoming
  program
    .command('upcoming')
    .description('Tasks due within N days')
    .option('--days <n>', 'Days ahead (default 14)', '14')
    .action(async (opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const now = new Date();
      const ahead = new Date(now);
      ahead.setDate(ahead.getDate() + parseInt(opts.days, 10));
      const script = ScriptBuilder.listTasks({
        dueAfter: now.toISOString().slice(0, 10),
        dueBefore: ahead.toISOString().slice(0, 10),
        sort: { field: 'dueDate', direction: 'asc' },
        limit: parseInt(globals.limit, 10) || 100,
      });
      const result = await ScriptExecutor.execute<{ tasks: unknown[] }>(script);
      console.log(formatOutput(result.tasks, globals.format as OutputFormat));
    });

  // review
  program
    .command('review')
    .description('Projects due for review')
    .action(async (_opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const script = ScriptBuilder.listProjects({ status: 'active' });
      const result = await ScriptExecutor.execute<{ projects: unknown[] }>(script);
      // TODO: Filter projects past review date (requires review date field)
      console.log(formatOutput(result.projects, globals.format as OutputFormat));
    });

  // suggest
  program
    .command('suggest')
    .description('Smart task suggestions')
    .option('--limit <n>', 'Number of suggestions', '10')
    .action(async (opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      // Smart suggestions: available, sorted by priority signals
      const script = ScriptBuilder.listTasks({
        available: true,
        limit: parseInt(opts.limit, 10),
        sort: { field: 'dueDate', direction: 'asc' },
      });
      const result = await ScriptExecutor.execute<{ tasks: unknown[] }>(script);
      console.log(formatOutput(result.tasks, globals.format as OutputFormat));
    });
}
```

**Step 3: Register shortcuts in index.ts**

Add: `import { registerShortcutCommands } from './commands/shortcuts.js';`
Add: `registerShortcutCommands(program);`

**Step 4: Build and test**

Run: `cd omnifocus-tools && npm run build && npx vitest run --project integration -- shortcuts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/ packages/cli/tests/
git commit -m "feat: add GTD shortcut commands (inbox, today, overdue, flagged, upcoming, review, suggest)"
```

---

## Phase 3: CLI Write Commands

### Task 8: Write Commands (add, complete, update, delete)

**Files:**
- Create: `packages/cli/src/commands/add.ts`
- Create: `packages/cli/src/commands/complete.ts`
- Create: `packages/cli/src/commands/update.ts`
- Create: `packages/cli/src/commands/delete.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/integration/commands/write-commands.test.ts`

**Step 1: Write integration tests**

```typescript
// packages/cli/tests/integration/commands/write-commands.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';

const createdTaskIds: string[] = [];

function run(args: string): string {
  return execFileSync('node', ['dist/index.js', ...args.split(' ')], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    timeout: 30000,
  });
}

describe('CLI write commands', () => {
  it('omnifocus add creates a task', () => {
    const output = run('add "Test task from CLI" --format json');
    const result = JSON.parse(output);
    expect(result.task).toBeDefined();
    expect(result.task.id).toBeDefined();
    expect(result.task.name).toBe('Test task from CLI');
    createdTaskIds.push(result.task.id);
  });

  it('omnifocus add with --flag creates flagged task', () => {
    const output = run('add "Flagged CLI task" --flag --format json');
    const result = JSON.parse(output);
    expect(result.task.id).toBeDefined();
    createdTaskIds.push(result.task.id);
  });

  it('omnifocus complete marks task done', () => {
    const id = createdTaskIds[0];
    const output = run(`complete ${id} --format json`);
    const result = JSON.parse(output);
    expect(result.task.completed).toBe(true);
  });

  // Clean up test tasks
  afterAll(() => {
    for (const id of createdTaskIds) {
      try { run(`delete ${id} --confirm`); } catch { /* ignore */ }
    }
  });
});
```

**Step 2: Implement add command**

```typescript
// packages/cli/src/commands/add.ts
import { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput, type OutputFormat } from '../output/formatter.js';
import { parseDate, formatDate } from '../utils/dates.js';

export function registerAddCommand(program: Command): void {
  program
    .command('add <name>')
    .description('Create a new task')
    .option('--project <name>', 'Assign to project')
    .option('--tag <name>', 'Add tag (repeatable)', collect, [])
    .option('--due <date>', 'Due date')
    .option('--defer <date>', 'Defer date')
    .option('--planned <date>', 'Planned date')
    .option('--flag', 'Flag the task')
    .option('--note <text>', 'Task note')
    .option('--estimate <minutes>', 'Time estimate in minutes')
    .action(async (name, opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};

      const data: Record<string, unknown> = { name };
      if (opts.project) data.project = opts.project;
      if (opts.tag?.length > 0) data.tags = opts.tag;
      if (opts.flag) data.flagged = true;
      if (opts.note) data.note = opts.note;
      if (opts.estimate) data.estimatedMinutes = parseInt(opts.estimate, 10);

      if (opts.due) {
        const parsed = parseDate(opts.due);
        data.dueDate = parsed ? formatDate(parsed, 'due') : opts.due;
      }
      if (opts.defer) {
        const parsed = parseDate(opts.defer);
        data.deferDate = parsed ? formatDate(parsed, 'defer') : opts.defer;
      }
      if (opts.planned) {
        const parsed = parseDate(opts.planned);
        data.plannedDate = parsed ? formatDate(parsed, 'planned') : opts.planned;
      }

      const script = ScriptBuilder.createTask(data as any);
      const result = await ScriptExecutor.execute(script);
      console.log(formatOutput(result, globals.format as OutputFormat));
    });
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
```

**Step 3: Implement complete, update, delete commands** (following same pattern)

Each command: parse options, build params, call ScriptBuilder method, execute, format output.

**Key detail for delete:** Requires `--confirm` flag.

```typescript
// packages/cli/src/commands/delete.ts
import { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput, type OutputFormat } from '../output/formatter.js';

export function registerDeleteCommand(program: Command): void {
  program
    .command('delete <id>')
    .description('Delete a task (requires --confirm)')
    .option('--confirm', 'Confirm deletion')
    .action(async (id, opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};

      if (!opts.confirm) {
        console.error('Error: --confirm flag required for destructive operations');
        process.exit(1);
      }

      const script = ScriptBuilder.deleteTask(id);
      const result = await ScriptExecutor.execute(script);
      console.log(formatOutput(result, globals.format as OutputFormat));
    });
}
```

**Step 4: Register commands, build, test**

Run: `cd omnifocus-tools && npm run build && npx vitest run --project integration -- write-commands`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/ packages/cli/tests/
git commit -m "feat: implement CLI write commands (add, complete, update, delete)"
```

---

## Phase 4: Analytics and System Commands

### Task 9: Analysis and System Commands

**Files:**
- Create: `packages/cli/src/commands/stats.ts`
- Create: `packages/cli/src/commands/system.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/integration/commands/analytics.test.ts`

**Step 1: Write integration tests**

```typescript
// packages/cli/tests/integration/commands/analytics.test.ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

function run(args: string): string {
  return execFileSync('node', ['dist/index.js', ...args.split(' ')], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    timeout: 60000,
  });
}

describe('Analytics and system commands', () => {
  it('omnifocus stats returns productivity metrics', () => {
    const output = run('stats --format json');
    const result = JSON.parse(output);
    expect(result.stats).toBeDefined();
    expect(typeof result.stats.active).toBe('number');
    expect(typeof result.stats.completed).toBe('number');
  });

  it('omnifocus version returns version info', () => {
    const output = run('version');
    expect(output).toContain('0.1.0');
  });

  it('omnifocus doctor runs diagnostics', () => {
    const output = run('doctor --format json');
    const result = JSON.parse(output);
    expect(result.omnifocusRunning).toBeDefined();
  });
});
```

**Step 2: Implement stats command**

```typescript
// packages/cli/src/commands/stats.ts
import { Command } from 'commander';
import { ScriptBuilder } from '../scripts/script-builder.js';
import { ScriptExecutor } from '../scripts/executor.js';
import { formatOutput, type OutputFormat } from '../output/formatter.js';

export function registerStatsCommand(program: Command): void {
  program
    .command('stats')
    .description('Productivity statistics')
    .option('--period <type>', 'Period: day, week, month')
    .action(async (opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const script = ScriptBuilder.productivityStats({ period: opts.period });
      const result = await ScriptExecutor.execute(script);
      console.log(formatOutput(result, globals.format as OutputFormat));
    });
}
```

**Step 3: Implement system commands**

```typescript
// packages/cli/src/commands/system.ts
import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { FileCache } from '../cache/file-cache.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { formatOutput, type OutputFormat } from '../output/formatter.js';

const CACHE_DIR = join(homedir(), '.omnifocus-cli', 'cache');

export function registerSystemCommands(program: Command): void {
  program
    .command('version')
    .description('Version information')
    .action((_opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const info = {
        cli: '0.1.0',
        node: process.version,
      };
      console.log(formatOutput(info, globals.format as OutputFormat));
    });

  program
    .command('doctor')
    .description('Connection diagnostics')
    .action(async (_opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const results: Record<string, unknown> = {};

      // Check OmniFocus is running
      try {
        execFileSync('osascript', ['-l', 'JavaScript', '-e',
          'Application("OmniFocus").running()'], { timeout: 5000 });
        results.omnifocusRunning = true;
      } catch {
        results.omnifocusRunning = false;
      }

      // Check osascript works
      try {
        execFileSync('osascript', ['-l', 'JavaScript', '-e', '"ok"'], { timeout: 5000 });
        results.osascriptAvailable = true;
      } catch {
        results.osascriptAvailable = false;
      }

      console.log(formatOutput(results, globals.format as OutputFormat));
    });

  program
    .command('cache')
    .description('Cache management')
    .option('--clear', 'Clear all cached data')
    .action((opts, cmd) => {
      const globals = cmd.parent?.opts() ?? {};
      const cache = new FileCache(CACHE_DIR);
      if (opts.clear) {
        cache.clear();
        console.log('Cache cleared');
      } else {
        console.log(formatOutput({ cacheDir: CACHE_DIR }, globals.format as OutputFormat));
      }
    });
}
```

**Step 4: Register, build, test**

Run: `cd omnifocus-tools && npm run build && npx vitest run --project integration -- analytics`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/ packages/cli/tests/
git commit -m "feat: add analytics and system commands (stats, version, doctor, cache)"
```

---

## Phase 5: MCP Server

### Task 10: Thin MCP Wrapper

~300-400 lines total. Calls CLI binary via process boundary.

**Files:**
- Create: `packages/mcp-server/src/cli-bridge.ts`
- Create: `packages/mcp-server/src/tools/read.ts`
- Create: `packages/mcp-server/src/tools/write.ts`
- Create: `packages/mcp-server/src/tools/analyze.ts`
- Create: `packages/mcp-server/src/tools/system.ts`
- Modify: `packages/mcp-server/src/index.ts`
- Test: `packages/mcp-server/tests/unit/tools/read.test.ts`
- Test: `packages/mcp-server/tests/unit/cli-bridge.test.ts`

**Step 1: Write failing tests for CLI bridge**

```typescript
// packages/mcp-server/tests/unit/cli-bridge.test.ts
import { describe, it, expect, vi } from 'vitest';
import { callCli } from '../../src/cli-bridge.js';
import * as child_process from 'node:child_process';

vi.mock('node:child_process');

describe('callCli', () => {
  const mockExecFile = vi.mocked(child_process.execFile);

  it('calls omnifocus binary with --format json', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(null, '{"tasks":[]}', '');
      return {} as any;
    });

    await callCli(['tasks', '--flagged']);
    expect(mockExecFile).toHaveBeenCalledWith(
      'omnifocus',
      ['tasks', '--flagged', '--format', 'json'],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns parsed JSON', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(null, '{"tasks":[{"id":"1"}]}', '');
      return {} as any;
    });

    const result = await callCli(['tasks']);
    expect(result).toEqual({ tasks: [{ id: '1' }] });
  });

  it('throws on CLI error', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(new Error('Command failed'), '', 'Error message');
      return {} as any;
    });

    await expect(callCli(['tasks'])).rejects.toThrow();
  });
});
```

**Step 2: Implement CLI bridge**

```typescript
// packages/mcp-server/src/cli-bridge.ts
import { execFile } from 'node:child_process';

/**
 * Call the omnifocus CLI binary and return parsed JSON result.
 * This is the ONLY interface between MCP server and CLI.
 */
export function callCli(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(
      'omnifocus',
      [...args, '--format', 'json'],
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (stderr) console.error(`[cli] ${stderr}`);
        if (error) {
          reject(new Error(`CLI error: ${error.message}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`CLI returned invalid JSON: ${stdout.slice(0, 200)}`));
        }
      },
    );
  });
}
```

**Step 3: Implement MCP server with 4 tools**

```typescript
// packages/mcp-server/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { callCli } from './cli-bridge.js';

const server = new McpServer({
  name: 'omnifocus',
  version: '0.1.0',
});

// Type coercion helpers (Claude Desktop sends strings for everything)
const coerceNumber = z.union([z.number(), z.string().transform(v => parseInt(v, 10))]).pipe(z.number());
const coerceBoolean = z.union([z.boolean(), z.string().transform(v => v === 'true')]).pipe(z.boolean());

// --- omnifocus_read ---
server.tool(
  'omnifocus_read',
  'Query tasks, projects, tags, folders, and GTD views',
  {
    command: z.enum(['tasks', 'task', 'projects', 'tags', 'folders',
      'inbox', 'today', 'overdue', 'flagged', 'upcoming', 'review', 'suggest']),
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
    if (params.limit) args.push('--limit', String(params.limit));
    if (params.offset) args.push('--offset', String(params.offset));
    if (params.sort) args.push('--sort', params.sort);
    if (params.daysAhead) args.push('--days', String(params.daysAhead));
    if (params.tagMode) args.push('--tag-mode', params.tagMode);

    const result = await callCli(args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
    if (params.estimatedMinutes) args.push('--estimate', String(params.estimatedMinutes));
    if (params.clearDueDate) args.push('--clear-due');
    if (params.clearDeferDate) args.push('--clear-defer');
    if (params.clearPlannedDate) args.push('--clear-planned');
    if (params.operation === 'delete') args.push('--confirm');

    const result = await callCli(args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

// --- omnifocus_analyze ---
server.tool(
  'omnifocus_analyze',
  'Productivity statistics and analysis',
  {
    type: z.enum(['stats', 'velocity', 'overdue', 'patterns', 'workflow']),
    period: z.enum(['day', 'week', 'month']).optional(),
    groupBy: z.enum(['day', 'week', 'month']).optional(),
  },
  async (params) => {
    const args: string[] = [];
    if (params.type === 'stats') {
      args.push('stats');
      if (params.period) args.push('--period', params.period);
    } else {
      args.push('analyze', '--type', params.type);
      if (params.groupBy) args.push('--group-by', params.groupBy);
    }
    const result = await callCli(args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

// --- Startup ---
const transport = new StdioServerTransport();

// Graceful shutdown
const pendingOps = new Set<Promise<unknown>>();
process.stdin.on('end', async () => {
  await Promise.allSettled([...pendingOps]);
  await server.close();
  process.exit(0);
});

await server.connect(transport);
```

**Step 4: Run unit tests**

Run: `cd omnifocus-tools && npx vitest run --project unit -- cli-bridge`
Expected: PASS

**Step 5: Build MCP server**

Run: `cd omnifocus-tools && npm run build`
Expected: Clean build

**Step 6: Smoke test MCP server**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node packages/mcp-server/dist/index.js
```

Expected: JSON-RPC response with server capabilities

**Step 7: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: implement thin MCP wrapper with 4 tools calling CLI binary"
```

---

## Phase 6: Agent Skills

### Task 11: GTD Skills (Agent Skills format)

Markdown files following the Agent Skills open standard (agentskills.io).

**Files:**
- Create: `skills/omnifocus/SKILL.md`
- Create: `skills/omnifocus/skills/capture/SKILL.md`
- Create: `skills/omnifocus/skills/clarify/SKILL.md`
- Create: `skills/omnifocus/skills/review/SKILL.md`
- Create: `skills/omnifocus/skills/engage/SKILL.md`
- Create: `skills/omnifocus/skills/query/SKILL.md`
- Create: `skills/omnifocus/skills/admin/SKILL.md`

**Step 1: Write root skill**

```markdown
# skills/omnifocus/SKILL.md
---
name: omnifocus-assistant
description: GTD executive secretary — manages tasks, projects, and reviews in OmniFocus
---

## Mode Detection

If you have bash access, use CLI mode (run `omnifocus` commands directly).
Otherwise, use MCP mode (call omnifocus_read/write/analyze tools).

## Intent Routing

| User Intent | Sub-Skill | Example |
|---|---|---|
| Add/capture/create task | capture | "Add buy groceries" |
| Clarify/organize/assign project | clarify | "This should go in Work" |
| Review/plan/weekly review | review | "Start my weekly review" |
| What should I work on? | engage | "What's next?" |
| Search/filter/find | query | "Show flagged tasks" |
| Manage tags/projects/system | admin | "Create a new tag" |

## Date Conversion

Always convert natural language dates before calling tools:
- "tomorrow" → YYYY-MM-DD
- "next Monday" → YYYY-MM-DD
- Due dates default to 5:00 PM, defer dates to 8:00 AM
- Never use ISO-8601 with Z suffix
```

**Step 2: Write sub-skills** (capture, clarify, review, engage, query, admin)

Each sub-skill is ~200-300 tokens, contains GTD methodology for that phase, CLI examples, and MCP examples. Follow the design spec section on Skills.

**Step 3: Commit**

```bash
git add skills/
git commit -m "feat: add GTD Agent Skills (capture, clarify, review, engage, query, admin)"
```

---

## Phase 7: Documentation and Polish

### Task 12: Execution Strategy Reference Doc

Preserve the empirical JXA/OmniJS knowledge in a permanent reference.

**Files:**
- Create: `docs/EXECUTION-STRATEGY.md`

**Step 1: Write the reference document**

Extract the decision matrix, JXA patterns, performance baselines, and known limitations from the design spec and existing docs (`JXA-VS-OMNIJS-PATTERNS.md`, `LESSONS_LEARNED.md`). Present as a compact reference for the new codebase.

**Step 2: Commit**

```bash
git add docs/EXECUTION-STRATEGY.md
git commit -m "docs: add JXA/OmniJS execution strategy reference"
```

---

### Task 13: Final Integration Testing and README

Run full test suite, fix any issues, write minimal README.

**Files:**
- Modify: Various (bug fixes from integration testing)
- Create: `omnifocus-tools/README.md`

**Step 1: Run full unit test suite**

Run: `cd omnifocus-tools && npx vitest run --project unit`
Expected: All tests PASS, >75% coverage

**Step 2: Run full integration test suite**

Run: `cd omnifocus-tools && npx vitest run --project integration`
Expected: All tests PASS

**Step 3: End-to-end CLI smoke test**

```bash
omnifocus tasks --limit 3 --format json
omnifocus inbox
omnifocus today
omnifocus flagged
omnifocus add "Smoke test task" --flag
omnifocus stats --format json
omnifocus version
omnifocus doctor
```

Verify each command returns expected output.

**Step 4: Write minimal README**

```markdown
# omnifocus-tools

CLI-first OmniFocus GTD assistant with MCP server wrapper.

## Quick Start

npm install && npm run build
npx omnifocus tasks --limit 5

## Packages

- @omnifocus/cli — standalone CLI
- @omnifocus/mcp-server — thin MCP wrapper

## Requirements

- macOS with OmniFocus 4.7+
- Node.js 20+
- Accessibility permissions for osascript
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: complete clean-room OmniFocus CLI + MCP server v0.1.0"
```

---

## Task Dependency Graph

```
Task 1 (scaffold) ← Task 2 (ScriptBuilder) ← Task 3 (executor)
                                              ↙             ↘
                   Task 4 (dates+cache)      Task 5 (formatter)
                            ↓                      ↓
                   Task 6 (read commands) ← ← ← ← ┘
                            ↓
                   Task 7 (GTD shortcuts)
                            ↓
                   Task 8 (write commands)
                            ↓
                   Task 9 (analytics+system)
                            ↓
                   Task 10 (MCP server)
                            ↓
                   Task 11 (skills)    Task 12 (docs)
                            ↓                ↓
                   Task 13 (final integration)
```

## Estimated Scope

| Phase | Tasks | Approx Source Lines |
|-------|-------|-------------------|
| Phase 1: Foundation | 1-4 | ~800 |
| Phase 2: Read Commands | 5-7 | ~600 |
| Phase 3: Write Commands | 8 | ~300 |
| Phase 4: Analytics+System | 9 | ~200 |
| Phase 5: MCP Server | 10 | ~300 |
| Phase 6: Skills | 11 | ~500 (markdown) |
| Phase 7: Docs+Polish | 12-13 | ~200 |
| **Total** | **13 tasks** | **~2,900 lines** |

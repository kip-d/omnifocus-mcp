// Architectural parity tests (OMN-47).
//
// Detect declaration/implementation drift before it ships. Each describe block
// pairs a public declaration (Zod enum, schema field set, etc.) with the
// implementation that's expected to honor every member. Adding a new member
// to the declaration without updating the implementation must fail loudly.
//
// Caught the bug class behind OMN-42, OMN-43, and OMN-45 — see those tickets
// for the original incidents. Add a new describe block here whenever you
// introduce a new declaration↔implementation pairing.

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, it, expect, vi } from 'vitest';

import {
  TaskFieldEnum,
  ProjectFieldEnum,
  SortFieldEnum,
  FILTER_FIELD_NAMES,
} from '../../../src/tools/unified/schemas/read-schema.js';
import { CreateDataSchema, UpdateChangesSchema } from '../../../src/tools/unified/schemas/write-schema.js';
import {
  buildFilteredTasksScript,
  buildFilteredProjectsScript,
  buildTaskCountScript,
  DEFAULT_FIELDS,
} from '../../../src/contracts/ast/script-builder.js';
import { QueryCompiler } from '../../../src/tools/unified/compilers/QueryCompiler.js';
import { createTaskResponseV2, createListResponseV2, generateTaskSummary } from '../../../src/utils/response-format.js';
import { OmniFocusReadTool } from '../../../src/tools/unified/OmniFocusReadTool.js';
import { OmniFocusWriteTool } from '../../../src/tools/unified/OmniFocusWriteTool.js';
import { OmniFocusAnalyzeTool } from '../../../src/tools/unified/OmniFocusAnalyzeTool.js';
import { SystemTool } from '../../../src/tools/system/SystemTool.js';

// =============================================================================
// TaskFieldEnum ↔ generateFieldProjection (OMN-45 class)
// =============================================================================
//
// Every field name accepted by the task-query schema must produce a non-empty
// projection in the generated OmniJS script. A missing case in the projection
// switch silently drops the field from server responses (the OMN-45 bug shape).

describe('Parity: TaskFieldEnum ↔ generateFieldProjection (OMN-45 class)', () => {
  for (const field of TaskFieldEnum.options) {
    it(`projects "${field}" when requested via fields: [...]`, () => {
      // Task projection is unconditional — buildFilteredTasksScript has no
      // nextTask/taskCounts/stats block and ignores performanceMode — so this
      // assertion was never vacuous. (The project block below was vacuous;
      // see its note.) No lite arg needed here.
      const result = buildFilteredTasksScript({}, { fields: [field] });
      // Each projection has the form `<field>: <expression>`.
      const projectionPattern = new RegExp(`\\b${field}\\s*:`);
      expect(result.script).toMatch(projectionPattern);
    });
  }
});

// =============================================================================
// FILTER_FIELD_NAMES ↔ QueryCompiler.transformFilters (OMN-43 class)
// =============================================================================
//
// Every filter-field key the schema accepts must be recognized by the compiler.
// Recognition means either the key passes through to the result, or it
// transforms into a known different key (e.g. `project: null` → `inInbox: true`).
// What it cannot do is fall through silently — the compiler emits a warning
// for unknown properties on its result, but that warning only fires post-hoc;
// what we want is up-front certainty that every schema key has a handler.

// For each filter field, a sample value of the right shape so transformFilters
// has something to chew on. None of these encode test-specific assumptions
// beyond "this is a syntactically valid value for this field".
const FILTER_SAMPLES: Record<string, unknown> = {
  id: 'sample-id',
  status: 'active',
  completed: false, // OMN-72
  tags: { any: ['@home'] },
  project: 'sample-project-id',
  projectId: 'sample-project-id',
  parentTaskId: 'sample-parent-task-id', // OMN-114

  dueDate: { before: '2026-12-31' },
  deferDate: { before: '2026-12-31' },
  plannedDate: { before: '2026-12-31' },
  completionDate: { before: '2026-12-31' },
  added: { after: '2024-01-01' },
  flagged: true,
  blocked: false,
  available: true,
  inInbox: true,
  text: { contains: 'search' },
  estimatedMinutes: { lessThan: 30 },
  name: { contains: 'meeting' },
  folder: 'Work',
};

// Both initial drift bugs are fixed (OMN-48: added; OMN-49: estimatedMinutes).
// If a new schema field is added without a compiler handler, the per-field test
// below will fail — either add the handler in QueryCompiler.transformFilters,
// or wrap that field in an `it.fails` block referencing a follow-up ticket.

describe('Parity: FILTER_FIELD_NAMES ↔ QueryCompiler.transformFilters (OMN-43 class)', () => {
  it('FILTER_SAMPLES covers every schema field — extend FILTER_SAMPLES if this fails', () => {
    const missing = FILTER_FIELD_NAMES.filter((name) => !(name in FILTER_SAMPLES));
    expect(missing).toEqual([]);
  });

  for (const fieldName of FILTER_FIELD_NAMES) {
    it(`compiler recognizes "${fieldName}" filter field`, () => {
      const compiler = new QueryCompiler();
      const value = FILTER_SAMPLES[fieldName];
      const input = { [fieldName]: value };

      // OMN-167: 'folder' is now implemented on tasks (maps to result.folder /
      // result.folderTopLevel) — it flows through the normal recognition path
      // below like every other field (was an OMN-162 reject special-case).

      // Spy on console.warn — the QueryCompiler emits this on unknown
      // properties. A field the compiler doesn't recognize would slip
      // through and trigger the warning.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = compiler.transformFilters(input as any);

      // The compiler must have produced *some* effect — either passing the
      // field through, or transforming it. An empty result means the field
      // was silently dropped.
      expect(Object.keys(result).length).toBeGreaterThan(0);

      // The unknown-property warning must not fire.
      const unknownWarnings = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes('Unknown filter properties detected'),
      );
      expect(unknownWarnings).toEqual([]);

      warnSpy.mockRestore();
    });
  }
});

// =============================================================================
// summary.returned_count === data[key].length invariant (OMN-42 class)
// =============================================================================
//
// The bug shape: a response builder produces a summary block whose
// returned_count diverges from the actual data. This invariant must hold for
// every code path that emits a summary alongside data.

// =============================================================================
// ProjectFieldEnum ↔ generateProjectFieldProjection (OMN-47 audit)
// =============================================================================
//
// Same shape as TaskFieldEnum parity, but for projects. A missing case in the
// project projection switch silently drops the field from server responses.

describe('Parity: ProjectFieldEnum ↔ generateProjectFieldProjection (OMN-47 audit)', () => {
  for (const field of ProjectFieldEnum.options) {
    it(`projects "${field}" when requested via fields: [...]`, () => {
      // performanceMode:'lite' suppresses buildFilteredProjectsScript's
      // nextTask/taskCounts block, which emits `name:`/`flagged:`/`dueDate:`
      // unconditionally. Without lite this assertion passed for those three
      // even with their projection case deleted — a silent false-negative for
      // the exact OMN-60 bug shape this gate exists to catch (OMN-61).
      const result = buildFilteredProjectsScript({}, { fields: [field], performanceMode: 'lite' });
      const projectionPattern = new RegExp(`\\b${field}\\s*:`);
      expect(result.script).toMatch(projectionPattern);
    });
  }
});

// =============================================================================
// SortFieldEnum ↔ generateSortComparator (OMN-47 audit)
// =============================================================================
//
// Every sortable field declared in the schema must be referenced in the sort
// comparator. The comparator hardcodes type-classification arrays (date / bool
// / number); a SortFieldEnum member missing from all of them falls through to
// the generic-string branch, which silently produces wrong ordering for date
// or numeric fields.

describe('Parity: SortFieldEnum ↔ generateSortComparator (OMN-47 audit)', () => {
  for (const field of SortFieldEnum.options) {
    it(`sort comparator references "${field}"`, () => {
      const result = buildFilteredTasksScript({}, { fields: ['id', 'name'], sort: [{ field, direction: 'asc' }] });
      // Comparator emits `a.${field}` and `b.${field}` to read the sort key.
      const accessorPattern = new RegExp(`a\\.${field}\\b`);
      expect(result.script).toMatch(accessorPattern);
    });
  }
});

// =============================================================================
// status filter values produce TASK-level filtering effects (OMN-50 class)
// =============================================================================
//
// Distinct from the simple "recognized vs dropped" drift — here the compiler
// "recognizes" the field but maps it incorrectly to a different scope. For
// tasks, `status: "dropped"` should produce a task-level filter (e.g.
// `result.dropped = true`), not a project-level filter (`result.projectStatus`).
// The latter has no effect on task queries, silently returning unfiltered results.
//
// Bug shape verified live: `status: "dropped"` returned 2855 tasks (entire DB).

const TASK_LEVEL_FILTER_KEYS = new Set([
  'completed',
  'dropped',
  'flagged',
  'available',
  'blocked',
  'inInbox',
  'projectId',
  'id',
  'name',
  'tags',
  // Date filters (any of these proves task-level filtering)
  'dueBefore',
  'dueAfter',
  'deferBefore',
  'deferAfter',
  'plannedBefore',
  'plannedAfter',
  'completionBefore',
  'completionAfter',
  // Text filters
  'text',
  'textOperator',
  'search',
]);

// Tracked but unfixed:
// - 'on_hold' has no task equivalent; either remove from schema for task scope
//   or define semantics (follow-up to OMN-50; currently silently no-op for tasks)
//
// Fixed in OMN-50 commit:
// - 'dropped' now sets result.dropped = true and produces task-level filtering
const KNOWN_INEFFECTIVE_STATUS = new Set(['on_hold']);

// =============================================================================
// TaskFieldEnum ↔ DEFAULT_FIELDS completeness (OMN-51 class)
// =============================================================================
//
// The tool description claims `details: true` returns "all fields with full
// notes". Internally that maps to DEFAULT_FIELDS = MINIMAL + DETAIL. If a
// TaskFieldEnum member isn't in DEFAULT_FIELDS, it's unreachable via
// `details: true` — users have to know it exists and request it explicitly.
//
// The drift is between the documented behavior (advertised in the tool
// description) and the internal default-field membership.

describe('Parity: TaskFieldEnum ↔ DEFAULT_FIELDS membership (OMN-51 class)', () => {
  // OMN-51 closed all known gaps. If a new TaskFieldEnum member is added without
  // a corresponding DETAIL_FIELDS entry, the per-field test below will fail —
  // either add the field to DETAIL_FIELDS, or wrap that field in an `it.fails`
  // block referencing a follow-up ticket.
  for (const field of TaskFieldEnum.options) {
    it(`DEFAULT_FIELDS includes "${field}" (reachable via details: true)`, () => {
      expect(DEFAULT_FIELDS).toContain(field);
    });
  }
});

// =============================================================================
// countOnly path ↔ standard path: implicit-default parity (OMN-52 class)
// =============================================================================
//
// `buildTaskCountScript` (countOnly path) and `buildFilteredTasksScript`
// (standard path) must apply the same implicit defaults. The standard path
// hardcodes `if (task.completed) return;` regardless of filter; the count
// path historically did not, producing different counts for the same filter.
// (See OMN-52: live verification showed 134 vs 284 for the same filter
// because the count path included completed tasks.)
//
// This test asserts both paths exclude completed by default. Add a similar
// assertion if a new implicit default is introduced in either path.

describe('Parity: countOnly path implicit defaults match standard path (OMN-52 class)', () => {
  it('count script excludes completed tasks when filter does not specify (matches list path default)', () => {
    const countScript = buildTaskCountScript({}).script;
    const listScript = buildFilteredTasksScript({}, { fields: ['id'] }).script;

    // The list script hardcodes the exclusion; the count script should reach
    // the equivalent via filter normalization (filter.completed = false).
    // Both should produce code that references task.completed in some way.
    expect(listScript).toMatch(/task\.completed/);
    expect(countScript).toMatch(/task\.completed/);
  });

  it('count script preserves explicit filter.completed = true (does not override user intent)', () => {
    const countScript = buildTaskCountScript({ completed: true }).script;
    // When user explicitly asks for completed tasks, the predicate must
    // compare === true (not === false from the implicit default).
    expect(countScript).toMatch(/task\.completed\s*===\s*true/);
  });
});

// =============================================================================
// MutationSchema operations ↔ dispatcher cases (defensive)
// =============================================================================
//
// The schema declares 8 top-level mutation operations. The dispatcher in
// OmniFocusWriteTool routes each to a handler. A new operation added to the
// schema without a corresponding handler would hit the default case at
// runtime; this test enforces the relationship at PR time.
//
// We do not import the handler directly — instead, this test scans the source
// of OmniFocusWriteTool.ts to confirm each operation literal appears in its
// dispatch logic. Brittle if the dispatch is restructured, but precisely the
// kind of "make a deliberate change to the test if you change the dispatch"
// guard that surfaces drift.

describe('Parity: MutationSchema operations ↔ dispatcher (defensive)', () => {
  const KNOWN_MUTATION_OPERATIONS = [
    'create',
    'create_folder',
    'update',
    'complete',
    'delete',
    'batch',
    'bulk_delete',
    'tag_manage',
  ];

  it('write tool source references every known operation by name', async () => {
    // Read the dispatch source — if the dispatcher moves, update this path.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const writeToolPath = path.resolve(here, '../../../src/tools/unified/OmniFocusWriteTool.ts');
    const source = fs.readFileSync(writeToolPath, 'utf8');

    for (const op of KNOWN_MUTATION_OPERATIONS) {
      // Each op should appear at least once as a string literal in dispatch logic.
      const literalPattern = new RegExp(`['"]${op}['"]`);
      expect(source, `operation "${op}" not referenced in OmniFocusWriteTool.ts`).toMatch(literalPattern);
    }
  });
});

// =============================================================================
// TagActionSchema actions ↔ handleTagManage (defensive)
// =============================================================================
//
// The tag_manage operation has its own action enum (create/rename/delete/
// merge/nest/unnest/reparent). The handler aliases `unnest → unparent` before
// dispatch. This source-scan test ensures every action is referenced in the
// handler — same defensive pattern as the mutation-operations test above.

describe('Parity: TagActionSchema actions ↔ handleTagManage (defensive)', () => {
  // Source-of-truth list, mirroring TagActionSchema in write-schema.ts.
  // When a new tag action is added there, this list must be updated alongside
  // the handler — and that simultaneous edit is exactly the discipline we want.
  const TAG_ACTIONS = ['create', 'rename', 'delete', 'merge', 'nest', 'unnest', 'reparent'];

  it('write tool source references every tag action (or its alias)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const writeToolPath = path.resolve(here, '../../../src/tools/unified/OmniFocusWriteTool.ts');
    const source = fs.readFileSync(writeToolPath, 'utf8');

    // Known alias: unnest → unparent (handleTagManage rewrites the action before dispatch).
    const aliases: Record<string, string> = { unnest: 'unparent' };

    for (const action of TAG_ACTIONS) {
      const dispatchedName = aliases[action] ?? action;
      const literalPattern = new RegExp(`['"]${dispatchedName}['"]`);
      expect(source, `tag action "${action}" (dispatched as "${dispatchedName}") not referenced`).toMatch(
        literalPattern,
      );
    }
  });
});

describe('Parity: status filter values produce task-level filtering (OMN-50 class)', () => {
  const TASK_STATUSES = ['active', 'completed', 'dropped', 'on_hold'] as const;

  for (const status of TASK_STATUSES) {
    const testFn = KNOWN_INEFFECTIVE_STATUS.has(status) ? it.fails : it;
    testFn(`status: "${status}" produces a task-level filter, not just projectStatus`, () => {
      const compiler = new QueryCompiler();

      const result = compiler.transformFilters({ status } as any) as Record<string, unknown>;

      const taskLevelKeys = Object.keys(result).filter((k) => TASK_LEVEL_FILTER_KEYS.has(k));
      expect(taskLevelKeys.length).toBeGreaterThan(0);
    });
  }
});

describe('Invariant: summary.returned_count === data[key].length (OMN-42 class)', () => {
  it('createTaskResponseV2 — small payload, no truncation', () => {
    const tasks = Array.from({ length: 50 }, (_, i) => ({ id: String(i), name: `T${i}` }));
    const response = createTaskResponseV2('test', tasks);

    const dataLen = (response.data as { tasks: unknown[] }).tasks.length;

    expect((response.summary as any).returned_count).toBe(dataLen);
    expect(response.metadata.returned_count).toBe(dataLen);
  });

  it('createTaskResponseV2 — large payload, truncation triggered', () => {
    const padding = 'x'.repeat(200);
    const tasks = Array.from({ length: 400 }, (_, i) => ({ id: String(i), name: `T${i} ${padding}` }));
    const response = createTaskResponseV2('test', tasks);

    const dataLen = (response.data as { tasks: unknown[] }).tasks.length;
    expect(response.metadata.truncated).toBe(true);

    expect((response.summary as any).returned_count).toBe(dataLen);
  });

  it('createListResponseV2 with itemType=tasks', () => {
    const tasks = Array.from({ length: 60 }, (_, i) => ({ id: String(i) }));
    const response = createListResponseV2('test', tasks, 'tasks');

    const dataLen = (response.data as { tasks: unknown[] }).tasks.length;

    expect((response.summary as any).returned_count).toBe(dataLen);
    expect(response.metadata.returned_count).toBe(dataLen);
  });

  it('generateTaskSummary directly — large input', () => {
    // The leaf function. If this drifts, every consumer drifts.
    const tasks = Array.from({ length: 250 }, (_, i) => ({ id: String(i) }));
    const summary = generateTaskSummary(tasks);
    expect(summary.returned_count).toBe(250);
    expect(summary.total_count).toBe(250);
  });
});

// =============================================================================
// inputSchema overrides ↔ Zod schema (OMN-47 S10 — the deferred surface)
// =============================================================================
//
// Each unified tool advertises a hand-crafted minimal JSON Schema (the
// `inputSchema` getter) for MCP tools/list, while server-side validation uses
// the full Zod `schema`. CLAUDE.md flags these as a manual-sync risk: the two
// can drift so the tool advertises a value Zod rejects (LLM is told a param is
// valid → server 400s) or hides a whole query type Zod accepts.
//
// We do NOT assert deep structural equality: the inputSchema deliberately
// *flattens* the Zod discriminatedUnion (filters as bare `{type:'object'}`,
// `fields` as `string[]` not the enum) to keep the advertised schema ~1 KB
// instead of ~22 KB (see OmniFocusReadTool.inputSchema doc-comment, mcp-design
// memory). Flattening drops detail on purpose — that's allowed. What is NOT
// allowed is an *enumeration* in inputSchema that disagrees with Zod: an
// advertised enum must never offer a value Zod rejects, and every Zod
// discriminator value must be advertised somewhere (or be on the documented
// allowlist below). That is exactly the OMN-43/45 drift shape, one layer up.
//
// SCOPE CAVEAT (do not over-trust): the subset check is union-based — an
// advertised enum value is accepted if it appears at *any* enum/literal
// position in the Zod tree, not necessarily the corresponding one. It
// reliably catches globally-unknown values (typos, removed/renamed values,
// garbage) but NOT a value that is valid at a *different* Zod path (e.g.
// advertising query.exportType:['tags'] passes because 'tags' is a valid
// query.type elsewhere). Per-path resolution through the coerceObject-wrapped
// discriminatedUnion is deferred; tighten only if a real per-path drift slips
// through in practice.

// Deliberate, documented divergences between an advertised enum/discriminator
// and the Zod schema. Empty = no intentional divergence. Add an entry ONLY
// with a justification + follow-up ticket; never to silence real drift.
const EXPECTED_FLATTENINGS: Record<string, { discriminatorValuesNotAdvertised?: string[]; reason: string }> = {
  // e.g. WriteTool: { discriminatorValuesNotAdvertised: ['x'], reason: '… (OMN-NN)' }
};

type ZodAny = { _def?: Record<string, unknown> } & Record<string, unknown>;

// Collect every literal/enum primitive value reachable in a Zod schema tree.
// This is the set of values the Zod schema can possibly accept at any enum or
// literal position — the universe an advertised enum value must live within.
function collectZodValueUniverse(root: unknown): Set<unknown> {
  const out = new Set<unknown>();
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const def = (node as ZodAny)._def as Record<string, unknown> | undefined;
    if (!def) return;
    const typeName = def.typeName as string | undefined;
    switch (typeName) {
      case 'ZodLiteral':
        out.add(def.value);
        return;
      case 'ZodEnum':
        for (const v of def.values as unknown[]) out.add(v);
        return;
      case 'ZodNativeEnum':
        for (const v of Object.values(def.values as object)) out.add(v);
        return;
      case 'ZodObject': {
        const shape = (def.shape as () => Record<string, unknown>)();
        for (const v of Object.values(shape)) visit(v);
        return;
      }
      case 'ZodDiscriminatedUnion':
      case 'ZodUnion':
        for (const o of def.options as unknown[]) visit(o);
        return;
      case 'ZodIntersection':
        visit(def.left);
        visit(def.right);
        return;
      case 'ZodArray':
      case 'ZodSet':
        visit(def.type);
        return;
      case 'ZodOptional':
      case 'ZodNullable':
      case 'ZodDefault':
      case 'ZodCatch':
      case 'ZodReadonly':
      case 'ZodBranded':
      case 'ZodPromise':
        visit(def.innerType);
        return;
      case 'ZodEffects': // z.preprocess / z.transform (coerceObject, coerceBoolean)
        visit(def.schema);
        return;
      case 'ZodPipeline':
        visit(def.in);
        visit(def.out);
        return;
      default:
        // Unknown wrapper — probe the common inner-schema keys defensively so a
        // future Zod construct can't silently shrink the universe (the OMN-54
        // empty-set failure mode).
        for (const key of ['innerType', 'schema', 'type', 'in', 'out', 'left', 'right']) {
          if (def[key]) visit(def[key]);
        }
        if (Array.isArray(def.options)) for (const o of def.options as unknown[]) visit(o);
    }
  };
  visit(root);
  return out;
}

// Collect every { enum: [...] } occurrence in a hand-crafted JSON Schema,
// recording a dotted path for diagnostics.
function collectJsonSchemaEnums(node: unknown, path = '$'): Array<{ path: string; values: unknown[] }> {
  const found: Array<{ path: string; values: unknown[] }> = [];
  const walk = (n: unknown, p: string): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (Array.isArray(obj.enum)) found.push({ path: p, values: obj.enum });
    if (obj.properties && typeof obj.properties === 'object') {
      for (const [k, v] of Object.entries(obj.properties as object)) walk(v, `${p}.${k}`);
    }
    if (obj.items) walk(obj.items, `${p}[]`);
    for (const comb of ['anyOf', 'oneOf', 'allOf'] as const) {
      if (Array.isArray(obj[comb])) (obj[comb] as unknown[]).forEach((s, i) => walk(s, `${p}.${comb}[${i}]`));
    }
  };
  walk(node, path);
  return found;
}

// The discriminator literal-set(s) of any discriminatedUnion in the Zod tree:
// every value here is a whole branch (query type / operation) the server
// accepts; if one isn't advertised, that capability is invisible to clients.
function collectZodDiscriminatorSets(root: unknown): Set<unknown> {
  const out = new Set<unknown>();
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const def = (node as ZodAny)._def as Record<string, unknown> | undefined;
    if (!def) return;
    const typeName = def.typeName as string | undefined;
    if (typeName === 'ZodDiscriminatedUnion') {
      const discriminator = def.discriminator as string;
      for (const opt of def.options as unknown[]) {
        const odef = (opt as ZodAny)._def as Record<string, unknown>;
        const shape = (odef.shape as () => Record<string, unknown>)();
        const disc = shape[discriminator] as ZodAny | undefined;
        if (disc?._def?.typeName === 'ZodLiteral') out.add(disc._def.value);
      }
    }
    for (const key of ['innerType', 'schema', 'type', 'in', 'out', 'left', 'right']) {
      if (def[key]) visit(def[key]);
    }
    if (def.typeName === 'ZodObject') {
      for (const v of Object.values((def.shape as () => Record<string, unknown>)())) visit(v);
    }
    if (Array.isArray(def.options)) for (const o of def.options as unknown[]) visit(o);
  };
  visit(root);
  return out;
}

describe('Parity: tool inputSchema ↔ Zod schema (OMN-47 S10)', () => {
  const tools = [
    { name: 'OmniFocusReadTool', tool: new OmniFocusReadTool({} as never) },
    { name: 'OmniFocusWriteTool', tool: new OmniFocusWriteTool({} as never) },
    { name: 'OmniFocusAnalyzeTool', tool: new OmniFocusAnalyzeTool({} as never) },
    { name: 'SystemTool', tool: new SystemTool({} as never) },
  ];

  for (const { name, tool } of tools) {
    describe(name, () => {
      const inputSchema = (tool as { inputSchema: Record<string, unknown> }).inputSchema;
      const zodSchema = (tool as { schema: unknown }).schema;
      const universe = collectZodValueUniverse(zodSchema);
      const jsonEnums = collectJsonSchemaEnums(inputSchema);
      const discriminatorSet = collectZodDiscriminatorSets(zodSchema);

      it('introspection found a non-empty Zod value universe (guards vacuous pass)', () => {
        // If a future Zod construct defeats the traversal, the universe goes
        // empty and every subset check passes vacuously — fail loudly instead.
        expect(universe.size).toBeGreaterThan(0);
      });

      it('inputSchema advertises at least one enum (guards vacuous pass)', () => {
        expect(jsonEnums.length).toBeGreaterThan(0);
      });

      for (const { path, values } of jsonEnums) {
        it(`advertised enum at ${path} contains only values Zod accepts`, () => {
          const rejected = values.filter((v) => !universe.has(v));
          expect(
            rejected,
            `inputSchema advertises ${JSON.stringify(rejected)} at ${path}, but the Zod schema accepts none of these — clients would be told these are valid and get a validation error.`,
          ).toEqual([]);
        });
      }

      it('every Zod discriminator value is advertised somewhere in inputSchema', () => {
        if (discriminatorSet.size === 0) return; // tool has no discriminatedUnion
        const advertised = new Set(jsonEnums.flatMap((e) => e.values));
        const allow = new Set<unknown>(EXPECTED_FLATTENINGS[name]?.discriminatorValuesNotAdvertised ?? []);
        const hidden = [...discriminatorSet].filter((v) => !advertised.has(v) && !allow.has(v));
        expect(
          hidden,
          `Zod accepts discriminator value(s) ${JSON.stringify(hidden)} that inputSchema never advertises — that capability is invisible to MCP clients. Advertise it, or add to EXPECTED_FLATTENINGS with a ticket.`,
        ).toEqual([]);
      });
    });
  }
});

// =============================================================================
// Reverse parity: projection emits no UNDECLARED key (OMN-61)
// =============================================================================
//
// The forward blocks above prove every enum member is emitted. This proves the
// converse: the projection must not emit a top-level `key: task.`/`key:
// project.` entry that no Field enum declares (dead/undiscoverable output).
// lite mode strips nextTask/taskCounts/stats so only the projection literal is
// scanned. Object-valued projections whose RHS is not bare `task.`/`project.`
// (e.g. repetitionRule's IIFE) are out of this scan by design — it guards
// against undeclared scalar keys, not value shape.
//
// Context-only keys: names emitted only by derived/today-mode builder paths
// this test does NOT drive (it requests just the enum members). With the
// current request set the allowlist filter is therefore unreachable — it is a
// forward guard for if/when this test is extended to exercise those paths (or
// the regex widens), not an active filter today. Kept explicit so a future
// extension that surfaces such a key makes a conscious choice: declare it in
// the enum, or allowlist it here.

const TASK_CONTEXT_ONLY_KEYS = ['effectivePlannedDate', 'reason', 'daysOverdue'];

describe('Reverse parity: generateFieldProjection ↔ TaskFieldEnum (OMN-61)', () => {
  it('emits no undeclared top-level task projection key', () => {
    const declared = new Set<string>(TaskFieldEnum.options);
    // performanceMode is ProjectScriptOptions-only; the task builder has no stats block
    // and ignores it, so omitting it here produces identical output.
    const { script } = buildFilteredTasksScript({}, { fields: [...TaskFieldEnum.options] });
    const emitted = [...script.matchAll(/^[ \t]*([A-Za-z]\w*):[ \t]*task\./gm)].map((m) => m[1]);
    const undeclared = [...new Set(emitted)].filter((k) => !declared.has(k) && !TASK_CONTEXT_ONLY_KEYS.includes(k));
    expect(undeclared, `undeclared task projection key(s): ${undeclared.join(', ')}`).toEqual([]);
  });
});

describe('Reverse parity: generateProjectFieldProjection ↔ ProjectFieldEnum (OMN-61)', () => {
  it('emits no undeclared top-level project projection key', () => {
    const declared = new Set<string>(ProjectFieldEnum.options);
    const { script } = buildFilteredProjectsScript(
      {},
      {
        fields: [...ProjectFieldEnum.options],
        performanceMode: 'lite',
      },
    );
    const emitted = [...script.matchAll(/^[ \t]*([A-Za-z]\w*):[ \t]*project\./gm)].map((m) => m[1]);
    // No PROJECT context-only allowlist: every project projection key today is
    // a declared ProjectFieldEnum member. Add one here if that ever changes.
    const undeclared = [...new Set(emitted)].filter((k) => !declared.has(k));
    expect(undeclared, `undeclared project projection key(s): ${undeclared.join(', ')}`).toEqual([]);
  });
});

// =============================================================================
// Write-side parity: settable schema field ↔ mutation-script-builder (OMN-61)
// =============================================================================
//
// Every field the create/update schemas accept must be *read* by the mutation
// builder seam as `data.<field>` / `changes.<field>` / `projectData.<field>`.
// A schema field the seam never references is silently dropped on write —
// the OMN-60 `fixed` bug shape (accepted, advertised, never applied). This is
// the write-side analog of the read-side projection parity above.
//
// OMN-128: the seam now spans TWO files — mutation-script-builder.ts holds the
// thin AST wrappers (and the sandbox guard), while the field-consuming
// lowerings live in mutation/defs.ts. Both are scanned; the per-field
// compile-time exhaustiveness guards in defs.ts carry the same intent
// structurally, this scan keeps the cross-file declaration↔implementation
// pairing honest.
//
// References the seam makes that are NOT user-settable fields of the two
// schemas under test, allowlisted so the reverse guard doesn't false-fail:
//   projectId    — builder's internal remap of the `project` schema field
//   parentFolder — a field of FolderCreateDataSchema, a different schema this
//                   gate intentionally does not cover
//   specs        — BatchCreateTasksData envelope field (batch fast path);
//                   per-spec fields are covered by the BatchTaskSpec
//                   exhaustiveness guard in defs.ts
//   stopOnError  — BatchCreateTasksData option, not a settable data field
//   tagName, parentTagName, newName, targetTag — fields of the tag-manage
//                   input types (TagCreateInput / TagRenameInput /
//                   TagMergeInput, OMN-128 slice 6), a different schema this
//                   gate intentionally does not cover (same category as
//                   parentFolder)
// A new entry forces a conscious choice rather than silently widening the
// accepted-but-internal surface.
const BUILDER_INTERNAL_REFS = [
  'parentFolder',
  'projectId',
  'specs',
  'stopOnError',
  'tagName',
  'parentTagName',
  'newName',
  'targetTag',
  // OMN-106: mark-reviewed/project params — the manage_reviews operation lives
  // in the ANALYZE schema (AnalyzeSchema manage_reviews params), not a write
  // settable; the AST builder still lowers them.
  'reviewDate',
  'updateNextReviewDate',
];

// Strip comments before scanning the (checked-in, bounded) builder source:
// it has a maintenance comment (`// ... if (data.X) ...`) that would
// otherwise be captured as a phantom `X` reference, which would then have to
// be masked by an allowlist entry.
function stripComments(src: string): string {
  // `[^\n]*` (not `.*$/m`) keeps the line-comment strip backtracking-free.
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
const mutationBuilderSource = [
  '../../../src/contracts/ast/mutation-script-builder.ts',
  '../../../src/contracts/ast/mutation/defs.ts',
]
  .map((p) => stripComments(readFileSync(fileURLToPath(new NodeURL(p, import.meta.url)), 'utf8')))
  .join('\n');
const builderRefs = new Set(
  [...mutationBuilderSource.matchAll(/\b(?:data|changes|projectData)\.([A-Za-z]\w*)/g)].map((m) => m[1]),
);

describe('Parity: CreateDataSchema ↔ mutation-script-builder (OMN-61)', () => {
  for (const field of Object.keys(CreateDataSchema.shape)) {
    it(`mutation builder reads create field "${field}"`, () => {
      expect(
        builderRefs.has(field),
        `CreateDataSchema accepts "${field}" but mutation-script-builder never reads data/changes/projectData.${field} — it is silently dropped on create (OMN-60 bug shape).`,
      ).toBe(true);
    });
  }
});

describe('Parity: UpdateChangesSchema ↔ mutation-script-builder (OMN-61)', () => {
  for (const field of Object.keys(UpdateChangesSchema.shape)) {
    it(`mutation builder reads update field "${field}"`, () => {
      expect(
        builderRefs.has(field),
        `UpdateChangesSchema accepts "${field}" but mutation-script-builder never reads it — silently dropped on update (OMN-60 bug shape).`,
      ).toBe(true);
    });
  }
});

describe('Reverse write parity: builder reads no undeclared settable key (OMN-61)', () => {
  it('every data/changes/projectData reference is a schema field or allowlisted internal', () => {
    const settable = new Set<string>([
      ...Object.keys(CreateDataSchema.shape),
      ...Object.keys(UpdateChangesSchema.shape),
    ]);
    const undeclared = [...builderRefs].filter((r) => !settable.has(r) && !BUILDER_INTERNAL_REFS.includes(r));
    expect(
      undeclared,
      `mutation-script-builder reads data/changes/projectData key(s) ${JSON.stringify(undeclared)} that no settable schema declares and that are not allowlisted internals — declare them, or add to BUILDER_INTERNAL_REFS with a reason.`,
    ).toEqual([]);
  });
});

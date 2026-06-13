# OMN-158 Leaf-Strict Response Schemas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen every OMN-139 family schema in `src/omnifocus/script-response-schemas.ts` (and tool-file
instantiations) from `z.unknown()` leaves to full, source-verified, `.strict()` field inventories — plus the six riders
(tie-in tests, unionErrors slimming, TaskWrite/Export unions, comment fix, ESLint cleanup).

**Spec:** `docs/superpowers/specs/2026-06-12-omn-158-leaf-strict-schemas-design.md` — read it first. Its normative rules
(§2 optionality/type rules, §3 strictness rules) govern every schema in this plan.

**Architecture:** Schemas stay in `src/omnifocus/script-response-schemas.ts`; row/leaf sub-schemas are added there and
threaded through evolved factories (`listResultSchema`, `astEnvelopeSchema`, `reviewSuccessSchema`, new
`v3EnvelopeSchema`). Zero detection-logic changes (rider 2 touches only `details.issues` content). The leaf inventories
below are source-verified (2026-06-12, four parallel probes) — but per spec §2.1, RE-VERIFY each table against the cited
emitter before coding it; the emitter is the truth, this plan is the map.

**Tech stack:** TypeScript, Zod 3 (`.strict()` objects — NOT zod4 syntax), vitest.

**Worktree:** `/Users/kip/src/omnifocus-mcp/.claude/worktrees/omn-158-leaf-strict` (branch
`worktree-omn-158-leaf-strict`). All commands run here. `npm run build` before any MCP-level testing.

**Normative coding rules (from spec — apply to EVERY schema below):**

1. `.strict()` on every object at every depth. `.strict()` does NOT propagate through unions — each branch gets its own.
   Chain `.strict()` BEFORE `.refine()`/`.transform()`.
2. Discriminators are literals (`z.literal(true)`, `z.literal('created')`), never broad types.
3. A key is `.optional()` iff ANY success branch can omit it (conditional spread, separate envelope literal, or
   `undefined`-drop). A key is required iff every branch emits it with a non-`undefined` value. Value `null` ≠ key
   absent: a key always emitted but sometimes `null` is REQUIRED with `.nullable()`.
4. Name-keyed maps (keys are user data): `z.record(<strict value schema>)`.
5. Passthrough echoes (input reflected back verbatim, e.g. `filters_applied`) may stay `z.unknown()` WITH a comment
   saying why.
6. Never add error-ish keys to a success schema.
7. ISO date leaves are `z.string()` (we do not regex-validate date format in this ticket — type only).

**Shared leaf vocabulary** — define once near the top of `script-response-schemas.ts` and reuse:

```typescript
/** ISO-8601 date string emitted via toISOString(); type-only (no format regex). */
const isoDate = z.string();
const isoDateOrNull = z.string().nullable();
/** OMN-137 best-effort warning labels: 'label: message' strings. */
const warningsArray = z.array(z.string());
```

---

### Task 1: Write-family leaf schemas (mutation envelopes) + TaskWriteResultSchema union (rider 3)

**Files:**

- Modify: `src/omnifocus/script-response-schemas.ts` (TaskWriteResultSchema through TagMutationResultSchema)
- Modify: `tests/unit/omnifocus/script-response-schemas.test.ts`
- Source of truth to re-verify against: `src/contracts/ast/mutation/defs.ts` (each build*/lower* function's envelope
  literal)

**Inventory (source-verified against defs.ts; re-verify before coding):**

| Schema                                | Variant        | Keys (R=required, O=optional)                                                                                                                                                                                                                                       |
| ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TaskWriteResultSchema                 | create         | taskId:string R · name:string R · note:string R · flagged:boolean R · dueDate/deferDate/plannedDate:string\|null R · estimatedMinutes:number\|null R · tags:string[] R · project:string\|null R · inInbox:boolean R · warnings:string[] R · created:literal(true) R |
| TaskWriteResultSchema                 | update         | taskId:string R · name:string R · flagged:boolean R · updated:literal(true) R · warnings:string[] R — NO other keys                                                                                                                                                 |
| CompleteResultSchema                  | task / project | (taskId\|projectId):string R · name:string R · completed:literal(true) R · completionDate:string\|null R                                                                                                                                                            |
| DeleteResultSchema                    | task / project | (taskId\|projectId):string R · name:string R · deleted:literal(true) R                                                                                                                                                                                              |
| BulkDeleteResultSchema                | —              | deleted: array of {id:string R, name:string R}.strict() R · errors: array of {taskId:string R, error:string R}.strict() R · message:string R                                                                                                                        |
| ProjectWriteResultSchema              | create         | projectId:string R · name:string R · note:string R · flagged:boolean R · sequential:boolean R · dueDate/deferDate/plannedDate:string\|null R · folder:string\|null R · tags:string[] R · warnings:string[] R · created:literal(true) R                              |
| ProjectWriteResultSchema              | update         | projectId:string R · name:string R · flagged:boolean R · status:enum('active','on_hold','completed','dropped') R · updated:literal(true) R · warnings:string[] R                                                                                                    |
| FolderCreateResultSchema              | —              | folderId:string R · name:string R · parentFolder:string\|null R · warnings:string[] R · created:literal(true) R                                                                                                                                                     |
| BatchCreateResultSchema               | —              | results: array of union[ {tempId:string R, taskId:string R, success:literal(true) R, warnings:string[] R}.strict(), {tempId:string R, taskId:null R, success:literal(false) R, error:string R, warnings:string[] R}.strict() ] R                                    |
| TagMutationResultSchema created(path) |                | action:'created' R · tagName:string R · tagId:string R · path:string R · createdSegments:string[] R · message:string R                                                                                                                                              |
| TagMutationResultSchema created(flat) |                | action:'created' R · tagName:string R · tagId:string R · parentTagName:string\|null R · parentTagId:string\|null R · message:string R                                                                                                                               |
| renamed                               |                | action R · oldName:string R · newName:string R · message:string R                                                                                                                                                                                                   |
| deleted                               |                | action R · tagName:string R · message:string R                                                                                                                                                                                                                      |
| merged                                |                | action:'merged' R · sourceTag:string R · targetTag:string R · tasksMerged:number R · message:string R                                                                                                                                                               |
| merged_with_warning                   |                | action:'merged_with_warning' R · sourceTag R · targetTag R · tasksMerged R · warning:string R (undefined-drop means key absent on 'merged' branch only) · message R                                                                                                 |
| nested                                |                | action R · tagName R · parentTagName:string R · parentTagId:string R · message R                                                                                                                                                                                    |
| unparented                            |                | action R · tagName R · message R                                                                                                                                                                                                                                    |
| reparented (with parent)              |                | action R · tagName R · newParentTagName:string R · newParentTagId:string R · message R                                                                                                                                                                              |
| reparented (to root)                  |                | action R · tagName R · message R — newParent\* keys structurally ABSENT (separate envelope literal)                                                                                                                                                                 |

Note: `reparented` becomes TWO strict variants (with-parent / to-root) replacing today's single optional-keys variant.
The update-task variant is deliberately minimal — do NOT "helpfully" mirror create's keys (no `note`, no dates, no tags
on update; verified defs.ts ~752-758). `batch_create` failure items: `taskId: z.null()`, `success: z.literal(false)` —
these are SUCCESS-contract per-item data (like BulkDelete's `errors`), not the error dialect; rule 6 is not violated.

- [ ] **Step 1: Write failing schema tests.** In `script-response-schemas.test.ts`, per schema above add: (a) a full
      representative payload passes; (b) payload with one extra leaf key inside a nested object (e.g.
      `results[0].extraKey`, `deleted[0].rogue`) FAILS; (c) wrong-typed leaf (e.g. `tasksMerged: "3"`) FAILS; (d) for
      unions, each variant passes its own branch and a cross-variant hybrid (e.g. update keys + `created:     true`, or
      reparent-to-root carrying `newParentTagId`) FAILS. Use the inventory table to build fixtures.
- [ ] **Step 2: Run them** — `npx vitest run tests/unit/omnifocus/script-response-schemas.test.ts` — new cases must FAIL
      against current lenient schemas (extra-nested-key cases fail; if one passes, the fixture is wrong).
- [ ] **Step 3: Implement the schemas** per the table + normative rules. TaskWriteResultSchema becomes
      `z.union([TaskCreateResult, TaskUpdateResult])` (drop the `.refine`); export the variants if tests need them.
- [ ] **Step 4: Run** the schema test file → PASS, then `npm run test:unit` → no regressions (existing tool tests with
      fixture payloads may fail — fix FIXTURES to wire shapes per spec §5, never loosen schemas; if a fixture disagrees
      with the emitter table, re-read the emitter and believe it).
- [ ] **Step 5: Commit** `feat(OMN-158): leaf-strict write-family schemas; TaskWriteResultSchema create∪update union`

### Task 2: Read-family leaf schemas (rows, metadata, count, folders, perspectives, export union — rider 4)

**Files:**

- Modify: `src/omnifocus/script-response-schemas.ts`, `src/tools/unified/OmniFocusReadTool.ts` (schema instantiations
  only)
- Create: `tests/unit/omnifocus/projection-parity.test.ts`
- Modify: `tests/unit/omnifocus/script-response-schemas.test.ts`
- Sources of truth: `src/contracts/ast/script-builder.ts` (generateFieldProjection ~line 189-316,
  generateProjectFieldProjection ~1108-1190, buildFilteredProjectsScript metadata ~1343-1355, buildProjectByIdScript
  ~1411, buildExportTasksScript ~1613-1747, EXPORT_FIELD_MAP ~1455-1473, buildFilteredFoldersScript ~1852-1933,
  buildTaskCountScript ~2064-2072), `src/omnifocus/scripts/tasks/list-tasks-ast.ts` (metadata ~96-106),
  `src/omnifocus/scripts/export/export-projects.ts`, `src/omnifocus/scripts/perspectives/list-perspectives.ts`,
  `src/contracts/ast/tag-script-builder.ts`

**Row schemas (all keys `.optional()` per the projection rule; values per table):**

- `TaskRowSchema`: id, name:string · completed, flagged, inInbox, blocked, available:boolean · dueDate, deferDate,
  plannedDate, effectivePlannedDate, completionDate, modified, added, dropDate:string|null · tags:string[] · note:string
  · project:string|null · projectId:string|null · estimatedMinutes:number|null · repetitionRule:{ruleString:string O,
  scheduleType:string O, anchorDateKey:string O, catchUpAutomatically:boolean O}.strict()|null · parentTaskId,
  parentTaskName:string|null · reason:enum('overdue','due_soon','flagged')|null · daysOverdue:number. ALL optional
  (projection-gated). **Re-verify the full case-label list against the generateFieldProjection switch and the
  repetitionRule sub-object's emitted keys before coding** — the switch is authoritative; if it has labels not listed
  here, add them.
- `ProjectRowSchema`: id, name, status:string · flagged, sequential, defaultSingletonActionHolder:boolean · note:string
  · dueDate, deferDate, plannedDate, folder, folderPath, folderId, lastReviewDate, nextReviewDate,
  completionDate:string|null · reviewInterval:{unit:string, steps:number}.strict()|null · tags:string[] ·
  taskCounts:{total,available,completed:number}.strict() · nextTask:{id,name:string, flagged:boolean,
  dueDate:string|null}.strict() · stats:{active,completed,total,completionRate,overdue,flagged:number}.strict(). ALL
  optional. Re-verify against generateProjectFieldProjection + the performanceMode/includeStats branches.
- Metadata schemas (`.strict()`): `TaskListMetadataSchema` {total_count:number R · total_matched:number **O** ·
  sorted_in_script:boolean R · limit_applied, offset:number R · offset_applied:number O · mode:string R ·
  filter_description:string **O** · optimization, architecture:string R}. **PATH TRAP:** the wrapper literal
  (`list-tasks-ast.ts` ~96-106) writes every key and LOOKS unconditional, but it copies values from the inner script's
  result and `JSON.stringify` drops the undefined ones — the id_lookup inner return (`buildTaskByIdScript`,
  script-builder.ts ~705-710) emits only {tasks, count, mode, targetId}-shaped data, so
  `total_matched`/`filter_description`/`offset_applied` are ABSENT on id-lookup reads. Trace BOTH the wrapper literal
  AND every inner-script return (filtered / inbox / id_lookup) and mark optional any key missing on any path; getting
  this wrong fail-closes live id-lookup reads. `ProjectListMetadataSchema` {total_available, total_matched,
  returned_count, limit_applied:number · performance_mode, optimization, filter_description:string ·
  stats_included:boolean} — all R, re-verify the same way against buildFilteredProjectsScript's single emission.

**Factory evolution:**

```typescript
export function listResultSchema<TRow extends z.ZodTypeAny, TMeta extends z.ZodTypeAny>(
  itemKeys: readonly string[],
  opts: { rowSchema: TRow; metadata?: TMeta; extras?: Record<string, z.ZodTypeAny> },
) {
  /* same union-of-strict-variants shape; [k]: z.array(opts.rowSchema); metadata key present iff opts.metadata,
     typed by it. Return type: drop the z.ZodTypeAny annotation — let TS infer (this retires the unsafe-argument
     warnings). The union cast for computed keys may stay internal. */
}
```

`astEnvelopeSchema(itemsKey, itemSchema, summarySchema?, metadataSchema?)` analogous. **Update ALL factory call sites in
BOTH tools in THIS task's commit** — the signature change otherwise compile-breaks the tree between Task 2 and Task 3:

- OmniFocusReadTool.ts: TASK_LIST_SCHEMA/PROJECT_LIST_SCHEMA (row+metadata schemas); TAG_LIST_SCHEMA (basic-mode item
  BUT see branch note below); PERSPECTIVE_LIST_SCHEMA with
  `{name:string, type:string, isBuiltIn:boolean, identifier:string|null, filterRules:z.null()}.strict()` rows and
  summary `{total:number, insights:string[]}.strict()`. Also the call sites at ~716/~850 — identify which schema each
  passes and thread the typed versions.
- OmniFocusAnalyzeTool.ts (~304-314): RECURRING_TASKS_SCHEMA (use the RecurringTaskRowSchema + summary/metadata schemas
  — define them in THIS task in the schemas module, using the inventory in Task 3's RECURRING_TASKS bullet),
  TAG_ITEMS_SCHEMA (tag-mode union per the hazard note), PROJECTS_LIST_SCHEMA/TASKS_LIST_SCHEMA (reuse
  ProjectRowSchema/TaskRowSchema + the corrected metadata schemas — but VERIFY which script feeds the
  parse_meeting_notes sites ~2646/2656/2681 and whether its metadata shape matches the read-tool wrapper's; if a site
  receives the inner shape directly, give it the matching schema, not the wrapper's).

**Tag-mode branch hazard:** `buildTagsScript` emits items as plain strings (mode 'names'), `{id,name}` (mode 'basic'),
or the full shape with optional parentId/parentName/childrenAreMutuallyExclusive/usage (mode 'full'). Check which modes
flow through each call site (read tool ~line 814 uses 'basic'? — VERIFY by reading handleTagQuery; the analyze tool's
TAG_ITEMS_SCHEMA may receive other modes). If one call site can receive multiple modes, the item schema is a union of
the mode shapes: `z.union([z.string(), BasicTagItem, FullTagItem])` — with FullTagItem's optional keys per the
tag-script-builder source. Tag summary:
`{total:number, insights:string[], query_time_ms:number, mode:string, optimization:string}.strict()`.

**Dedicated schemas:**

- `CountResultSchema`: count:number R · filters_applied:z.unknown() R (passthrough echo — keep unknown, comment why) ·
  query_time_ms:number R · optimization:string R · filter_description:string R · scanned:number R · total_tasks:number R
  · limited:boolean R (emitted on BOTH branches: `{warning, limited:true}` or `{limited:false}` — script-builder.ts
  ~2063-2071) · warning:string O (the only conditional key). Over-optionality is the laxity this ticket removes — do not
  blanket-optional these.
- `FolderListSchema`: success:literal(true) · folders: array of {id,name,status,path:string · depth:number ·
  parentId:string O · parentName:string O · children: array of {id,name:string}.strict() O · childCount:number O ·
  projects: array of {id,name,status:string}.strict() O · projectCount:number O}.strict() ·
  metadata:{returned_count,total_available:number}.strict() O.
- `ProjectByIdSchema`: projects:z.array(ProjectRowSchema) · count:number · mode:string · targetId:string.
- `ExportResultSchema` → **replaced by TWO per-script unions** (rider 4); the call sites are distinct (task export vs
  project export handlers in OmniFocusReadTool.ts ~1022/1209 vs ~1117/1230 — verify which handler runs which script and
  pass the matching schema):
  - `ExportTasksResultSchema` = union of (each `.strict()`; R/O verified against script-builder.ts ~1613-1747):
    - csv empty: {format:literal('csv'), data:string, count:number, duration:number, message:string}
    - csv non-empty: {format:literal('csv'), data:string, count:number, duration:number, limited:boolean R (always
      emitted: `tasksAdded >= maxTasks`), message:string O (undefined-drop)}
    - markdown: {format:literal('markdown'), data:string, count:number, duration:number}
    - json: {format:literal('json'), data:z.array(ExportTaskRowSchema), count:number, duration:number, limited:boolean
      R, debug:TaskExportDebugSchema R (both always emitted), message:string O}
    - (if csv empty/non-empty can't be cleanly two variants — e.g. shared keys make the union ambiguous — a single csv
      variant with limited:boolean O and message:string O is acceptable; note the choice in a comment)
  - `ExportProjectsResultSchema` = union of (verify against export-projects.ts):
    - csv / markdown: {format:literal, data:string, count:number, duration:number} — no limited/message/debug
    - json: {format:literal('json'), data:z.array(ExportProjectRowSchema), count:number, duration:number,
      debug:{totalProjectsProcessed:number, includeStats:boolean, optimizationUsed:string}.strict() R}
  - Task json debug: {totalTasksProcessed:number, maxTasksAllowed:number, filterDescription:string,
    fieldsRequested:string[], optimizationUsed:string}.strict().
  - `ExportTaskRowSchema`: closed set = EXPORT_FIELD_MAP keys (id,name,note,project,projectId,tags,deferDate,
    dueDate,plannedDate,completed,completionDate,flagged,estimated,created,createdDate,modified,modifiedDate), all
    optional; values: tags:string[] · completed/flagged:boolean · estimated:number · rest:string (empty-string
    fallbacks, no nulls). `ExportProjectRowSchema`: id,name,status:string R · note,parentId,parentName,deferDate,
    dueDate,plannedDate,effectivePlannedDate,completionDate,modifiedDate:string O · stats:{totalTasks,
    completedTasks,availableTasks,completionRate,overdueCount,flaggedCount:number}.strict() O.

- [ ] **Step 1: Write the projection-parity test** (`tests/unit/omnifocus/projection-parity.test.ts`). Mechanism (scoped
      source-scan — do NOT grep the whole file, it has several unrelated `case` switches; do NOT read dist/):
      `fs.readFileSync('src/contracts/ast/script-builder.ts')`, slice the text between
      `function generateFieldProjection` and the next top-level `\nfunction ` declaration, extract `case '(\w+)':`
      labels from that slice only; same for `generateProjectFieldProjection`. Assert the extracted label set equals
      `Object.keys(TaskRowSchema.shape)` exactly (note: `reason`/`daysOverdue` ARE switch cases, no special-casing
      needed for tasks). For projects, assert extracted labels ⊆ `Object.keys(ProjectRowSchema.shape)` and that the
      difference is exactly {taskCounts, nextTask, stats} — those come from the performanceMode/includeStats branches,
      not the switch. Run → FAILS (schema doesn't exist yet). (Alternative const-driven switch refactor rejected: larger
      behavioral-risk diff for the same protection.)
- [ ] **Step 2: Write failing fixture tests** for every schema above (same pattern as Task 1: full payload passes,
      nested extra key fails, wrong type fails, per-variant union checks: a csv payload with `debug` FAILS).
- [ ] **Step 3: Implement** row schemas, metadata schemas, factory evolution, call-site updates, dedicated schemas.
- [ ] **Step 4: Run** schema + parity tests → PASS; `npm run test:unit` → fix fixtures (never loosen); `npm run build` →
      compiles.
- [ ] **Step 5: Commit** `feat(OMN-158): leaf-strict read-family schemas; ExportResultSchema per-format union`

### Task 3: Analyze-family leaf schemas (v3 payloads, reviews, slimmed, recurring)

**Files:**

- Modify: `src/omnifocus/script-response-schemas.ts`, `src/tools/unified/OmniFocusAnalyzeTool.ts`
- Modify: `tests/unit/omnifocus/script-response-schemas.test.ts`
- Sources of truth:
  `src/omnifocus/scripts/analytics/{productivity-stats-v3,task-velocity-v3,analyze-overdue-v3,workflow-analysis-v3}.ts`,
  `src/omnifocus/scripts/reviews/{projects-for-review,mark-project-reviewed,set-review-schedule}.ts`,
  `src/omnifocus/scripts/recurring/{analyze-recurring-tasks-ast,get-recurring-patterns}.ts`, the inline JXA in
  `fetchSlimmedData` (OmniFocusAnalyzeTool.ts ~1307-1415)

**New factory:** `v3EnvelopeSchema<T>(dataSchema: T)` →
`z.object({ok: z.literal(true), v: z.string(), data: dataSchema}).strict()`. One module-scope instance per operation;
delete the shared `ANALYZE_V3_SCHEMA` + its `as z.ZodTypeAny` casts.

**Data payloads (each `.strict()` at every object; re-verify against script source — these scripts build JSON via string
templates, read the emission carefully):**

- productivity_stats: summary{period:string, totalProjects, activeProjects, totalTasks, completedTasks,
  completedInPeriod, availableTasks, completionRate, dailyAverage, daysInPeriod, overdueCount:number}.strict() R ·
  projectStats:z.record(strict value — inventory the per-project value keys from the script) O ·
  tagStats:z.record(…same…) O · insights:string[] R · metadata{generated_at, method, optimization, note:string,
  query_time_ms:number}.strict() R.
- task_velocity: velocity{period:string, averageCompleted, averageCreated, dailyVelocity,
  backlogGrowthRate:string}.strict() · throughput{intervals: array of {start:string, end:string (Date.toJSON → ISO
  string on the wire — VERIFY by reading what JSON.stringify does to the emitted Date), created:number,
  completed:number, label:string}.strict(), totalCompleted:number, totalCreated:number}.strict() ·
  breakdown{medianCompletionHours:string, tasksAnalyzed:number}.strict() · projections{tasksPerDay, tasksPerWeek,
  tasksPerMonth:string}.strict() · optimization:string · dateRange{start:string, end:string}.strict(). All R.
- overdue_analysis: summary{totalOverdue, blockedCount, unblockedCount, blockedPercentage, avgDaysOverdue:number,
  mostOverdue:(strict object — inventory from source)|null}.strict() · insights:(inventory element shape) ·
  groupedByUrgency:z.record(strict value — inventory) · projectBottlenecks/blockedTasks: arrays — inventory their row
  shapes from source · metadata{…like productivity + tasksAnalyzed:number}.strict(). All R.
- workflow_analysis: insights: array of {category, insight, priority:string}.strict() · patterns:z.record(— check the
  value shapes in source; if heterogeneous, type the union) · recommendations: array of {category, recommendation,
  priority:string}.strict() · data:z.unknown() O (includeRawData passthrough — comment why) · totalTasks, totalProjects,
  analysisTime, dataPoints:number · metadata{analysisDepth:string, focusAreas:string[], maxInsights:number, method,
  optimization:string, query_time_ms:number}.strict(). All R except data.
- RECURRING_TASKS items (astEnvelopeSchema('tasks', RecurringTaskRowSchema, summary, metadata)): row {id,name:string R ·
  project,projectId:string O · repetitionRule{unit:string **NULLABLE** R, steps:number R, ruleString:string O,
  \_inferenceSource:string O, method:string **NULLABLE** O}.strict() R · frequency:string R ·
  deferDate,dueDate,nextDue:string O · **CORRECTION (Task 2 spec-review found vs emitter analyze-recurring-tasks-ast.ts
  ~216/228): the emitter emits `unit: null` and `method: null` when there is no ruleString and no name-inference — so
  `unit` is required but `.nullable()` (NOT plain string), and `method` is `.optional().nullable()`. The bullet
  originally said `unit:string R` which would fail-closed on an unparseable-rule recurring task. NOTE:
  RecurringTaskRowSchema already LANDED in Task 2's commit 6586318 as a compile dependency, currently with
  `unit: z.string().optional()` — FIX IT HERE: re-verify the whole row against the emitter, correct unit/method
  nullability, and ADD the fixture tests this schema never got (Task 2 only added it to satisfy the type system).**
  daysUntilDue:number O · isOverdue:boolean O · overdueDays:number O · lastCompleted:string O}.strict(); summary
  {totalRecurring,returned,overdue,dueThisWeek:number, byFrequency:z.record(z.number())}.strict(); metadata
  {query_time_ms:number, optimization:string, options:z.unknown() O (echo)}.strict(). **Also check
  buildRecurringSummaryScript's summary-only shape and which schema validates that endpoint today — expected answer: it
  appears EXPORTED BUT NEVER INVOKED from any tool (likely dead). If it truly has no call site, do NOT invent a schema;
  note it in the PR body as a candidate orphan. Only if a call site exists give it its own strict schema.**
- RecurringPatternsSchema: totalRecurring:number · patterns: array of PatternSchema{pattern:string, unit:string,
  steps:z.union([z.number(),z.string()]), count:number, percentage:number, examples:string[]}.strict() · byProject:
  array of {project:string, recurringCount:number, patterns: array of {pattern:string,count:number}.strict()}.strict() ·
  mostCommon:PatternSchema|null · duration:number · debug:{optimizationUsed:string}.strict() O.
- Reviews: REVIEWS_LIST = reviewSuccessSchema with projects: array of {id,name,status:string R · flagged, sequential,
  completedByChildren:boolean R · note,folder,dueDate,deferDate,lastReviewDate,nextReviewDate:string O ·
  reviewInterval{unit:string,steps:number}.strict() O · taskCounts{total,available,completed:number}.strict()
  O}.strict() + metadata{total_found:number, filter_applied:z.unknown() O (echo), generated_at:string,
  search_criteria:z.unknown() O (echo)}.strict() O. MARK_REVIEWED: project{id,name:string,
  lastReviewDate,nextReviewDate:string|null, reviewInterval:{unit,steps}|null}.strict() R · changes:string[] O ·
  message:string O. SET_SCHEDULE: results{successful: array of {projectId,projectName:string, changes:string[],
  reviewInterval:{unit:string,steps:number}.strict()|null, nextReviewDate:string|null}.strict(), failed: array of
  {projectId:string, projectName:string O, error:string}.strict(), summary{total_requested, successful_count,
  failed_count:number}.strict()}.strict() R · message:string O.
- SlimmedDataSchema rows: tasks {id,name:string R · completed,flagged:boolean R · status:string R · tags:string[] R ·
  project,projectId,deferDate,dueDate,completionDate,createdDate,modificationDate,note,noteHead:string O ·
  estimatedMinutes:number O · children:number O}.strict(); projects {id,name,status:string R · taskCount,
  availableTaskCount:number O · lastReviewDate,nextReviewDate,creationDate,modificationDate,completionDate:string
  O}.strict(); tags {id,name:string R, taskCount:number R}.strict().

- [ ] **Step 1: Write failing fixture tests** per payload (full passes / nested extra key fails / wrong type fails).
- [ ] **Step 2: Implement** `v3EnvelopeSchema` + the data schemas + review/slimmed/recurring schemas; update all analyze
      call sites; remove every `as z.ZodTypeAny` cast.
- [ ] **Step 3: Run** schema tests → PASS; `npm run test:unit` (fix fixtures, never loosen); `npm run build`.
- [ ] **Step 4: ESLint check (rider 6 partial):** `npx eslint src 2>&1 | grep -c no-unsafe-argument` — expect 0 from the
      ZodTypeAny class (baseline was 11, all attributable). Record the number for the PR body.
- [ ] **Step 5: Commit** `feat(OMN-158): leaf-strict analyze-family schemas; per-operation v3 payload schemas`

### Task 4: Schema↔emission tie-in tests (rider 1)

**Files:**

- Modify:
  `tests/unit/contracts/ast/mutation/{complete,create-folder,create-task,create-task-batch,delete,tag-create,tag-lifecycle,tag-move,update-project,update-task}.test.ts`
  (the 10 mutation VM test files; emitter.test.ts only where a parsed envelope maps 1:1 to a schema)
- Possibly create: a tiny shared helper `tests/unit/contracts/ast/mutation/assert-schema.ts`

Pattern — wherever a success-path test already does `const parsed = JSON.parse(vm.runInNewContext(...))`, add:

```typescript
import { CompleteResultSchema } from '../../../../../src/omnifocus/script-response-schemas.js';
const sp = CompleteResultSchema.safeParse(parsed);
expect(sp.error?.issues ?? []).toEqual([]); // issues in the failure message for diagnosability
expect(sp.success).toBe(true);
```

Schema↔file mapping: complete→CompleteResultSchema · create-folder→FolderCreateResultSchema ·
create-task/update-task→TaskWriteResultSchema · create-task-batch→BatchCreateResultSchema ·
delete→DeleteResultSchema+BulkDeleteResultSchema · tag-\*→TagMutationResultSchema ·
update-project→ProjectWriteResultSchema.

Known gap (do NOT build new infra): `buildCreateProjectProgram` has no VM success-path test today. Add ONE minimal VM
success test for it in the existing style (sandbox stubs like its update sibling) so the create-project envelope gets a
tie-in; if the sandbox stubbing turns out to need >~30 lines of new harness, skip and note the gap in the PR body
instead.

- [ ] **Step 1:** Add safeParse asserts to every success-path VM test in the 10 files (+ the create-project test).
- [ ] **Step 2:** `npm run test:unit` → all PASS.
- [ ] **Step 3: Mutation-verify (mandatory, report result):** temporarily remove one required key from one envelope in
      `defs.ts` (e.g. delete `completionDate` from lowerComplete's task envelope) → the complete tie-in test must FAIL →
      restore → PASS again. State this in the commit/PR.
- [ ] **Step 4: Commit** `test(OMN-158): mechanical schema↔emission tie-in asserts in VM mutation tests`

### Task 5: unionErrors slimming (rider 2) + comment fix (rider 5)

**Files:**

- Modify: `src/omnifocus/OmniAutomation.ts` (fail-closed site in `executeJson`), possibly a helper in
  `src/omnifocus/script-result-types.ts`
- Modify: `src/omnifocus/script-response-schemas.ts` (reparent comment ~line 385-389)
- Test: `tests/unit/omnifocus/OmniAutomation.test.ts`

Slimming algorithm (spec rider 2, normative): given `validation.error.issues`, if the top-level issue is `invalid_union`
with `unionErrors`, AND exactly one union branch's literal-typed keys all match the rejected value, replace `issues`
with that branch's issues; if zero or multiple branches match, leave `issues` unchanged. Implement as a pure exported
function (e.g. `slimUnionIssues(schema, value, error)` or operate on `error.issues` + the parsed value using each
branch's shape literals via Zod introspection (`schema._def`/`instanceof z.ZodLiteral`) — Zod 3 API). Pure presentation:
only the `details.issues` payload of the `'Unrecognized script output shape'` ScriptError changes. (Safety pre-verified
2026-06-12: the diagnose-failures pipeline matches only normalized errorMessage/inputShape/tool — never
`details.issues`.)

- [ ] **Step 1: Failing unit tests** in OmniAutomation.test.ts: (a) near-miss tag payload (`action:'renamed'`, `oldName`
      wrong type) through executeJson with TagMutationResultSchema → details.issues contains ONLY the renamed-branch
      issues; (b) payload matching no branch literal (`action:'bogus'`) → full unionErrors retained; (c) non-union
      schema rejection → issues untouched. Drive through executeJson with a mocked execute() — the way the real caller
      drives it.
- [ ] **Step 2:** Implement; run tests → PASS.
- [ ] **Step 3:** Fix the reparent comment: the to-root variant omits keys via a separate envelope literal at build time
      (defs.ts lowerTagMove ~1340-1345), NOT JSON.stringify undefined-dropping (that mechanism is merge's `warning`).
      Update the comment text accordingly (the optional() encoding stays correct only if Task 1 kept a single reparent
      variant — Task 1 splits it, so rewrite the comment to describe the two-variant union).
- [ ] **Step 4:** `npm run test:unit` → PASS. **Step 5: Commit**
      `feat(OMN-158): slim invalid_union rejection details to the matched branch; fix reparent comment`

### Task 6: Gates — full unit, lint, integration, conformance

- [ ] **Step 1:** `npm run build && npm run test:unit` → green. `npx eslint src` → zero `no-unsafe-argument` from the
      ZodTypeAny class; no NEW warnings of any kind vs main.
- [ ] **Step 2: Integration suite** (controller runs this, not a subagent): `npm run test:integration` via
      run_in_background (npm not bun; NEVER kill the shell — OMN-143; ~15-16 min). Expect green; any failure with
      context `'Unrecognized script output shape'` is a wrong schema — read `details.raw` (2000 chars) and fix the one
      line (then re-run the affected file is impossible — re-run full suite).
- [ ] **Step 3: Conformance gate:** run `npm run conformance` on this branch AND a same-day control on main (baselines
      drifted — OMN-168); llama3.1:8b + qwen2.5:7b; expect parity with the control (~84% qwen until OMN-168 lands).
      Probe owns the Ollama lifecycle (OMN-163).
- [ ] **Step 3.5: Scope note for the PR body:** `VersionResponseSchema` in `src/omnifocus/version-detection.ts` (~33-37)
      is an executeJson schema OUTSIDE the family module — explicitly out of OMN-158 scope (spec covers
      `script-response-schemas.ts` families). State this in the PR body so reviewers don't flag it as a miss. OPTIONAL
      freebie if trivial: `.strict()` + `ok: z.literal(true)` — only after verifying the version script emits `ok: true`
      on success; skip if any doubt.
- [ ] **Step 4:** Update CHANGELOG.md (Unreleased → leaf-strict response schemas, no wire-visible change on the success
      path; rejection `details.issues` slimmed for union schemas).
- [ ] **Step 5: Commit + PR** targeting kip-d/omnifocus-mcp main, title
      `feat(OMN-158): leaf-strict response schemas — full field inventories`. PR body: inventory method, riders 1-6
      dispositions, ESLint before/after counts, mutation-verify results, integration+conformance results.

### Execution notes for the controller

- Tasks 1-3 are independent of each other in content but all edit `script-response-schemas.ts` and its test file — run
  them SEQUENTIALLY (same files), Sonnet implementers, two-stage review per task (spec-compliance then code-quality per
  superpowers:subagent-driven-development).
- Task 4 depends on Tasks 1-3 (schemas must exist). Task 5 depends on Task 1 (union variants). Task 6 last.
- Every implementer must re-verify its inventory table against the cited emitter source BEFORE coding and report any
  discrepancy to the controller rather than silently following either source.
- Reviewers: apply the test-reachability rule (would this test fail if the behavior broke, driven the way the real
  caller drives it?) and check `.strict()` presence on every union branch (zod_strict_propagation_depth).

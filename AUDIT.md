# Audit tracker

Findings from code audits. One numbered sequence across runs; check an item off when it lands, or strike it through with
a reason when it is rejected or won't be done. Future audits dedupe against everything here, including rejected and
won't-do items.

## Audit 2026-09-25 at 31d52e9e

Tools run: `tsc --noEmit` (plus `--noUnusedLocals --noUnusedParameters`, on both `tsconfig.json` and
`tsconfig.test.json`; all clean), ESLint (`src` and `eslint-rules` clean; hits only in `tests/`), knip, jscpd
(`--min-tokens 70`; 4 clones), `vitest run tests/unit --coverage` (192 files, 4059 tests pass; 85.9% lines), git change
coupling (6 months, 307 commits). Unavailable: Stryker (not run by design; no earlier report exists under
`reports/mutation/`). Linear tickets for P0–P2 filed 2026-09-25 as OMN-329..OMN-363 (tag shown per item; P3 items
#53–#70 not ticketed). Deduped against: AUDIT.md (new file), Linear (open OMN issues only), ADRs (none exist),
PATTERNS.md and both ARCHITECTURE.md files.

Scope: six slices (analyze, write, read, core/transport, bridge/cache, test helpers). Every slice's coverage manifest
matches its file list. Every finding below was checked by an independent verifier that was given only the claim and the
citation. Qualifications the verifiers added are folded into the text. The verifier notes are in
`/tmp/audit-31d52e9e/verdicts.md`.

**Dual schema is not a finding.** The hand-written `inputSchema` next to the full Zod schema is recorded as a deliberate
convention: a compact advertisement to save tokens, with complete validation behind it. Items #43 and #50 touch it, and
both keep the advertised JSON byte-for-byte as it is today.

### P0 — broken today

- [x] 1. [OMN-329] `coerceBoolean()` turns `null`, `"null"`, `"unflag"`, `"off"` and every other unrecognized value into
     `true`, because it falls back to `return Boolean(strVal)`. It guards destructive write fields: `flagged: null`
     flags the task, and `clearDueDate: null` clears the due date. A required `coerceBoolean()` field that is missing
     also parses to `true` (`src/tools/schemas/coercion-helpers.ts:15-22`, `coerceBoolean`; used at
     `src/tools/unified/schemas/write-schema.ts:177,212-215,231`). Fix: return the raw value for anything that is not a
     recognized true/false token, so `z.boolean()` rejects it with VALIDATION_ERROR, and pin `null`, `"null"`,
     `"unflag"` and a missing key in a unit test. Related: `coerceNumber()` turns `null`, `""` and `true` into 0 or 1
     (Technique: Substitute Algorithm). Verified: `npx tsx` against `WriteSchema.safeParse` gives
     `{"flagged":null} -> {"flagged":true}` and `{"clearDueDate":null} -> {"clearDueDate":true}`; the independent
     verifier reported HOLDS.
- [x] 2. [OMN-330] A tasks `mode` is silently dropped whenever the filter targets the inbox.
     `const mode = compiled.filters.inInbox ? 'inbox' : compiled.mode`, and `project: null` compiles to `inInbox: true`
     (`QueryCompiler.ts:391-392`). So
     `{mode:'flagged'|'overdue'|'available'|'today'|'upcoming'|'blocked'|'smart_suggest', filters:{project:null}}`
     returns every active inbox task and reports `mode:'inbox'`, and countOnly is wrong the same way. `forecast_past` is
     the one exception: it is dispatched earlier (`src/tools/unified/OmniFocusReadTool.ts:245`, `buildTaskQuery`). Fix:
     keep `compiled.mode` for augmentation and pass the inbox routing to `buildListTasksScriptV4` as its own flag
     (Technique: Split Temporary Variable). Verified: `npx tsx /tmp/audit-31d52e9e/s3/mode-inbox.ts` shows the `flagged`
     predicate is `task.inInbox === true && … && task.project === null`, with no flagged term; the verifier reported
     HOLDS.
- [ ] 3. [OMN-331] Project filters ignore `id` everywhere except on the id-lookup fast path. `generateProjectFilterCode`
     emits nothing for `ProjectFilter.id`, and `isEmptyProjectFilter` ignores it. So
     `{type:'projects', filters:{id:'X'}, countOnly:true}` counts **all** projects, because count runs before the id
     short-circuit. And `filters:{status:'active', OR:[{id:'a'},{id:'b'}]}` returns every active project
     (`src/contracts/ast/filter-generator.ts:285-354,359-371`; `src/tools/unified/OmniFocusReadTool.ts:1028-1041`). Fix:
     emit `project.id.primaryKey === ${JSON.stringify(id)}` and include `id` in `isEmptyProjectFilter` (Technique:
     Substitute Algorithm). Verified: the tsx probe gives `predicate: true, isEmptyFilter: true` and
     `(project.status === Project.Status.Active) && ((true) || (true))`; the verifier reported HOLDS.
- [ ] 4. [OMN-332] Date-only read filters are parsed as UTC midnight, but writes treat the same string as local time.
     The emitter writes `new Date("2026-03-31")`, which is UTC, while the write path sends the same format through
     `localToUTC` (local time, due 17:00). In US Eastern, `between:["2026-03-01","2026-03-31"]` ends at Mar 30 20:00
     local. That excludes tasks due Mar 31 at 17:00, and `after:"2026-03-31"` includes Mar 30 evening
     (`src/contracts/ast/emitters/omnijs.ts:223-225`, `emitDateComparison`;
     `src/tools/unified/compilers/QueryCompiler.ts:497-542`, `transformDates` passes the string through raw). Fix: parse
     `YYYY-MM-DD[ HH:mm]` as local time in `transformDates`, turn date-only bounds into local-day instants (after means
     start of day, before means end of day), and emit ISO instants (Technique: Replace Data Value with Object).
     Verified: `TZ=America/Detroit node -e` gives `cutoff local: Mon Mar 30 2026 20:00`; the verifier reported HOLDS.
     Unverified at runtime in OmniJS: settled by an integration test with a task due at 17:00 local on the `between` end
     date. `tests/unit/contracts/ast/emitters/omnijs.test.ts:68` currently pins the raw form.
- [ ] 5. [OMN-333] A batch reports `success: true` when an update, complete or delete inside it fails. Handlers
     **return** `createErrorResponseV2` on script failure rather than throwing, and `runBatchFollowupPhases` pushes the
     returned value into `results.updated/completed/deleted`. Only a `catch` records into `results.errors`. The
     consequences:
     - Top-level `success: results.errors.length === 0` stays true.
     - `stopOnError` never halts.
     - `summary` counts the failure as done.
     - `extractOperationResult` drops the error message and emits `id:'unknown'`. It does the same for every successful
       project row, because it only reads `data.task`. Each failed row's own `success:false` survives
       (`src/tools/unified/OmniFocusWriteTool.ts:1582-1583,1535,1586`, `runBatchFollowupPhases`;
       `src/tools/unified/batch-response-flatten.ts:163-170`, `extractOperationResult`). Fix: treat a returned
       `success === false` as a failure at the one push site (record the phase, id and message in `errors`, and honor
       `stopOnError`), and teach `extractOperationResult` to read `data.project` and `error.message` (Technique:
       Consolidate Conditional Expression). Verified: `npx tsx /tmp/audit-31d52e9e/s2-flatten.ts` gives
       `{"topLevelSuccess":true,"flat":[{"operation":"update","success":false,"id":"unknown"}]}`; the verifier reported
       HOLDS.
- [ ] 6. [OMN-334] `task_velocity` splices `scope.dateRange.start/end` raw into the nested OmniJS program, for example
     `new Date('${startDateStr}T00:00:00')`. `VelocityScopeSchema` accepts any string, so a `'` rewrites the program
     inside OmniFocus. The documented `YYYY-MM-DD HH:mm` form, or any ISO datetime, becomes `Invalid Date`: then
     `numIntervals` is NaN, and the op returns `success` with every count at 0
     (`src/omnifocus/scripts/analytics/task-velocity-v3.ts:29-30,39-40,180-181`, `TASK_VELOCITY_SCRIPT_V3`;
     `src/tools/unified/schemas/analyze-schema.ts:24-33`, `VelocityScopeSchema`). Fix: add a `^\d{4}-\d{2}-\d{2}$` regex
     in the Zod schema, mirror it in the inputSchema description, and pass the values into the inner program as
     `JSON.stringify` literals (Technique: Introduce Assertion). Verified:
     `npx tsx /tmp/audit-31d52e9e/s1-velocity-probe.ts` gives `schema accepts injected start: true` and
     `HH:mm form -> Invalid Date`; `node -e` shows NaN intervals; the verifier reported HOLDS. See also #43.

### P1 — misleading today

- [ ] 7. [OMN-332] Date filter strings are the one read-side value that reaches generated OmniJS without
     `JSON.stringify`: `` `${accessor} ${operator} new Date("${dateStr}")` ``. `DateFilterSchema` is a bare
     `z.string()`, so `dueDate:{before:'2026-01-01") || true || ("'}` passes validation and turns the clause into
     `… || true`, inside a tool marked `readOnlyHint: true` (`src/contracts/ast/emitters/omnijs.ts:224`,
     `emitDateComparison`; `src/tools/unified/schemas/read-schema.ts:12-16`, `DateFilterSchema`). Fix:
     `new Date(${JSON.stringify(v)})` plus a format refinement, which falls out of #4 (Technique: Introduce Assertion).
     Verified: tsx probe `/tmp/audit-31d52e9e/s3/date-chain.ts`; fuzzing 10 hostile values across every other filter
     channel produced valid scripts; the verifier reported HOLDS.
- [ ] 8. [OMN-335] Three task paths sort or score only a page that was already capped in database order, while reporting
     `sort_applied: true`:
     - `buildInboxScript`, used by every `project:null` or `inInbox` read, stops at `limit` with no in-script sort, and
       the tool sorts that page afterwards.
     - `smart_suggest` scores only the first `limit` rows.
     - Mode default sorts (overdue/upcoming/today) run after the cap. So "top N by X" returns the wrong N
       (`src/contracts/ast/script-builder.ts:769-859`, `buildInboxScript`;
       `src/tools/unified/OmniFocusReadTool.ts:290-307,597-611`; `src/tools/tasks/task-query-pipeline.ts:400-449`,
       `scoreForSmartSuggest`). Fix: route inbox reads through `buildFilteredTasksScript`, which already sorts before it
       slices, and push mode default sorts and smart_suggest pre-selection into the script (Technique: Substitute
       Algorithm). Verified: tsx probe `/tmp/audit-31d52e9e/s3/inbox-sort.ts` gives
       `inbox | in-script sort: false | caps in loop: true`; the verifier reported HOLDS. OMN-305 (sort key vs `fields`)
       is a different bug; its fix would not fix this.
- [ ] 9. [OMN-336] `bulk_delete` of tasks runs only `cache.clear('tasks')`, a category no reader uses. Single delete
     invalidates analytics, projects and tags. After a bulk delete, `productivity_stats`, `overdue_analysis` and
     `workflow_analysis` serve pre-delete numbers for up to 1 h, and `projects includeStats` counts stay stale for up to
     5 min (`src/tools/unified/OmniFocusWriteTool.ts:1071`, `handleBulkDeleteTasks`, vs `:976-982`). Fix: one
     `invalidateAfterTaskDelete()` shared by both paths (Technique: Extract Function). Verified: read;
     `tests/unit/tools/unified/OmniFocusWriteTool.test.ts:601` pins only `clear('tasks')`; two slices found this
     independently, and the verifier reported HOLDS.
- [ ] 10. [OMN-336] No `omnifocus_write` path invalidates the `reviews` cache (3-min TTL). The only
      `invalidate('reviews')` calls are in the analyze tool's own review writes
      (`OmniFocusAnalyzeTool.ts:3794,3834,3902`), and `CacheManager.refreshForWorkflow` has no callers. Completing,
      dropping or deleting a project, or changing its `reviewInterval`, through `omnifocus_write` leaves it listed by
      `manage_reviews list_for_review` (`src/tools/unified/OmniFocusWriteTool.ts:1267,1310,1344,1448`; reader
      `OmniFocusAnalyzeTool.ts:3636-3638`). Fix: clear `reviews` inside `CacheManager.invalidateProject`, which every
      project write already calls (Technique: Move Function). Verified: read and grep; the verifier reported HOLDS.
- [ ] 11. [OMN-337] `system` diagnostics reports `health: 'healthy'` for the failures it exists to catch.
      `spawnDiagnostic` resolves any parsed JSON, including its own `{error:true,…}` "no document" and catch payloads,
      and SystemTool marks every non-throwing test `success:true`. The wrapper also embeds the script as
      `(() => { ${script} })()`, so an IIFE-expression script such as `buildListTasksScriptV4`'s yields `undefined`, and
      the result is still marked success (`src/omnifocus/DiagnosticOmniAutomation.ts:124,178-183,189-191,224-229`;
      `src/tools/system/SystemTool.ts:230-234,293-297,355-359,427-431,453-457,473-479`). Fix: run results through
      `detectKnownErrorShape` and mark those tests failed, and `return` the embedded script's value (Technique:
      Substitute Algorithm). Verified: a tsx/node eval of the wrapper gives `result undefined`, top-level keys
      `['diagnostics']`; the verifier reported HOLDS. `tests/unit/tools/system-v2.test.ts:145-160` mocks around it.
- [ ] 12. [OMN-338] The `pattern_analysis` scan (`fetchSlimmedData`) passes project root rows and dropped tasks to every
      task detector. Its task loop skips only `completed`, although the uncapped pass in the same function skips roots.
      The detectors inherit it:
      - `analyzeDeadlines` counts overdue projects and dropped tasks.
      - `clarify_candidates` lists project names.
      - WIP counts include each project's root.
      - waiting-for and bunching include dropped tasks. (`src/tools/unified/OmniFocusAnalyzeTool.ts:1470-1519`,
        `fetchSlimmedData`; detectors at 1357, 2085, 2187;
        `src/omnifocus/scripts/analytics/clarify-candidates-analyzer.ts:135`;
        `src/omnifocus/scripts/analytics/due-date-bunching-analyzer.ts:30`). Fix: at the scan, skip `task.project` rows,
        and skip `Task.Status.Dropped` unless `includeCompleted` is set (Technique: Consolidate Duplicate Conditional
        Fragments). Verified: independent read; the verifier reported HOLDS. Unverified at runtime: a text-assertion
        unit test on the emitted program, plus a live check that no `clarify_candidates` id is a project id.
- [ ] 13. [OMN-339] `workflow_analysis` counts dropped tasks, and tasks in dropped projects, as overdue, because its
      test is `dueDate && !completed`. That inflates `overdueTasks`, `overduePercentage`, `timeBuckets` and each
      project's `overdueRate`. It bypasses the `TERMINAL_STATUS_HELPER` that `productivity_stats` and `overdue_analysis`
      use, so the two ops disagree on "overdue" for the same database
      (`src/omnifocus/scripts/analytics/workflow-analysis-v3.ts:187,227-246,279-289`, `WORKFLOW_ANALYSIS_V3`). Fix:
      splice `TERMINAL_STATUS_HELPER` and gate on `!isTerminalStatus(task.taskStatus)` (Technique: Substitute
      Algorithm). Verified: read and grep; the verifier reported HOLDS. Note for OMN-110: an oracle that preserves
      current behavior would pin this bug.
- [ ] 14. [OMN-340] `overdue_analysis` builds `groupedAnalysis[*].count` and project-bottleneck counts from a sample
      capped at 100 and collected in database order (not the most overdue), while `summary.totalOverdue` is uncapped.
      The key findings ("critical: N", "Most overdue in X (n)") present sample counts as totals. The script's
      `tasksAnalyzed` is dropped by the handler
      (`src/omnifocus/scripts/analytics/analyze-overdue-v3.ts:185-186,331-350`;
      `src/tools/unified/OmniFocusAnalyzeTool.ts:967,1047-1054,1129-1137`). Fix: count urgency buckets and per-project
      totals uncapped in the script, cap only the task arrays, and surface `tasks_detailed`/`detail_capped` (Technique:
      Separate Query from Modifier). Verified: read; the verifier reported HOLDS. Unverified at runtime: a unit test
      with 150 mocked overdue rows asserting that the bucket counts sum to `totalOverdue`.
- [ ] 15. [OMN-341] `recurring_tasks {operation:'patterns'}` discards the script's computed `patterns[]` and ships
      placeholders (`patterns: {}`, `recurringTasks: []`, `byFrequency: {}`). Its project insight reads `.count`, but
      the script emits `recurringCount`, so it renders "Project X has the most recurring tasks (undefined)". The unit
      mock (`OmniFocusAnalyzeTool.test.ts:1035`) uses a shape the strict schema rejects, so it pins the bug
      (`src/tools/unified/OmniFocusAnalyzeTool.ts:2686-2693,2741-2744`;
      `src/omnifocus/scripts/recurring/get-recurring-patterns.ts:229-235`). Fix: pass `patterns` through, delete the
      placeholders, read `recurringCount` via `z.infer<typeof RecurringPatternsSchema>`, and bump the
      `recurring_patterns_` cache key (Technique: Remove Dead Code). Verified: read against
      `src/omnifocus/response-schemas/read.ts:548-576`; the verifier reported HOLDS.
- [ ] 16. [OMN-342] `parse_meeting_notes` (text mode) silently drops `* ` bullets. `isNonActionable` matches `/^\*+\s/`
      before `isListItem`, which treats `*` as a bullet, so "\* Call Sarah" lands in neither `tasks` nor `unparsed`.
      That breaks the OMN-123 contract that nothing silently vanishes
      (`src/tools/unified/OmniFocusAnalyzeTool.ts:3243,3367-3376`, `isNonActionable`; `:3303`, `isListItem`). Fix:
      delete the `/^\*+\s/` pattern, since headings are already covered by `/^#+\s/` (Technique: Remove Dead Code).
      Verified: `node -e` with the verbatim regexes; the verifier reported HOLDS.
- [ ] 17. [OMN-343] Task `update` accepts inputs and silently skips them while still reporting success:
      - The update date fields have no `DATE_REGEX` (create has it), and `sanitizeDateField` swallows the `localToUTC`
        throw.
      - `folder`, `reviewInterval` and `status: 'active'|'on_hold'` are accepted but not forwarded.
      - When nothing survives, the response is success with `updated:false`. The same bad date on project update throws,
        so the two targets disagree. Create is the same class: task create ignores `folder/status/reviewInterval`, and
        project create ignores `project/parentTaskId/estimatedMinutes/repetitionRule`. `RepetitionRule.endDate` is an
        unvalidated `z.string()` that is spliced into the RRULE
        (`src/tools/unified/schemas/write-schema.ts:46,174-176,209-235`;
        `src/tools/unified/utils/task-sanitizer.ts:41-48,129-132`;
        `src/tools/unified/OmniFocusWriteTool.ts:439-451,716-723,1234-1246,1428`;
        `src/contracts/ast/mutation/repetition.ts:50`). Fix: add `DATE_REGEX` to the update dates and `endDate`, and
        reject target-mismatched fields, either with per-target schema members or a refine that fails loudly (convention
        12). Needs a decision (Technique: Replace Conditional with Polymorphism). Verified:
        `s2-batchmax.ts`/`s2-sanit.ts` give `sanitizeTaskUpdates({status:'on_hold',folder:'X',reviewInterval:7}) -> {}`;
        the verifier reported MOSTLY HOLDS (`completed`/`dropped` status is forwarded). `task-sanitizer.test.ts:100-106`
        pins the silent date drop.
- [ ] 18. [OMN-344] `tag_manage merge` with `targetTag === tagName` removes the tag from every task, deletes it, and
      reports "merged". Source and target resolve to the same tag, `mergeRetag` skips the re-add because `_hasTgt` is
      true, and then `deleteObject(_src)` runs. Neither the schema nor `validateTagManageParams` rejects it
      (`src/contracts/ast/mutation/defs.ts:1233-1275`, `buildMergeTagsProgram`;
      `src/tools/unified/OmniFocusWriteTool.ts:2332-2380`). Fix: reject `tagName === targetTag`, and a target that
      descends from the source, at the tool (Technique: Introduce Assertion). Verified: tsx
      `/tmp/audit-31d52e9e/s2-merge.ts` shows both refs resolving via the same `find`; the verifier reported HOLDS.
      Unverified at runtime: the descendant-cascade variant (settled by a tag-paths integration test).
- [ ] 19. [OMN-345] An explicit `returnMapping: false` breaks same-batch tempId references. `executeBatchCreates`
      attaches `mapping` only when `returnMapping` is set, and the follow-up phases resolve ids only through that
      mapping. So an update with `id:'t1'` sends the raw tempId, gets "not found", and #5 then reports it as success
      (`src/tools/unified/OmniFocusWriteTool.ts:1581,1670,1735-1737,1909-1911`). Fix: always carry
      `resolver.getMappings()` internally, and apply `returnMapping` only to the response (Technique: Separate Query
      from Modifier). Verified: read; the verifier reported HOLDS (the default is `true`). Unverified at runtime: a unit
      test with `returnMapping:false`, a create `t1` and an update `t1`.
- [ ] 20. [OMN-346] The `omnifocus_write` description states three things the code does not do:
      - "planned=8am", but `localToUTC` uses 12:00.
      - "Batch supports up to 100 operations", but `operations` has no min or max; 0, 101 and 500 all parse.
      - The bulk-delete dry-run note says invalid ids "fail silently", but execution reports a per-item "Task not
        found". (`src/tools/unified/OmniFocusWriteTool.ts:200,208,2617`; `src/utils/timezone.ts:106-108`;
        `src/tools/unified/schemas/write-schema.ts:351`; `src/contracts/ast/mutation/emitter.ts:345-347`). Fix: correct
        the text, and add `.min(1).max(100)` to `operations` in both schemas (Technique: Rename Method, i.e. make the
        text true). Verified: `TZ=America/Detroit npx tsx s2-tz.ts` gives `local hour = 12`; the `safeParse` probes
        accept 0 and 150 operations; the verifier reported HOLDS.
- [ ] 21. [OMN-347] In HTTP mode, a POST with an unknown or expired `mcp-session-id` creates a new, uninitialized
      session (a full `Server` with all tools registered) instead of returning 404. The SDK then answers 400 "Server not
      initialized", which clients don't treat as a signal to re-initialize, so they never recover after the 30-min idle
      cleanup. Each such POST leaks another session until timeout. GET and DELETE already return 404
      (`src/http-server.ts:253-261`, `handleMcpPostRequest`). Fix: create a session only when there is no id **and** the
      body `isInitializeRequest`; return 404 for an unknown id (Technique: Consolidate Conditional Expression).
      Verified: read, plus SDK `webStandardStreamableHttp.js:578`; the verifier reported HOLDS. Unverified at runtime: a
      unit test driving `handleRequest` with an unknown id that asserts 404 and `getSessionCount()===0`.
- [ ] 22. [OMN-348] The logger drops the context arguments its callers pass. `info`/`warn` discard `...args`, and
      `error` keeps only an `Error`'s `.message` unless `STRUCTURED_LOGGING=true`. So
      `uncaughtException`/`unhandledRejection` log only their headline, with no stack or reason, and about 50
      `logger.*('…', {…})` sites lose their payload (`src/utils/logger.ts:129-157`, `createLogger`;
      `src/index.ts:31-44`). The info-level drop is test-pinned as deliberate (`tests/unit/utils/logger.test.ts:25-32`).
      Fix: have `error`/`warn` append `redactArgs(args)`, which already scrubs names and notes, or format at the call
      sites. Needs a decision: privacy vs debuggability (Technique: Change Function Declaration). Verified: tsx against
      `createLogger` prints `[ERROR] [server] Uncaught exception (server continuing):` with nothing after it; the
      verifier reported HOLDS.

### P2 — inconsistent or costly to change

- [ ] 23. [OMN-336] Remaining write→stale-read cache paths, beyond #9 and #10:
      - Single-item project update calls only `invalidateProject`, so a status change to done or dropped leaves
        `analytics` stale for 1 h, and tags created by `tags/addTags` leave `tags` stale for 10 min. The batch route
        does invalidate analytics.
      - Project create invalidates only `projects`.
      - Task complete, and task update without a string `project` (including a move to inbox), never invalidate
        `projects`, so `includeStats` `taskCounts`/`nextTask` stay stale for 5 min.
      - `tag_manage` rename/delete/merge leaves project rows with old tag names, and analytics tag stats stale.
        (`src/tools/unified/OmniFocusWriteTool.ts:818-824,916-920,1267,1448,2449-2455`;
        `src/cache/CacheManager.ts:260-355`). Fix: one declarative write-to-category map used by every handler. Needs a
        decision: invalidate projects on every task write, or stop caching `includeStats` rows (Technique: Consolidate
        Duplicate Conditional Fragments). Verified: read; the verifier reported HOLDS.
- [ ] 24. [OMN-349] `CacheWarmer` fills entries that no reader ever hits, while every tool call waits for it behind the
      OMN-228 startup gate:
      - The `tasks:*` entries: no tool reads that category.
      - `tasks:perspectives_list`: the perspectives path doesn't cache.
      - `projects:projects_active`: the reader key is `projects_list_{json}`, and the shape differs (array vs
        `{projects,totalMatched}`).
      - The warmed tags key has a 4th flag of `false`; the reader's is `true`, and it stores a full response.
        (`src/cache/CacheWarmer.ts:194-200,229,303,370`; readers `src/tools/unified/OmniFocusReadTool.ts:1065,1240`).
        Fix: delete the MCP-cache population (`CacheWarmer`, `warm-task-caches.ts`, `warm-projects-cache.ts`, plus
        `CacheManager`'s `tasks` category, `invalidateTaskQueries`, `refreshForWorkflow` and `warm`), or keep one cheap
        OmniFocus-side warm probe if the app warm-up is the real value. Needs a decision (Technique: Remove Dead Code).
        Verified: grep of every `cache.get` in `src`; two slices found this independently, and the verifier reported
        HOLDS.
- [ ] 25. [OMN-350] `productivity_stats.tagStats` is probably always `{}`. The script reads `tag.availableTaskCount` and
      `tag.remainingTaskCount` inside OmniJS, but these are declared only in the hand-written
      `OmniFocus-extensions.d.ts:49,55` (JXA-probed), not on `Tag` in the vendor 4.9 export. The analogous project
      `*Count` properties were live-probed as undefined in OmniJS. `|| 0` masks the miss
      (`src/omnifocus/scripts/analytics/productivity-stats-v3.ts:240-249`). Fix: use `tag.availableTasks.length` and
      `tag.remainingTasks.length` (Technique: Substitute Algorithm). Needs verification: the verifier reported
      UNCERTAIN, so this was demoted from P1. Unverified at runtime: settled by a live `/verify` of `productivity_stats`
      checking that `stats.tagStats` is non-empty.
- [ ] 26. [OMN-351] Analyze date keys use UTC calendar dates, so local-evening results shift by one day.
      - The `task_velocity` default window is `toISOString().split('T')[0]`, which the script parses as local midnight.
        In US evenings the window slides one day forward, and it is part of the cache key.
      - Due-date bunching keys are cut from `toISOString()`, so a 17:00 PDT due date buckets onto the next day.
        (`src/tools/unified/OmniFocusAnalyzeTool.ts:786-790,2104`;
        `src/omnifocus/scripts/analytics/due-date-bunching-analyzer.ts:36`). Fix: one shared local `YYYY-MM-DD`
        formatter (Technique: Extract Function). Verified: `TZ=America/New_York` and `TZ=America/Los_Angeles` `node -e`
        probes; the verifier reported HOLDS.
- [ ] 27. [OMN-340] Analyze ops cap or truncate silently in three places:
      - `pattern_analysis` scans `Math.min(flattenedTasks.length, 3000)` **raw** rows, with completed, dropped and root
        rows using up the budget, and no capped flag.
      - `list_for_review` stops at 100 in database order and sorts afterwards, so the most overdue reviews can be
        dropped, and `review_summary` counts the truncated list.
      - The script-side `tasksAnalyzed` from #14 is never surfaced.
        (`src/tools/unified/OmniFocusAnalyzeTool.ts:1173,1437-1473,1316-1323,3635-3744`;
        `src/omnifocus/scripts/reviews/projects-for-review.ts:51,108-109,176-180`). Fix: count admitted rows against the
        cap, collect then sort then slice, and emit `capped`/`scanned_total` the way `clarify_candidates` does
        (Technique: Split Loop). Verified: read; the verifier reported HOLDS.
- [ ] 28. [OMN-352] Analytics aggregates are keyed by project **name**, and OmniFocus allows duplicate names:
      - `productivity_stats.projectStats[name]` overwrites, so one project's stats are lost.
      - The workflow and overdue maps merge same-named projects.
      - Overdue bottlenecks drop a real project named "Inbox".
        (`src/omnifocus/scripts/analytics/productivity-stats-v3.ts:191,216`;
        `src/omnifocus/scripts/analytics/workflow-analysis-v3.ts:253,293-336`;
        `src/omnifocus/scripts/analytics/analyze-overdue-v3.ts:81,197-198`;
        `src/omnifocus/scripts/recurring/get-recurring-patterns.ts:199-210`). Fix: key by `project.id.primaryKey` and
        carry `name`, with cache-key bumps. This is a wire change, so it needs a decision (Technique: Replace Data Value
        with Object). Verified: read; the verifier reported HOLDS.
- [ ] 29. [OMN-353] `productivity_stats` ships hardcoded placeholders `stats.daily: []` and `stats.weekly: {}` that
      nothing computes. This is the class OMN-289 deleted from `task_velocity`. `wip_limits` passes `sequential: false`
      for every project although the scan fills `ProjectData.sequential`, so the analyzer's sequential branch is dead
      and the reported field is fabricated; the numeric effect may be small, because blocked tasks are already excluded
      (`src/tools/unified/OmniFocusAnalyzeTool.ts:571-572,1356`;
      `src/omnifocus/scripts/analytics/wip-limits-analyzer.ts:52-58`). Fix: delete the placeholders (bump to
      `productivity_v4_`), and pass `project.sequential === true` (Technique: Remove Dead Code / Replace Magic Literal).
      Verified: read and grep; the verifier reported HOLDS.
- [ ] 30. [OMN-354] Tasks `id` combined with other filters behaves three ways:
      - The row path ignores the other filters and returns the task, even when it is completed.
      - countOnly ANDs the other filters with the completed/dropped defaults, so the count can be 0 for the row
        returned.
      - Projects reject `id` plus anything else loudly. (`src/tools/unified/OmniFocusReadTool.ts:555-562`;
        `src/contracts/ast/script-builder.ts:881,1803-1855`;
        `src/tools/unified/compilers/transform-project-filters.ts:148-154`). Fix: apply the projects exclusivity rule in
        `QueryCompiler`. Needs a decision: reject or ignore, but do it consistently (Technique: Introduce Assertion).
        Verified: tsx probe `/tmp/audit-31d52e9e/s3/id-paths.ts`; the verifier reported HOLDS.
- [ ] 31. [OMN-354] `limit`/`offset` mean different things per query type. Perspectives accept both, and the handler
      never reads them, so results are silently unpaginated. Defaults are 25 for tasks and projects, 100 for folders,
      and unbounded for tags, while the description says "default limit: 25"
      (`src/tools/unified/OmniFocusReadTool.ts:244,378,1014,1231-1235,1314-1368,1408`;
      `src/tools/unified/schemas/read-schema.ts:350-355`). Fix: omit `limit`/`offset` from `PerspectiveQuerySchema` and
      from the inputSchema variant, and state the per-type defaults (Technique: Remove Parameter). Verified: tsx parse
      and compile, plus read; the verifier reported HOLDS.
- [ ] 32. [OMN-354] `filters.folder` means a `:`/`/` subtree path with NOT_FOUND on tasks and projects, but a
      direct-parent **name substring** with no NOT_FOUND on folders queries. So `folder:"Personal/Bills"`, copied from a
      folders result, silently returns nothing (`src/tools/unified/compilers/reject-filters.ts:153-159`,
      `transformFolderFilters`; `src/contracts/ast/filter-generator.ts:441-443`). Fix: reuse `parseFolderFilterPath` /
      `emitFolderChainPredicate` against `folder.parent`. Needs a decision, because the current behavior is described
      (Technique: Substitute Algorithm). Verified: tsx probe; the verifier reported HOLDS.
- [ ] 33. [OMN-354] A bare projects query (`filters:{}`) returns done and dropped projects, while bare tasks queries
      exclude completed and dropped. This is test-pinned as "bare browse unchanged"
      (`transform-project-filters.test.ts:106`) but undocumented in the tool description
      (`src/tools/unified/compilers/transform-project-filters.ts:160-161,228-248`). Fix: default to
      `status:['active','onHold']`, or document the asymmetry. Needs a decision (Technique: Introduce Assertion).
      Verified: tsx `transformProjectFilters({}) -> {}`; the verifier reported HOLDS.
- [ ] 34. [OMN-355] `createTaskResponseV2` computes the summary (`key_insights`, `preview`, breakdown) over the full
      list **before** `truncateResponse` halves it. The summary then headlines overdue tasks and preview ids that are
      not in `data.tasks`, and no next offset is emitted, so a caller paging `offset += limit` skips the dropped half
      (`src/utils/response-format.ts:710-753`). Fix: truncate first, then summarize, and emit
      `next_offset = offset + returned_count` (Technique: Slide Statements). Verified: a tsx probe with 200 tasks gives
      `preview [t153,t162,t171] inData [false,false,false]`; the verifier reported HOLDS.
- [ ] 35. [OMN-347] HTTP shutdown and pending-operation tracking diverge from stdio:
      - `new SessionManager()` calls `setPendingOperationsTracker` with its own private set, replacing the tracker from
        `index.ts:60`. From then on, osascript and tool promises go into a set nothing drains.
      - HTTP `gracefulShutdown` awaits no pending operations, and has no `exitCommitted` guard or bounded force-exit.
      - `stop()` runs before `closeAllSessions()`, so an open SSE GET can block shutdown.
      - The `new Server({…},{capabilities})` construction is copied in two places.
        (`src/session-manager.ts:44-50,105-119`; `src/index.ts:60,186-200,401-422`). Fix: pass one tracker into
        `SessionManager`, share a `drainAndExit()` between modes, close sessions first, and extract `createMcpServer()`
        (Technique: Extract Function). Verified: read; the verifier reported HOLDS. Unverified at runtime: a unit test
        asserting the tracker survives `SessionManager` construction.
- [ ] 36. [OMN-356] HTTP transport defaults contradict the MCP transport-security guidance:
      - The default bind is `0.0.0.0`, and auth is optional.
      - No `allowedHosts`/`allowedOrigins`/DNS-rebinding protection is configured (the SDK default is off), and CORS
        answers `*`.
      - `GET /sessions` returns every live session id, and it is open when no token is set.
      - The token comparison uses `===`. HTTP mode is off by default (`src/utils/cli.ts:19,21,106-112`;
        `src/session-manager.ts:91-100,283,289-303`; `src/http-server.ts:167-176,380-398`). Fix: default the host to
        `127.0.0.1`, enable DNS-rebinding protection, return a count rather than ids, and use `crypto.timingSafeEqual`.
        Needs a decision (Technique: Introduce Parameter Object for the security options). Verified: read, plus SDK
        `webStandardStreamableHttp.js:70`; the verifier reported HOLDS.
- [ ] 37. [OMN-348] `.finally()` derived promises are never handled, so rejections surface as spurious "Unhandled
      promise rejection" logs, with no reason attached (see #22). At the OmniAutomation layer this fires for every
      rejected script promise. At the tool layer it fires for thrown errors (Zod VALIDATION_ERROR and McpError);
      returned error envelopes don't trigger it (`src/omnifocus/OmniAutomation.ts:151-155`;
      `src/tools/index.ts:182-185`). Fix: `p.then(cleanup, cleanup)` (Technique: Substitute Algorithm). Verified:
      `node -e` gives `caller handled: tool failed` followed by `UNHANDLED: tool failed`; the verifier reported PARTLY
      HOLDS, and the scope is reworded to match.
- [ ] 38. [OMN-357] MCP `prompts/get` arguments are strings (SDK `types.js:990`, `z.record(z.string(), z.string())`),
      but seven prompt flags compare against boolean literals:
      - `eisenhower-matrix.ts:27-29`
      - `InboxProcessingPrompt.ts:34-36`
      - `WeeklyReviewPrompt.ts:29` So `"true"` never enables an opt-in flag, `"false"` never disables a default-on one,
        and `InboxProcessingPrompt`'s `quick_mode` branch (`:38-75`) is unreachable (all in `src/prompts/gtd/`). Fix:
        one `parsePromptBool(raw, default)` in `src/prompts/base.ts` that throws `PromptArgumentError` on bad input, the
        way `GuidedReviewPrompt.parseMode` already does (Technique: Extract Function). Verified: read, plus the SDK
        schema; the verifier reported HOLDS.
- [ ] 39. [OMN-358] `system` accepts inputs it ignores, and reports a wrong TTL:
      - `testScript` is advertised as "Optional custom script to test" and accepts any string, but only `'list_tasks'`
        has an effect; anything else is only echoed back.
      - Cache stats hardcode `tasks: '30 seconds TTL'`, while `CacheManager` uses 300 s.
        (`src/tools/system/SystemTool.ts:32-36,131-134,442,474,580`; `src/cache/CacheManager.ts:21`). Fix: make
        `testScript` `z.enum(['list_tasks'])` in both schemas, and render the TTLs from `CacheManager` config
        (Technique: Replace Magic Literal). Verified: read; the verifier reported HOLDS.
- [ ] 40. [OMN-359] A thrown non-Zod, non-McpError error writes **two** failure-log entries: `handleExecuteError` logs,
      then `handleErrorV2` logs again with `inputArgs: {}`. The weekly diagnose-failures job therefore double-counts
      thrown failures, and half the entries have no inputs (`src/tools/base.ts:245,248,615`). Fix: skip the second log
      on this path (Technique: Remove Duplicate). Verified: read; the verifier reported HOLDS.
      `tests/unit/tools/base-failure-routing.test.ts:187-202` counts metrics, not log writes.
- [ ] 41. [OMN-342] `parse_meeting_notes` date suggestions compute wrong absolute dates:
      - `getEndOfMonth` runs `setMonth(+1)` before `setDate(0)`, so on the 29th–31st, when the next month is shorter,
        "end of month" and "next month" overflow (Jan 31 gives Feb 28 and Mar 31).
      - Month-name and slash dates always use the current year, even when that date has passed.
      - The slash regex matches fractions: "Buy 1/2 gallon milk" gets a due date of Jan 2.
        (`src/tools/capture/date-extraction.ts:222-227,244-245,276-277`; consumed at `OmniFocusAnalyzeTool.ts:3447`).
        Fix: `new Date(y, m+1, 0)`, roll to next year when the date is in the past, and require date context for slash
        dates (Technique: Substitute Algorithm). Verified: tsx with a pinned clock; the verifier reported HOLDS. These
        are arithmetic bugs, distinct from the tracked relative-date resolution item.
- [ ] 42. [OMN-345] Atomic batch rollback deletes in reverse **input** order, not reverse creation order, despite the
      docstring "children first". With the default `createSequentially:true`, a child listed before its parent gets its
      parent deleted first. The child then returns "not found", and the response falsely reports `rolledBack:'partial'`
      plus an ORPHANED error (`src/tools/unified/OmniFocusWriteTool.ts:1838-1843,2284-2299`;
      `src/tools/unified/utils/tempid-resolver.ts:95-109`). Fix: iterate the creation order in reverse (Technique:
      Substitute Algorithm). Verified: tsx with the real `DependencyGraph`/`TempIdResolver` gives
      `rollback delete order [ 'p', 'c' ]`; the verifier reported HOLDS. Unverified at runtime: the cascade-delete step
      (settled by an integration test with `atomicOperation:true`).
- [ ] 43. [OMN-334] `OmniAutomation.buildScript` substitutes values with a **string** replacement, so `$&`, `` $` ``,
      `$'` and `$$` inside a JSON-serialized value are expanded as replacement patterns: `a$$b` becomes `a$b`, and
      `x$'y` splices template text into the literal. `task_velocity`'s `dateRange` (#6) is the only caller that passes
      user strings today (`src/omnifocus/OmniAutomation.ts:322-337`, `buildScript`). Fix:
      `script.replace(re, () => replacement)` (Technique: Substitute Algorithm). Verified: the `node -e` probe
      reproduces all four cases; the verifier reported HOLDS.
- [ ] 44. [OMN-359] An osascript killed by the spawn timeout rejects with "Script execution failed with code null",
      because the `close` handler ignores `signal`. It is then classified INTERNAL_ERROR (via `executeJson`) or
      OMNIFOCUS_ERROR (if thrown), never SCRIPT_TIMEOUT. Callers lose the timeout advice, and diagnose-failures'
      `IGNORE_SET` never filters these (`src/omnifocus/OmniAutomation.ts:185-196`;
      `src/omnifocus/DiagnosticOmniAutomation.ts:77-89`; `src/diagnostics/clustering.ts:68-74`). Fix: read
      `(code, signal)` and emit a "timed out" message (Technique: Replace Magic Literal). Verified: tsx
      `categorizeError`; the verifier reported PARTLY HOLDS on the category. Unverified at runtime: an
      `OmniAutomation.test.ts` case that emits `close(null,'SIGTERM')`.
- [ ] 45. [OMN-360] The dual-schema drift check compares only top-level properties under the wrapper key, so it cannot
      see drift in the parts that matter most. Nested `filters`/`data`/`changes` collapse to `{type:'object'}`,
      one-sided enums are skipped, and types are never compared. Enum drift in `filters.status` passes green
      (`src/diagnostics/schema-drift.ts:40-42,89-98,114-128,185-188`, `diffSchemas`). This is about the gate that
      enforces convention #1, not the design: the compact advertisement stays. Fix: recurse with dotted paths, and flag
      one-sided enums, with an allowlist for the intentional compact-advertisement omissions. Needs a decision on the
      allowlist (Technique: Replace Function with Command). Verified: the tsx probe returns `[]` for injected nested
      drift; the verifier reported HOLDS.
- [ ] 46. [OMN-360] Two custom lint rules have holes that let their target violation through:
      - `no-whose-where` inspects only TS `CallExpression`s, but every script under `src/omnifocus/scripts/` is text
        inside template literals, and `src/contracts/ast/` is outside its path gate.
      - `use-standard-response`/`use-handle-error` engage only when the return annotation mentions `StandardResponse`,
        so the 43 `Promise<unknown>` handlers are exempt. `routeToBatch` returns a hand-built literal envelope.
        (`eslint-rules/index.js:83-86,125-128,270-279`;
        `src/tools/unified/OmniFocusWriteTool.ts:1496,1534-1554,764-771`). Fix: scan `TemplateLiteral` quasis for
        `/\.(whose|where)\s*\(/` and widen the gate; key the response rules on file plus return shape, or annotate the
        handlers (Technique: Substitute Algorithm). Verified: ESLint `Linter` probe gives
        `template-literal script: 0 messages`; the verifier reported HOLDS.
- [ ] 47. [OMN-361] The test-mode sandbox guard spawns `osascript` through `execAsync`, bypassing `runSerialized`
      (convention 17). `Promise.all` fans it out, so a guarded 100-id `bulk_delete` can start 100 concurrent osascripts,
      the OMN-320 contention class. It also interpolates ids raw into script text. It runs only when `NODE_ENV=test` and
      `SANDBOX_GUARD_ENABLED=true` (`src/contracts/ast/mutation-script-builder.ts:50-53,79-91,184,243`;
      `src/contracts/ast/mutation/defs.ts:1692,1741,1766`). Fix: route through `runSerialized` and pass ids through
      `JSON.stringify` (Technique: Substitute Algorithm). Verified: read and grep; the verifier reported HOLDS.
      Unverified at runtime: a guarded bulk-delete integration run watching the process count.
- [ ] 48. [OMN-361] The sandbox guard doesn't check move destinations. `update/task` validates the target, but not
      `changes.project`/`changes.parentTaskId`, and `update/project` doesn't validate `changes.folder`. An integration
      test can move a sandboxed item into live data, where folder-scoped cleanup won't find it
      (`src/contracts/ast/mutation/defs.ts:1659-1672`). Fix: validate destinations fail-closed (Technique: Introduce
      Assertion). Verified: read; the verifier reported HOLDS. Unverified at runtime: a unit test with `isTestMode`
      mocked, asserting that a move to a live project throws.
- [ ] 49. [OMN-343] `minimalResponse` is accepted on create and complete and compiled through, but only task update
      reads it, and that one honored path returns a hand-built literal without `metadata`
      (`src/tools/unified/schemas/write-schema.ts:301,334`; `src/tools/unified/compilers/MutationCompiler.ts:130,167`;
      `src/tools/unified/OmniFocusWriteTool.ts:710,763-772`). Fix: remove it from the create and complete members (Zod
      and inputSchema), or implement it everywhere. Needs a decision (Technique: Remove Parameter). Verified: grep; the
      verifier reported HOLDS.
- [ ] 50. [OMN-343] `reviewInterval` object form accepts any `unit` and maps unknown units to 1 day (`?? 1`), so
      `{steps:1, unit:'quarter'}` sets a **daily** review, and `fortnight` also becomes 1. The description lists only
      days/weeks/months/years (`src/tools/unified/schemas/write-schema.ts:74-88`). Fix: a closed, case-insensitive enum
      of the `UNIT_TO_DAYS` keys (Technique: Replace Type Code with Subclasses/enum). Verified: tsx
      `WriteSchema.safeParse` gives `quarter -> 1`; the verifier reported HOLDS.
- [ ] 51. [OMN-362] The write field set is hand-copied in two redundant places:
      - `MutationCompiler` redeclares `CreateData`/`UpdateChanges`/`BatchOperation` (the Zod output types) and casts
        into them, with no `SameKeys` guard (4 casts).
      - `task-sanitizer.ts` is a second per-field allowlist that re-implements Zod coercion, and it is where #17's drops
        happen. Every new write field touches both, on top of the necessary layers
        (`src/tools/unified/compilers/MutationCompiler.ts:4-58,129,136,149,199`;
        `src/tools/unified/utils/task-sanitizer.ts:77-135`). This is internal duplication, not the advertised
        inputSchema. Co-change: 3aef0a43, 8b8d4e64, 43d5c689, 9e99b316, 1790bac0, b63f309b, c90ff684, 1f2199a3. Fix: use
        `z.infer<typeof …Schema>`, and shrink the sanitizer to date conversion only (Technique: Remove Middle Man).
        Verified: read and git log; the verifier reported HOLDS.
- [ ] 52. [OMN-363] Two tests in `OmniFocusWriteTool.test.ts` cannot fail:
      - `:334` "returns error when taskId is missing" asserts only `toBeDefined()` inside a `catch`.
      - `:1942` "rejects invalid date format in create" puts its assertion inside a `try` whose `catch` swallows the
        AssertionError. And `tests/unit/utils/response-format-utilities.test.ts:628` "should detect stalled projects"
        asserts only `bottlenecks` `toBeDefined()`, which is always true. Deleting the stalled branch
        (`src/utils/response-format.ts:404-417`) fails no test. Fix: `await expect(...).rejects.toThrow(...)`, the
        pattern already at `:772`, and assert the stalled message (Technique: Substitute Algorithm). Verified: read,
        plus vitest runs; the verifier reported HOLDS.

### P3 — polish, duplication, dead code

#### Dead code

- [ ] 53. Nine test-support modules (2,322 lines) are never imported, run or referenced:
      - `tests/support/`: `environment.ts`, `error-filtering.ts`, `test-factories.ts`, `generate-test-report.ts`,
        `simple-gherkin-test.ts`.
      - `tests/utils/`: `mock-factories.ts`, `schema-helpers.ts`, `test-cleanup.ts`.
      - `tests/integration/helpers/test-write-client.ts`. Several are stale: `environment.ts:77,84` negates a Promise in
        `skipIf`, `error-filtering.ts` references a deleted module, and `simple-gherkin-test.ts` calls pre-unified
        tools. `tests/TESTING_GUIDE.md:30,54,73,221` still tells contributors to use them against a `ManageFolderTool`
        that no longer exists. Fix: delete them, and rewrite or remove those guide sections. Needs a decision on the
        guide (Technique: Remove Dead Code). Verified: knip plus per-name grep across
        `src tests scripts eslint-rules docs package.json vitest.config.ts`; the verifier reported HOLDS.
- [ ] 54. `tests/support/claude-code-mcp.ts` and `tests/support/gherkin-test-runner.ts` call tool names the server
      doesn't register (`list_tasks`, `todays_agenda`, `create_task`, …), so every scenario can only fail. No npm script
      runs them. They survive only through transport-level unit tests, and their write steps spawn without
      `SANDBOX_GUARD_ENABLED` (`claude-code-mcp.ts:65-86,104`; `gherkin-test-runner.ts:101,222-291,447-496`). Fix:
      delete both, along with `tests/unit/support/{claude-code-mcp,gherkin-test-runner}.test.ts`, or port them to the
      unified tools with the guard on. Needs a decision (Technique: Remove Dead Code). Verified: read and grep; the
      verifier reported HOLDS.
- [ ] 55. Dead helpers and vestiges in live test modules:
      - `createMockOmni` (`tests/support/setup-unit.ts:12`, loaded in every unit worker).
      - `isProjectInSandbox` (`tests/integration/helpers/sandbox-manager.ts:175`, which also interpolates the id raw).
      - `getSharedClientSync` (`tests/integration/helpers/shared-server.ts:683`).
      - `isCurrentRunName`/`isCurrentRunTagName` (`tests/integration/helpers/run-id.ts:120,127`), called only by their
        own tests.
      - `thoroughCleanup()`, which is behaviorally identical to `quickCleanup()` apart from log text, while 13 call
        sites choose it (`tests/integration/helpers/mcp-test-client.ts:302,357`). The comments at
        `mcp-test-client.ts:11-14,203-204,240-241` promise a "runId-scoped teardown" that doesn't exist. The tags
        themselves do feed the `__test-` prefix sweep. Fix: delete the helpers, fold `thoroughCleanup` into
        `quickCleanup`, and correct the comments (Technique: Remove Dead Code / Inline Function). Verified: grep; the
        verifier reported HOLDS on the dead helpers and PARTLY REFUTED that the tags are unused, so the item was
        reworded.
- [ ] 56. `src/contracts/index.ts` is an unimported barrel, and every runtime export of `src/contracts/responses.ts` is
      dead (`isScriptError`, `isTaskListOutput`, `isProjectListOutput`, `buildSuccessResponse`, `buildErrorResponse`,
      `unwrapScriptOutput`, at `:195-335`). Its `isScriptError` tests `error === true`, the **opposite** discriminant to
      the live one in `src/omnifocus/script-result-types.ts:60`. An auto-import of the wrong one would silently treat
      errors as success. `docs/dev/LESSONS_LEARNED.md:212` still recommends the dead `unwrapScriptOutput()`. Fix: move
      `RepetitionRuleData` (the only live import, `src/omnifocus/types.ts:5`) into `types.ts`, delete both files, and
      fix the doc line (Technique: Remove Dead Code). Verified: knip plus grep; the verifier reported HOLDS. Not in
      OMN-94's list.
- [ ] 57. `src/contracts/ast/index.ts` has zero importers. It keeps alive five filter-generator exports used only by
      tests: `generateFilterFunction`, `generateFilterBlock`, `generateFilterCodeSafe`, `describeFilter` and
      `isEmptyFilter` (`src/contracts/ast/filter-generator.ts:135-250`). `describeFilter`'s vocabulary has drifted from
      the live `describeFilterForScript`. The re-export at `src/omnifocus/scripts/tasks/list-tasks-ast.ts:136` has no
      consumer. Fix: delete the barrel, then its test-only dependents (Technique: Remove Dead Code). Verified: grep; the
      verifier reported HOLDS.
- [ ] 58. Nine interfaces in `src/omnifocus/script-response-types.ts` are imported nowhere and contradict the live
      shapes: `TaskData`, `StatsOverview`, `ProjectStats`, `TagStats`, `ProductivityStatsData` (still has
      `healthScore`), `Pattern`, `Bottleneck`, `WorkflowAnalysisData` and `TaskOperationResult` (`:7-101,125-144`).
      `ReviewProjectData` and `RepeatRule` stay, because live types use them. Fix: Remove Dead Code. Verified: knip plus
      grep; the verifier reported HOLDS (9 of 11 dead).
- [ ] 59. The circuit breaker and error-recovery path does nothing. Needs a decision (delete, or give it process scope
      and gate on it).
      - `withCorrelation()` builds a fresh tool, and so a fresh `CircuitBreaker`, on every call, so failures never
        accumulate.
      - The breaker never blocks: `CircuitBreaker.execute` has no callers, and the open-circuit branch only logs.
      - `classifyErrorWithContext` is always passed a string, so it always returns "An unknown error occurred".
      - `executeWithRetry`, `createEnhancedErrorResponse` and `throwMcpError` have no `src` callers.
        (`src/tools/index.ts:132-134`; `src/tools/base.ts:69-83,371-375,388,465,569-599,650`;
        `src/utils/circuit-breaker.ts`; `src/utils/error-recovery.ts:41-45`). Fix: Remove Dead Code / Collapse
        Speculative Generality. Verified: tsx `classifyErrorWithContext(...)` gives
        `["An unknown error occurred","Please try again"]`; the verifier reported HOLDS.
- [ ] 60. Unreachable write-path code:
      - `DependencyGraph.getChildren` (`src/tools/unified/utils/dependency-graph.ts:174-183`).
      - `TempIdResolver.has`/`isResolved` (`src/tools/unified/utils/tempid-resolver.ts:80-90`).
      - `getCreationOrder`'s cycle throw (`:95-97`); the constructor already validates.
      - The operation-level `tempId` lift (`src/tools/unified/OmniFocusWriteTool.ts:1652-1660`); the strict schema
        rejects the key.
      - The sanitizer's `projectId`/`completionDate` branches (`task-sanitizer.ts:93,105`); unit tests exercise them
        directly, but they are unreachable in production. Fix: Remove Dead Code. Verified: tsx strict-schema probes plus
        grep; the verifier reported HOLDS.

#### Duplicates to remove

- [ ] 61. The same `CacheManager` mock (8 `vi.fn()` members) is copied into five unit files:
      - `OmniFocusWriteTool.test.ts:15`
      - `omn-245-project-note-truncation.test.ts:18`
      - `omn-244-task-note-truncation.test.ts:21`
      - `batch-response-shape.test.ts:473`
      - `write-dry-run.test.ts:11` There are also `StubCache` near-copies in `batch-mixed-operations.test.ts` and
        `batch-create-project-field.test.ts`, and `mockFastPathCreate` is defined twice in `OmniFocusWriteTool.test.ts`
        (`:29`, `:1378`). Any new invalidation method has to be added to every copy. Fix: one `createMockCacheManager()`
        in `tests/unit/helpers/` (Technique: Extract Function). Verified: grep; the verifier reported HOLDS.
- [ ] 62. Two families of duplicated test helpers:
      - `extractOmniJsProgram` is copied in `tests/unit/contracts/ast/mutation-script-builder.test.ts:23` and
        `project-update-field-coverage.test.ts:27`, next to the shared `recoverInnerProgram`
        (`tests/utils/recover-bridge-program.ts:58`).
      - The vm `runScript` harness is byte-identical in
        `tests/unit/contracts/ast/mutation/set-review-schedule.test.ts:56` and `mark-reviewed-batch.test.ts:55`, with
        near-copies at `mark-reviewed.test.ts:62` and `run-analytics-script.ts:44`, next to `omnijs-vm-fixture.ts`. Fix:
        reuse the shared helper, keeping the local copies' strict throw-on-non-literal as an option. Add a project-map
        runner to `omnijs-vm-fixture.ts` (Technique: Extract Function). Verified: diff plus read; the verifier reported
        HOLDS.
- [ ] 63. Analyze error classification is written three times. `classifyAnalyticsError` (used by productivity only) is
      re-implemented inline in the overdue and workflow catch blocks, as variants with different fallback codes
      (`src/tools/unified/OmniFocusAnalyzeTool.ts:94-114,1070-1085,2456-2472`). Fix: a per-op override parameter on the
      one helper (Technique: Extract Function). Verified: read; the verifier reported HOLDS.

#### Primitive values and typing

- [ ] 64. Adding an analysis type means typing the same 8 literals in four places:
      - the Zod union (`src/tools/unified/schemas/analyze-schema.ts:66-165`)
      - the inputSchema `enum` (`OmniFocusAnalyzeTool.ts:406-415`)
      - `meta.capabilities` (`:447-456`)
      - the hand-written `CompiledAnalysis` union (`src/tools/unified/compilers/AnalysisCompiler.ts:13-87`)
        `CompiledAnalysis` has already drifted: it still declares `scope`/`tags`/`projects`/`metrics`, which OMN-288
        deleted. `compileStandard` is an unchecked `as` cast. Fix: `CompiledAnalysis = AnalyzeInput['analysis']`. Build
        the enum array and capabilities from the union's option literals in code, so the advertised JSON stays
        byte-identical and the compact inputSchema design is untouched (Technique: Inline Class / Replace Type Code).
        Co-change: 456fd249, f460f8e8, fa0a3007, 9e5d37ce, 57fcb2ec, 1f588e0e, 7b877337. Verified: read; the verifier
        reported HOLDS.
- [ ] 65. Two v3 unwraps bypass the OMN-194 typed-unwrap convention:
      - `unwrapProductivityResult` uses hand-declared all-optional interfaces and a zero-filled fallback that the strict
        schema makes unreachable; it would fabricate zeros if it were reached.
      - `executeOverdueAnalysis` double-casts `result.data as unknown as …`.
        (`src/tools/unified/OmniFocusAnalyzeTool.ts:620-708,1000-1004`). Fix: type against the inferred schema and
        delete the fallback (Technique: Remove Dead Code). Verified: read; the verifier reported HOLDS.
- [ ] 66. `overdue_analysis` and `pattern_analysis` answer with the legacy operation names `'analyze_overdue'` and
      `'analyze_patterns'`, while the other six ops echo their request type. The pattern_analysis thrown path reports a
      third name, the tool name (`src/tools/unified/OmniFocusAnalyzeTool.ts:976,991,1061,1088,1191,1202,1316,1326`).
      Fix: echo the request `type`. This is a wire change, so it needs a decision (Technique: Rename Function).
      Verified: tally of every `*ResponseV2(` first argument; the verifier reported HOLDS.
- [ ] 67. `categorizeError` lowercases the message, then tests `.includes('omniJs')`, which can never match. OmniJS
      errors without "bridge" or "evaluatejavascript" in them fall to INTERNAL_ERROR
      (`src/utils/error-taxonomy.ts:89,205`). Fix: `'omnijs'` (Technique: Substitute Algorithm). Verified: tsx gives
      `OmniJS error: task.foo is not a function -> INTERNAL_ERROR`; the verifier reported HOLDS.
- [ ] 68. `getOmniFocusVersion` caches its `'unknown'` fallback for the life of the process after one failed probe.
      `executeJson` never throws, so the `catch` that logs is unreachable, and `system version` reports `unknown` until
      restart with no log line (`src/omnifocus/version-detection.ts:83-106`). Fix: cache only on success, and log the
      ScriptError (Technique: Remove Dead Code for the catch). Verified: read; the verifier reported HOLDS. Unverified
      at runtime: a `version-detection.test.ts` case where a failure is followed by a success.

#### Tests that barely test

- [ ] 69. About 21 tests assert only `toBeDefined()` on the result of a `new` expression, which is never undefined:
      - `tests/unit/cache-warmer.test.ts`: 15 tests (41, 46, 62, 133, 148, 163, 176, 189, 204, 212, 282, 287, 292,
        305, 321)
      - `tests/unit/omnifocus/OmniAutomation.test.ts:45,50,55`
      - `tests/unit/utils/metrics.test.ts:12,17` And `tests/unit/mcp-client.test.ts:4,10` asserts only on literals.
        Removing strategy merging, the env-var parsing, or `maxHistorySize` would still pass. Fix: assert the observable
        effect, or delete the tests (Technique: Substitute Algorithm). Verified: read; the verifier reported HOLDS.
- [ ] 70. Four `MutationCompiler.test.ts` tests put every assertion inside `if (compiled.operation === …)` without first
      asserting the operation, so they pass if `compile()` returns the wrong one
      (`tests/unit/tools/unified/compilers/MutationCompiler.test.ts:109,120,146,156`). Fix: add the discriminant
      `expect` that the sibling tests already have (Technique: Introduce Assertion). Verified: read; the verifier
      reported HOLDS.

### Dropped during verification

- An inbox list/count missing subtasks of inbox tasks: REFUTED. `task.inInbox` also excludes contained tasks
  (`src/omnifocus/api/OmniFocus.d.ts:782-783`), so the `inbox`-collection path and the OR-branch path agree.

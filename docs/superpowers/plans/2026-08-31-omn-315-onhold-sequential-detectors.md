# OMN-315: onhold_reactivation + sequential_blocked_far Detectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two `pattern_analysis` detectors — `onhold_reactivation` (an on-hold project with a task past its defer
date, a task due soon, or a passed `nextReviewDate`) and `sequential_blocked_far` (a sequential project whose first
incomplete task is deferred far out) — and wire them into the guided-review workflow's `standard`/`deep` modes,
replacing the raw "list all on-hold projects" queue with the smarter reactivation-readiness detector.

**Architecture:** Both detectors are pure functions over the existing `fetchSlimmedData()` scan output (`ProjectData[]`,
`SlimTask[]`), following the exact shape of the already-shipped `missing_next_actions`/`dormant_projects` detectors —
scan + evidence bundle, no severity verdict, no recommendation prose. `sequential_blocked_far` needs one new field
(`sequential: boolean`) added to the project scan, since nothing in the current pipeline exposes it. Both detectors
register in `KNOWN_PATTERNS` and the `pattern_analysis` switch, matching every sibling detector's registration shape
exactly.

**Tech Stack:** TypeScript, Zod (response schema validation), OmniJS (the bridge script inside `evaluateJavascript`),
vitest with mocked `executeJson`.

**Spec:** OMN-315 (Linear), Obsidian `Technical/specs/Guided-Decision Review Layer - design.md` Slice 3. Branch off
`main` (current head after OMN-313/314/320 merges).

**Ground rules from CLAUDE.md that apply here:**
`npm run build && npm run lint && npm run format:check && npm run test:unit` before any task is done; `.strict()` Zod
schemas everywhere (no `.passthrough()`); call the OmniJS escape hatch "the bridge," never "evaluateJavascript" in
prose/comments; this changes a `pattern_analysis` response shape (new `data.<detector>` keys) — Vertical Contract Matrix
rows 1 (schema — `insights[]` stays free-form strings, N/A), 2 (normalization, N/A), 3/4 (single-item/batch path, N/A —
analytics has no single/batch split), 5 (script lowering — Task 1 IS this), 6 (live bridge — Task 7 IS this), 7
(response validation — Task 1's Zod schema), 8 (cache key — N/A, `fetchSlimmedData`'s cache key doesn't change, it's
keyed on scan options not output shape) all get walked explicitly in the PR body.

---

## File structure

| File                                                                   | Responsibility                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/omnifocus/response-schemas/read.ts`                               | `SlimProjectSchema` gains `sequential: z.boolean().optional()`                                                                                                                                                       |
| `src/tools/unified/OmniFocusAnalyzeTool.ts`                            | `ProjectData` interface gains `sequential?: boolean`; OmniJS emitter emits it; `KNOWN_PATTERNS` gains both names; switch statement gains both cases; `detectOnholdReactivation`/`detectSequentialBlockedFar` methods |
| `tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts`                | Tests for both detectors, and one test proving `sequential` flows through the scan                                                                                                                                   |
| `src/prompts/gtd/GuidedReviewPrompt.ts`                                | `QUEUES_BY_MODE.standard`/`.deep` swap `on_hold_projects` for the two new detector names; `NON_DETECTOR_QUEUES`/`extraCalls` lose the `on_hold_projects` branch                                                      |
| `tests/unit/prompts/GuidedReviewPrompt.test.ts`                        | Updated queue-composition assertions                                                                                                                                                                                 |
| `docs/skills/omnifocus-assistant/references/workflow-guided-review.md` | Queue-path table row updated; on-hold-projects row replaced                                                                                                                                                          |
| `CHANGELOG.md`                                                         | `### Added` entry                                                                                                                                                                                                    |

---

### Task 0: Live fixture probe (pre-build — verifies the two semantics this plan depends on)

**Files:** none (verification only; record results in your final report)

This MUST run before Task 1, against the **guarded** `omnifocus-dev` MCP server (never prod), because both detectors
depend on two facts about the live app that aren't yet proven: whether `project.sequential` reads correctly through the
bridge, and whether tasks come back from a per-project scan in document order (needed for "first incomplete task").

- [ ] **Step 1: Probe `project.sequential` and document order via `system` diagnostics**

Call the `omnifocus-dev` MCP tool `system` with `operation: "diagnostics"` and this `testScript` (a raw OmniJS snippet,
per the tool's documented `testScript` field):

```javascript
(() => {
  const results = [];
  const projects = flattenedProjects.slice(0, 20);
  projects.forEach((p) => {
    try {
      results.push({ id: p.id.primaryKey, name: p.name, sequential: p.sequential });
    } catch (e) {
      results.push({ id: p.id.primaryKey, name: p.name, error: String(e) });
    }
  });
  // Document-order check: for one sequential project with >=2 incomplete
  // tasks, confirm task.flattenedTasks (project-scoped, not the global
  // collection) returns them in outline order.
  const seqProject = projects.find((p) => {
    try {
      return p.sequential;
    } catch (e) {
      return false;
    }
  });
  let orderCheck = null;
  if (seqProject) {
    const kids = seqProject.flattenedTasks
      .filter((t) => !t.completed)
      .map((t) => ({ id: t.id.primaryKey, name: t.name }));
    orderCheck = { projectId: seqProject.id.primaryKey, firstTwoIncomplete: kids.slice(0, 2) };
  }
  return JSON.stringify({ sample: results, orderCheck }, null, 2);
})();
```

- [ ] **Step 2: Confirm two things from the output before proceeding**

1. At least one project shows `sequential: true` or `sequential: false` (not `error`) — proves the property reads
   cleanly through the bridge with no OmniJS-vs-JXA mismatch (unlike `reviewInterval`/`numberOfTasks`, which have known
   JXA-only or undefined-in-OmniJS gotchas per `docs/dev/PATTERNS.md`).
2. If a sequential project with 2+ incomplete tasks was found, manually open that project in the OmniFocus UI and
   confirm `firstTwoIncomplete[0]` really is the first (topmost) incomplete task in outline order — proves
   `flattenedTasks` order matches the UI's document order, which `sequential_blocked_far` depends on for "first
   incomplete task."

If either check fails, STOP and report BLOCKED — do not proceed to Task 1 with an unverified assumption; escalate to Kip
with what you found.

- [ ] **Step 3: Record the results** (paste the raw JSON output and your pass/fail judgment) in your task report. This
      becomes the PR body's Vertical Contract Matrix row 6 (live bridge) evidence.

---

### Task 1: Add `sequential` to the project scan pipeline

**Files:**

- Modify: `src/omnifocus/response-schemas/read.ts` (`SlimProjectSchema`, ~line 480-496)
- Modify: `src/tools/unified/OmniFocusAnalyzeTool.ts` (`ProjectData` interface ~line 175-189; the OmniJS project-loop
  ~line 1508-1524)
- Test: `tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts`

- [ ] **Step 1: Write the failing test**

Add near the existing `missing_next_actions`/`dormant_projects` describe blocks in
`tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts`:

```ts
// OMN-315: `sequential` is a new field on the project scan, needed by
// sequential_blocked_far. This test only proves the field survives the
// Zod boundary (SlimProjectSchema) end-to-end through pattern_analysis —
// the detector logic itself is tested separately.
describe('fetchSlimmedData sequential field (OMN-315)', () => {
  it('a project with sequential:true survives the scan and reaches a detector that reads it', async () => {
    mockOmni.executeJson.mockResolvedValue(
      createScriptSuccess({
        tasks: [],
        projects: [
          {
            id: 'seq1',
            name: 'Sequential proj',
            status: 'active status',
            taskCount: 0,
            availableTaskCount: 0,
            sequential: true,
          },
        ],
        tags: [],
      }),
    );
    // missing_next_actions doesn't read sequential, but it DOES read the same
    // ProjectData rows the scan produces — if SlimProjectSchema rejected the
    // sequential key (e.g. .strict() without the field declared), this whole
    // call would throw, not silently drop the field. A throw-free 200 here is
    // the proof the field is accepted at the Zod boundary.
    const res: any = await tool.execute({
      analysis: { type: 'pattern_analysis', params: { insights: ['missing_next_actions'] } },
    });
    expect(res.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts -t "sequential field" --run` Expected: FAIL —
`SlimProjectSchema` is `.strict()` (`src/omnifocus/response-schemas/read.ts`), so the mocked `sequential: true` key on
the project row is unrecognized and the parse throws, which `fetchSlimmedData` reports as an `EXECUTION_ERROR`
(`res.success` will be `false`, not `true`).

- [ ] **Step 3: Add the field to `SlimProjectSchema`**

In `src/omnifocus/response-schemas/read.ts`, find `SlimProjectSchema` (~line 480):

```ts
const SlimProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    taskCount: z.number(),
    availableTaskCount: z.number(),
    // OMN-255: containing folder name; always emitted since OMN-269 (null for
    // root projects, degrades to null on error) — required-nullable so a future
    // emitter regression that omits it fails validation instead of passing silently
    folder: z.string().nullable(),
    lastReviewDate: z.string().optional(),
    nextReviewDate: z.string().optional(),
    creationDate: z.string().optional(),
    modificationDate: z.string().optional(),
    completionDate: z.string().optional(),
  })
  .strict();
```

Add one line after `completionDate`:

```ts
    completionDate: z.string().optional(),
    // OMN-315: needed by sequential_blocked_far. Optional — the emitter's
    // try/catch degrades a bad read to an omitted key, same as every other
    // field here, never to a fabricated default.
    sequential: z.boolean().optional(),
```

- [ ] **Step 4: Add the field to the `ProjectData` TypeScript interface**

In `src/tools/unified/OmniFocusAnalyzeTool.ts` (~line 175), the local interface used by all pattern detectors:

```ts
interface ProjectData {
  id: string;
  name: string;
  status: string;
  // Required since OMN-269: the OmniJS emitter always sets these three
  // (SlimProjectSchema enforces it at the wire boundary).
  taskCount: number;
  availableTaskCount: number;
  folder: string | null;
  lastReviewDate?: string;
  nextReviewDate?: string;
  creationDate?: string;
  modificationDate?: string;
  completionDate?: string;
  // OMN-315: whether the project is a sequential action group. Optional to
  // match the emitter's try/catch-degrades-to-omitted convention.
  sequential?: boolean;
}
```

- [ ] **Step 5: Emit the field from the OmniJS project loop**

In `src/tools/unified/OmniFocusAnalyzeTool.ts`, find the project-building loop inside `fetchSlimmedData` (~line
1508-1524):

```javascript
try {
  projectData.folder = project.parentFolder ? project.parentFolder.name : null;
} catch (e) {
  projectData.folder = null;
}
putISO(projectData, 'lastReviewDate', project, 'lastReviewDate');
putISO(projectData, 'nextReviewDate', project, 'nextReviewDate');
putISO(projectData, 'creationDate', project, 'added');
putISO(projectData, 'modificationDate', project, 'modified');
putISO(projectData, 'completionDate', project, 'completionDate');
```

Add one line after the `completionDate` `putISO` call:

```javascript
try {
  projectData.sequential = project.sequential;
} catch (e) {}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts -t "sequential field" --run` Expected: PASS

- [ ] **Step 7: Full unit suite + typecheck (schema change — must not regress anything else)**

Run: `npm run build && npm run typecheck:test && npm run test:unit` Expected: all green

- [ ] **Step 8: Commit**

```bash
git add src/omnifocus/response-schemas/read.ts src/tools/unified/OmniFocusAnalyzeTool.ts tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts
git commit -m "feat(OMN-315): add sequential field to the project scan (SlimProjectSchema + OmniJS emitter)"
```

---

### Task 2: `onhold_reactivation` detector

**Files:**

- Modify: `src/tools/unified/OmniFocusAnalyzeTool.ts` (`KNOWN_PATTERNS` ~line 256-267; switch statement ~line 1208-1277;
  new private method near `detectMissingNextActions` ~line 1741)
- Test: `tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts`

An on-hold project is a reactivation candidate when it has ANY task whose defer date has passed, OR any task due within
`reactivation_days_ahead` (default 14), OR the project's own `nextReviewDate` has passed. Evidence = the triggering
task(s)/date, never a "why is this on hold" judgment.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts`, near the `missing_next_actions` describe block:

```ts
describe('pattern_analysis onhold_reactivation (OMN-315)', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const pastDefer = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
  const soonDue = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days from now
  const farDue = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days from now
  const pastReview = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day ago

  it('reports an on-hold project with a task whose defer date has passed', async () => {
    mockOmni.executeJson.mockResolvedValue(
      createScriptSuccess({
        tasks: [
          {
            id: 't1',
            name: 'Follow up',
            project: 'On hold A',
            projectId: 'poh1',
            deferDate: pastDefer,
            completed: false,
            flagged: false,
            status: 'blocked',
            tags: [],
            estimatedMinutes: null,
            children: 0,
          },
        ],
        projects: [
          {
            id: 'poh1',
            name: 'On hold A',
            status: 'on hold status',
            taskCount: 1,
            availableTaskCount: 0,
            folder: null,
          },
          {
            id: 'pact',
            name: 'Active, not on hold',
            status: 'active status',
            taskCount: 0,
            availableTaskCount: 0,
            folder: null,
          },
        ],
        tags: [],
      }),
    );
    const res: any = await tool.execute({
      analysis: { type: 'pattern_analysis', params: { insights: ['onhold_reactivation'] } },
    });
    expect(res.success).toBe(true);
    const finding = res.data.onhold_reactivation;
    expect(finding.count).toBe(1);
    expect(finding.items.map((i: any) => i.id)).toEqual(['poh1']);
    expect(finding.items[0].reason).toContain('defer date passed');
  });

  it('reports an on-hold project with a task due within the window, but not one due far out', async () => {
    mockOmni.executeJson.mockResolvedValue(
      createScriptSuccess({
        tasks: [
          {
            id: 't2',
            name: 'Due soon',
            project: 'On hold B',
            projectId: 'poh2',
            dueDate: soonDue,
            completed: false,
            flagged: false,
            status: 'blocked',
            tags: [],
            estimatedMinutes: null,
            children: 0,
          },
          {
            id: 't3',
            name: 'Due far',
            project: 'On hold C',
            projectId: 'poh3',
            dueDate: farDue,
            completed: false,
            flagged: false,
            status: 'blocked',
            tags: [],
            estimatedMinutes: null,
            children: 0,
          },
        ],
        projects: [
          {
            id: 'poh2',
            name: 'On hold B',
            status: 'on hold status',
            taskCount: 1,
            availableTaskCount: 0,
            folder: null,
          },
          {
            id: 'poh3',
            name: 'On hold C',
            status: 'on hold status',
            taskCount: 1,
            availableTaskCount: 0,
            folder: null,
          },
        ],
        tags: [],
      }),
    );
    const res: any = await tool.execute({
      analysis: { type: 'pattern_analysis', params: { insights: ['onhold_reactivation'] } },
    });
    const ids = res.data.onhold_reactivation.items.map((i: any) => i.id);
    expect(ids).toEqual(['poh2']);
  });

  it('reports an on-hold project whose nextReviewDate has passed, even with no qualifying task', async () => {
    mockOmni.executeJson.mockResolvedValue(
      createScriptSuccess({
        tasks: [],
        projects: [
          {
            id: 'poh4',
            name: 'Review overdue',
            status: 'on hold status',
            taskCount: 0,
            availableTaskCount: 0,
            folder: null,
            nextReviewDate: pastReview,
          },
        ],
        tags: [],
      }),
    );
    const res: any = await tool.execute({
      analysis: { type: 'pattern_analysis', params: { insights: ['onhold_reactivation'] } },
    });
    const finding = res.data.onhold_reactivation;
    expect(finding.count).toBe(1);
    expect(finding.items[0].reason).toContain('review overdue');
  });

  it('does not report an on-hold project with no qualifying signal, or an active project at all', async () => {
    mockOmni.executeJson.mockResolvedValue(
      createScriptSuccess({
        tasks: [
          {
            id: 't5',
            name: 'Far out task',
            project: 'On hold D',
            projectId: 'poh5',
            deferDate: farDue,
            completed: false,
            flagged: false,
            status: 'blocked',
            tags: [],
            estimatedMinutes: null,
            children: 0,
          },
        ],
        projects: [
          {
            id: 'poh5',
            name: 'On hold D',
            status: 'on hold status',
            taskCount: 1,
            availableTaskCount: 0,
            folder: null,
          },
          { id: 'pact2', name: 'Active E', status: 'active status', taskCount: 1, availableTaskCount: 0, folder: null },
        ],
        tags: [],
      }),
    );
    const res: any = await tool.execute({
      analysis: { type: 'pattern_analysis', params: { insights: ['onhold_reactivation'] } },
    });
    expect(res.data.onhold_reactivation.count).toBe(0);
  });

  it('empty case: no on-hold projects at all', async () => {
    mockOmni.executeJson.mockResolvedValue(createScriptSuccess({ tasks: [], projects: [], tags: [] }));
    const res: any = await tool.execute({
      analysis: { type: 'pattern_analysis', params: { insights: ['onhold_reactivation'] } },
    });
    expect(res.data.onhold_reactivation).toMatchObject({ type: 'onhold_reactivation', count: 0, severity: 'info' });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts -t "onhold_reactivation" --run` Expected: FAIL —
`onhold_reactivation` is not a recognized pattern name yet; `res.data.onhold_reactivation` is `undefined`.

- [ ] **Step 3: Register the detector name in `KNOWN_PATTERNS`**

In `src/tools/unified/OmniFocusAnalyzeTool.ts` (~line 256), add to the exported array (keep alphabetically-neutral, just
append near the end before `missing_next_actions` to group with the OMN-315 sibling):

```ts
export const KNOWN_PATTERNS = [
  'duplicates',
  'dormant_projects',
  'tag_audit',
  'deadline_health',
  'waiting_for',
  'estimation_bias',
  'clarify_candidates',
  'review_gaps',
  'wip_limits',
  'due_date_bunching',
  'missing_next_actions',
  'onhold_reactivation',
  'sequential_blocked_far',
];
```

(Both new names go in now — Task 3 relies on `sequential_blocked_far` already being present here so its own tests can
run.)

- [ ] **Step 4: Add the switch case**

In the pattern-dispatch switch (~line 1275, right after the `missing_next_actions` case):

```ts
          case 'missing_next_actions':
            findings.missing_next_actions = this.detectMissingNextActions(slimData.projects);
            break;
          case 'onhold_reactivation':
            findings.onhold_reactivation = this.detectOnholdReactivation(
              slimData.projects,
              slimData.tasks,
              options.reactivation_days_ahead,
            );
            break;
          case 'sequential_blocked_far':
            findings.sequential_blocked_far = this.detectSequentialBlockedFar(
              slimData.projects,
              slimData.tasks,
              options.sequential_blocked_days,
            );
            break;
```

- [ ] **Step 5: Add the two new options with defaults**

In the `options` object (~line 1164):

```ts
const options = {
  dormant_threshold_days: 90,
  duplicate_similarity_threshold: 0.85,
  include_completed: false,
  max_tasks: 3000,
  wip_limit: 5,
  bunching_threshold: 8,
  reactivation_days_ahead: 14,
  sequential_blocked_days: 30,
};
```

- [ ] **Step 6: Implement `detectOnholdReactivation`**

Add this method near `detectMissingNextActions` (~line 1741), same class:

```ts
  // OMN-315: reactivation-readiness check for deliberately on-hold projects.
  // "Is this ready to reactivate?", never "why is this on hold?" — an
  // on-hold project with none of these signals is left alone, not flagged.
  private detectOnholdReactivation(
    projects: ProjectData[],
    tasks: SlimTask[],
    daysAhead: number,
  ): PatternFinding {
    const now = Date.now();
    const dueSoonCutoff = now + daysAhead * 24 * 60 * 60 * 1000;
    const tasksByProject = new Map<string, SlimTask[]>();
    for (const t of tasks) {
      if (!t.projectId) continue;
      const arr = tasksByProject.get(t.projectId) ?? [];
      arr.push(t);
      tasksByProject.set(t.projectId, arr);
    }

    const candidates: Array<{ id: string; name: string; folder: string | null; reason: string }> = [];
    for (const p of projects) {
      if (p.status !== 'onHold') continue;

      const projTasks = tasksByProject.get(p.id) ?? [];
      const pastDeferTask = projTasks.find((t) => t.deferDate && new Date(t.deferDate).getTime() <= now);
      if (pastDeferTask) {
        candidates.push({
          id: p.id,
          name: p.name,
          folder: p.folder,
          reason: `task "${pastDeferTask.name}" defer date passed (${pastDeferTask.deferDate})`,
        });
        continue;
      }

      const dueSoonTask = projTasks.find((t) => t.dueDate && new Date(t.dueDate).getTime() <= dueSoonCutoff);
      if (dueSoonTask) {
        candidates.push({
          id: p.id,
          name: p.name,
          folder: p.folder,
          reason: `task "${dueSoonTask.name}" due within ${daysAhead} days (${dueSoonTask.dueDate})`,
        });
        continue;
      }

      if (p.nextReviewDate && new Date(p.nextReviewDate).getTime() <= now) {
        candidates.push({
          id: p.id,
          name: p.name,
          folder: p.folder,
          reason: `review overdue (nextReviewDate ${p.nextReviewDate})`,
        });
      }
    }

    return {
      type: 'onhold_reactivation',
      severity: candidates.length > 5 ? 'warning' : 'info',
      count: candidates.length,
      items: candidates,
      recommendation:
        candidates.length > 0
          ? `${candidates.length} on-hold project(s) show a signal they may be ready to reactivate.`
          : 'No on-hold projects show a reactivation signal.',
    };
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts -t "onhold_reactivation" --run` Expected: 5
passed

- [ ] **Step 8: Commit**

```bash
git add src/tools/unified/OmniFocusAnalyzeTool.ts tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts
git commit -m "feat(OMN-315): onhold_reactivation detector — defer/due/review signals on on-hold projects"
```

---

### Task 3: `sequential_blocked_far` detector

**Files:**

- Modify: `src/tools/unified/OmniFocusAnalyzeTool.ts` (new private method near `detectOnholdReactivation`)
- Test: `tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts`

A sequential, active project is a candidate when its first incomplete task (in scan order, which Task 0 confirmed
matches document order) has a defer date more than `daysOut` (default 30) in the future — a silently-blocked project
nobody will see as "stalled" via `missing_next_actions` (it may have zero available tasks OR one far-future available
task depending on the defer semantics, but either way the blocking is invisible without walking the sequence).

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts`:

```ts
describe('pattern_analysis sequential_blocked_far (OMN-315)', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const farDefer = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString(); // 45 days out
  const soonDefer = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days out

  it('reports a sequential project whose first incomplete task is deferred far out, with the count of tasks behind it', async () => {
    mockOmni.executeJson.mockResolvedValue(
      createScriptSuccess({
        tasks: [
          {
            id: 't1',
            name: 'Blocked head',
            project: 'Seq A',
            projectId: 'pseq1',
            deferDate: farDefer,
            completed: false,
            flagged: false,
            status: 'blocked',
            tags: [],
            estimatedMinutes: null,
            children: 0,
          },
          {
            id: 't2',
            name: 'Behind 1',
            project: 'Seq A',
            projectId: 'pseq1',
            completed: false,
            flagged: false,
            status: 'blocked',
            tags: [],
            estimatedMinutes: null,
            children: 0,
          },
          {
            id: 't3',
            name: 'Behind 2',
            project: 'Seq A',
            projectId: 'pseq1',
            completed: false,
            flagged: false,
            status: 'blocked',
            tags: [],
            estimatedMinutes: null,
            children: 0,
          },
        ],
        projects: [
          {
            id: 'pseq1',
            name: 'Seq A',
            status: 'active status',
            taskCount: 3,
            availableTaskCount: 0,
            folder: null,
            sequential: true,
          },
        ],
        tags: [],
      }),
    );
    const res: any = await tool.execute({
      analysis: { type: 'pattern_analysis', params: { insights: ['sequential_blocked_far'] } },
    });
    expect(res.success).toBe(true);
    const finding = res.data.sequential_blocked_far;
    expect(finding.count).toBe(1);
    expect(finding.items[0]).toMatchObject({
      id: 'pseq1',
      name: 'Seq A',
      blockingTaskName: 'Blocked head',
      tasksBehind: 2,
    });
  });

  it('does not report a sequential project whose first incomplete task is deferred soon', async () => {
    mockOmni.executeJson.mockResolvedValue(
      createScriptSuccess({
        tasks: [
          {
            id: 't4',
            name: 'Blocked head 2',
            project: 'Seq B',
            projectId: 'pseq2',
            deferDate: soonDefer,
            completed: false,
            flagged: false,
            status: 'blocked',
            tags: [],
            estimatedMinutes: null,
            children: 0,
          },
        ],
        projects: [
          {
            id: 'pseq2',
            name: 'Seq B',
            status: 'active status',
            taskCount: 1,
            availableTaskCount: 0,
            folder: null,
            sequential: true,
          },
        ],
        tags: [],
      }),
    );
    const res: any = await tool.execute({
      analysis: { type: 'pattern_analysis', params: { insights: ['sequential_blocked_far'] } },
    });
    expect(res.data.sequential_blocked_far.count).toBe(0);
  });

  it('does not report a non-sequential (parallel) project, even with a far-deferred first task', async () => {
    mockOmni.executeJson.mockResolvedValue(
      createScriptSuccess({
        tasks: [
          {
            id: 't5',
            name: 'Parallel task',
            project: 'Parallel C',
            projectId: 'ppar1',
            deferDate: farDefer,
            completed: false,
            flagged: false,
            status: 'blocked',
            tags: [],
            estimatedMinutes: null,
            children: 0,
          },
        ],
        projects: [
          {
            id: 'ppar1',
            name: 'Parallel C',
            status: 'active status',
            taskCount: 1,
            availableTaskCount: 0,
            folder: null,
            sequential: false,
          },
        ],
        tags: [],
      }),
    );
    const res: any = await tool.execute({
      analysis: { type: 'pattern_analysis', params: { insights: ['sequential_blocked_far'] } },
    });
    expect(res.data.sequential_blocked_far.count).toBe(0);
  });

  it('a sequential project with no incomplete tasks at all is not reported (nothing to block on)', async () => {
    mockOmni.executeJson.mockResolvedValue(
      createScriptSuccess({
        tasks: [],
        projects: [
          {
            id: 'pseq3',
            name: 'Seq D empty',
            status: 'active status',
            taskCount: 0,
            availableTaskCount: 0,
            folder: null,
            sequential: true,
          },
        ],
        tags: [],
      }),
    );
    const res: any = await tool.execute({
      analysis: { type: 'pattern_analysis', params: { insights: ['sequential_blocked_far'] } },
    });
    expect(res.data.sequential_blocked_far.count).toBe(0);
  });

  it('a sequential project whose first incomplete task has no defer date at all is not reported', async () => {
    mockOmni.executeJson.mockResolvedValue(
      createScriptSuccess({
        tasks: [
          {
            id: 't6',
            name: 'No defer',
            project: 'Seq E',
            projectId: 'pseq4',
            completed: false,
            flagged: false,
            status: 'available',
            tags: [],
            estimatedMinutes: null,
            children: 0,
          },
        ],
        projects: [
          {
            id: 'pseq4',
            name: 'Seq E',
            status: 'active status',
            taskCount: 1,
            availableTaskCount: 1,
            folder: null,
            sequential: true,
          },
        ],
        tags: [],
      }),
    );
    const res: any = await tool.execute({
      analysis: { type: 'pattern_analysis', params: { insights: ['sequential_blocked_far'] } },
    });
    expect(res.data.sequential_blocked_far.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts -t "sequential_blocked_far" --run` Expected: FAIL
— `res.data.sequential_blocked_far` is `undefined` (no switch case yet).

- [ ] **Step 3: Add the switch case**

Already added in Task 2 Step 4 (both cases were added together, since `KNOWN_PATTERNS` needed both names present for
Task 2's tests to type-check against `insights: ['onhold_reactivation']` without an "unrecognized pattern" complaint).
If you're executing tasks out of order, add now:

```ts
          case 'sequential_blocked_far':
            findings.sequential_blocked_far = this.detectSequentialBlockedFar(
              slimData.projects,
              slimData.tasks,
              options.sequential_blocked_days,
            );
            break;
```

- [ ] **Step 4: Implement `detectSequentialBlockedFar`**

Add near `detectOnholdReactivation`:

```ts
  // OMN-255 ride-along: a sequential project whose first incomplete task is
  // deferred far out silently blocks every task behind it — invisible to
  // missing_next_actions (which only sees the 0-vs-nonzero boundary, not
  // WHY a project has few/no available tasks). Task order here is scan
  // order, which Task 0's live probe confirmed matches flattenedTasks'
  // outline order for a project-scoped filter.
  private detectSequentialBlockedFar(
    projects: ProjectData[],
    tasks: SlimTask[],
    daysOut: number,
  ): PatternFinding {
    const now = Date.now();
    const cutoff = now + daysOut * 24 * 60 * 60 * 1000;
    const tasksByProject = new Map<string, SlimTask[]>();
    for (const t of tasks) {
      if (!t.projectId) continue;
      const arr = tasksByProject.get(t.projectId) ?? [];
      arr.push(t);
      tasksByProject.set(t.projectId, arr);
    }

    const candidates: Array<{
      id: string;
      name: string;
      folder: string | null;
      blockingTaskName: string;
      blockingDeferDate: string;
      tasksBehind: number;
    }> = [];

    for (const p of projects) {
      if (p.status !== 'active' || p.sequential !== true) continue;
      const incomplete = (tasksByProject.get(p.id) ?? []).filter((t) => !t.completed);
      if (incomplete.length === 0) continue;

      const head = incomplete[0];
      if (!head.deferDate) continue;
      const deferMs = new Date(head.deferDate).getTime();
      if (deferMs <= cutoff) continue;

      candidates.push({
        id: p.id,
        name: p.name,
        folder: p.folder,
        blockingTaskName: head.name,
        blockingDeferDate: head.deferDate,
        tasksBehind: incomplete.length - 1,
      });
    }

    return {
      type: 'sequential_blocked_far',
      severity: candidates.length > 5 ? 'warning' : 'info',
      count: candidates.length,
      items: candidates,
      recommendation:
        candidates.length > 0
          ? `${candidates.length} sequential project(s) are blocked by a task deferred more than ${daysOut} days out.`
          : 'No sequential projects are blocked by a far-future defer date.',
    };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts -t "sequential_blocked_far" --run` Expected: 5
passed

- [ ] **Step 6: Full unit suite**

Run: `npm run build && npm run lint && npm run format:check && npm run test:unit` Expected: all green

- [ ] **Step 7: Commit**

```bash
git add src/tools/unified/OmniFocusAnalyzeTool.ts tests/unit/tools/unified/OmniFocusAnalyzeTool.test.ts
git commit -m "feat(OMN-315): sequential_blocked_far detector — first-incomplete-task defer-date check"
```

---

### Task 4: Wire both detectors into `guided_review`'s standard/deep modes

**Files:**

- Modify: `src/prompts/gtd/GuidedReviewPrompt.ts`
- Test: `tests/unit/prompts/GuidedReviewPrompt.test.ts`

Replace the raw "list all on-hold projects" queue with the two new detectors — the guided review should ask "is this
ready to reactivate / is this silently blocked?", not just re-list every on-hold project with no signal.

- [ ] **Step 1: Update the failing test expectations first**

In `tests/unit/prompts/GuidedReviewPrompt.test.ts`, change the `'standard and deep are supersets in the spec order'`
test:

```ts
it('standard and deep are supersets in the spec order', () => {
  expect(QUEUES_BY_MODE.standard.slice(0, 3)).toEqual(QUEUES_BY_MODE.quick);
  expect(QUEUES_BY_MODE.deep.slice(0, QUEUES_BY_MODE.standard.length)).toEqual(QUEUES_BY_MODE.standard);
  expect(QUEUES_BY_MODE.deep).toEqual([
    'missing_next_actions',
    'deadline_health',
    'waiting_for',
    'dormant_projects',
    'onhold_reactivation',
    'sequential_blocked_far',
    'wip_limits',
    'clarify_candidates',
    'review_gaps',
    'productivity_check',
  ]);
});
```

Change `'excludes non-detector queues from the pattern_analysis insights array but keeps them in Queue order'` —
`on_hold_projects` is gone entirely now (it's a real detector name, not a non-detector queue), so simplify to only check
`productivity_check`:

```ts
it('excludes non-detector queues from the pattern_analysis insights array but keeps them in Queue order', () => {
  for (const mode of ['standard', 'deep'] as const) {
    const text = textOf(prompt, { mode });
    const match = text.match(/insights: (\[.*?\])/);
    expect(match).not.toBeNull();
    const insights = JSON.parse(match![1]);
    expect(insights).not.toContain('productivity_check');
    expect(insights).toContain('onhold_reactivation');
    expect(insights).toContain('sequential_blocked_far');

    const queueOrderLine = text.split('\n').find((l) => l.startsWith('Queue order:'));
    if (mode === 'deep') {
      expect(queueOrderLine).toContain('productivity_check');
    }
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest tests/unit/prompts/GuidedReviewPrompt.test.ts --run` Expected: FAIL — `QUEUES_BY_MODE` still has the
old shape.

- [ ] **Step 3: Update `QUEUES_BY_MODE` and drop the `on_hold_projects` special-casing**

In `src/prompts/gtd/GuidedReviewPrompt.ts`:

```ts
// Order is the presentation order. `productivity_check` is a read/analyze
// call, not a pattern_analysis detector — see NON_DETECTOR_QUEUES.
export const QUEUES_BY_MODE: Record<ReviewMode, readonly string[]> = {
  quick: ['missing_next_actions', 'deadline_health', 'waiting_for'],
  standard: [
    'missing_next_actions',
    'deadline_health',
    'waiting_for',
    'dormant_projects',
    'onhold_reactivation',
    'sequential_blocked_far',
    'wip_limits',
  ],
  deep: [
    'missing_next_actions',
    'deadline_health',
    'waiting_for',
    'dormant_projects',
    'onhold_reactivation',
    'sequential_blocked_far',
    'wip_limits',
    'clarify_candidates',
    'review_gaps',
    'productivity_check',
  ],
};
```

```ts
const NON_DETECTOR_QUEUES = new Set(['productivity_check']);
```

- [ ] **Step 4: Remove the `on_hold_projects` extraCalls branch**

```ts
const extraCalls = [
  queues.includes('productivity_check')
    ? 'productivity_check = omnifocus_analyze({ analysis: { type: "productivity_stats", params: { groupBy: "week" } } }) — read, do not act.'
    : '',
]
  .filter(Boolean)
  .join('\n');
```

(Drops the `on_hold_projects` ternary entirely — `omnifocus_read` for on-hold projects is no longer part of this
prompt's fetch step.)

- [ ] **Step 5: Update the queue-path documentation table inside the prompt text**

The `describePopulation`/prompt body text doesn't reference `on_hold_projects` by name elsewhere in this file — confirm
with `grep -n "on_hold_projects" src/prompts/gtd/GuidedReviewPrompt.ts` that Steps 3-4 removed every occurrence
(expected: zero matches after this task).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest tests/unit/prompts/GuidedReviewPrompt.test.ts --run` Expected: all passing (7 tests + the
detector-vocabulary drift-guard test, which will now also confirm `onhold_reactivation`/`sequential_blocked_far` are
present in `KNOWN_PATTERNS` — they are, from Task 2 Step 3).

- [ ] **Step 7: Full gate**

Run: `npm run build && npm run lint && npm run format:check && npm run test:unit` Expected: all green

- [ ] **Step 8: Commit**

```bash
git add src/prompts/gtd/GuidedReviewPrompt.ts tests/unit/prompts/GuidedReviewPrompt.test.ts
git commit -m "feat(OMN-315): guided_review standard/deep modes use onhold_reactivation + sequential_blocked_far, not a raw on-hold list"
```

---

### Task 5: Update the skill reference doc

**Files:**

- Modify: `docs/skills/omnifocus-assistant/references/workflow-guided-review.md`

- [ ] **Step 1: Replace the on-hold-projects row in the Step-1 queue-path table**

Find (current text):

```markdown
| on-hold projects | `omnifocus_read({ query: { type: "projects", filters: { status: "on_hold" } } })` | "on hold; N
tasks" (until the `onhold_reactivation` detector lands — OMN-315) |
```

Replace with two rows:

```markdown
| onhold_reactivation | `data.onhold_reactivation.items[]` `{id,name,folder,reason}` | the `reason` field, verbatim — it
already names the triggering task/date | | sequential_blocked_far | `data.sequential_blocked_far.items[]`
`{id,name,folder,blockingTaskName,blockingDeferDate,tasksBehind}` | "blocked by \"<blockingTaskName>\" until
<blockingDeferDate>, N tasks behind" |
```

- [ ] **Step 2: Update the `standard` mode's queue-order text**

Find (in the Modes table near the top):

```markdown
| `standard` | 30 min | quick + dormant_projects → on-hold projects → wip_limits | All active + on-hold projects |
```

Replace with:

```markdown
| `standard` | 30 min | quick + dormant_projects → onhold_reactivation → sequential_blocked_far → wip_limits | All
active + on-hold projects |
```

- [ ] **Step 3: Formatting check**

Run:
`npx prettier --write docs/skills/omnifocus-assistant/references/workflow-guided-review.md && npx prettier --check docs/skills/omnifocus-assistant/references/workflow-guided-review.md`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 4: Path/docs test**

Run: `npx vitest tests/unit/docs --run` Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add docs/skills/omnifocus-assistant/references/workflow-guided-review.md
git commit -m "docs(OMN-315): route standard-mode guided review through the new on-hold/sequential detectors"
```

---

### Task 6: CHANGELOG + final gate + draft PR

**Files:**

- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the entry**

Under `## [Unreleased]` → `### Added` (create the heading if it no longer exists after prior merges — check first):

```markdown
- **`onhold_reactivation` + `sequential_blocked_far` pattern_analysis detectors** (OMN-315) — reactivation-readiness
  signals for deliberately on-hold projects (a task's defer date passed, a task due soon, or an overdue review), and a
  silently-blocked-sequential-project check (first incomplete task deferred far out). Both are scan + evidence bundles,
  no severity verdict. `guided_review`'s `standard`/`deep` modes now route through these instead of a raw "list all
  on-hold projects" read. New `ProjectData.sequential` field on the `pattern_analysis` project scan.
```

- [ ] **Step 2: Full local gate**

Run: `npm run ci:local` Expected: build, lint (`--max-warnings=0`), format:check, test:unit all green.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(OMN-315): changelog"
```

- [ ] **Step 4: Push and open the draft PR**

```bash
git push -u origin omn-315-onhold-sequential-detectors
```

```bash
gh pr create --repo kip-d/omnifocus-mcp --draft --title "feat(OMN-315): onhold_reactivation + sequential_blocked_far detectors" --body-file - <<'EOF'
Slice 3 of the guided-decision review layer. Spec: vault `Technical/specs/Guided-Decision Review Layer - design.md`; Linear OMN-315.

## Vertical Contract Matrix
1. Schema (both) — N/A: `insights[]` stays free-form strings, no input schema change.
2. Normalization — N/A: no WRAPPER_HINTS-relevant field.
3/4. Single-item/batch path — N/A: pattern_analysis has no single/batch split.
5. Script lowering — DONE: `SlimProjectSchema` + the OmniJS project-loop emit `sequential`.
6. Live bridge — DONE: Task 0's live fixture probe against omnifocus-dev, results below.
7. Response validation — DONE: `SlimProjectSchema.sequential` (.strict(), optional).
8. Cache key — N/A: fetchSlimmedData's cache key is keyed on scan options (max_tasks, include_completed), not on which detector requested the scan or the shape of ProjectData.

## Live verify (Task 0, omnifocus-dev)
<paste the Task 0 diagnostics output and your pass/fail judgment here>

## Notes
- Replaces `guided_review`'s standard/deep "list all on-hold projects" queue with the two new detectors — the review now asks "is this ready to reactivate / is this silently blocked?" instead of just re-listing every on-hold project with no signal.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01TVdNwNdXLskFTdmdXgTrHd
EOF
```

Do NOT merge, mark ready, or run `/code-review` — that is Kip's gate.

---

## Self-review (done while writing)

- **Spec coverage:** both detectors' full contract (scan+evidence, no verdict) ✔; on-hold reactivation's 3 signals ✔;
  sequential-blocked's blocking-task+tasksBehind evidence ✔; standard-mode workflow reference update ✔ (acceptance
  criterion literally required this); dual-schema N/A documented explicitly per the ticket's own note ✔; matrix rows
  marked in the PR body ✔; red-first tests for both detectors incl. empty case ✔; pre-build fixture probe ✔ (Task 0,
  blocks Task 1 on failure).
- **Not in scope, on purpose:** OMN-316 (ledger), OMN-317 (velocity decay), OMN-318's three semantics questions (those
  are about `guided-review-push.ts`'s own queue-membership logic, a different file from this ticket's scope),
  OMN-319/321 (dedup/concurrency-lock, separate tickets).
- **Type consistency:** `detectOnholdReactivation(projects, tasks, daysAhead)` and
  `detectSequentialBlockedFar(projects, tasks, daysOut)` — same parameter shape (`ProjectData[]`, `SlimTask[]`,
  `number`) as every other two/three-arg detector in this file (e.g. `detectDormantProjects(projects, thresholdDays)`);
  both return `PatternFinding` exactly as `missing_next_actions`/`dormant_projects` do.
  `options.reactivation_days_ahead`/`options.sequential_blocked_days` match the plan's Task 2 Step 5 and are the exact
  names read in Task 2 Step 4's switch case.

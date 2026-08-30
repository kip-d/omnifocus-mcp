# Guided-Decision Review Layer (slices 1–2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "do the weekly review" into "N decisions, one at a time" (OMN-313) and add the push that starts it — a
launchd job that creates/updates an OmniFocus inbox item `Review: N decisions waiting` (OMN-314).

**Architecture:** No server contract changes. Slice 1 is a skill reference + an MCP prompt that drive detectors which
already exist (`missing_next_actions`, `deadline_health`, `waiting_for`, `dormant_projects`, `wip_limits`,
`clarify_candidates`, `review_gaps`) and the batched `manage_reviews` ops. Slice 2 is a deterministic TypeScript script
under `scripts/ops/` driven through `StdioJsonRpcTransport` against the prod server, wrapped by a bash launchd job
cloned from OMN-302. Pure functions (queue building, item text, create-vs-update) are unit-tested; the live path is
verified once on `omnifocus-dev`.

**Tech Stack:** TypeScript (ESM, `npx tsx` for scripts), vitest, bash + launchd, existing
`tests/integration/helpers/stdio-jsonrpc-transport.ts`.

**Spec:** Obsidian `Technical/specs/Guided-Decision Review Layer - design.md` (approved 2026-08-30). Tickets: OMN-313
(slice 1), OMN-314 (slice 2). Two PRs, one per ticket; the second branches from the first.

**Ground rules from CLAUDE.md that apply here:**
`npm run build && npm run lint && npm run format:check && npm run test:unit` before claiming any task done
(`format:check` is the only one that sees markdown); no `console.log` in `src/`; the skill reference is canonical and
the prompt mirrors it; nothing in either slice scans task text for words — decision outcomes are an _output_ vocabulary.

---

## File structure

| File                                                                   | Slice | Responsibility                                                                                    |
| ---------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| `docs/skills/omnifocus-assistant/references/workflow-guided-review.md` | 1     | Canonical procedure: modes, queue order, per-item loop, outcomes, log format, one-time staggering |
| `docs/skills/omnifocus-assistant/SKILL.md`                             | 1     | Reference-map row pointing at the new file                                                        |
| `src/prompts/gtd/GuidedReviewPrompt.ts`                                | 1     | MCP prompt `guided_review` (arg `mode`) — same procedure for non-skill clients                    |
| `src/prompts/index.ts`                                                 | 1     | Register the prompt                                                                               |
| `src/prompts/reference/QuickReferencePrompt.ts`                        | 1     | Prompt list row + count                                                                           |
| `tests/unit/prompts/GuidedReviewPrompt.test.ts`                        | 1     | Pins name, arg, default mode, queue order per mode, outcome vocabulary                            |
| `scripts/ops/guided-review-push.ts`                                    | 2     | Pure functions (`buildQueue`, `buildInboxItem`, `decideAction`) + `main()` driving the server     |
| `tests/unit/scripts/guided-review-push.test.ts`                        | 2     | Pure-function tests incl. zero-decisions and update-not-create                                    |
| `scripts/ops/of-mcp-guided-review`                                     | 2     | launchd bash wrapper: PATH, pgrep fail-safe, bounded run, log                                     |
| `scripts/ops/com.omnifocus-mcp.guided-review.plist.template`           | 2     | Mon–Sat 07:00                                                                                     |
| `scripts/ops/install-guided-review-schedule.sh`                        | 2     | Installer, clone of `install-integration-schedule.sh`                                             |
| `docs/dev/guided-review-push.md`                                       | 2     | Runbook (layout, install, verify, knobs)                                                          |
| `scripts/README.md`, `CHANGELOG.md`                                    | 1, 2  | Index rows / Unreleased entries                                                                   |

---

# Part A — OMN-313: guided-decision workflow

### Task 1: Skill reference `workflow-guided-review.md`

**Files:**

- Create: `docs/skills/omnifocus-assistant/references/workflow-guided-review.md`

- [ ] **Step 1: Create the reference file with this exact content**

````markdown
# Workflow: Guided Review (one decision at a time)

> Reference for the `omnifocus-assistant` skill. Loaded on demand — see the reference map in `SKILL.md`. This file is
> canonical for its topic; edit it directly. The `guided_review` MCP prompt mirrors it for non-skill clients.

**Purpose.** Replace "do the weekly review" with "here are N things that need a decision — let's resolve them one at a
time." The server scans and evidences; you present; the user judges. Never present a scoreboard of everything open.

## Modes

| Mode              | Time      | Queues, in this order                                            | Population                           |
| ----------------- | --------- | ---------------------------------------------------------------- | ------------------------------------ |
| `quick` (default) | 10–15 min | missing_next_actions → deadline_health → waiting_for             | Today's `list_for_review` slice only |
| `standard`        | 30 min    | quick + dormant_projects → on-hold projects → wip_limits         | All active + on-hold projects        |
| `deep`            | 60 min    | standard + clarify_candidates → review_gaps → productivity check | Whole database                       |

## Step 1 — fetch the queues (two calls, never per-project fan-out)

```
omnifocus_analyze({ analysis: { type: "manage_reviews", params: { operation: "list_for_review" } } })
omnifocus_analyze({ analysis: { type: "pattern_analysis", params: { insights: [
  "missing_next_actions", "deadline_health", "waiting_for"            // quick
  , "dormant_projects", "wip_limits"                                  // + standard
  , "clarify_candidates", "review_gaps"                               // + deep
] } } })
```

Where each queue's items live in the `pattern_analysis` response:

| Queue                | Path                                                                                                | Surfacing reason to quote                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| missing_next_actions | `data.missing_next_actions.items[]` `{id,name,folder,task_count}`                                   | "active, 0 available tasks, N tasks total"                                               |
| deadline_health      | `data.deadline_health.items.overdue_samples[]` `{id,name,project,days_overdue}` (+ `overdue_count`) | "due N days ago"                                                                         |
| waiting_for          | `data.waiting_for.items.candidates[]` `{id,name,screen_reasons,note_head,defer_date,…}`             | the `screen_reasons` + `defer_date` — this is a **screen**, judge each from its evidence |
| dormant_projects     | `data.dormant_projects.items[]` `{id,name,days_dormant,last_modified,available_tasks}`              | "no change in N days"                                                                    |
| on-hold projects     | `omnifocus_read({ query: { type: "projects", filters: { status: "on_hold" } } })`                   | "on hold; N tasks" (until the `onhold_reactivation` detector lands — OMN-315)            |
| wip_limits           | `data.wip_limits.items.projects_over_limit[]`                                                       | "N available actions at once"                                                            |
| clarify_candidates   | `data.clarify_candidates.items.candidates[]`                                                        | screen reasons — judge from evidence                                                     |
| review_gaps          | `data.review_gaps.items.never_reviewed[]` / `.overdue[]`                                            | "never reviewed" / "review overdue"                                                      |

**Quick mode population:** keep only items whose project id appears in `list_for_review`'s `data.projects[]` with
`reviewStatus` of `overdue` or `due_today`. If that slice is empty, say so and offer `standard`.

## Step 2 — the loop (one item per turn)

For each item, in queue order, oldest/most-overdue first within a queue:

1. **State the item and the reason, quoted from the evidence** — numbers and dates from the bundle, never an inferred
   motive. "Library Wi-Fi migration — active, 0 available tasks, last modified 19 days ago."
2. **Ask for one decision outcome** from this fixed set (an _output_ vocabulary — nothing here scans task text):

   | Outcome   | Means                              | Write                                                                  |
   | --------- | ---------------------------------- | ---------------------------------------------------------------------- |
   | `define`  | name the next physical action      | `omnifocus_write` create task in the project                           |
   | `hold`    | intentionally dormant until a date | project `status: "on_hold"`, optionally a defer date on its first task |
   | `handoff` | routine tail goes to someone else  | see Handoff below                                                      |
   | `drop`    | no longer a commitment             | project/task `status: "dropped"`                                       |
   | `done`    | it is actually finished            | `complete`                                                             |
   | `skip`    | no decision today                  | no write — log it                                                      |

3. **Embed the confirmation in the question** — "Put this on hold until Sept 15?" — then apply the write. No separate
   confirmation ceremony for single writes; `drop` on a project with >5 open tasks gets one explicit "this drops N tasks
   — confirm?".
4. **Append one line to the vault log** (format below). Move to the next item. Show the remaining count only if asked.

After the last item of a project-level queue, mark the touched projects reviewed in ONE call:
`omnifocus_analyze({ analysis: { type: "manage_reviews", params: { operation: "mark_reviewed", projectIds: [ ... ] } } })`
— check `data.batch.results.failed` before assuming success.

## Handoff outcome

Read the project's open tasks and note (`omnifocus_read` tasks with `filters: { project: "<name>" }` + the project row
with `details: true`). Propose, as ONE editable list, then apply via `omnifocus_write` batch after the user edits:

- "Document current state of <project>" (task, in the project, due in 3 days)
- "Walk <person> through <the solved part>" (task, in the project)
- "<person>: <remaining routine task>" for each task being delegated, tagged with the delegate's tag if one exists
- "Waiting: <person> — <project> handoff" tagged `@waiting-for`, deferred 7 days

Novel-vs-routine is the user's call; do not assert it — ask "does the design part feel finished?"

## Vault log

File: `GTD/Review Log.md` in the Obsidian vault (create it with a `# Review Log` heading if absent). Append one line per
decision:

```
2026-09-01 | quick | Library Wi-Fi migration (project) | missing_next_actions | define
2026-09-01 | quick | Ask Ryan about LDAP cutover (task) | waiting_for | skip
```

Rules: item **name**, never an `omnifocus:///` URI (vault→OF links go dead by design); the outcome only, never a reason
you inferred; `skip` is a first-class line — it is the most informative one.

Write it with the Obsidian CLI (`obsidian` … redirected to a temp file) or by appending to the vault file directly;
avoid 3-byte UTF-8 characters adjacent to spaces in CLI `content=` (known hang).

## One-time setup: stagger review dates (runbook step the user runs)

`quick` mode needs a daily slice. Spread weekly-cadence projects across Mon–Fri once:

1. `omnifocus_read({ query: { type: "projects", filters: { status: "active" }, fields: ["id","name","reviewInterval","nextReviewDate"] } })`
2. Split the ids into five groups (round-robin by name).
3. For group k (k = 0..4): `manage_reviews` `set_schedule` with `projectIds: [group k]`,
   `reviewInterval: { unit: "weeks", steps: 1 }`, then `mark_reviewed` with `reviewDate` = next Monday + k days.
   `nextReviewDate` recomputes from `lastReviewDate + interval`.
4. Projects with longer intervals (monthly, quarterly) are left alone.

## Anti-patterns

- Listing 47 items and asking "which first?" — that is the weekly review's load reproduced in chat.
- Inventing a reason ("you seem to be avoiding this").
- Skipping the log line on `skip`.
- Calling `mark_reviewed` per project (use the batch form).
````

- [ ] **Step 2: Run the formatter on the new file**

Run:
`npx prettier --write docs/skills/omnifocus-assistant/references/workflow-guided-review.md && npx prettier --check docs/skills/omnifocus-assistant/references/workflow-guided-review.md`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 3: Commit**

```bash
git add docs/skills/omnifocus-assistant/references/workflow-guided-review.md
git commit -m "docs(OMN-313): guided-review skill reference — one decision at a time"
```

### Task 2: SKILL.md reference-map row

**Files:**

- Modify: `docs/skills/omnifocus-assistant/SKILL.md` (the reference-map table, the row that starts `| "Weekly review"`)

- [ ] **Step 1: Add a row directly BELOW the "Weekly review" row**

The table has two columns (Trigger | file). Insert:

```markdown
| "Guided review" / "what needs a decision?" / "quick review" — one item at a time over the existing detectors; a
`quick` pass needs today's `manage_reviews.list_for_review` slice, so also read `references/workflow-weekly-review.md`
steps 9–10 for the batch `mark_reviewed` envelope | `references/workflow-guided-review.md` |
```

Run `npx prettier --write docs/skills/omnifocus-assistant/SKILL.md` to re-align the table.

- [ ] **Step 2: Verify the path tests still resolve**

Run: `npx vitest tests/unit/docs --run` Expected: all passing (the path-rot tests read every `references/*.md` mention).

- [ ] **Step 3: Commit**

```bash
git add docs/skills/omnifocus-assistant/SKILL.md
git commit -m "docs(OMN-313): route 'guided review' requests to the new reference"
```

### Task 3: `GuidedReviewPrompt` — failing test first

**Files:**

- Create: `tests/unit/prompts/GuidedReviewPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { GuidedReviewPrompt, QUEUES_BY_MODE, DECISION_OUTCOMES } from '../../../src/prompts/gtd/GuidedReviewPrompt.js';

const textOf = (p: GuidedReviewPrompt, args: Record<string, unknown>) =>
  p
    .generateMessages(args)
    .map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');

describe('GuidedReviewPrompt', () => {
  const prompt = new GuidedReviewPrompt();

  it('is named guided_review and takes only an optional mode argument', () => {
    expect(prompt.name).toBe('guided_review');
    expect(prompt.arguments).toEqual([
      { name: 'mode', description: expect.stringContaining('quick'), required: false },
    ]);
  });

  it('defaults to quick mode and lists the quick queues in order', () => {
    const text = textOf(prompt, {});
    expect(text).toContain('Mode: quick');
    const order = QUEUES_BY_MODE.quick.map((q) => text.indexOf(q));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(text).not.toContain('clarify_candidates');
  });

  it('standard and deep are supersets in the spec order', () => {
    expect(QUEUES_BY_MODE.standard.slice(0, 3)).toEqual(QUEUES_BY_MODE.quick);
    expect(QUEUES_BY_MODE.deep.slice(0, QUEUES_BY_MODE.standard.length)).toEqual(QUEUES_BY_MODE.standard);
    expect(QUEUES_BY_MODE.deep).toEqual([
      'missing_next_actions',
      'deadline_health',
      'waiting_for',
      'dormant_projects',
      'on_hold_projects',
      'wip_limits',
      'clarify_candidates',
      'review_gaps',
      'productivity_check',
    ]);
  });

  it('rejects an unknown mode loudly rather than silently falling back', () => {
    expect(() => prompt.generateMessages({ mode: 'weekly' })).toThrow(/mode must be one of quick, standard, deep/);
  });

  it('states the fixed decision-outcome vocabulary and that nothing scans task text', () => {
    const text = textOf(prompt, { mode: 'deep' });
    for (const o of DECISION_OUTCOMES) expect(text).toContain(`\`${o}\``);
    expect(DECISION_OUTCOMES).toEqual(['define', 'hold', 'handoff', 'drop', 'done', 'skip']);
    expect(text).toMatch(/output vocabulary/i);
    expect(text).toMatch(/one (item|decision) at a time/i);
    expect(text).toContain('GTD/Review Log.md');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest tests/unit/prompts/GuidedReviewPrompt.test.ts --run` Expected: FAIL —
`Cannot find module '../../../src/prompts/gtd/GuidedReviewPrompt.js'`

### Task 4: `GuidedReviewPrompt` — implementation + registration

**Files:**

- Create: `src/prompts/gtd/GuidedReviewPrompt.ts`
- Modify: `src/prompts/index.ts` (import + `promptInstances`)
- Modify: `src/prompts/reference/QuickReferencePrompt.ts` (the `## Available Prompts` block)

- [ ] **Step 1: Write the prompt**

```ts
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import { BasePrompt, PromptArgument } from '../base.js';

/**
 * OMN-313 — guided review: "N decisions, one at a time" over the detectors
 * that already exist. Mirrors docs/skills/omnifocus-assistant/references/
 * workflow-guided-review.md (canonical). Externalize salience, not agency:
 * the server scans + evidences, this prompt presents, the user judges.
 */
export const REVIEW_MODES = ['quick', 'standard', 'deep'] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

// Order is the presentation order. `on_hold_projects` and `productivity_check`
// are read/analyze calls, not pattern_analysis detectors — see NON_DETECTOR_QUEUES.
export const QUEUES_BY_MODE: Record<ReviewMode, readonly string[]> = {
  quick: ['missing_next_actions', 'deadline_health', 'waiting_for'],
  standard: [
    'missing_next_actions',
    'deadline_health',
    'waiting_for',
    'dormant_projects',
    'on_hold_projects',
    'wip_limits',
  ],
  deep: [
    'missing_next_actions',
    'deadline_health',
    'waiting_for',
    'dormant_projects',
    'on_hold_projects',
    'wip_limits',
    'clarify_candidates',
    'review_gaps',
    'productivity_check',
  ],
};

// An OUTPUT vocabulary — the choices the user can make after judging an item.
// Not a text screen: nothing in this workflow scans task names or notes for
// words (the OMN-258 verb-whitelist screen is a different, demoted thing).
export const DECISION_OUTCOMES = ['define', 'hold', 'handoff', 'drop', 'done', 'skip'] as const;

const NON_DETECTOR_QUEUES = new Set(['on_hold_projects', 'productivity_check']);

function parseMode(raw: unknown): ReviewMode {
  const mode = raw === undefined || raw === null || raw === '' ? 'quick' : String(raw);
  if (!(REVIEW_MODES as readonly string[]).includes(mode)) {
    throw new Error(`guided_review: mode must be one of quick, standard, deep (got ${JSON.stringify(raw)})`);
  }
  return mode as ReviewMode;
}

export class GuidedReviewPrompt extends BasePrompt {
  name = 'guided_review';
  description =
    'Guided review, one decision at a time: fetch the decision queues (existing detectors), present each item with its ' +
    'surfacing reason quoted from the evidence, ask for one outcome, apply it, log it. Modes: quick | standard | deep.';

  arguments: PromptArgument[] = [
    {
      name: 'mode',
      description: "quick (default, 10–15 min, today's review slice) | standard | deep",
      required: false,
    },
  ];

  generateMessages(args: Record<string, unknown>): PromptMessage[] {
    const mode = parseMode(args.mode);
    const queues = QUEUES_BY_MODE[mode];
    const detectors = queues.filter((q) => !NON_DETECTOR_QUEUES.has(q));

    const population =
      mode === 'quick'
        ? "Only items whose project appears in list_for_review's data.projects[] with reviewStatus overdue or due_today. If that slice is empty, say so and offer standard."
        : mode === 'standard'
          ? 'All active and on-hold projects.'
          : 'The whole database.';

    const extraCalls = [
      queues.includes('on_hold_projects')
        ? 'on_hold_projects = omnifocus_read({ query: { type: "projects", filters: { status: "on_hold" } } }).'
        : '',
      queues.includes('productivity_check')
        ? 'productivity_check = omnifocus_analyze({ analysis: { type: "productivity_stats", params: { groupBy: "week" } } }) — read, do not act.'
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    return [
      {
        role: 'user',
        content: { type: 'text', text: `Run a guided review. Mode: ${mode}. One decision at a time.` },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `## Guided review — Mode: ${mode}

### Step 1 — fetch the queues (two calls, never a per-project fan-out)
\`\`\`
omnifocus_analyze({ analysis: { type: "manage_reviews", params: { operation: "list_for_review" } } })
omnifocus_analyze({ analysis: { type: "pattern_analysis", params: { insights: ${JSON.stringify(detectors)} } } })
\`\`\`
Queue order: ${queues.join(' → ')}.
Population: ${population}
${extraCalls}

### Step 2 — the loop, one item per turn
1. State the item and its reason QUOTED from the evidence bundle (counts, dates). Never an inferred motive.
2. Ask for one decision outcome from this fixed set — an output vocabulary, not a text screen; nothing here scans task text:
   ${DECISION_OUTCOMES.map((o) => `\`${o}\``).join(' · ')}
   define → create the next action · hold → status on_hold (+ date) · handoff → propose the handoff list, apply after the user edits it · drop → status dropped · done → complete · skip → no write, log it.
3. Embed the confirmation in the question ("Put this on hold until Sept 15?"), then apply the write.
4. Append one line to the vault file GTD/Review Log.md: \`YYYY-MM-DD | ${mode} | <name> (project|task) | <queue> | <outcome>\` — names, never omnifocus:/// URIs; the outcome only.
After a project-level queue, mark the touched projects reviewed in ONE manage_reviews mark_reviewed call with projectIds[]; check data.batch.results.failed.

Do not show a scoreboard of everything open. Show the remaining count only if asked.`,
        },
      },
      {
        role: 'user',
        content: { type: 'text', text: 'Fetch the queues and start with the first item.' },
      },
    ];
  }
}
```

- [ ] **Step 2: Register it in `src/prompts/index.ts`**

Add the import after `EisenhowerMatrixPrompt`:

```ts
import { GuidedReviewPrompt } from './gtd/GuidedReviewPrompt.js';
```

and in `promptInstances`, after `new EisenhowerMatrixPrompt(),`:

```ts
    new GuidedReviewPrompt(),
```

- [ ] **Step 3: Update the quick-reference list in `src/prompts/reference/QuickReferencePrompt.ts`**

Replace the block

```
## Available Prompts (5 GTD-focused)
1. \`gtd_principles\` - Core GTD methodology guide
2. \`gtd_process_inbox\` - Process inbox using pure GTD (2-minute rule)
3. \`eisenhower_matrix_inbox\` - Process inbox using priority quadrants
4. \`gtd_weekly_review\` - Complete weekly review workflow
5. \`quick_reference\` - This essential reference guide
```

with

```
## Available Prompts (6)
1. \`gtd_principles\` - Core GTD methodology guide
2. \`gtd_process_inbox\` - Process inbox using pure GTD (2-minute rule)
3. \`eisenhower_matrix_inbox\` - Process inbox using priority quadrants
4. \`gtd_weekly_review\` - Complete weekly review workflow
5. \`guided_review\` - One decision at a time over the review queues (mode: quick | standard | deep)
6. \`quick_reference\` - This essential reference guide
```

(The "GTD-focused" label leaves the heading only because the count changes here; the Eisenhower relabel proper is
OMN-257 and is not this ticket's scope.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest tests/unit/prompts/GuidedReviewPrompt.test.ts --run` Expected: 5 passed

- [ ] **Step 5: Check the prompt is discoverable and the whole suite is green**

Run: `npm run build && npm run prompts:list | grep guided_review` Expected: a line naming `guided_review`. Run:
`npm run test:unit` Expected: all passing (the index test mocks `registerPrompts`; any prompt-count assertion elsewhere
fails here and must be updated to 6).

- [ ] **Step 6: Commit**

```bash
git add src/prompts/gtd/GuidedReviewPrompt.ts src/prompts/index.ts src/prompts/reference/QuickReferencePrompt.ts tests/unit/prompts/GuidedReviewPrompt.test.ts
git commit -m "feat(OMN-313): guided_review MCP prompt — one decision at a time over existing detectors"
```

### Task 5: CHANGELOG + verification gate

**Files:**

- Modify: `CHANGELOG.md` (under `## [Unreleased]`, add an `### Added` section above `### Changed` if none exists)

- [ ] **Step 1: Add the entry**

```markdown
### Added

- **`guided_review` MCP prompt + `workflow-guided-review.md` skill reference** (OMN-313) — "N decisions, one at a time"
  over the detectors that already exist (`missing_next_actions`, `deadline_health`, `waiting_for`, `dormant_projects`,
  `wip_limits`, `clarify_candidates`, `review_gaps`) and batched `manage_reviews`. Modes quick / standard / deep; a
  fixed decision-outcome vocabulary (define · hold · handoff · drop · done · skip) logged to the vault. No tool or
  schema change. Spec: `Technical/specs/Guided-Decision Review Layer - design.md` (vault).
```

- [ ] **Step 2: Run the full local gate**

Run: `npm run ci:local` Expected: build, lint (`--max-warnings=0`), format:check, test:unit all green. Also
`grep -rn 'console\.log' src/` shows only `src/utils/cli.ts`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(OMN-313): changelog"
```

### Task 6: Live dry run on `omnifocus-dev` (layer 6 — cannot be mocked)

**Files:** none (verification only; record results in the PR body)

- [ ] **Step 1: Read-only dry run of each mode through the dev server**

In a Claude Code session with the `omnifocus-dev` MCP server connected, invoke the prompt three times (`mode` = quick,
standard, deep) and follow Step 1 only (the two fetch calls). Record in the PR body, per mode: number of items per
queue, and one example surfacing line with its quoted numbers.

- [ ] **Step 2: One full loop iteration on a `__TEST__` fixture**

Create `__TEST__ guided-review fixture` project on dev with zero available tasks (one deferred task), confirm it appears
in `missing_next_actions`, walk it through `define` (creates a `__TEST__`-prefixed task), then delete the fixture. Write
the log line to a scratch note `GTD/Review Log (dev dry run).md` — NOT `GTD/Review Log.md` — and delete it afterwards.

- [ ] **Step 3: Open the draft PR**

```bash
git push -u origin HEAD
gh pr create --repo kip-d/omnifocus-mcp --draft --title "feat(OMN-313): guided_review prompt + skill reference (one decision at a time)" --body-file - <<'EOF'
Slice 1 of the guided-decision review layer. Spec: vault `Technical/specs/Guided-Decision Review Layer - design.md`.

No tool/schema change → Vertical Contract Matrix: rows 1–8 **N/A** (prompt + docs only).

Live dry run (omnifocus-dev): <paste Task 6 results>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Then stop: Kip runs `/code-review`; merge only on his per-PR go-ahead.

---

# Part B — OMN-314: inbox push trigger

Branch from the OMN-313 branch (the inbox item's last line points at the guided-review workflow).

### Task 7: Pure functions — failing tests first

**Files:**

- Create: `tests/unit/scripts/guided-review-push.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  buildQueue,
  buildInboxItem,
  decideAction,
  ITEM_PREFIX,
  type PatternData,
  type ReviewProject,
} from '../../../scripts/ops/guided-review-push.js';

const slice: ReviewProject[] = [
  { id: 'p1', name: 'Wi-Fi migration', reviewStatus: 'overdue' },
  { id: 'p2', name: 'Newstaff shelf rebuild', reviewStatus: 'due_today' },
  { id: 'p3', name: 'Quarterly budget', reviewStatus: 'scheduled' },
];

const patterns: PatternData = {
  missing_next_actions: {
    items: [
      { id: 'p1', name: 'Wi-Fi migration', folder: 'Library', task_count: 4 },
      { id: 'p3', name: 'Quarterly budget', folder: 'Library', task_count: 2 },
    ],
  },
  deadline_health: {
    items: {
      overdue_count: 1,
      overdue_samples: [{ id: 't9', name: 'Renew catalog cert', project: 'Newstaff shelf rebuild', days_overdue: 2 }],
    },
  },
  waiting_for: {
    items: {
      candidates: [
        {
          id: 't4',
          name: 'Ask Ryan about LDAP',
          project: 'Wi-Fi migration',
          project_id: 'p1',
          screen_reasons: ['waiting_tag'],
          defer_date: '2026-08-20',
        },
      ],
    },
  },
  dormant_projects: { items: [{ id: 'p3', name: 'Quarterly budget', days_dormant: 40 }] },
};

describe('buildQueue', () => {
  it('quick mode keeps only items whose project is overdue/due_today in the review slice, in queue order', () => {
    const q = buildQueue(patterns, slice, 'quick');
    expect(q.total).toBe(3);
    expect(q.perQueue).toEqual({ missing_next_actions: 1, deadline_health: 1, waiting_for: 1 });
    expect(q.top.map((t) => t.name)).toEqual(['Wi-Fi migration', 'Renew catalog cert', 'Ask Ryan about LDAP']);
    expect(q.top[0].reason).toBe('active, 0 available tasks, 4 tasks total');
    expect(q.top[1].reason).toBe('due 2 days ago');
    expect(q.top[2].reason).toBe('waiting_tag; deferred 2026-08-20');
  });

  it('deep mode adds dormant_projects and drops the slice filter', () => {
    const q = buildQueue(patterns, slice, 'deep');
    expect(q.perQueue).toEqual({ missing_next_actions: 2, deadline_health: 1, waiting_for: 1, dormant_projects: 1 });
    expect(q.total).toBe(5);
    expect(q.top).toHaveLength(3);
  });

  it('a task whose project is not in the slice is dropped in quick mode (task rows match by project name)', () => {
    const q = buildQueue(patterns, [slice[0]], 'quick');
    expect(q.perQueue).toEqual({ missing_next_actions: 1, deadline_health: 0, waiting_for: 1 });
  });

  it('marks the deadline count as a floor when the detector capped its samples', () => {
    const capped: PatternData = {
      ...patterns,
      deadline_health: {
        items: { overdue_count: 9, overdue_samples: patterns.deadline_health!.items!.overdue_samples },
      },
    };
    const q = buildQueue(capped, slice, 'deep');
    expect(q.floors).toEqual({ deadline_health: true });
  });
});

describe('buildInboxItem', () => {
  it('names the item with the count and writes a ≤10-line note ending with the start line', () => {
    const q = buildQueue(patterns, slice, 'quick');
    const item = buildInboxItem(q, 'quick', new Date('2026-09-01T07:00:00'));
    expect(item.name).toBe(`${ITEM_PREFIX}3 decisions waiting`);
    const lines = item.note.split('\n');
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(lines[0]).toBe('quick review — 2026-09-01');
    expect(lines).toContain('missing_next_actions: 1 · deadline_health: 1 · waiting_for: 1');
    expect(lines).toContain('- Wi-Fi migration — active, 0 available tasks, 4 tasks total');
    expect(lines.at(-1)).toBe('Start: ask Claude for a quick guided review');
  });

  it('uses the singular for one decision', () => {
    const q = buildQueue(
      { ...patterns, missing_next_actions: { items: [] }, waiting_for: { items: { candidates: [] } } },
      slice,
      'quick',
    );
    expect(buildInboxItem(q, 'quick', new Date('2026-09-01T07:00:00')).name).toBe(`${ITEM_PREFIX}1 decision waiting`);
  });

  it('prints a + after a floored count', () => {
    const capped: PatternData = {
      ...patterns,
      deadline_health: {
        items: { overdue_count: 9, overdue_samples: patterns.deadline_health!.items!.overdue_samples },
      },
    };
    const item = buildInboxItem(buildQueue(capped, slice, 'deep'), 'deep', new Date('2026-09-05T07:00:00'));
    expect(item.note.split('\n')[1]).toContain('deadline_health: 1+');
  });
});

describe('decideAction', () => {
  it('creates when no open review item exists', () => {
    expect(decideAction([], 3)).toEqual({ action: 'create' });
  });
  it('updates the existing open item instead of creating a second one', () => {
    expect(decideAction([{ id: 'x1', name: `${ITEM_PREFIX}5 decisions waiting` }], 3)).toEqual({
      action: 'update',
      id: 'x1',
    });
  });
  it('does nothing when there are zero decisions and no open item (silence is the signal)', () => {
    expect(decideAction([], 0)).toEqual({ action: 'none' });
  });
  it('still updates an existing item to 0 so a stale count never lingers', () => {
    expect(decideAction([{ id: 'x1', name: `${ITEM_PREFIX}5 decisions waiting` }], 0)).toEqual({
      action: 'update',
      id: 'x1',
    });
  });
  it('ignores inbox rows that merely contain the prefix mid-name', () => {
    expect(decideAction([{ id: 'x2', name: `Book: ${ITEM_PREFIX}notes` }], 2)).toEqual({ action: 'create' });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest tests/unit/scripts/guided-review-push.test.ts --run` Expected: FAIL — cannot find module
`scripts/ops/guided-review-push.js`

### Task 8: Pure functions — implementation

**Files:**

- Create: `scripts/ops/guided-review-push.ts` (pure part; `main()` is added in Task 9)

- [ ] **Step 1: Write the module**

```ts
#!/usr/bin/env node
/**
 * guided-review-push (OMN-314) — the push half of the guided-decision review
 * layer. Runs the existing detectors unprompted and puts "N decisions waiting"
 * where the user already looks: an OmniFocus INBOX item (decision D1).
 *
 * Deterministic — no model runs here. Counting is the server's job (scan);
 * judging is the user's, in the guided_review session the item points at.
 *
 * Idempotent: one open `Review: …` inbox item is UPDATED, never duplicated.
 * Silent on zero: no decisions → no item created (a daily "nothing to do"
 * entry trains the eye to skip the prefix). An existing item is updated to 0
 * so a stale count never lingers; completing it is the user's act.
 *
 * Usage (prod): npx tsx scripts/ops/guided-review-push.ts <path>/dist/index.js [--mode quick|deep]
 * Env: OF_MCP_REVIEW_ITEM_PREFIX overrides "Review: " (dev server needs "__TEST__ Review: ").
 */
import { StdioJsonRpcTransport } from '../../tests/integration/helpers/stdio-jsonrpc-transport.js';
import { isRunDirectly } from '../lib/run-directly.js';

export const ITEM_PREFIX = process.env.OF_MCP_REVIEW_ITEM_PREFIX ?? 'Review: ';
export const startLine = (mode: PushMode): string => `Start: ask Claude for a ${mode} guided review`;

export type PushMode = 'quick' | 'deep';

export interface ReviewProject {
  id: string;
  name: string;
  reviewStatus: string; // overdue | due_today | due_soon | scheduled | no_schedule
}

// Only the fields this script reads; every other detector field is ignored.
export interface PatternData {
  missing_next_actions?: { items?: Array<{ id: string; name: string; folder?: string; task_count?: number }> };
  deadline_health?: {
    items?: {
      overdue_count?: number;
      overdue_samples?: Array<{ id: string; name: string; project?: string; days_overdue: number }>;
    };
  };
  waiting_for?: {
    items?: {
      candidates?: Array<{
        id: string;
        name: string;
        project?: string;
        project_id?: string;
        screen_reasons?: string[];
        defer_date?: string | null;
      }>;
    };
  };
  dormant_projects?: { items?: Array<{ id: string; name: string; days_dormant: number }> };
}

export interface QueueItem {
  queue: string;
  id: string;
  name: string;
  reason: string;
  projectId?: string;
  projectName?: string;
}
export interface Queue {
  total: number;
  perQueue: Record<string, number>;
  /** queue → true when the detector capped its rows, so the count is a floor */
  floors: Record<string, boolean>;
  top: QueueItem[];
}

export const QUEUE_ORDER: Record<PushMode, string[]> = {
  quick: ['missing_next_actions', 'deadline_health', 'waiting_for'],
  deep: ['missing_next_actions', 'deadline_health', 'waiting_for', 'dormant_projects'],
};
const TOP_N = 3;

function extract(patterns: PatternData, queue: string): QueueItem[] {
  switch (queue) {
    case 'missing_next_actions':
      return (patterns.missing_next_actions?.items ?? []).map((p) => ({
        queue,
        id: p.id,
        name: p.name,
        projectId: p.id,
        projectName: p.name,
        reason: `active, 0 available tasks, ${p.task_count ?? 0} tasks total`,
      }));
    case 'deadline_health':
      return (patterns.deadline_health?.items?.overdue_samples ?? []).map((t) => ({
        queue,
        id: t.id,
        name: t.name,
        projectName: t.project,
        reason: `due ${t.days_overdue} day${t.days_overdue === 1 ? '' : 's'} ago`,
      }));
    case 'waiting_for':
      return (patterns.waiting_for?.items?.candidates ?? []).map((t) => ({
        queue,
        id: t.id,
        name: t.name,
        projectId: t.project_id,
        projectName: t.project,
        reason: `${(t.screen_reasons ?? []).join(', ') || 'screen'}${t.defer_date ? `; deferred ${t.defer_date}` : ''}`,
      }));
    case 'dormant_projects':
      return (patterns.dormant_projects?.items ?? []).map((p) => ({
        queue,
        id: p.id,
        name: p.name,
        projectId: p.id,
        projectName: p.name,
        reason: `no change in ${p.days_dormant} days`,
      }));
    default:
      return [];
  }
}

/** Quick mode = only items whose project is due for review today (overdue | due_today). Deep = everything. */
export function buildQueue(patterns: PatternData, slice: ReviewProject[], mode: PushMode): Queue {
  const due = slice.filter((p) => p.reviewStatus === 'overdue' || p.reviewStatus === 'due_today');
  const dueIds = new Set(due.map((p) => p.id));
  const dueNames = new Set(due.map((p) => p.name));
  const inSlice = (i: QueueItem): boolean =>
    mode === 'deep' || (i.projectId ? dueIds.has(i.projectId) : i.projectName ? dueNames.has(i.projectName) : false);

  const perQueue: Record<string, number> = {};
  const floors: Record<string, boolean> = {};
  const all: QueueItem[] = [];
  for (const q of QUEUE_ORDER[mode]) {
    const items = extract(patterns, q).filter(inSlice);
    perQueue[q] = items.length;
    all.push(...items);
  }
  // deadline_health returns at most 5 samples; if the detector saw more, the count above is a floor.
  const dh = patterns.deadline_health?.items;
  if (dh && (dh.overdue_count ?? 0) > (dh.overdue_samples?.length ?? 0)) floors.deadline_health = true;

  return { total: all.length, perQueue, floors, top: all.slice(0, TOP_N) };
}

export function buildInboxItem(queue: Queue, mode: PushMode, now: Date): { name: string; note: string } {
  const n = queue.total;
  const name = `${ITEM_PREFIX}${n} decision${n === 1 ? '' : 's'} waiting`;
  const date = now.toISOString().slice(0, 10);
  const counts = Object.entries(queue.perQueue)
    .map(([q, c]) => `${q}: ${c}${queue.floors[q] ? '+' : ''}`)
    .join(' · ');
  const lines = [
    `${mode} review — ${date}`,
    counts,
    ...queue.top.map((t) => `- ${t.name} — ${t.reason}`),
    startLine(mode),
  ];
  return { name, note: lines.slice(0, 10).join('\n') };
}

export function decideAction(
  openInboxTasks: Array<{ id: string; name: string }>,
  total: number,
): { action: 'create' } | { action: 'update'; id: string } | { action: 'none' } {
  const existing = openInboxTasks.find((t) => t.name.startsWith(ITEM_PREFIX));
  if (existing) return { action: 'update', id: existing.id };
  return total > 0 ? { action: 'create' } : { action: 'none' };
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npx vitest tests/unit/scripts/guided-review-push.test.ts --run` Expected: 12 passed

- [ ] **Step 3: Typecheck the test tree (vitest strips types — this is what catches signature drift)**

Run: `npm run typecheck:test` Expected: no errors (the unused `isRunDirectly`/`StdioJsonRpcTransport` imports are
consumed in Task 9; if lint complains before then, do Task 9 first and run lint once).

- [ ] **Step 4: Commit**

```bash
git add scripts/ops/guided-review-push.ts tests/unit/scripts/guided-review-push.test.ts
git commit -m "feat(OMN-314): guided-review push — queue, inbox-item text, create-vs-update (pure functions, TDD)"
```

### Task 9: `main()` — drive the server

**Files:**

- Modify: `scripts/ops/guided-review-push.ts` (append below `decideAction`)
- Modify: `tests/unit/scripts/guided-review-push.test.ts` (add `parseArgs` tests)

- [ ] **Step 1: Append the driver**

```ts
// ─── driver ─────────────────────────────────────────────────────────────────

export interface PushArgs {
  server: string;
  mode: PushMode;
  timeoutMs: number;
}
export class UsageError extends Error {}

export function parseArgs(argv: string[]): PushArgs {
  const [server, ...rest] = argv;
  if (!server) {
    throw new UsageError('usage: guided-review-push.ts <path-to-dist/index.js> [--mode quick|deep] [--timeout <ms>]');
  }
  let mode: PushMode = 'quick';
  let timeoutMs = 180_000;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--mode') {
      const m = rest[++i];
      if (m !== 'quick' && m !== 'deep')
        throw new UsageError(`--mode must be quick or deep (got ${JSON.stringify(m)})`);
      mode = m;
    } else if (rest[i] === '--timeout') {
      timeoutMs = Number(rest[++i]);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        throw new UsageError('--timeout needs a positive number of ms');
    } else {
      throw new UsageError(`unknown argument ${rest[i]}`);
    }
  }
  return { server, mode, timeoutMs };
}

// JSON-RPC payloads are untyped by design here (same as scripts/verify-deploy.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */
async function main(): Promise<void> {
  const { server, mode, timeoutMs } = parseArgs(process.argv.slice(2));
  const transport = new StdioJsonRpcTransport({ serverPath: server });
  transport.start();
  transport.child.once('exit', (code, signal) => {
    transport.rejectAllPending(new Error(`server exited unexpectedly (code ${code}, signal ${signal})`));
  });
  const rpc = (method: string, params: unknown): Promise<any> =>
    transport.sendRequest({ jsonrpc: '2.0', id: transport.nextId(), method, params }, timeoutMs);
  const call = async (name: string, args: unknown): Promise<any> => {
    const res = await rpc('tools/call', { name, arguments: args });
    if (res.error) throw new Error(`${name}: JSON-RPC error ${JSON.stringify(res.error)}`);
    const parsed = JSON.parse(res.result.content[0].text);
    if (parsed.success === false) throw new Error(`${name}: ${JSON.stringify(parsed.error ?? parsed)}`);
    return parsed;
  };

  try {
    const init = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'guided-review-push', version: '1.0.0' },
    });
    if (init.error) throw new Error(`initialize: ${JSON.stringify(init.error)}`);
    transport.sendNotification('notifications/initialized', {});

    // Refuse a stale build: the same probe verify-deploy uses (buildId + stale flag).
    const version = await call('system', { operation: 'version' });
    const vd = version.data ?? version;
    if (vd.stale === true) {
      throw new Error(`server build is stale (buildId ${vd.buildId}); rebuild before running the push`);
    }

    const reviews = await call('omnifocus_analyze', {
      analysis: { type: 'manage_reviews', params: { operation: 'list_for_review' } },
    });
    const slice: ReviewProject[] = (reviews.data?.projects ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      reviewStatus: p.reviewStatus,
    }));

    const patterns = await call('omnifocus_analyze', {
      analysis: { type: 'pattern_analysis', params: { insights: QUEUE_ORDER[mode] } },
    });
    const queue = buildQueue(patterns.data as PatternData, slice, mode);

    const inbox = await call('omnifocus_read', {
      query: {
        type: 'tasks',
        mode: 'inbox',
        filters: { name: { contains: ITEM_PREFIX.trim() } },
        fields: ['id', 'name'],
        limit: 20,
      },
    });
    const open: Array<{ id: string; name: string }> = (inbox.data?.tasks ?? inbox.data?.items ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
    }));

    const decision = decideAction(open, queue.total);
    const item = buildInboxItem(queue, mode, new Date());
    if (decision.action === 'none') {
      console.error('guided-review-push: 0 decisions, no open item — nothing to do');
    } else if (decision.action === 'create') {
      const r = await call('omnifocus_write', {
        mutation: { operation: 'create', target: 'task', data: { name: item.name, note: item.note } },
      });
      console.error(`guided-review-push: CREATED ${item.name} (${r.data?.task?.taskId ?? '?'})`);
    } else {
      await call('omnifocus_write', {
        mutation: {
          operation: 'update',
          target: 'task',
          id: decision.id,
          changes: { name: item.name, note: item.note },
        },
      });
      console.error(`guided-review-push: UPDATED ${decision.id} → ${item.name}`);
    }
    console.error(`guided-review-push: ${JSON.stringify(queue.perQueue)}`);
  } finally {
    await transport.close({ graceful: true });
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

if (isRunDirectly(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof UsageError ? e.message : `guided-review-push FAILED: ${(e as Error).message}`);
    process.exit(e instanceof UsageError ? 2 : 1);
  });
}
```

(`console.error` is deliberate: this is not the MCP server, and keeping stdout empty means the wrapper's log is the only
place output lands. The `no-console` sweep in CLAUDE.md is over `src/`; this file is under `scripts/`.)

- [ ] **Step 2: Add `parseArgs` tests to the same test file**

```ts
import { parseArgs, UsageError } from '../../../scripts/ops/guided-review-push.js';

describe('parseArgs', () => {
  it('defaults to quick with a 180s timeout', () => {
    expect(parseArgs(['dist/index.js'])).toEqual({ server: 'dist/index.js', mode: 'quick', timeoutMs: 180_000 });
  });
  it('accepts --mode deep and --timeout', () => {
    expect(parseArgs(['dist/index.js', '--mode', 'deep', '--timeout', '5000'])).toEqual({
      server: 'dist/index.js',
      mode: 'deep',
      timeoutMs: 5000,
    });
  });
  it('rejects a missing server path and an unknown mode as usage errors', () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs(['dist/index.js', '--mode', 'standard'])).toThrow(/quick or deep/);
  });
});
```

- [ ] **Step 3: Run tests + typecheck + lint**

Run: `npx vitest tests/unit/scripts/guided-review-push.test.ts --run && npm run typecheck:test && npm run lint`
Expected: 15 passed; no type errors; lint clean.

- [ ] **Step 4: Commit**

```bash
git add scripts/ops/guided-review-push.ts tests/unit/scripts/guided-review-push.test.ts
git commit -m "feat(OMN-314): guided-review push driver — list_for_review + pattern_analysis → idempotent inbox item"
```

### Task 10: launchd wrapper `of-mcp-guided-review`

**Files:**

- Create: `scripts/ops/of-mcp-guided-review` (mode 755)

- [ ] **Step 1: Write the wrapper**

```bash
#!/usr/bin/env bash
# of-mcp-guided-review — launchd wrapper for the guided-review inbox push (OMN-314).
#
# Canonical source: scripts/ops/of-mcp-guided-review in the omnifocus-mcp repo.
# Deploy with scripts/ops/install-guided-review-schedule.sh. Do NOT hand-edit
# the deployed copy — edit here and re-run the installer.
#
# WHAT IT DOES: runs scripts/ops/guided-review-push.ts against the prod server
# in $OF_MCP_REPO_DIR. That script counts the review decisions waiting and
# creates/updates ONE OmniFocus inbox item ("Review: N decisions waiting"). It
# writes to the real database — one inbox task, by design (spec D1).
#
# Saturday runs use --mode deep (adds dormant_projects); weekdays are quick.
set -euo pipefail

brew_dirs=()
for d in /opt/homebrew/bin /usr/local/bin; do
  [ -d "$d" ] && brew_dirs+=("$d")
done
if [ ${#brew_dirs[@]} -gt 0 ]; then
  PATH="$(IFS=:; printf '%s' "${brew_dirs[*]}"):$PATH"
fi
export PATH

REPO_DIR="${OF_MCP_REPO_DIR:-$HOME/omnifocus-mcp}"
LOG="${OF_MCP_GUIDED_REVIEW_LOG:-$HOME/.omnifocus-mcp/guided-review.log}"
RUN_TIMEOUT="${OF_MCP_GUIDED_REVIEW_TIMEOUT:-600}"

mkdir -p "$(dirname "$LOG")"
cd "$REPO_DIR" || { echo "of-mcp-guided-review: repo dir not found: $REPO_DIR" >&2; exit 1; }
log() { echo "$*" >> "$LOG"; }

# Bounded run — same shape as of-mcp-integration's run_bounded, deliberately NOT
# --foreground (that flag disables the descendant kill we want). 124 = timeout.
TIMEOUT_CMD=""
for c in timeout gtimeout; do
  command -v "$c" >/dev/null 2>&1 && { TIMEOUT_CMD="$c"; break; }
done
run_bounded() {
  local secs="$1"; shift
  local rc=0
  if [ -n "$TIMEOUT_CMD" ]; then
    "$TIMEOUT_CMD" -k 30s "$secs" "$@" >> "$LOG" 2>&1 || rc=$?
    return "$rc"
  fi
  set -m
  "$@" >> "$LOG" 2>&1 &
  local child=$!
  set +m
  ( sleep "$secs"; kill -9 -"$child" 2>/dev/null || kill -9 "$child" 2>/dev/null ) >/dev/null 2>&1 &
  local wd=$!
  disown "$wd" 2>/dev/null || true
  wait "$child" 2>/dev/null || rc=$?
  if ! kill "$wd" 2>/dev/null; then [ "$rc" -eq 137 ] && rc=124; fi
  return "$rc"
}

log ""
log "===== run $(date '+%Y-%m-%d %H:%M:%S %Z') ====="

# Fail-safe, not an operating mode: OmniFocus normally runs all day on this
# machine. pgrep (not `tell application`, which auto-launches; not System
# Events, which fails under launchd) covers the reboot window only.
if ! pgrep -x OmniFocus >/dev/null 2>&1; then
  log "STATUS: SKIPPED — OmniFocus is not running; nothing pushed."
  exit 0
fi

MODE="quick"
[ "$(date +%u)" = "6" ] && MODE="deep"

set +e
run_bounded "$RUN_TIMEOUT" npx tsx scripts/ops/guided-review-push.ts "$REPO_DIR/dist/index.js" --mode "$MODE"
rc=$?
set -e
case "$rc" in
  0)   log "STATUS: OK (mode=$MODE)" ;;
  124) log "STATUS: WEDGED — push exceeded ${RUN_TIMEOUT}s and was killed (mode=$MODE)"; exit 0 ;;
  *)   log "STATUS: FAILED — push exited $rc (mode=$MODE)"; exit "$rc" ;;
esac
```

- [ ] **Step 2: Make it executable and shellcheck it**

Run: `chmod +x scripts/ops/of-mcp-guided-review && shellcheck scripts/ops/of-mcp-guided-review` Expected: no output. If
`shellcheck` is absent: `brew install shellcheck`, or note "(shellcheck not attempted)" in the PR.

- [ ] **Step 3: Commit**

```bash
git add scripts/ops/of-mcp-guided-review
git commit -m "feat(OMN-314): launchd wrapper for the guided-review push (pgrep fail-safe, bounded run)"
```

### Task 11: plist template + installer

**Files:**

- Create: `scripts/ops/com.omnifocus-mcp.guided-review.plist.template`
- Create: `scripts/ops/install-guided-review-schedule.sh` (mode 755)

- [ ] **Step 1: Write the plist template (Mon–Sat 07:00 — D2)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated from scripts/ops/com.omnifocus-mcp.guided-review.plist.template by
     install-guided-review-schedule.sh (substitutes absolute paths and a
     Homebrew-aware PATH; launchd does NOT expand $HOME). Re-run the installer
     to update; do not hand-edit the deployed copy. -->
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.omnifocus-mcp.guided-review</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>__PATH_VALUE__</string>
      <key>OF_MCP_REPO_DIR</key>
      <string>__REPO_DIR__</string>
    </dict>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>__WRAPPER_PATH__</string>
    </array>
    <!-- Mon–Sat 07:00 (spec D2). Saturday's run is deep mode (the wrapper
         decides by weekday). Sunday is deliberately free: the diagnose job runs
         Sunday 09:00 and the integration suite Saturday 08:00 — this job
         finishes in well under a minute so 07:00 Saturday never overlaps. -->
    <key>StartCalendarInterval</key>
    <array>
      <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
      <dict><key>Weekday</key><integer>2</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
      <dict><key>Weekday</key><integer>3</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
      <dict><key>Weekday</key><integer>4</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
      <dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
      <dict><key>Weekday</key><integer>6</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    </array>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>__LAUNCHD_LOG__</string>
    <key>StandardErrorPath</key>
    <string>__LAUNCHD_LOG__</string>
  </dict>
</plist>
```

- [ ] **Step 2: Write the installer by copying the integration one and substituting names**

```bash
cp scripts/ops/install-integration-schedule.sh scripts/ops/install-guided-review-schedule.sh
sed -i '' \
  -e 's/install-integration-schedule\.sh/install-guided-review-schedule.sh/g' \
  -e 's/com\.omnifocus-mcp\.integration/com.omnifocus-mcp.guided-review/g' \
  -e 's/of-mcp-integration/of-mcp-guided-review/g' \
  -e 's/integration-launchd\.log/guided-review-launchd.log/g' \
  -e 's#\$HOME/.omnifocus-mcp/integration\.log#$HOME/.omnifocus-mcp/guided-review.log#g' \
  -e 's/weekly integration-suite launchd job/guided-review inbox-push launchd job (OMN-314)/' \
  scripts/ops/install-guided-review-schedule.sh
chmod +x scripts/ops/install-guided-review-schedule.sh
```

Then open the file and fix by hand: the header comment's `--verify` note ("runs the FULL suite ~15 min") → "runs the
push once through launchd (seconds) and creates/updates one inbox item"; the `docs/dev/integration-scheduling.md`
pointer → `docs/dev/guided-review-push.md`. Read the whole file once — any remaining "suite" wording is a miss.

- [ ] **Step 3: Diff against the original to confirm only names changed**

Run:
`diff scripts/ops/install-integration-schedule.sh scripts/ops/install-guided-review-schedule.sh | grep '^[<>]' | grep -v 'integration\|guided-review\|suite' || true`
Expected: empty (every differing line mentions one of the renamed tokens).

- [ ] **Step 4: Commit**

```bash
git add scripts/ops/com.omnifocus-mcp.guided-review.plist.template scripts/ops/install-guided-review-schedule.sh
git commit -m "feat(OMN-314): launchd plist (Mon–Sat 07:00) + installer for the guided-review push"
```

### Task 12: Runbook + index rows + changelog

**Files:**

- Create: `docs/dev/guided-review-push.md`
- Modify: `scripts/README.md` (ops table), `CHANGELOG.md`

- [ ] **Step 1: Write the runbook**

````markdown
# Guided-review inbox push (OMN-314)

The push half of the guided-decision review layer (spec: vault
`Technical/specs/Guided-Decision Review Layer - design.md`). A launchd job runs the existing detectors and creates or
updates **one** OmniFocus inbox item — `Review: N decisions waiting` — so the review starts from the inbox the user
already processes (decision D1). The item's last note line points at the `guided_review` prompt /
`workflow-guided-review.md` skill reference (OMN-313).

## Layout

| Committed source                                             | Deployed to                                                    | Role                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------- |
| `scripts/ops/guided-review-push.ts`                          | — (run from the prod checkout)                                 | Counts, builds the item, creates/updates |
| `scripts/ops/of-mcp-guided-review`                           | `~/bin/of-mcp-guided-review`                                   | launchd wrapper: PATH, pgrep, bounded    |
| `scripts/ops/com.omnifocus-mcp.guided-review.plist.template` | `~/Library/LaunchAgents/com.omnifocus-mcp.guided-review.plist` | Mon–Sat 07:00; Saturday = deep mode      |
| `scripts/ops/install-guided-review-schedule.sh`              | —                                                              | Installs both, (re)loads the job         |

Edit the canonical files and re-run the installer — never hand-edit a deployed copy (repo-vs-`~/bin` drift is the
OMN-302 lesson).

## Behavior

| Rule                                                        | Why                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Zero decisions and no open item → nothing created           | A daily "nothing to do" item trains the eye to skip the prefix        |
| An open `Review: …` inbox item is updated, never duplicated | One item per unprocessed stretch, not five                            |
| The job never completes the item                            | Completing it is the user's act; the inbox count is the honest signal |
| OmniFocus not running → `STATUS: SKIPPED`, exit 0           | Fail-safe for the reboot window, not an operating mode                |
| Stale build (`system version` → `stale:true`) → `FAILED`    | Same probe `verify-deploy.ts` uses                                    |
| `deadline_health` count shows `N+`                          | The detector caps samples at 5; the count is a floor when it saw more |

## Install / verify / uninstall

```bash
scripts/ops/install-guided-review-schedule.sh            # install or reload
scripts/ops/install-guided-review-schedule.sh --verify   # kickstart once, then check the log
scripts/ops/install-guided-review-schedule.sh --uninstall
tail -20 ~/.omnifocus-mcp/guided-review.log
```

Manual run against any checkout (the dev server's sandbox guard only allows inbox tasks with the `__TEST__` prefix):

```bash
OF_MCP_REVIEW_ITEM_PREFIX="__TEST__ Review: " npx tsx scripts/ops/guided-review-push.ts <dev-checkout>/dist/index.js --mode quick
```

## Knobs

| Env                            | Default                              | Meaning                                                   |
| ------------------------------ | ------------------------------------ | --------------------------------------------------------- |
| `OF_MCP_REPO_DIR`              | `~/omnifocus-mcp`                    | Prod checkout the job runs against (baked into the plist) |
| `OF_MCP_GUIDED_REVIEW_LOG`     | `~/.omnifocus-mcp/guided-review.log` | Run log                                                   |
| `OF_MCP_GUIDED_REVIEW_TIMEOUT` | `600`                                | Seconds before the push is killed (124 = wedged)          |
| `OF_MCP_REVIEW_ITEM_PREFIX`    | `Review: `                           | Inbox item name prefix (dev server: `__TEST__ Review: `)  |
````

- [ ] **Step 2: Add the `scripts/README.md` rows** — same table style as the `verify-deploy.ts` row, one row per new
      file (`guided-review-push.ts`, `of-mcp-guided-review`, `install-guided-review-schedule.sh`); description from the
      runbook's Layout table, invocation from its Install section.

- [ ] **Step 3: CHANGELOG entry under `### Added`**

```markdown
- **Guided-review inbox push** (OMN-314) — `scripts/ops/guided-review-push.ts` + a Mon–Sat 07:00 launchd job
  (`of-mcp-guided-review`, installer, plist template) that runs the review detectors and creates/updates ONE OmniFocus
  inbox item `Review: N decisions waiting`; silent when nothing is waiting; Saturday runs deep mode. Runbook:
  `docs/dev/guided-review-push.md`.
```

- [ ] **Step 4: Gate**

Run: `npm run ci:local` Expected: green. `format:check` covers the three markdown files — fix with
`npx prettier --write` if it complains.

- [ ] **Step 5: Commit**

```bash
git add docs/dev/guided-review-push.md scripts/README.md CHANGELOG.md
git commit -m "docs(OMN-314): guided-review push runbook, script index rows, changelog"
```

### Task 13: Live verify on `omnifocus-dev` (layer 6) and draft PR

**Files:** none (record results in the PR body)

- [ ] **Step 1: Build the dev checkout and run the push twice**

```bash
npm run build
export OF_MCP_REVIEW_ITEM_PREFIX="__TEST__ Review: "
npx tsx scripts/ops/guided-review-push.ts "$PWD/dist/index.js" --mode deep   # first run → CREATED (deep so the count is >0 on a sandbox DB)
npx tsx scripts/ops/guided-review-push.ts "$PWD/dist/index.js" --mode deep   # second run → UPDATED <same id>
```

Expected stderr: `CREATED __TEST__ Review: N decisions waiting (<id>)` then `UPDATED <id> → …`. Then confirm exactly one
such inbox task exists:

```bash
npx tsx scripts/verify-deploy.ts "$PWD/dist/index.js" omnifocus_read '{"query":{"type":"tasks","mode":"inbox","filters":{"name":{"contains":"__TEST__ Review:"}},"fields":["id","name","note"]}}'
```

Expected: one row; note ≤ 10 lines; last line `Start: ask Claude for a deep guided review`. Delete the fixture task via
`omnifocus_write` `delete` and re-verify zero rows.

- [ ] **Step 2: Wrapper run through launchd on the dev checkout (proves the launchd context, not just the script)**

```bash
OF_MCP_REPO_DIR="$PWD" OF_MCP_BIN_DIR="$HOME/bin" OF_MCP_REVIEW_ITEM_PREFIX="__TEST__ Review: " scripts/ops/install-guided-review-schedule.sh --verify
tail -5 ~/.omnifocus-mcp/guided-review.log
```

Expected: `STATUS: OK (mode=…)`. Note the prefix env must reach the wrapper — if the installer does not bake extra env
into the plist, add `OF_MCP_REVIEW_ITEM_PREFIX` to the template's `EnvironmentVariables` for this verify run only, then
revert. **Then uninstall** (`--uninstall`) and delete the `__TEST__` inbox item — the real install targets the prod
checkout and is Kip's redeploy step, not this PR's.

- [ ] **Step 3: Draft PR**

```bash
git push -u origin HEAD
gh pr create --repo kip-d/omnifocus-mcp --draft --title "feat(OMN-314): guided-review inbox push (launchd → one idempotent OF inbox item)" --body-file - <<'EOF'
Slice 2 of the guided-decision review layer; builds on the OMN-313 PR. Spec: vault `Technical/specs/Guided-Decision Review Layer - design.md`, D1 = inbox item.

No tool/schema change → Vertical Contract Matrix rows 1–5, 7, 8 **N/A**; row 6 (live bridge) = the two-run idempotency check below.

Live verify (omnifocus-dev): <paste Task 13 results — CREATED id, UPDATED same id, single-row read-back, launchd --verify STATUS line>

Post-merge (Kip): redeploy prod, then `scripts/ops/install-guided-review-schedule.sh` from `~/omnifocus-mcp`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Then stop: Kip runs `/code-review`; merge only on his per-PR go-ahead.

---

## Self-review (done while writing)

- **Spec coverage.** Slice 1: modes ✔ (Tasks 1/4), queue order ✔, per-item loop + quoted reasons ✔, outcomes ✔, embedded
  confirmation ✔, vault log format + URI rule ✔, handoff workflow ✔, staggered review setup ✔ (documented runbook step,
  Kip runs it — D5), prompt + SKILL row + quick-reference row ✔, live dry run ✔. Slice 2: D1 inbox ✔, deterministic
  no-model ✔, pgrep fail-safe ✔, list_for_review + pattern_analysis ✔, slice intersection ✔, zero → none ✔,
  update-not-duplicate ✔, name/note ≤10 lines + start line ✔, never completes ✔, D2 cadence + Saturday deep ✔, OMN-302
  guardrails (timeout without `--foreground`, bounded run, log, stale probe; no `$(pipeline)` under `set -e` that can be
  empty) ✔, unit tests ✔, dev live verify ✔, runbook + drift note ✔.
- **Not in scope, on purpose:** the `onhold_reactivation` detector (OMN-315); ingesting the vault log (OMN-316);
  analytics `scope` filtering (OMN-293); the Eisenhower relabel (OMN-257).
- **Type consistency.** `buildQueue(patterns, slice, mode)` → `Queue{total, perQueue, floors, top}`;
  `buildInboxItem(queue, mode, now)`; `decideAction(openInboxTasks, total)`; `parseArgs(argv)`; `QUEUE_ORDER` exported
  and reused by `main()` — same names and arities in Tasks 7, 8, 9. `ITEM_PREFIX` is read from env at module load, so
  the dev-run prefix override must be set before `tsx` starts (Task 13 does).
- **Known limitation stated in the note:** `deadline_health.items.overdue_samples` is capped at 5 by the detector, so
  that queue's count prints as `N+` when `overdue_count` exceeds the samples (Task 7 test, Task 8 `floors`).

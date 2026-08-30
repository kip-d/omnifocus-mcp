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

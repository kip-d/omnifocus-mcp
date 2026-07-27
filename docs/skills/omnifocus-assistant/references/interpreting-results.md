# Interpreting results

> Reference for the `omnifocus-assistant` skill. Loaded on demand — see the reference map in `SKILL.md`. This file is
> canonical for its topic; edit it directly.

## Interpreting Results

### Productivity Stats

**Note:** `completionRate` is returned as a decimal (e.g., 0.75 = 75%). Health score varies 0-100 based on overdue
count, inbox size, and completion rate.

| Metric          | Healthy Range | Concern                   |
| --------------- | ------------- | ------------------------- |
| Completion rate | 0.70-0.90     | < 0.50 backlog growing    |
| Inbox count     | 0-10          | > 20 needs processing     |
| Overdue count   | 0-5           | > 10 system trust eroding |
| Available tasks | 10-30         | > 50 overwhelming         |

### Analysis Types Reference

| Type                  | Best for                                  | Performance   |
| --------------------- | ----------------------------------------- | ------------- |
| `productivity_stats`  | GTD health metrics, completion rates      | Fast          |
| `task_velocity`       | Completion trends over time (day/week/mo) | Fast          |
| `overdue_analysis`    | Bottleneck identification                 | Fast          |
| `pattern_analysis`    | Database-wide patterns, stale items       | 5-10s (1000+) |
| `workflow_analysis`   | Deep workflow assessment                  | 3-5s          |
| `recurring_tasks`     | Repeat task patterns and frequencies      | Fast          |
| `parse_meeting_notes` | Structure action items into OmniFocus     | Fast          |
| `manage_reviews`      | Project review scheduling                 | Fast          |

All analysis types accept an optional `scope` with `dateRange`, `tags`, `projects`, `includeCompleted`, and
`includeDropped`.

### Judgment detectors return screens + evidence, not verdicts (`pattern_analysis`)

Three `pattern_analysis` insights — `clarify_candidates` (formerly `next_actions`), `waiting_for`, and `estimation_bias`
— follow a **screen → evidence-bundle → you-judge** contract:

- The server runs a cheap, recall-oriented lexical screen and returns per-candidate **evidence bundles**: `id`, `name`,
  `note_head` (first ~160 note chars), `note_empty`, `project`/`folder_path`, `tags`, raw dates, `estimated_minutes`,
  `has_children`, plus `screen_reasons` saying which lexical signal fired.
- **You judge.** A bare "Follow up with Ryan" may be perfectly clear once its note says who/what/when — read the bundle
  before flagging anything to the user. `note_empty: true` alongside a vague name is the strongest clarify signal; a
  clear-only-via-note task is legitimate and needs no rewrite.
- Candidate lists are **capped** and say so (`items.screen.capped`, `candidates_total` vs `candidates_returned`) — never
  present a capped list as exhaustive. `estimation_bias` returns distribution facts (histogram, round-number counts,
  largest-by-id) with no thresholds; interpret them for the user yourself.
- Act by `id` via `omnifocus_write` — every candidate is directly actionable, no search-by-name needed.
- The `next_actions` key is retired: sending it returns `metadata.unrecognized_insights` rather than data.

### Parsing Meeting Notes (`parse_meeting_notes`)

**Extract the action items yourself, then pass `items[]` — do not paste raw prose.** You read the notes far more
accurately than the server's heuristic. The tool's job is the read-only pre-flight only the server can do.

1. Read the notes and produce structured items, one per real action:
   `{ name, project?, tags?, dueDate?, deferDate?, estimatedMinutes?, flagged?, note? }` (convert dates to `YYYY-MM-DD`
   / `YYYY-MM-DD HH:mm` first — see Date Conversion in `SKILL.md`).
2. Call `omnifocus_analyze` type `parse_meeting_notes` with `params.items`. It returns a preview per item
   (`project.match` exact/partial/none, `tags.existing`/`new`, `duplicateOf`, `readyToCreate`), a `summary`, and a
   ready-to-send **`batchPayload`**.
3. Review the preview — especially `duplicateOf` (already exists), `project.match: "none"` (a new project would be
   created), and `tags.new` (new tags). Adjust items and re-run if needed.
4. Send `batchPayload` to `omnifocus_write` operation `batch` (use `dryRun: true` once to confirm, then create).

`validateAgainstExisting: false` skips the DB reads (faster, but no project resolution / dedupe / tag classification).

**Fallback:** if you genuinely can't pre-structure, pass `params.text` (raw prose). The heuristic extractor runs and
surfaces anything it couldn't parse in `unparsed[]` (nothing is silently dropped). Provide exactly one of
`items`/`text`.

### Pattern Analysis

**Stale projects** (no changes 30+ days):

- Review intention during weekly review
- Options: reactivate, drop, or move to someday/maybe

**Vague tasks** ("Think about X", "Consider Y"):

- Needs clarification: what's the physical next action?

**Bunched deadlines**:

- Spread out to avoid overwhelm
- May indicate reactive planning

---

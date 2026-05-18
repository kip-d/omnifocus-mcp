# OmniJS / JXA Property Setter Patterns

Decision matrix for writing OmniFocus object properties. **For typed-class properties, an API returning `success: true`
is not proof of persistence** — the OMN-38 chain shipped five iterations that returned success while mutating a
snapshot. Read back the value; never trust the write status alone. The reusable proof is
`tests/integration/helpers/assert-field-persisted.ts` (`assertFieldPersisted`).

Origin: OMN-41 (audit), OMN-38 (the `reviewInterval` saga), OMN-58 (OmniJS rejection forms), OMN-60 (made
`set-review-schedule` reachable and fixed site #14).

## The four-pattern probe

Every writable property was classified against four candidate write patterns:

| Pattern                       | Form                                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| **P1 — direct**               | `obj.prop = value` (plain object / scalar / `Date` / enum constant) |
| **P2 — `new`**                | `obj.prop = new TypeName(...)`                                      |
| **P3 — factory**              | `obj.prop = TypeName(...)` (no `new`)                               |
| **P4 — read-modify-reassign** | `const t = obj.prop; t.field = X; obj.prop = t`                     |

`Ctx` = the JavaScript context the write must run in. **JXA** = outer osascript (`task.name = …`). **OmniJS** = inside
`app.evaluateJavascript(...)`. Parent/relationship and `Project.Status` access exist **only** in OmniJS. See
`docs/dev/JXA-VS-OMNIJS-PATTERNS.md`.

## Decision matrix

| Row | Property                                                              | Value type                             | Ctx           | Working pattern                                                                                                                                                 | P1                                                | P2                                                     | P3  | P4              | Read-back required              |
| --- | --------------------------------------------------------------------- | -------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ | --- | --------------- | ------------------------------- |
| 1   | `Project.reviewInterval`                                              | `Project.ReviewInterval` (typed class) | OmniJS        | **P4** — read existing instance, set `.steps`/`.unit`, reassign                                                                                                 | ❌ rejected (Object/Number)                       | ❌ non-constructible (zero-arg → CallbackObject error) | ❌  | ✅ **required** | **Yes**                         |
| 2   | `Task.repetitionRule`                                                 | `Task.RepetitionRule` (typed class)    | OmniJS        | **P2** — `new Task.RepetitionRule(rrule, null, scheduleType, anchorDateKey, catchUp)`; assign `null` to clear                                                   | ❌                                                | ✅                                                     | ❌  | n/a             | Recommended                     |
| 3   | `Project.status`                                                      | `Project.Status` (enum constant)       | OmniJS        | **P1 with the enum constant** — `proj.status = Project.Status.OnHold` (map strings → constants first)                                                           | ✅ _iff value is the enum constant, not a string_ | ❌                                                     | ❌  | n/a             | Recommended                     |
| 4   | Scalars — `name`, `note`, `flagged`, `sequential`, `estimatedMinutes` | string / bool / number                 | JXA or OmniJS | **P1 — direct**                                                                                                                                                 | ✅                                                | n/a                                                    | n/a | n/a             | No                              |
| 5   | Dates — `dueDate`, `deferDate`, `plannedDate`                         | `Date` or `null`                       | JXA or OmniJS | **P1 — direct**, value must be `new Date(...)` or `null` (never an ISO+Z string)                                                                                | ✅                                                | n/a                                                    | n/a | n/a             | No                              |
| 6   | Tags (`Task`/`Project`)                                               | `Tag[]` relationship                   | OmniJS bridge | **Not a value setter.** `task.addTags()` / `task.tags = …` silently no-op in JXA — use `bridgeSetTags()` (`src/omnifocus/scripts/shared/minimal-tag-bridge.ts`) | ❌ silent no-op (JXA)                             | n/a                                                    | n/a | n/a             | Yes (assignment silently fails) |
| 7   | Parent / move — `Project.parentFolder`, task→project, `Folder.parent` | relationship                           | OmniJS        | **Move via OmniJS** (`moveTasks(...)`, parent assignment). Parent reads return `null` in JXA                                                                    | n/a                                               | n/a                                                    | n/a | n/a             | Recommended                     |

### Why row 1 needs P4 (the expensive lesson)

`Project.ReviewInterval` is strictly typechecked **and** not constructible from user code. Direct assignment of a plain
`{unit, steps}` object or a `Number` is rejected (OMN-58). `new Project.ReviewInterval()` fails with a CallbackObject
error. In-place mutation of the getter result **silently no-ops** because the getter returns a snapshot, not a live
reference. The only pattern that persists: read the existing typed instance, mutate the local reference, reassign it. If
a project has no existing `ReviewInterval` instance, OmniJS cannot create one — fail loudly rather than silently no-op
(see site #14).

### Rows 2–3: typed but writable

`Task.RepetitionRule` _is_ constructible (P2). `Project.Status` is an enum whose constants assign directly (P1) — but a
raw string does not; always map through `Project.Status.*`. Both contexts are OmniJS-only.

### Rows 4–5: the common case

Scalars and dates take direct assignment in either context. The only date hazard is the value form: `new Date(...)` or
`null`, never an ISO-8601 string with a `Z` suffix (see CLAUDE.md "Date Formats").

### Rows 6–7: relationships, not value writes

Tag and parent/move operations are relationship mutations, not typed-value setters, and have their own bridge-required
machinery. Listed here so an auditor reaching for "set the tags property" doesn't reinvent the silent-no-op bug. Full
audit of every folder/tag relationship pattern is out of OMN-41 scope (the typed-value bug-hunt — rows 1–3 — is the part
that was load-bearing).

## Setter sites (cross-referenced in code)

Each site below carries an inline `// SETTER-PATTERNS row N` comment.

| Site                                  | File:line                                                   | Row |
| ------------------------------------- | ----------------------------------------------------------- | --- |
| Project create — reviewInterval       | `src/contracts/ast/mutation-script-builder.ts` ~975         | 1   |
| Project update — reviewInterval       | `src/contracts/ast/mutation-script-builder.ts` ~1572        | 1   |
| Analyze set_schedule — reviewInterval | `src/omnifocus/scripts/reviews/set-review-schedule.ts` ~105 | 1   |
| Task create — repetitionRule          | `src/contracts/ast/mutation-script-builder.ts` ~785         | 2   |
| Task update — repetitionRule          | `src/contracts/ast/mutation-script-builder.ts` ~1473        | 2   |
| Project create — status               | `src/contracts/ast/mutation-script-builder.ts` ~944         | 3   |
| Project update — status               | `src/contracts/ast/mutation-script-builder.ts` ~1616        | 3   |

## Adding a new typed-value setter

1. Identify the value type. Scalar/`Date`/string → row 4/5, direct assignment, done.
2. Typed class or enum → run the four-pattern probe in a scratch script **and read the value back**.
3. Add a row here with the verified pattern and the per-pattern outcomes.
4. Add `// SETTER-PATTERNS row N` at the call site.
5. Cover it with an `assertFieldPersisted` round-trip test — `success: true` is not enough.

# Integration-suite performance & execution model

> Audit deliverable for **OMN-165** (2026-06-14). Documents where the ~17-minute wall goes, which work is load-bearing,
> why the suite runs serially, and a justified floor so future drift is detectable against a measured baseline rather
> than a guess.

## TL;DR

- The full integration suite runs **serially against the live OmniFocus app** (`singleFork`). This is required, not
  incidental — see [Why serial](#why-serial-singlefork-and-no-parallel-live-lane).
- Measured wall: **~1016–1196 s (~17–20 min)** across the audit runs for **166 tests across 20 live files**
  (2026-06-14); **~1019 s post-fix on a quiet host**.
- **The wall is fixture-bound, not test-body-bound.** Only ~526 s is test bodies; the rest — **~400–570 s (39–48 %),
  computed as wall minus test-body** — is per-file fixture setup/teardown + the shared-server OmniFocus warm, and it
  swings ±90 s run-to-run independent of any code change.
- **Do not track this suite by wall-clock delta.** A single wall number is dominated by fixture noise and OmniFocus
  cache state; it cannot reflect a test-body optimization. Track the **per-class test-body subtotal** instead (see
  [Measuring](#measuring--detecting-drift)).

## Where the time goes (measured 2026-06-14, quiet host)

| Layer                              | Time        | Notes                                                                                                                                                                                                                                                              |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Test bodies**                    | **~526 s**  | The `duration` vitest reports per test.                                                                                                                                                                                                                            |
| Fixture setup + teardown + OF warm | **~493 s**  | Wall minus test-body (this run; ~400–570 s across runs). Per-file `beforeAll` sandbox + `afterAll` `fullCleanup` (~7 sequential `osascript`/AppleEvent calls + straggler sweeps) × 20 files, plus the shared-server cache warm (~13 s). Not counted in `duration`. |
| **Wall**                           | **~1019 s** | What you wait for (526 + 493).                                                                                                                                                                                                                                     |

### Test-body breakdown by class

| Class                                                                                | Test-body           | Load-bearing?                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Floor-bound** (filter / count / analytics — the filter _is_ the system under test) | ~374 s              | **Yes.** Each whole-DB read asserts a filter predicate / count-honesty / analytics calc over the real population. An id-lookup cannot test these. Files: `filter-results`, `count-honesty`, `name-filter-scope`, `dropped-task-exclusion`, `analytics-validation`, `*-filter-rejection`, plus the read/pagination tests in `end-to-end`, `mcp-protocol`, `http-transport`. |
| **Task id read-backs** (verify a created/mutated task)                               | ~152 s (was ~259 s) | **Captured by [OMN-185](https://github.com/kip-d/omnifocus-mcp/pull/115).** These resolve a known id, so they never needed the whole-DB scan.                                                                                                                                                                                                                              |

## The ~7–10 s floor and the OMN-185 fix

Any **filtered whole-DB task read** materialises `flattenedTasks` — a ~7–10 s floor on a large database (the
`flattenedTasks` materialisation floor). The audit's premise was that write-side read-backs paid this floor
unnecessarily and could use a cheap `Task.byIdentifier` id-lookup. Investigation **inverted the premise**: the id-lookup
path (`buildTaskByIdScript`) did _not_ use `Task.byIdentifier` — it iterated `flattenedTasks.forEach`, paying the _same_
floor. Projects got an O(1) `Project.byIdentifier` read fast path in OMN-40; tasks were the lone laggard.

**OMN-185** gives task id-lookups the same O(1) path. Measured effect, reproduced across two runs at ~6× different host
load (so it is host-independent, not noise):

|                                            | pre-fix | post-fix | Δ                  |
| ------------------------------------------ | ------- | -------- | ------------------ |
| `update-operations` (≈100 % id read-backs) | 107 s   | ~40 s    | **−62 to −64 %**   |
| id-read-back files (subtotal)              | ~259 s  | ~152 s   | **−107 s (−41 %)** |
| floor-bound / other files                  | —       | —        | +noise only        |

The **suite wall did not drop**, because the −92 s test-body win was absorbed by a +92 s swing in fixture overhead that
run — the structural reason the wall is the wrong metric here.

### Project read-backs: convertible but not worth it

`field-roundtrip` and `update-paths` verify project mutations via `filters:{folder}` (folder-scoped) rather than
`filters:{id}`. These _look_ like the task case, but they are **already cheap** (~2–3 s total per test): a folder-scoped
project read materialises only the handful of projects in the sandbox folder, not the whole DB. Converting them to
`filters:{id}` would save ~0 s while adding diff and risk, so the audit **deliberately leaves them** (the
`flattenedTasks` floor is task-specific).

## Why serial (`singleFork`) and no parallel live lane

Configured in `vitest.config.ts` (`pool: 'forks'`, `poolOptions.forks.singleFork: true` — applied whenever the run isn't
unit-only, i.e. for every integration run):

1. **One OmniFocus app; AppleEvents serialise.** Every live test drives the single OmniFocus instance over
   `osascript`/AppleEvents, which the app processes one at a time. Concurrent workers do not gain parallelism — they
   queue on the same channel and instead cause **timeouts and intermittent failures**.
2. **Orphaned-worker hazard (OMN-143).** Parallel forks against the live app have historically orphaned vitest workers
   whose teardowns then fire against live sessions. `singleFork` + the worker-guard
   (`tests/support/setup-worker-guard.ts`) exist specifically to prevent this. Any change here must preserve both. Run
   the suite **only via `run_in_background`, never kill it** (orphaned-worker hazard).
3. **The three non-OmniFocus files don't justify a second lane.** `mcp-protocol`, `http-transport`, `startup-timing`
   (~41 s combined) don't contend for AppleEvents and _could_ run in a parallel lane, but the saving is small and
   splitting the pool risks the `singleFork` guarantee the live files depend on. Not worth it.

(Separately, OMN-178 established that the **conformance** probe and this suite can't share a warm window without
decoupling the probe's MCP boot from OmniFocus — fixed there. That's cross-suite contention, distinct from the
within-suite serialisation above.)

## The floor statement

> **~400–490 s of the wall is irreducible per-file OmniFocus fixture overhead** (sandbox setup + `fullCleanup`
> teardown + cache warm), and **~374 s of test-body time is load-bearing floor-bound filter/count/analytics work** that
> must scan the real population to assert what it asserts. The remaining test-body lever — task id read-backs (~107 s) —
> was taken by **OMN-185**. The next lever on the wall is **fixture economics** (sharing a per-run sandbox/teardown
> instead of per-file), tracked as **OMN-186**; it is deferred from this audit because it touches the OMN-143
> leak-sensitive cleanup machinery and must keep cleanup folder-scoped.

So the justified floor today is roughly **fixture overhead (~400–490 s) + load-bearing floor-bound test bodies (~374 s)
≈ 13–14 min**, with the rest being the now-optimised id read-backs and the small rejection/protocol tests. Duration
meaningfully above that band (on a quiet host) signals real drift, not the baseline.

## Measuring & detecting drift

The suite auto-records one per-machine timing row per full integration run (`tests/support/suite-timing-reporter.ts` →
`~/.local/state/of-mcp-suite-timing/runs.jsonl`, OMN-182). For a per-test profile (the artifact this audit was built
from):

```bash
npm run build   # required — the suite spawns dist/index.js
npx vitest tests/integration --run --reporter=json --outputFile.json=/tmp/pertest.json
# then aggregate per-file / per-class from /tmp/pertest.json
```

Because the wall is fixture-noise-dominated, **compare the per-class test-body subtotal on a quiet host** (check
`loadavg`), not the raw wall. The id-read-back subtotal (~152 s post-OMN-185) is the most stable, attributable signal.

### Profiling the fixture overhead itself (OMN-186 Phase 1)

The test-body profile above cannot locate the ~400–490 s of non-test-body overhead — hooks aren't in vitest's per-test
`duration`. The fixture profiler (`tests/integration/helpers/fixture-profiler.ts`) times the fixture-machinery leaf
calls (`ensureSandboxFolder`, `fullCleanup`, shared-server init/reuse/shutdown) and appends one JSON line per call:

```bash
npm run build
FIXTURE_PROFILE=1 npx vitest tests/integration --run
# log: tests/integration/fixture-profile.jsonl (override with FIXTURE_PROFILE_LOG); delete between runs — it appends

# per-op totals
jq -s 'group_by(.op) | map({op: .[0].op, calls: length, total_s: ((map(.ms) | add) / 1000 | round)})' \
  tests/integration/fixture-profile.jsonl

# per-file totals (worst offenders first)
jq -s 'group_by(.file) | map({file: .[0].file, total_s: ((map(.ms) | add) / 1000 | round)}) | sort_by(-.total_s)' \
  tests/integration/fixture-profile.jsonl
```

Entries are `{file, hook, op, ms, at, failed?}`; `file` is `"(global)"` for globalSetup/globalTeardown calls. The flag
off (default) is a pure pass-through — normal runs are untouched. This profile is the decision gate for OMN-186 Phase 2
(per-run fixture epoch): proceed only if teardown-dominated.

### Per-run fixture epoch (OMN-186 Phase 2)

The Phase-1 profile (2026-07-08, quiet host, 525 s wall) confirmed teardown dominance: `fullCleanup` was 109 s of the
~216 s fixture overhead — 15 per-file `afterAll` sweeps averaging ~7.3 s, each paying two whole-DB everywhere-scans plus
a sandbox-folder delete the next file's `ensureSandboxFolder` had to undo.

Phase 2 scopes those per-file sweeps. The OMN-143 single-instance lock's lifetime is the run's fixture epoch: while the
lock is held by a live PID, `fullCleanup()` (default `scope: 'auto'`) runs **scoped** — inbox tasks, sandbox projects,
sandbox subfolders, and test tags only (4 `osascript` calls instead of 7), keeping the sandbox folder alive across
files. The everywhere-scans and folder delete run in the ONE explicit `fullCleanup({ scope: 'full' })` sweep in
`globalTeardown`, and `globalSetup`'s explicit full sweep remains the prior-run orphan hunt (crash recovery). The
post-run `scanForFixtures` fail-loud check is unchanged. Manual purges (`npm run test:cleanup -- --apply`) pass explicit
full and never scope down. In profiler logs the scoped sweeps record op `fullCleanup.scoped`, so before/after
aggregations can split the modes.

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

**Supervising a live run:** `--reporter=json` alone goes nearly silent on stdout — it buffers per-test output into the
JSON file instead of streaming it, so a healthy multi-minute run and a genuinely hung one look identical from the
outside (2026-07-12: this cost a false "it's hung" call and a near-kill of a live suite mid-OMN-261-verification). Stack
a second reporter for a continuous liveness signal without losing the machine-readable output:

```bash
FIXTURE_PROFILE=1 npx vitest tests/integration --run --reporter=dot --reporter=json --outputFile.json=/tmp/pertest.json
# `dot` is low-noise (one character per test); use `default` instead for per-test names if the extra log volume is fine
```

### Per-run fixture epoch (OMN-186 Phase 2)

The Phase-1 profile (2026-07-08, quiet host, 525 s wall) confirmed teardown dominance: `fullCleanup` was 109 s of the
~216 s fixture overhead — 15 per-file `afterAll` sweeps averaging ~7.3 s, each paying two whole-DB everywhere-scans plus
a sandbox-folder delete the next file's `ensureSandboxFolder` had to undo.

Phase 2 scopes 10 of those 15 per-file sweeps — the ordinary best-effort teardown calls that never inspect the returned
report. The OMN-143 single-instance lock's lifetime is the run's fixture epoch: while the lock is held by a live PID,
`fullCleanup()` (default `scope: 'auto'`) runs **scoped** — inbox tasks, sandbox projects, sandbox subfolders, and test
tags only (4 `osascript` calls instead of 7), keeping the sandbox folder alive across files. The everywhere-scans and
folder delete run in the ONE explicit `fullCleanup({ scope: 'full' })` sweep in `globalTeardown`, and `globalSetup`'s
explicit full sweep remains the prior-run orphan hunt (crash recovery). The remaining 5 sweeps — the OMN-46 fixture-leak
GUARD tests under `tests/integration/tools/unified/` that assert `report.errors` to catch whole-DB residue as a
regression guard — stay pinned to `scope: 'full'` and pay the full 7-call cost every time, since scoping them down would
make their own correctness assertion vacuous. The post-run `scanForFixtures` fail-loud check is unchanged. Manual purges
(`npm run test:cleanup -- --apply`) pass explicit full and never scope down. In profiler logs the scoped sweeps record
op `fullCleanup.scoped`, so before/after aggregations can split the modes — expect the ~109 s baseline to drop by
roughly 10/15 of the scoped sweeps' savings, not the full amount.

## Cross-file shared server via globalThis (OMN-261)

Before this fix, `shared-server.ts`'s module-scope `let sharedClient`/`initPromise`/`isFirstAccess` bindings reset on
every test file under vitest's default per-file `isolate: true` (the `forks` pool default) — independent of
`singleFork: true`, which only guarantees one OS process, not one module registry. So despite the file's own docstring
describing "one server per run," 13 of the suite's 17 `getSharedClient()` call sites each spawned and warmed a brand-new
MCP server + OmniFocus cache from scratch; the only reuse came from a second call within the same file
(`4 = (4-1) + (2-1)`, the two files that call it twice). Root cause is confirmed by a permanent regression-pinning test
(`tests/integration/_diagnostics/module-isolation-probe-*.test.ts`) that proves the isolation behavior against the real
integration-suite vitest config, not a simulation.

Fix: move the three pieces of state onto a `globalThis`-keyed slot (`tests/integration/helpers/global-singleton.ts`) —
the one thing per-file module isolation does not reset within a single OS process. Zero test-file edits, same invariant
OMN-186 held to.

Shutdown is a PID-file kill (`killOrphanedSharedServer`, mirroring the OMN-143 lock's PID-in-a-file pattern) called from
`globalTeardown` — a different process than the one that spawned the server — plus defensively at the start of the next
run, in case a crashed prior run left its server alive. An earlier design also registered a
`process.once('beforeExit', ...)` hook inside the worker fork as a second layer, but investigation found it
realistically never fires under a real `vitest --run` (tinypool's `ProcessWorker.terminate()` SIGTERMs the worker
externally, no in-worker signal handler registered outside Node's own profiling flags) — it was removed as confirmed
dead code (`/code-review high` finding, 2026-07-12). `shutdownSharedClient()`'s graceful, ID-based cleanup
(`thoroughCleanup()`) is kept as a tested, reusable unit but currently has no automatic caller — tracked in OMN-264.

**Call-count delta:**

|                                      | `getSharedClient.init` | `getSharedClient.reuse` |
| ------------------------------------ | ---------------------- | ----------------------- |
| Before (2026-07-11 profile)          | 13                     | 4                       |
| After (2026-07-12 profile, this fix) | 1                      | 16                      |

**Total-seconds:** post-fix, the single init totaled ~11–12 s across two verification runs (11.22 s and 11.52 s),
consistent with the file's documented ~13 s cache-warm cost. The pre-fix total-seconds for the 13 inits was never
separately recorded — only the call count was profiled on 2026-07-11 — so there's no measured before/after total-seconds
delta to report here; a same-cost-per-init extrapolation (13 × ~11.5 s ≈ 150 s) is a plausible estimate, not a measured
figure, and is called out as such rather than presented as data.

**Verification (2026-07-12, live suite against real OmniFocus, `FIXTURE_PROFILE=1`):**

- 202 tests total, 0 failures, 22 pending, on a clean re-run. (An earlier same-day run hit 1 isolated failure in
  `update-operations.test.ts`, fully explained by an OmniFocus app crash mid-run — an isolated re-run of just that file
  passed 9/9 clean, and the subsequent full clean re-run passed 202/202.)
- Zero orphaned `dist/index.js` processes: before/after `pgrep -fl 'dist/index.js'` snapshots were byte-identical across
  every run.
- `shutdownSharedClient` shows zero entries in `fixture-profile.jsonl` in every run — expected, since it currently has
  no automatic caller (see above). The PID-file path is invisible to this profiler (it runs from a different process)
  but is confirmed working by the zero-orphan-process result.
- As with OMN-186, raw suite wall is not the tracked metric here — this is a correctness/resource-leak fix (spawning 13
  servers instead of 1 wasted OS processes and OmniFocus warm-up time, but the suite was already fixture-noise-dominated
  per the TL;DR above, so wall-clock delta is not a reliable signal for this change either).

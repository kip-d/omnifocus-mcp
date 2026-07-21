#!/usr/bin/env npx tsx
/**
 * KMM golden-database seeder (OMN-235 Phase 1, Deliverable 3).
 *
 * Runs ON KMM against whatever OmniFocus document is currently open. Creates a
 * `Fixtures` top-level folder containing labeled `FIXTURE:`-prefixed data covering the
 * coverage matrix in docs/superpowers/specs/2026-07-02-kmm-test-ground-design.md, then
 * reads the resulting entity counts back and writes them to PROVENANCE.md.
 *
 * All dates are computed relative to the moment this script runs (never hardcoded), so
 * the golden DB stays "overdue 12 days" etc. no matter when it's re-seeded. Re-seeding
 * is IDEMPOTENT: the payload first deletes any prior `FIXTURE:`-prefixed folders, tags,
 * and inbox tasks, so a re-run refreshes the fixture tree instead of duplicating it.
 *
 * Usage: npx tsx scripts/kmm/seed-golden-database.ts [--out ~/of-golden]
 *
 * Env: OF_SEED_TIMEOUT_MS bounds the osascript run (default 180000) — a wedged
 * OmniFocus (modal dialog) otherwise hangs the seeder forever (known failure mode,
 * see CLAUDE.md "Script timeouts").
 *
 * NOT YET LIVE-VERIFIED — this must run against real OmniFocus on KMM before the
 * database is frozen. Treat every OmniJS API call below as a hypothesis until an
 * actual run confirms it (perspective creation in particular is best-effort).
 */
import { spawn } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { isRunDirectly } from '../lib/run-directly.js';

// Validated lazily (not at module scope) so importing the module for tests
// never throws on a stray env var; a bad value fails loud with the actual
// cause instead of spawn() rejecting NaN as an opaque ERR_OUT_OF_RANGE.
function resolveSeedTimeoutMs(raw: string | undefined = process.env.OF_SEED_TIMEOUT_MS): number {
  if (raw === undefined || raw === '') return 180_000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`OF_SEED_TIMEOUT_MS must be a positive number of milliseconds, got: '${raw}'`);
  }
  return n;
}

function parseArgs(argv: string[]): { outDir: string } {
  const outIndex = argv.indexOf('--out');
  // Fail loud, not fall back: silently writing PROVENANCE.md to the default
  // location on a value-less --out (or mkdir-ing a directory literally named
  // '--verbose' when the value is another flag) means of-db-reset.sh later
  // reads the wrong (or stale) file from an unintended directory.
  if (outIndex !== -1 && (!argv[outIndex + 1] || argv[outIndex + 1].startsWith('-'))) {
    throw new Error(`--out requires a directory argument (e.g. --out ~/of-golden), got: '${argv[outIndex + 1] ?? ''}'`);
  }
  const outDir = outIndex !== -1 ? argv[outIndex + 1] : join(homedir(), 'of-golden');
  return { outDir };
}

/**
 * The seeding logic runs as OmniJS (property access, not method calls) because it
 * creates folders/projects/tags and assigns tags+parents — all bridge-only operations
 * per this repo's JXA-vs-OmniJS split (CLAUDE.md "Tag Operations").
 *
 * JXA drives `evaluateJavascript` from the outside so the whole payload is one
 * osascript invocation.
 */
function buildOmniJsPayload(): string {
  return `
(function () {
  var now = new Date();
  function daysFromNow(n) {
    var d = new Date(now.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }
  function fixtureName(label) {
    return 'FIXTURE: ' + label;
  }
  function isFixture(obj) {
    return obj.name.indexOf('FIXTURE: ') === 0;
  }

  // ---- Idempotency: remove any prior FIXTURE: data before re-seeding -----
  // The header advertises re-running this script to refresh relative dates;
  // without this sweep a re-run would create a SECOND fixture tree alongside
  // the first and corrupt whatever golden snapshot gets frozen from it.
  // FLATTENED collections, not top-level ones: a FIXTURE folder/tag nested
  // under a non-fixture parent would be invisible to folders/tags. Deleting
  // a parent cascades to children already in the slice, so each delete is
  // try/caught (a dead reference just means the cascade got there first).
  // Slice first: deleting while iterating a live collection is undefined.
  function sweepFixtures(collection) {
    collection.slice().filter(isFixture).forEach(function (obj) {
      try {
        deleteObject(obj);
      } catch (e) {
        // already removed via a parent's cascade delete
      }
    });
  }
  // Projects and tasks are swept too, not just left to folder cascades: a
  // cascade that failed partway on a prior run can leave orphaned FIXTURE
  // projects/tasks whose parent folder no longer exists.
  sweepFixtures(flattenedFolders);
  sweepFixtures(flattenedProjects);
  sweepFixtures(flattenedTags);
  sweepFixtures(flattenedTasks);
  sweepFixtures(inbox);
  // Post-sweep verification: the per-delete try/catch above tolerates
  // cascade-dead references, but that must not hide a delete that failed
  // for a REAL reason (mid-sync, locked item). If anything FIXTURE-prefixed
  // survived the sweep — in ANY flattened collection, so orphans of a
  // partial cascade can't hide — creating a fresh tree would produce
  // exactly the duplicate-fixture corruption the sweep exists to prevent;
  // fail loud instead (the throw propagates out of evaluateJavascript).
  var leftovers = flattenedFolders.slice().filter(isFixture).length +
    flattenedProjects.slice().filter(isFixture).length +
    flattenedTags.slice().filter(isFixture).length +
    flattenedTasks.slice().filter(isFixture).length +
    inbox.slice().filter(isFixture).length;
  if (leftovers > 0) {
    throw new Error('idempotency sweep left ' + leftovers + ' FIXTURE item(s) behind — refusing to seed a second fixture tree alongside them.');
  }
  // The custom perspective is handled by reuse-not-recreate below (there is
  // no documented Perspective delete API to sweep with).

  // Folder/Project constructors take (name, position) — position is a parent
  // Folder or a Folder.ChildInsertionLocation like library.beginning
  // (src/omnifocus/api/OmniFocus.d.ts). The Folder CLASS has no insertion-
  // location statics — beginning/ending exist only on instances/library.
  var root = new Folder(fixtureName('Fixtures'), library.beginning);
  var nested1 = new Folder(fixtureName('Nested L1'), root);
  var nested2 = new Folder(fixtureName('Nested L2'), nested1);
  var droppedFolder = new Folder(fixtureName('Dropped Folder'), root);
  droppedFolder.status = Folder.Status.Dropped;

  // ---- Tags ------------------------------------------------------------
  // Tag constructor is (name, position: Tag | Tag.ChildInsertionLocation |
  // null) — null = top level, explicit per the typedef's required arity.
  var tagSingle = new Tag(fixtureName('tag-single'), null);
  var tagMultiA = new Tag(fixtureName('tag-multi-a'), null);
  var tagMultiB = new Tag(fixtureName('tag-multi-b'), null);
  var tagParent = new Tag(fixtureName('tag-parent'), null);
  var tagChild = new Tag(fixtureName('tag-child'), tagParent);
  var tagOnHold = new Tag(fixtureName('tag-on-hold'), null);
  tagOnHold.status = Tag.Status.OnHold;
  var tagDropped = new Tag(fixtureName('tag-dropped'), null);
  tagDropped.status = Tag.Status.Dropped;
  var tagUnused = new Tag(fixtureName('tag-zero-tasks'), null);

  // ---- Projects: types x statuses x features ----------------------------
  var pParallel = new Project(fixtureName('Parallel Project'), root);
  pParallel.sequential = false;

  var pSequential = new Project(fixtureName('Sequential Project'), root);
  pSequential.sequential = true;

  var pSingleAction = new Project(fixtureName('Single Action List'), root);
  pSingleAction.singletonActionHolder = true;

  var pOnHold = new Project(fixtureName('On Hold Project'), root);
  pOnHold.status = Project.Status.OnHold;

  var pCompleted = new Project(fixtureName('Completed Project'), root);
  var completedTask = new Task(fixtureName('completed project seed task'), pCompleted);
  completedTask.markComplete();
  pCompleted.status = Project.Status.Done;

  var pDropped = new Project(fixtureName('Dropped Project'), root);
  pDropped.status = Project.Status.Dropped;

  var pReview = new Project(fixtureName('Review Interval Project'), root);
  pReview.reviewInterval = { unit: 'week', steps: 1 };
  pReview.nextReviewDate = daysFromNow(3);

  var pDeferDue = new Project(fixtureName('Defer+Due Project'), root);
  pDeferDue.deferDate = daysFromNow(-2);
  pDeferDue.dueDate = daysFromNow(10);

  var pCompleteWithLast = new Project(fixtureName('Complete-With-Last-Action Project'), root);
  pCompleteWithLast.completedByChildren = true;

  var pRepeating = new Project(fixtureName('Repeating Project'), root);
  pRepeating.repetitionRule = new Task.RepetitionRule('FREQ=WEEKLY', Task.RepetitionMethod.Fixed);

  var pEmpty = new Project(fixtureName('Empty Project'), root);

  var pPerf = new Project(fixtureName('Perf 100+ Tasks Project'), root);
  for (var i = 0; i < 105; i++) {
    new Task(fixtureName('perf task ' + i), pPerf);
  }

  // Duplicate project names (OF allows this; known trap).
  new Project(fixtureName('Duplicate Name'), root);
  new Project(fixtureName('Duplicate Name'), root);

  // ---- Task locations: inbox / root / nested action groups --------------
  // Task positions are Project | Task | Task.ChildInsertionLocation — the
  // Inbox collection itself is not one, but inbox.ending is.
  new Task(fixtureName('inbox task'), inbox.ending);

  var rootTask = new Task(fixtureName('root-level task'), pParallel);

  var groupL1 = new Task(fixtureName('action group L1'), pParallel);
  groupL1.sequential = true;
  var groupL2 = new Task(fixtureName('action group L2 (nested)'), groupL1);
  new Task(fixtureName('nested task under group L2'), groupL2);

  // sequential group inside parallel project
  var seqGroupInParallel = new Task(fixtureName('sequential group in parallel project'), pParallel);
  seqGroupInParallel.sequential = true;
  new Task(fixtureName('seq-in-parallel child 1'), seqGroupInParallel);
  new Task(fixtureName('seq-in-parallel child 2'), seqGroupInParallel);

  // parallel group inside sequential project
  var parGroupInSequential = new Task(fixtureName('parallel group in sequential project'), pSequential);
  parGroupInSequential.sequential = false;
  new Task(fixtureName('par-in-sequential child 1'), parGroupInSequential);
  new Task(fixtureName('par-in-sequential child 2'), parGroupInSequential);

  // ---- Task states --------------------------------------------------------
  new Task(fixtureName('available task'), pParallel);

  var blockedChain = new Task(fixtureName('blocked-by-sequence chain'), pSequential);
  blockedChain.sequential = true;
  var blockerFirst = new Task(fixtureName('blocker: do this first'), blockedChain);
  var blockedSecond = new Task(fixtureName('blocked: waits on first'), blockedChain);

  var deferredTask = new Task(fixtureName('deferred (future)'), pParallel);
  deferredTask.deferDate = daysFromNow(14);

  var dueSoonTask = new Task(fixtureName('due soon'), pParallel);
  dueSoonTask.dueDate = daysFromNow(2);

  // Overdue spread: 1d / 3d / 12d / 45d, across >=3 projects, one clear bottleneck.
  var overdue1 = new Task(fixtureName('overdue 1d'), pParallel);
  overdue1.dueDate = daysFromNow(-1);
  var overdue3 = new Task(fixtureName('overdue 3d'), pSequential);
  overdue3.dueDate = daysFromNow(-3);
  var overdue12 = new Task(fixtureName('overdue 12d'), pDeferDue);
  overdue12.dueDate = daysFromNow(-12);
  var bottleneckProject = new Project(fixtureName('Overdue Bottleneck Project'), root);
  var overdue45 = new Task(fixtureName('overdue 45d (bottleneck)'), bottleneckProject);
  overdue45.dueDate = daysFromNow(-45);

  var flaggedTask = new Task(fixtureName('flagged task'), pParallel);
  flaggedTask.flagged = true;

  var completedStandaloneTask = new Task(fixtureName('completed standalone task'), pParallel);
  completedStandaloneTask.markComplete();

  // drop() requires (allOccurrences, dateDropped) per OmniFocus.d.ts — the
  // production mutation code (src/contracts/ast/mutation/defs.ts) always
  // calls it with both; there is no documented no-arg fallback like
  // markComplete()'s.
  var droppedStandaloneTask = new Task(fixtureName('dropped standalone task'), pParallel);
  droppedStandaloneTask.drop(true, now);

  // ---- Task features --------------------------------------------------
  var repFixed = new Task(fixtureName('repeats fixed weekly'), pParallel);
  repFixed.repetitionRule = new Task.RepetitionRule('FREQ=WEEKLY', Task.RepetitionMethod.Fixed);
  repFixed.dueDate = daysFromNow(7);

  var repDeferAnother = new Task(fixtureName('repeats defer-another'), pParallel);
  repDeferAnother.repetitionRule = new Task.RepetitionRule('FREQ=DAILY', Task.RepetitionMethod.DeferUntilDate);
  repDeferAnother.deferDate = daysFromNow(1);

  var repDueAgain = new Task(fixtureName('repeats due-again'), pParallel);
  repDueAgain.repetitionRule = new Task.RepetitionRule('FREQ=MONTHLY', Task.RepetitionMethod.DueDate);
  repDueAgain.dueDate = daysFromNow(30);

  var estimatedTask = new Task(fixtureName('has estimated duration'), pParallel);
  estimatedTask.estimatedMinutes = 45;

  var plainNoteTask = new Task(fixtureName('plain note'), pParallel);
  plainNoteTask.note = 'Plain fixture note, no links.';

  var urlNoteTask = new Task(fixtureName('note with URL'), pParallel);
  urlNoteTask.note = 'See https://example.com/fixture for context.';

  var plannedTask = new Task(fixtureName('planned date'), pParallel);
  plannedTask.plannedDate = daysFromNow(5);

  new Task(fixtureName('no dates at all'), pParallel);

  // ---- Tag assignments (bridge-only per this repo's addTag() convention) --
  var untaggedTask = new Task(fixtureName('untagged task'), pParallel);
  var singleTagTask = new Task(fixtureName('single-tag task'), pParallel);
  singleTagTask.addTag(tagSingle);
  var multiTagTask = new Task(fixtureName('multi-tag task'), pParallel);
  multiTagTask.addTag(tagMultiA);
  multiTagTask.addTag(tagMultiB);
  var nestedTagTask = new Task(fixtureName('nested-tag task'), pParallel);
  nestedTagTask.addTag(tagChild);
  var onHoldTagTask = new Task(fixtureName('on-hold-tag task'), pParallel);
  onHoldTagTask.addTag(tagOnHold);
  var droppedTagTask = new Task(fixtureName('dropped-tag task'), pParallel);
  droppedTagTask.addTag(tagDropped);

  // ---- Name edge cases ------------------------------------------------
  new Task(fixtureName('unicode/emoji name ✅ 日本語 🚀'), pParallel);
  new Task(fixtureName('name with "quotes" and \\\\backslashes\\\\'), pParallel);
  new Task(
    fixtureName(
      'a very long task name that goes on and on and on to make sure truncation and rendering code paths ' +
        'get exercised against something realistically oversized rather than a short sample string',
    ),
    pParallel,
  );

  // ---- Custom perspective (best-effort; requires Pro; verify on KMM) ---
  // Reuse-not-recreate for idempotency: Perspective.Custom.byName finds a
  // prior run's copy (no documented delete API exists to sweep it), so
  // re-seeding never duplicates the perspective.
  var perspectiveCreated = false;
  try {
    var customPerspective =
      Perspective.Custom.byName(fixtureName('Custom Perspective')) ||
      new Perspective.Custom(fixtureName('Custom Perspective'));
    customPerspective.archivedFilterRules = [Perspective.FilterRule.Flagged];
    perspectiveCreated = true;
  } catch (e) {
    perspectiveCreated = false;
  }

  // ---- Seed-timestamp marker task (conformance suite reset-window precondition) ---
  // Tasks cannot live directly in a Folder — the marker gets its own tiny
  // project so the conformance suite has a stable, named home to read it from.
  var pMeta = new Project(fixtureName('Seed Meta'), root);
  var marker = new Task(fixtureName('seed-timestamp'), pMeta);
  marker.note = now.toISOString();

  // ---- Count-verify -----------------------------------------------------
  var allTasks = flattenedTasks;
  var allProjects = flattenedProjects;
  var allTags = flattenedTags;
  var allFolders = flattenedFolders;

  var counts = {
    tasks: allTasks.length,
    projects: allProjects.length,
    tags: allTags.length,
    folders: allFolders.length,
    tasks_completed: allTasks.filter(function (t) { return t.completed; }).length,
    tasks_dropped: allTasks.filter(function (t) { return t.dropped; }).length,
    projects_dropped: allProjects.filter(function (p) { return p.status === Project.Status.Dropped; }).length,
    projects_done: allProjects.filter(function (p) { return p.status === Project.Status.Done; }).length,
    seed_timestamp: now.toISOString(),
    perspective_created: perspectiveCreated,
  };

  return JSON.stringify(counts);
})();
`;
}

interface SeedCounts {
  tasks: number;
  projects: number;
  tags: number;
  folders: number;
  tasks_completed: number;
  tasks_dropped: number;
  projects_dropped: number;
  projects_done: number;
  seed_timestamp: string;
  perspective_created: boolean;
}

async function runOmniJs(omniJsPayload: string): Promise<string> {
  const jxa = `
    var of = Application('OmniFocus');
    of.includeStandardAdditions = true;
    var result = of.evaluateJavascript(${JSON.stringify(omniJsPayload)});
    result;
  `;
  // stdin piping + a hard timeout, mirroring production OmniAutomation.ts:
  // a ~300-line JSON-escaped payload in a single `-e` argv element invites
  // argv-length/escaping edge cases stdin avoids, and a wedged OmniFocus
  // (modal dialog) would otherwise hang the seeder with no diagnostic.
  // Deliberately MIRRORS (not imports) OmniAutomation.ts's runner: this is
  // a standalone ops script (npx tsx, no build step) that must not depend
  // on the MCP server's src/ runtime — the same no-server-dependency rule
  // its sibling of-db-reset.sh states in its header.
  return new Promise<string>((resolve, reject) => {
    const timeoutMs = resolveSeedTimeoutMs();
    const proc = spawn('osascript', ['-l', 'JavaScript'], { timeout: timeoutMs });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code, signal) => {
      if (signal) {
        reject(
          new Error(
            `osascript killed by ${signal} after ${timeoutMs}ms — is OmniFocus blocked by a modal dialog? (OF_SEED_TIMEOUT_MS overrides the bound)`,
          ),
        );
      } else if (code !== 0) {
        reject(new Error(`osascript exited ${code}: ${stderr.trim()}`));
      } else {
        resolve(stdout.trim());
      }
    });
    // Without this, a write to an already-closed pipe (osascript exiting
    // instantly on a TCC/Automation prompt, or the timeout firing between
    // spawn and write) emits an unhandled 'error' (EPIPE) that crashes the
    // seeder with a raw stack trace instead of the diagnostics above.
    proc.stdin.on('error', (err: Error) => {
      reject(
        new Error(
          `failed to write the payload to osascript stdin — did it exit immediately (TCC/Automation prompt)? ${String(err)}`,
        ),
      );
    });
    proc.stdin.write(jxa);
    proc.stdin.end();
  });
}

function renderProvenance(counts: SeedCounts): string {
  return `# KMM Golden Database Provenance

Generated by \`scripts/kmm/seed-golden-database.ts\`. Do not hand-edit — regenerate by re-seeding.

Export date: ${counts.seed_timestamp}
Custom perspective created: ${counts.perspective_created}

## Counts

tasks: ${counts.tasks}
projects: ${counts.projects}
tags: ${counts.tags}
folders: ${counts.folders}
tasks_completed: ${counts.tasks_completed}
tasks_dropped: ${counts.tasks_dropped}
projects_dropped: ${counts.projects_dropped}
projects_done: ${counts.projects_done}

## Notes

- These counts are the OmniFocus \`flattenedTasks\` / \`flattenedProjects\` / \`flattenedTags\` / \`flattenedFolders\`
  totals across the WHOLE document, not just the \`Fixtures\` folder — the golden DB is Kip's old real database
  plus these fixtures layered on top, so counts include both.
- \`scripts/kmm/of-db-reset.sh\` diffs its post-restore counts against this file and fails loudly on mismatch.
- Re-run the coverage-matrix audit (spec §2) before trusting a freshly regenerated golden snapshot; this script
  does not itself verify coverage, only entity counts.
`;
}

async function main(): Promise<void> {
  const { outDir } = parseArgs(process.argv.slice(2));
  console.log(`Seeding golden database fixtures (OmniFocus must already be running with the target document open)...`);

  // Fail fast on a bad --out BEFORE the live OmniFocus mutation: if this
  // mkdir ran after runOmniJs, a typo'd path would throw only after the
  // expensive live seed, losing PROVENANCE.md and forcing a full re-seed.
  await mkdir(outDir, { recursive: true });

  const rawResult = await runOmniJs(buildOmniJsPayload());
  let counts: SeedCounts;
  try {
    counts = JSON.parse(rawResult) as SeedCounts;
  } catch (err) {
    throw new Error(`Seed script did not return valid JSON. Raw osascript output:\n${rawResult}\n\n${String(err)}`);
  }

  const provenancePath = join(outDir, 'PROVENANCE.md');
  await writeFile(provenancePath, renderProvenance(counts), 'utf8');

  console.log(`Seeding complete. Counts:`, counts);
  console.log(`Wrote ${provenancePath}`);
  if (!counts.perspective_created) {
    console.warn(
      'WARNING: custom perspective creation failed (Perspective.Custom API not available or not licensed for ' +
        'Pro?). Coverage-matrix row "Perspectives" is not satisfied — investigate before freezing.',
    );
  }
  console.log(
    'Next: run the coverage-matrix audit by hand against docs/superpowers/specs/2026-07-02-kmm-test-ground-design.md §2, ' +
      'then zip the document into the golden snapshot (see spec §2 "Freeze").',
  );
}

// Run-guard (scripts/lib/run-directly.ts pattern, same as verify-deploy.ts):
// without it, merely IMPORTING this module — e.g. a unit test exercising
// parseArgs/renderProvenance — would fire real OmniFocus mutations against
// whatever database happens to be open.
if (isRunDirectly(import.meta.url)) {
  main().catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  });
}

// Exported for unit tests (the run-guard above makes importing side-effect-free).
export { parseArgs, buildOmniJsPayload, renderProvenance, resolveSeedTimeoutMs, type SeedCounts };

/**
 * OMN-280 — unit coverage for the KMM golden-database seeder (PR #216).
 * Live behavioral verification (actually seeding OmniFocus) is deferred to
 * OMN-280's on-machine sitting; this suite covers what's testable without
 * OmniFocus: pure functions, payload pins for the OmniJS API-shape bugs the
 * /code-review gate confirmed, and the PROVENANCE.md contract shared with
 * scripts/kmm/of-db-reset.sh.
 *
 * Importing the module at all is itself a regression test: without the
 * isRunDirectly guard, this import would shell out to osascript and mutate
 * a real OmniFocus database.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, sourceAndRun } from './bash-harness.js';
import {
  parseArgs,
  buildOmniJsPayload,
  renderProvenance,
  resolveSeedTimeoutMs,
  type SeedCounts,
} from '../../../scripts/kmm/seed-golden-database.js';

const OF_DB_RESET = join(REPO_ROOT, 'scripts/kmm/of-db-reset.sh');

const SAMPLE_COUNTS: SeedCounts = {
  tasks: 152,
  projects: 21,
  tags: 9,
  folders: 4,
  tasks_completed: 3,
  tasks_dropped: 1,
  projects_dropped: 1,
  projects_done: 1,
  seed_timestamp: '2026-07-21T12:00:00.000Z',
  perspective_created: false,
};

describe('parseArgs', () => {
  it('defaults --out to ~/of-golden', () => {
    expect(parseArgs([]).outDir).toBe(join(homedir(), 'of-golden'));
  });

  it('throws loudly when --out has no value instead of silently defaulting', () => {
    expect(() => parseArgs(['--out'])).toThrow('--out requires a directory argument');
  });

  it('throws loudly when --out is followed by another flag instead of mkdir-ing a directory named like the flag', () => {
    expect(() => parseArgs(['--out', '--verbose'])).toThrow('--out requires a directory argument');
  });

  it('honors --out override', () => {
    // Computed rather than literal so no hardcoded world-writable-directory
    // string appears in source (sonarjs/publicly-writable-directories).
    const customOut = join(tmpdir(), 'custom-golden');
    expect(parseArgs(['--out', customOut]).outDir).toBe(customOut);
  });
});

describe('buildOmniJsPayload — OmniJS API-shape pins (gate findings)', () => {
  const payload = buildOmniJsPayload();

  it('is syntactically valid JavaScript', () => {
    // new Function() parses without executing — OmniFocus globals stay
    // unresolved, but a syntax error (the class of bug that burns a live
    // KMM sitting instantly) throws here.
    expect(() => new Function(payload)).not.toThrow();
  });

  it('never references the nonexistent Folder.ending static', () => {
    expect(payload).not.toContain('Folder.ending');
  });

  it('creates the fixture root at library.beginning with two-arg Folder constructors', () => {
    expect(payload).toContain("new Folder(fixtureName('Fixtures'), library.beginning)");
    expect(payload).toContain("new Folder(fixtureName('Nested L1'), root)");
  });

  // [^\n]* not [^)]* — the first argument is always a fixtureName(...) call,
  // whose closing paren would stop a [^)]* class before it ever reached the
  // position argument, making the not.toMatch a permanent false negative.
  const TASK_IN_FOLDER = /new Task\([^\n]*,\s*root\)/;
  const TASK_IN_INBOX_COLLECTION = /new Task\([^\n]*,\s*inbox\)/;

  it('the Task-position pin regexes actually match known-bad code (canary)', () => {
    // Watched-it-fail guard: if these regexes cannot flag the exact bug
    // they exist to catch, the pins below prove nothing.
    expect("var marker = new Task(fixtureName('seed-timestamp'), root);").toMatch(TASK_IN_FOLDER);
    expect("new Task(fixtureName('inbox task'), inbox);").toMatch(TASK_IN_INBOX_COLLECTION);
  });

  it('never positions a Task in a Folder (marker lives in the Seed Meta project)', () => {
    expect(payload).not.toMatch(TASK_IN_FOLDER);
    expect(payload).toContain("new Project(fixtureName('Seed Meta'), root)");
    expect(payload).toContain("new Task(fixtureName('seed-timestamp'), pMeta)");
  });

  it('positions the inbox task at inbox.ending, not the Inbox collection itself', () => {
    expect(payload).toContain('inbox.ending');
    expect(payload).not.toMatch(TASK_IN_INBOX_COLLECTION);
  });

  it('sweeps prior FIXTURE: data from FLATTENED collections before creating anything (idempotent re-seed)', () => {
    // Flattened, not top-level — a fixture nested under a non-fixture
    // parent would be invisible to the top-level folders/tags collections.
    // ALL flattened collections — a partial cascade failure can orphan
    // FIXTURE projects/tasks whose parent folder is already gone.
    for (const swept of [
      'sweepFixtures(flattenedFolders)',
      'sweepFixtures(flattenedProjects)',
      'sweepFixtures(flattenedTags)',
      'sweepFixtures(flattenedTasks)',
      'sweepFixtures(inbox)',
    ]) {
      expect(payload).toContain(swept);
    }
    // The leftover verification must scan the same five collections.
    for (const checked of [
      'flattenedProjects.slice().filter(isFixture).length',
      'flattenedTasks.slice().filter(isFixture).length',
    ]) {
      expect(payload).toContain(checked);
    }
    // The sweep must run BEFORE the first fixture creation.
    expect(payload.indexOf('deleteObject')).toBeLessThan(payload.indexOf('new Folder('));
  });

  it('reuses an existing FIXTURE custom perspective instead of duplicating it on re-seed', () => {
    expect(payload).toContain("Perspective.Custom.byName(fixtureName('Custom Perspective')) ||");
  });

  it('calls Task.drop() with both required arguments (allOccurrences, dateDropped)', () => {
    // Zero-arg drop() has no documented fallback (unlike markComplete);
    // production defs.ts always passes both.
    expect(payload).toContain('.drop(true, now)');
    expect(payload).not.toMatch(/\.drop\(\)/);
  });

  it('contains the seed-timestamp marker and returns JSON counts', () => {
    expect(payload).toContain("fixtureName('seed-timestamp')");
    expect(payload).toContain('return JSON.stringify(counts)');
  });
});

describe('main() ordering', () => {
  it('creates the output directory BEFORE the live OmniFocus mutation', () => {
    // A bad --out path must fail fast, not after the expensive live seed
    // has already mutated the real document (losing PROVENANCE.md).
    const src = readFileSync(join(REPO_ROOT, 'scripts/kmm/seed-golden-database.ts'), 'utf8');
    const mkdirIndex = src.indexOf('await mkdir(outDir');
    const seedIndex = src.indexOf('await runOmniJs(');
    expect(mkdirIndex).toBeGreaterThan(-1);
    expect(seedIndex).toBeGreaterThan(-1);
    expect(mkdirIndex).toBeLessThan(seedIndex);
  });
});

describe('renderProvenance — contract with of-db-reset.sh', () => {
  it('renders the key: value count lines', () => {
    const rendered = renderProvenance(SAMPLE_COUNTS);
    expect(rendered).toContain('tasks: 152');
    expect(rendered).toContain('projects: 21');
  });

  it("parses with the merged reset script's parse_provenance_count (cross-contract)", () => {
    // The real seam: of-db-reset.sh diffs live counts against this exact
    // file. Feed the rendered output through the actual bash parser rather
    // than re-asserting the format in TypeScript.
    const dir = mkdtempSync(join(tmpdir(), 'provenance-xcontract-'));
    try {
      writeFileSync(join(dir, 'PROVENANCE.md'), renderProvenance(SAMPLE_COUNTS));
      const result = sourceAndRun(
        OF_DB_RESET,
        `PROVENANCE="${dir}/PROVENANCE.md"; echo "$(parse_provenance_count tasks) $(parse_provenance_count projects)"`,
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('152 21');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveSeedTimeoutMs', () => {
  it('defaults to 180000 when unset or empty', () => {
    expect(resolveSeedTimeoutMs(undefined)).toBe(180_000);
    expect(resolveSeedTimeoutMs('')).toBe(180_000);
  });

  it('honors a numeric override', () => {
    expect(resolveSeedTimeoutMs('60000')).toBe(60_000);
  });

  it('throws loudly on a non-numeric or non-positive value instead of passing NaN to spawn', () => {
    expect(() => resolveSeedTimeoutMs('abc')).toThrow('OF_SEED_TIMEOUT_MS must be a positive number');
    expect(() => resolveSeedTimeoutMs('0')).toThrow('OF_SEED_TIMEOUT_MS must be a positive number');
    expect(() => resolveSeedTimeoutMs('-5')).toThrow('OF_SEED_TIMEOUT_MS must be a positive number');
  });
});

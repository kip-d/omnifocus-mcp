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
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import {
  parseArgs,
  buildOmniJsPayload,
  renderProvenance,
  type SeedCounts,
} from '../../../scripts/kmm/seed-golden-database.js';

const REPO_ROOT = join(__dirname, '../../..');
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

  it('never positions a Task in a Folder (marker lives in the Seed Meta project)', () => {
    expect(payload).not.toMatch(/new Task\([^)]*,\s*root\)/);
    expect(payload).toContain("new Project(fixtureName('Seed Meta'), root)");
    expect(payload).toContain("new Task(fixtureName('seed-timestamp'), pMeta)");
  });

  it('positions the inbox task at inbox.ending, not the Inbox collection itself', () => {
    expect(payload).toContain('inbox.ending');
    expect(payload).not.toMatch(/new Task\([^)]*,\s*inbox\)/);
  });

  it('sweeps prior FIXTURE: folders, tags, and inbox tasks before creating anything (idempotent re-seed)', () => {
    for (const sweep of [
      'folders.slice().filter(isFixture)',
      'tags.slice().filter(isFixture)',
      'inbox.slice().filter(isFixture)',
    ]) {
      expect(payload).toContain(sweep);
    }
    // The sweep must run BEFORE the first fixture creation.
    expect(payload.indexOf('deleteObject')).toBeLessThan(payload.indexOf('new Folder('));
  });

  it('contains the seed-timestamp marker and returns JSON counts', () => {
    expect(payload).toContain("fixtureName('seed-timestamp')");
    expect(payload).toContain('return JSON.stringify(counts)');
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
      const result = spawnSync(
        'bash',
        [
          '-c',
          `source "$1"; PROVENANCE="$2/PROVENANCE.md"; echo "$(parse_provenance_count tasks) $(parse_provenance_count projects)"`,
          'bash',
          OF_DB_RESET,
          dir,
        ],
        { env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' }, encoding: 'utf8' },
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('152 21');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// tests/unit/omnifocus/scripts/analytics/productivity-status-vocab.test.ts
// OMN-272 — projectStats.status shipped "[object project.status: active]":
// OmniJS Project.Status enums stringify as `[object Project.Status: Active]`,
// so the emitter's `.replace(' status', '')` (space, no dot) never matched and
// the lowercased raw object tag went to clients. Same defect class as OMN-250
// (enum stringification); same fix shape as projectStatusString in
// fetchSlimmedData (PR #227): explicit identity-compare map, String(s)
// fail-open fallback. These tests pin the canonical vocabulary against the
// live-faithful enum fakes (FAKE_PROJECT_STATUS), which stringify like the
// real enums — the old string-valued fakes made this bug untestable.
import { describe, it, expect } from 'vitest';
import { PRODUCTIVITY_STATS_SCRIPT_V3 } from '../../../../../src/omnifocus/scripts/analytics/productivity-stats-v3.js';
import { PRODUCTIVITY_STATS_V3_SCHEMA } from '../../../../../src/omnifocus/response-schemas/analyze.js';
import { runAnalyticsScript, FAKE_PROJECT_STATUS } from './run-analytics-script.js';

interface ProjectStatsRow {
  status: string;
}

function fakeProject(name: string, status: unknown) {
  return {
    id: { primaryKey: name },
    name,
    status,
    task: { children: [] },
    completionDate: null,
    // Recent activity so the row emits even with zero tasks.
    modified: new Date(),
  };
}

function runScript(projects: unknown[]): {
  ok: boolean;
  data: { projectStats: Record<string, ProjectStatsRow> };
} {
  const options = { period: 'week', includeProjectStats: true, includeTagStats: false, includeInactive: true };
  return runAnalyticsScript(PRODUCTIVITY_STATS_SCRIPT_V3, options, {
    flattenedProjects: projects,
  }) as ReturnType<typeof runScript>;
}

describe('OMN-272 — projectStats.status canonical vocabulary', () => {
  it('emits the canonical word for each Project.Status enum, never the object tag', () => {
    const parsed = runScript([
      fakeProject('P-active', FAKE_PROJECT_STATUS.Active),
      fakeProject('P-onHold', FAKE_PROJECT_STATUS.OnHold),
      fakeProject('P-done', FAKE_PROJECT_STATUS.Done),
      fakeProject('P-dropped', FAKE_PROJECT_STATUS.Dropped),
    ]);
    expect(parsed.ok).toBe(true);
    expect(PRODUCTIVITY_STATS_V3_SCHEMA.safeParse(parsed).success).toBe(true);

    // Pre-fix: every row read "[object project.status: <word>]".
    expect(parsed.data.projectStats['P-active'].status).toBe('active');
    expect(parsed.data.projectStats['P-onHold'].status).toBe('onHold');
    expect(parsed.data.projectStats['P-done'].status).toBe('done');
    expect(parsed.data.projectStats['P-dropped'].status).toBe('dropped');
  });

  it('fails open on an unknown future status value (String(s), not a crash or a drop)', () => {
    const alien = { toString: () => '[object Project.Status: Someday]' };
    const parsed = runScript([fakeProject('P-alien', alien)]);
    const row = parsed.data.projectStats['P-alien'];
    expect(row).toBeDefined();
    expect(row.status).toBe('[object Project.Status: Someday]');
  });

  it('the dead .replace is gone from the script text', () => {
    expect(PRODUCTIVITY_STATS_SCRIPT_V3).not.toContain(".replace(' status'");
  });
});

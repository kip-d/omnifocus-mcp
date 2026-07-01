/**
 * OMN-218 fix (b) — the folder-existence guard is injected into BOTH read-script
 * builders when (and only when) a string folder PATH filter is present, so an
 * unresolvable folder reference fails loudly (FOLDER_NOT_FOUND) instead of returning
 * a silent `success:true, total_count:0`.
 *
 * These are codegen-presence tests (the scripts run only inside OmniFocus). The guard's
 * RUNTIME behavior is covered by the emitFolderExistsGuard predicate tests in
 * folder-path-match.test.ts; the tool-layer mapping is covered by the OmniFocusReadTool
 * unit tests; end-to-end is the live `/verify`.
 */

import { describe, it, expect } from 'vitest';
import {
  buildFilteredTasksScript,
  buildFilteredProjectsScript,
  buildTaskCountScript,
  buildInboxScript,
} from '../../../../src/contracts/ast/script-builder.js';
import { buildListTasksScriptV4 } from '../../../../src/omnifocus/scripts/tasks/list-tasks-ast.js';
import type { NormalizedTaskFilter, ProjectFilter, TaskFilter } from '../../../../src/contracts/filters.js';

const CODE = 'FOLDER_NOT_FOUND';
const EXISTS = 'flattenedFolders.some';

describe('OMN-218: projects-side folder-existence guard', () => {
  it('injects the existence guard + FOLDER_NOT_FOUND envelope for a string folder path', () => {
    const { script } = buildFilteredProjectsScript({ folderName: 'Personal/Other Games' } as ProjectFilter);
    expect(script).toContain(EXISTS);
    expect(script).toContain(CODE);
  });

  it('does NOT inject the guard when no folder filter is present', () => {
    const { script } = buildFilteredProjectsScript({} as ProjectFilter);
    expect(script).not.toContain(CODE);
  });

  it('does NOT inject the guard for the top-level-only (folder:null) path', () => {
    const { script } = buildFilteredProjectsScript({ topLevelOnly: true } as ProjectFilter);
    expect(script).not.toContain(CODE);
  });

  it('the outer JXA wrapper passes an in-script error envelope through', () => {
    const { script } = buildFilteredProjectsScript({ folderName: 'X' } as ProjectFilter);
    expect(script).toContain('result.error');
  });
});

describe('OMN-218: tasks-side folder-existence guard', () => {
  it('injects the existence guard + FOLDER_NOT_FOUND envelope for a string folder path', () => {
    const { script } = buildFilteredTasksScript({ folder: 'Personal/Other Games' } as NormalizedTaskFilter);
    expect(script).toContain(EXISTS);
    expect(script).toContain(CODE);
  });

  it('does NOT inject the guard when no folder filter is present', () => {
    const { script } = buildFilteredTasksScript({} as NormalizedTaskFilter);
    expect(script).not.toContain(CODE);
  });

  it('does NOT inject the guard for the top-level (folderTopLevel) path', () => {
    const { script } = buildFilteredTasksScript({ folderTopLevel: true } as NormalizedTaskFilter);
    expect(script).not.toContain(CODE);
  });

  it('the V4 JXA wrapper passes an in-script error envelope through', () => {
    // buildFilteredTasksScript returns only the inner OmniJS program; the JXA wrapper
    // that must forward the error lives in buildListTasksScriptV4.
    const wrapped = buildListTasksScriptV4({ filter: { folder: 'X' } as NormalizedTaskFilter });
    expect(wrapped).toContain('result.error');
  });
});

describe('OMN-218: tasks-count folder-existence guard (countOnly parity)', () => {
  // Sibling of the list path: an unresolvable folder must not silently return count 0.
  it('injects the guard + FOLDER_NOT_FOUND envelope for a string folder path', () => {
    const { script } = buildTaskCountScript({ folder: 'Personal/Other Games' });
    expect(script).toContain(EXISTS);
    expect(script).toContain(CODE);
  });

  it('does NOT inject the guard when no folder filter is present', () => {
    const { script } = buildTaskCountScript({});
    expect(script).not.toContain(CODE);
  });

  it('does NOT inject the guard for the top-level (folderTopLevel) path', () => {
    const { script } = buildTaskCountScript({ folderTopLevel: true });
    expect(script).not.toContain(CODE);
  });
});

// OMN-218 review round 2: two gaps the first pass missed.
describe('OMN-218 review round 2: folder path nested in an OR branch', () => {
  it('tasks list: guards a folder path that only appears inside an OR branch', () => {
    const { script } = buildFilteredTasksScript({
      orBranches: [{ folder: 'Typo Folder' }, { flagged: true }],
    } as NormalizedTaskFilter);
    expect(script).toContain(CODE);
    expect(script).toContain('Typo Folder');
  });

  it('projects list: guards a folderName that only appears inside an OR branch', () => {
    const { script } = buildFilteredProjectsScript({
      orBranches: [{ folderName: 'Typo Folder' }, { name: 'x' }],
    } as ProjectFilter);
    expect(script).toContain(CODE);
    expect(script).toContain('Typo Folder');
  });

  it('tasks count: guards a folder path that only appears inside an OR branch', () => {
    const { script } = buildTaskCountScript({
      orBranches: [{ folder: 'Typo Folder' }, { flagged: true }],
    } as TaskFilter);
    expect(script).toContain(CODE);
    expect(script).toContain('Typo Folder');
  });
});

describe('OMN-218 review round 2: inbox mode + folder filter', () => {
  it('buildInboxScript injects the existence guard for a string folder path', () => {
    const { script } = buildInboxScript({ folder: 'Typo Folder' } as TaskFilter);
    expect(script).toContain(EXISTS);
    expect(script).toContain(CODE);
    expect(script).toContain('Typo Folder');
  });

  it('buildInboxScript does NOT inject the guard when no folder filter is present', () => {
    const { script } = buildInboxScript({} as TaskFilter);
    expect(script).not.toContain(CODE);
  });

  it('the V4 wrapper routes mode:"inbox" + a folder filter through the guarded inbox builder', () => {
    const wrapped = buildListTasksScriptV4({
      filter: { folder: 'Typo Folder', inInbox: true } as NormalizedTaskFilter,
      mode: 'inbox',
    });
    expect(wrapped).toContain(CODE);
  });
});

// OMN-218 /code-review high (PR #168): countOnly is routed BEFORE the id short-circuit
// in OmniFocusReadTool (compiled.countOnly checked before filter.id), so an
// {id, folder} countOnly query reaches buildTaskCountScript/buildFilteredProjectsScript
// directly instead of the dedicated id-lookup builder — unlike the non-countOnly path,
// where id already short-circuits BEFORE these builders ever see a folder value.
// buildTaskByIdScript documents "the id filter is the sole selector (sibling keys are
// ignored)"; the count builders must honor that same convention so id+folder+countOnly
// doesn't newly hard-error where id+folder without countOnly silently ignores folder.
describe('OMN-218 review (PR #168): folder guard skipped when filter.id is present', () => {
  it('buildTaskCountScript does NOT guard folder when id is also set', () => {
    const { script } = buildTaskCountScript({ id: 'abc123', folder: 'Typo Folder' });
    expect(script).not.toContain(CODE);
  });

  it('buildTaskCountScript DOES guard folder when id is absent (regression check)', () => {
    const { script } = buildTaskCountScript({ folder: 'Typo Folder' });
    expect(script).toContain(CODE);
  });

  it('buildFilteredProjectsScript does NOT guard folderName when id is also set', () => {
    const { script } = buildFilteredProjectsScript({ id: 'abc123', folderName: 'Typo Folder' } as ProjectFilter);
    expect(script).not.toContain(CODE);
  });

  it('buildFilteredProjectsScript DOES guard folderName when id is absent (regression check)', () => {
    const { script } = buildFilteredProjectsScript({ folderName: 'Typo Folder' } as ProjectFilter);
    expect(script).toContain(CODE);
  });
});

// OMN-218 /code-review high (PR #168): the guard collector deduped on the raw filter
// string, not the normalized (lowercased, segment-parsed) path — so "Personal/Bills"
// and "Personal : Bills" (same real folder, different separator) emitted two redundant
// existence-guard closures instead of one. Dedup behavior itself is exercised at the
// collector level (folder-path-match.test.ts) — two different string values for the
// SAME field on separate OR branches trips an unrelated, pre-existing validator bug
// (`detectContradictions` doesn't respect OR-branch scoping; confirmed general, not
// folder-specific, e.g. `{OR:[{projectId:'A'},{projectId:'B'}]}` also throws on `main`
// today) when routed through the full generateFilterCode/validate pipeline, so a
// builder-level (`buildFilteredTasksScript`) dedup demonstration can't be constructed
// without tripping that orthogonal defect. Flagged separately; out of scope here.

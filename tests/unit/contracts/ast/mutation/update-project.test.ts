// tests/unit/contracts/ast/mutation/update-project.test.ts
// OMN-128 slice 4 — golden + vm-execution + dispatch-guard tests for the
// update/project lowering (buildUpdateProjectProgram). Mirrors update-task.test.ts.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
// Imports go through the barrel deliberately — this file exercises the public
// surface of src/contracts/ast/mutation/index.ts.
import {
  buildUpdateProjectProgram,
  dispatchMutation,
  validateMutationProgram,
  emitProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';
import type { ProjectUpdateData } from '../../../../../src/contracts/mutations.js';
import { ProjectWriteResultSchema } from '../../../../../src/omnifocus/script-response-schemas.js';
import { expectMatchesSchema } from './assert-schema.js';

function emit(changes: ProjectUpdateData, projectId = 'p1'): string {
  const program = buildUpdateProjectProgram({ projectId, changes });
  validateMutationProgram(program);
  return emitProgram(program);
}

describe('buildUpdateProjectProgram — golden emission', () => {
  // The §2.1 delta: the legacy name fallback (flattenedProjects.find) is DEAD.
  it('target resolves via Project.byIdentifier ONLY — name fallback dead (spec §2.1)', () => {
    const omnijs = emit({ name: 'x' });
    expect(omnijs).toContain('const proj = Project.byIdentifier("p1") || null;');
    expect(omnijs).not.toContain('flattenedProjects.find');
    expect(omnijs).toContain(
      'if (proj === null) return JSON.stringify({ error: true, message: "Project not found: p1", context: "update_project" });',
    );
  });

  // Build-time conditional lowering (spec §1): only-what-changed.
  it('rename-only update emits resolve, guard, one setProp, return — nothing else', () => {
    const program = buildUpdateProjectProgram({ projectId: 'p1', changes: { name: 'New name' } });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual(['resolveProjectById', 'guard', 'setProp', 'return']);
    expect(program.context).toBe('update_project');
    expect(program.snippetDeps).toEqual([]);

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('proj.name = "New name";');
    expect(omnijs).not.toContain('moveSections');
    expect(omnijs).not.toContain('dueDate');
    expect(omnijs).not.toContain('addTag');
  });

  it('full-field input lowers in legacy apply order: scalars → reviewInterval → dates → status → folder move → tags', () => {
    const program = buildUpdateProjectProgram({
      projectId: 'p1',
      changes: {
        name: 'n',
        note: 'o',
        flagged: true,
        sequential: true,
        reviewInterval: 7,
        dueDate: '2026-06-12 17:00',
        status: 'on_hold',
        folder: 'Work Folder',
        tags: ['__test-a'],
        addTags: ['__test-b'],
        removeTags: ['__test-c'],
      },
    });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual([
      'resolveProjectById', // target
      'guard',
      'resolveFolder', // destination: folder
      'guard',
      'setProp', // name
      'setProp', // note
      'setProp', // flagged
      'setProp', // sequential
      'setProp', // reviewInterval (readModifyReassign strategy)
      'setProp', // dueDate
      'setProp', // status
      'moveProject', // folder move
      'assignTags', // tags (replace)
      'assignTags', // addTags (add)
      'assignTags', // removeTags (remove)
      'return',
    ]);
  });

  // Status — update supports 'active' (create's STATUS_ENUM does not; spec §3).
  it('status active emits a Project.Status.Active assignment', () => {
    const omnijs = emit({ status: 'active' });
    expect(omnijs).toContain('proj.status = Project.Status.Active;');
  });

  it('status set is best-effort labeled status (OMN-137 — legacy swallowed it)', () => {
    const omnijs = emit({ status: 'on_hold' });
    expect(omnijs).toContain('try { proj.status = Project.Status.OnHold; }');
    expect(omnijs).toContain('_warnings.push("status"');
  });

  // Folder move — destinations keep flexible resolution; only the target is strict.
  it('folder: null emits moveSections to library.beginning, best-effort labeled folder', () => {
    const omnijs = emit({ folder: null });
    expect(omnijs).toContain('try { moveSections([proj], library.beginning); }');
    expect(omnijs).toContain('_warnings.push("folder"');
  });

  it('folder string resolves flexibly with a loud guard BEFORE applies (§2.2 message delta)', () => {
    const program = buildUpdateProjectProgram({ projectId: 'p1', changes: { name: 'x', folder: 'Work Folder' } });
    expect(program.snippetDeps).toContain('resolveFolderFlexible');
    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const targetFolder = resolveFolderFlexible("Work Folder");');
    // Delta from legacy's 'Failed to move project: folder_not_found:' wrapping —
    // the new message matches the create-family wording.
    expect(omnijs).toContain(
      'if (targetFolder === null) return JSON.stringify({ error: true, message: "Folder not found: Work Folder", context: "update_project" });',
    );
    expect(omnijs).not.toContain('folder_not_found');
    expect(omnijs.indexOf('Folder not found: Work Folder')).toBeLessThan(omnijs.indexOf('proj.name = "x";'));
    expect(omnijs).toContain('moveSections([proj], targetFolder.beginning);');
  });

  // reviewInterval — readModifyReassign with BUILD-time unit conversion (shared
  // with create/project), best-effort labeled reviewInterval.
  it('reviewInterval lowers via readModifyReassign with build-time unit conversion', () => {
    const weekly = emit({ reviewInterval: 7 });
    expect(weekly).toContain(
      '{ const _rmr = proj.reviewInterval; if (_rmr) { _rmr.steps = 1; _rmr.unit = "weeks"; proj.reviewInterval = _rmr; } else { _warnings.push("reviewInterval: no existing typed instance to modify — OmniJS cannot construct one (OMN-41/OMN-58); value not set"); } }',
    );
    expect(weekly).toContain('_warnings.push("reviewInterval"');

    const nonDivisible = emit({ reviewInterval: 10 });
    expect(nonDivisible).toContain('_rmr.steps = 10; _rmr.unit = "days";');
  });

  // Dates — shared set-vs-clear helper (spec §3).
  it('dueDate: null and clearDueDate: true both emit a null assignment', () => {
    for (const changes of [{ dueDate: null }, { clearDueDate: true }] as const) {
      const omnijs = emit(changes);
      expect(omnijs).toContain('proj.dueDate = null;');
      expect(omnijs).not.toContain('new Date');
    }
  });

  // Carried from the Task 6 review: legacy lowered '' to null via its falsy
  // check, so the shared helper treats empty-string date as a clear.
  it('dueDate: "" lowers to a null assignment (legacy falsy-check faithful)', () => {
    const omnijs = emit({ dueDate: '' });
    expect(omnijs).toContain('proj.dueDate = null;');
    expect(omnijs).not.toContain('new Date');
  });

  it('clear flag WINS over a simultaneous value (legacy clear-applied-last)', () => {
    const omnijs = emit({ dueDate: '2026-06-12 17:00', clearDueDate: true });
    expect(omnijs).toContain('proj.dueDate = null;');
    expect(omnijs).not.toContain('new Date("2026-06-12 17:00")');
  });

  it('deferDate/plannedDate get the same set-vs-clear treatment', () => {
    const omnijs = emit({ deferDate: null, plannedDate: '2026-06-13 12:00', clearPlannedDate: true });
    expect(omnijs).toContain('proj.deferDate = null;');
    expect(omnijs).toContain('proj.plannedDate = null;');
    expect(omnijs).not.toContain('new Date');

    const set = emit({ deferDate: '2026-06-13 08:00' });
    expect(set).toContain('proj.deferDate = new Date("2026-06-13 08:00");');
  });

  // Scalars — emitted when !== undefined (false/empty-string are real values).
  it('name/note/flagged/sequential lower as setProps when !== undefined', () => {
    const omnijs = emit({ name: 'n', note: '', flagged: false, sequential: true });
    expect(omnijs).toContain('proj.name = "n";');
    expect(omnijs).toContain('proj.note = "";');
    expect(omnijs).toContain('proj.flagged = false;');
    expect(omnijs).toContain('proj.sequential = true;');
  });

  // Tags: three modes, distinct binds, best-effort labeled 'tags' (OMN-137).
  it('tags + addTags + removeTags emit three mode blocks with distinct binds', () => {
    const program = buildUpdateProjectProgram({
      projectId: 'p1',
      changes: { tags: ['__test-a'], addTags: ['__test-b'], removeTags: ['__test-c'] },
    });
    const tagStmts = program.statements.filter((s) => s.type === 'assignTags') as any[];
    expect(tagStmts.map((s) => [s.mode, s.bind, s.bestEffort, s.label])).toEqual([
      ['replace', 'replacedTags', true, 'tags'],
      ['add', 'addedTags', true, 'tags'],
      ['remove', 'removedTags', true, 'tags'],
    ]);
    expect(program.snippetDeps).toContain('resolveOrCreateTagByPath');
    expect(program.snippetDeps).toContain('resolveTagByPath');

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('proj.clearTags();');
    expect(omnijs).toContain('removeTag');
    expect(omnijs).toContain('_warnings.push("tags"');
  });

  // Envelope: live read-backs, never input echoes (spec §2.4 — the legacy
  // envelope echoed `changes.status || 'active'` while the set could have failed).
  it('envelope status is a READ-BACK ternary over Project.Status, not an input echo', () => {
    const omnijs = emit({ status: 'on_hold' });
    expect(omnijs).toContain("proj.status === Project.Status.Active ? 'active'");
    expect(omnijs).toContain("proj.status === Project.Status.OnHold ? 'onHold'");
    expect(omnijs).toContain("proj.status === Project.Status.Done ? 'done' : 'dropped'");
    expect(omnijs).not.toContain('"on_hold", updated'); // no echo of the requested value in the envelope
  });

  it('envelope reads back primaryKey/name/flagged/status and carries warnings', () => {
    const omnijs = emit({ name: 'x' });
    expect(omnijs).toContain('projectId: proj.id.primaryKey');
    expect(omnijs).toContain('name: proj.name');
    expect(omnijs).toContain('flagged: proj.flagged');
    expect(omnijs).toContain('updated: true');
    expect(omnijs).toContain('warnings: _warnings');
  });

  // Rule-7 sensitivity at the lowering's shape: stripping the target guard from
  // the EMITTED program tree must fail validation — proving the lowering's
  // resolve-first shape is actually under rule-7 protection (not vacuously valid).
  it('stripping the target guard makes the program fail rule 7 (without a guard)', () => {
    const program = buildUpdateProjectProgram({ projectId: 'p1', changes: { name: 'x' } });
    expect(() => validateMutationProgram(program)).not.toThrow();
    const guardIndex = program.statements.findIndex((s) => s.type === 'guard');
    expect(guardIndex).toBeGreaterThan(-1);
    program.statements.splice(guardIndex, 1);
    expect(() => validateMutationProgram(program)).toThrow(/without a guard/i);
  });
});

// EXECUTE the emitted program in a vm with stubbed OmniJS globals.
describe('emitted update-project program executes (vm)', () => {
  // Distinct enum-constant objects so the read-back ternary's === checks are real.
  const PROJECT_STATUS = {
    Active: { _status: 'Active' },
    OnHold: { _status: 'OnHold' },
    Done: { _status: 'Done' },
    Dropped: { _status: 'Dropped' },
  };

  const MUTATING_PROPS = [
    'name',
    'note',
    'flagged',
    'sequential',
    'dueDate',
    'deferDate',
    'plannedDate',
    'reviewInterval',
    'status',
  ] as const;

  /** A project stub whose setters RECORD — readable id/name/flagged/status, loud
   * sets. `statusSetThrows` makes the status SETTER throw while the GETTER keeps
   * returning the fixed live value (the §2.4 read-back proof rig). */
  function makeRecordingProject(opts?: { statusSetThrows?: boolean }): {
    proj: Record<string, unknown>;
    sets: string[];
    calls: string[];
  } {
    const sets: string[] = [];
    const calls: string[] = [];
    const values: Record<string, unknown> = { name: 'Old name', flagged: false, status: PROJECT_STATUS.Active };
    const proj: Record<string, unknown> = {
      id: { primaryKey: 'fake-proj-id' },
      clearTags: () => {
        calls.push('clearTags');
      },
      addTag: () => {
        calls.push('addTag');
      },
      removeTag: () => {
        calls.push('removeTag');
      },
    };
    for (const prop of MUTATING_PROPS) {
      Object.defineProperty(proj, prop, {
        get: () => values[prop],
        set: (v: unknown) => {
          if (prop === 'status' && opts?.statusSetThrows) {
            throw new Error('status locked');
          }
          sets.push(prop);
          values[prop] = v;
        },
      });
    }
    return { proj, sets, calls };
  }

  it('vm: not-found target returns the error envelope and mutates NOTHING', () => {
    const program = emitProgram(
      buildUpdateProjectProgram({ projectId: 'missing', changes: { name: 'x', folder: null } }),
    );
    const sandbox: Record<string, unknown> = {
      Project: { byIdentifier: () => null, Status: PROJECT_STATUS },
      moveSections: () => {
        throw new Error('moveSections must not be called when the target guard fires');
      },
    };
    const result = vm.runInNewContext(program, sandbox) as string;
    expect(JSON.parse(result)).toEqual({
      error: true,
      message: 'Project not found: missing',
      context: 'update_project',
    });
  });

  // The §2.4 read-back proof: the stub's status SET throws, its GET returns the
  // fixed live value — the envelope must report the LIVE value, not the request.
  it('vm: status set failure records a labeled warning, the update still succeeds, and the envelope status is the LIVE value', () => {
    const { proj, sets } = makeRecordingProject({ statusSetThrows: true });
    const program = emitProgram(
      buildUpdateProjectProgram({ projectId: 'p1', changes: { name: 'x', status: 'on_hold' } }),
    );
    const sandbox: Record<string, unknown> = {
      Project: { byIdentifier: () => proj, Status: PROJECT_STATUS },
    };
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expectMatchesSchema(ProjectWriteResultSchema, parsed);
    expect(parsed.updated).toBe(true);
    expect(parsed.name).toBe('x'); // the other change persisted
    expect(parsed.warnings).toEqual(['status: status locked']);
    expect(parsed.status).toBe('active'); // live GET (Active), NOT the requested 'on_hold'
    expect(sets).toContain('name');
    expect(sets).not.toContain('status'); // the throw fired before the recording line
  });

  // OMN-136 fail-loud: the null-instance readModifyReassign case.
  it('vm: update with reviewInterval on a project with NO interval instance warns and does not set (OMN-136)', () => {
    const { proj, sets } = makeRecordingProject(); // stub reviewInterval getter → undefined
    const program = emitProgram(buildUpdateProjectProgram({ projectId: 'p1', changes: { reviewInterval: 7 } }));
    const sandbox: Record<string, unknown> = {
      Project: { byIdentifier: () => proj, Status: PROJECT_STATUS },
    };
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expectMatchesSchema(ProjectWriteResultSchema, parsed);
    expect(parsed.updated).toBe(true); // best-effort: the update itself still succeeds
    expect(parsed.warnings).toEqual([
      'reviewInterval: no existing typed instance to modify — OmniJS cannot construct one (OMN-41/OMN-58); value not set',
    ]);
    expect(sets).not.toContain('reviewInterval');
  });

  it('vm: update with reviewInterval on a project WITH an instance mutates it and stays warning-free (OMN-136)', () => {
    const { proj, sets } = makeRecordingProject();
    (proj as { reviewInterval: unknown }).reviewInterval = { unit: 'months', steps: 1 };
    const program = emitProgram(buildUpdateProjectProgram({ projectId: 'p1', changes: { reviewInterval: 14 } }));
    const sandbox: Record<string, unknown> = {
      Project: { byIdentifier: () => proj, Status: PROJECT_STATUS },
    };
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expect(parsed.warnings).toEqual([]);
    expect(sets).toContain('reviewInterval');
    expect((proj as { reviewInterval: { unit: string; steps: number } }).reviewInterval).toEqual({
      unit: 'weeks',
      steps: 2,
    });
  });

  it('vm: rename-only happy path returns the read-back envelope with empty warnings', () => {
    const { proj } = makeRecordingProject();
    const program = emitProgram(buildUpdateProjectProgram({ projectId: 'p1', changes: { name: 'New name' } }));
    const sandbox: Record<string, unknown> = {
      Project: { byIdentifier: () => proj, Status: PROJECT_STATUS },
    };
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expectMatchesSchema(ProjectWriteResultSchema, parsed);
    expect(parsed).toEqual({
      projectId: 'fake-proj-id',
      name: 'New name', // read back from the stub, not echoed
      flagged: false,
      status: 'active',
      updated: true,
      warnings: [],
    });
  });

  // Carried from the Task 6 review: a throwing move records a labeled warning
  // while the rest of the update applies (OMN-137 partial-success truthfulness).
  it('vm: a throwing moveSections records a labeled folder warning but the update still succeeds', () => {
    const { proj, sets } = makeRecordingProject();
    const program = emitProgram(buildUpdateProjectProgram({ projectId: 'p1', changes: { name: 'x', folder: null } }));
    const sandbox: Record<string, unknown> = {
      Project: { byIdentifier: () => proj, Status: PROJECT_STATUS },
      library: { beginning: { marker: 'library-start' } },
      moveSections: () => {
        throw new Error('boom');
      },
    };
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expectMatchesSchema(ProjectWriteResultSchema, parsed);
    expect(parsed.updated).toBe(true);
    expect(parsed.name).toBe('x'); // the other change persisted
    expect(parsed.warnings).toEqual(['folder: boom']);
    expect(sets).toContain('name');
  });
});

// OMN-136 fail-loud: a readModifyReassign whose target instance is null used to
// silently no-op AND report success (no else branch). Kip's 2026-07-06 decision:
// write no-ops FAIL LOUD — the null-instance case records a labeled OMN-137
// warning in the envelope instead of silent success. (vm-execution proofs live
// in the vm describe above, where the recording stub is in scope.)
describe('OMN-136 — reviewInterval null-instance is LOUD, not a silent skip', () => {
  it('emission: the readModifyReassign block carries the labeled else-warning', () => {
    const omnijs = emitProgram(buildUpdateProjectProgram({ projectId: 'p1', changes: { reviewInterval: 7 } }));
    expect(omnijs).toContain(
      'else { _warnings.push("reviewInterval: no existing typed instance to modify — OmniJS cannot construct one (OMN-41/OMN-58); value not set"); }',
    );
  });
});

// The OMN-119/120 non-bypass property for the update family: dispatch runs the
// sandbox guard BEFORE building (mirrors update-task.test.ts's guard test).
describe('dispatchMutation update/project guard (OMN-119/120 non-bypass)', () => {
  it('rejects a non-sandbox project id when the sandbox guard is enabled', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(
        dispatchMutation('update/project', { projectId: 'not-a-sandbox-project-id', changes: { name: 'x' } }),
      ).rejects.toThrow(/TEST GUARD/);
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});

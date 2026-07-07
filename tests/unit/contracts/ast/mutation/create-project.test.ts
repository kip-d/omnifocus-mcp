import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { buildCreateProjectProgram, dispatchMutation } from '../../../../../src/contracts/ast/mutation/defs.js';
import { validateMutationProgram } from '../../../../../src/contracts/ast/mutation/validator.js';
import { emitProgram } from '../../../../../src/contracts/ast/mutation/emitter.js';
import { ProjectWriteResultSchema } from '../../../../../src/omnifocus/script-response-schemas.js';
import { expectMatchesSchema } from './assert-schema.js';

describe('buildCreateProjectProgram', () => {
  it('no folder → constructProject folder kind none; no resolveFolder/guard', () => {
    const p = buildCreateProjectProgram({ name: 'P' });
    expect(p.statements.find((s) => s.type === 'resolveFolder')).toBeUndefined();
    const cp = p.statements.find((s) => s.type === 'constructProject') as any;
    expect(cp.folder).toEqual({ kind: 'none' });
    expect(p.statements.at(-1)!.type).toBe('return');
  });

  it('folder requested → resolveFolder + guard + resolved construct + snippet dep', () => {
    const p = buildCreateProjectProgram({ name: 'P', folder: 'Work' });
    expect(p.statements[0].type).toBe('resolveFolder');
    expect(p.statements[1].type).toBe('guard');
    expect(p.snippetDeps).toContain('resolveFolderFlexible');
    const cp = p.statements.find((s) => s.type === 'constructProject') as any;
    expect(cp.folder).toEqual({ kind: 'resolved', var: 'targetFolder' });
  });

  it('status active is NOT emitted; on_hold IS', () => {
    expect(
      buildCreateProjectProgram({ name: 'P', status: 'active' }).statements.some(
        (s) => s.type === 'setProp' && (s as any).prop === 'status',
      ),
    ).toBe(false);
    expect(
      buildCreateProjectProgram({ name: 'P', status: 'on_hold' }).statements.some(
        (s) => s.type === 'setProp' && (s as any).prop === 'status',
      ),
    ).toBe(true);
  });

  it('reviewInterval 7 → weekly readModifyReassign with steps 1', () => {
    const p = buildCreateProjectProgram({ name: 'P', reviewInterval: 7 });
    const ri = p.statements.find((s) => s.type === 'setProp' && (s as any).prop === 'reviewInterval') as any;
    expect(ri.strategy).toBe('readModifyReassign');
    expect(ri.mutations).toEqual(
      expect.arrayContaining([
        { prop: 'steps', value: { type: 'json', value: 1 } },
        { prop: 'unit', value: { type: 'json', value: 'weeks' } },
      ]),
    );
  });

  // OMN-137: every best-effort site carries a warnings label, and the envelope
  // surfaces the program-scope _warnings array.
  it('best-effort sites carry OMN-137 labels and the envelope carries warnings', () => {
    const p = buildCreateProjectProgram({
      name: 'P',
      tags: ['t'],
      status: 'on_hold',
      reviewInterval: 7,
    });
    const status = p.statements.find((s) => s.type === 'setProp' && (s as any).prop === 'status') as any;
    expect(status.bestEffort).toBe(true);
    expect(status.label).toBe('status');
    const ri = p.statements.find((s) => s.type === 'setProp' && (s as any).prop === 'reviewInterval') as any;
    expect(ri.bestEffort).toBe(true);
    expect(ri.label).toBe('reviewInterval');
    const tags = p.statements.find((s) => s.type === 'assignTags') as any;
    expect(tags.bestEffort).toBe(true);
    expect(tags.label).toBe('tags');
    const ret = p.statements.at(-1) as any;
    expect(ret.envelope.warnings).toEqual({ type: 'ref', name: '_warnings' });
  });

  it('produced program passes the validator and emits a runnable-looking OmniJS program', () => {
    const p = buildCreateProjectProgram({
      name: 'P',
      folder: 'Work',
      tags: ['t'],
      dueDate: '2026-06-30',
      status: 'on_hold',
      reviewInterval: 7,
    });
    expect(() => validateMutationProgram(p)).not.toThrow();
    const out = emitProgram(p);
    expect(out).toContain('new Project(');
    expect(out).toContain('resolveFolderFlexible(');
    // OMN-137: program-scope warnings declaration, labeled best-effort catches,
    // and the warnings key in the return envelope.
    expect(out).toContain('let _warnings = [];');
    expect(out).toContain('_warnings.push("status"');
    expect(out).toContain('_warnings.push("reviewInterval"');
    expect(out).toContain('_warnings.push("tags"');
    expect(out).toContain('warnings: _warnings');
    // The ONLY remaining swallow is the deliberate dateExpr one (spec §3.1).
    const swallows = out.match(/catch \(e\) \{\}/g) ?? [];
    expect(swallows).toHaveLength(1); // the dueDate dateExpr arm
  });
});

describe('dispatchMutation guard (OMN-119/120 non-bypass)', () => {
  it('calls the sandbox guard before building (async since slice 2)', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(dispatchMutation('create/project', { name: 'P', folder: 'NotSandbox' } as any)).rejects.toThrow(
        /TEST GUARD/,
      );
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});

// OMN-158 Task 4: VM success-path test to tie the create-project emitter to ProjectWriteResultSchema.
describe('emitted create-project program executes (vm)', () => {
  function makeSandbox(): Record<string, unknown> {
    const ProjectCtor = function (this: Record<string, unknown>, name: string) {
      this.id = { primaryKey: 'proj-pk-1' };
      this.name = name;
      this.note = '';
      this.flagged = false;
      this.sequential = false;
      this.dueDate = null;
      this.deferDate = null;
      this.plannedDate = null;
      this.addTag = (): void => {};
      this.clearTags = (): void => {};
    } as unknown as Record<string, unknown>;
    return {
      Project: ProjectCtor,
      Tag: function (this: Record<string, unknown>, n: string) {
        this.name = n;
      },
      flattenedTags: [],
      tags: [],
    };
  }

  // OMN-249 (coverage gap from the OMN-106 review): the reviewInterval branch
  // was only string-asserted — execute it, both instance states, the way
  // update-project.test.ts does post-OMN-136.
  it('vm: create with reviewInterval on a stub WITH a default instance mutates it warning-free', () => {
    const sandbox = makeSandbox();
    (sandbox.Project as unknown as { prototype: Record<string, unknown> }).prototype.reviewInterval = undefined;
    const withInstance = function (this: Record<string, unknown>, name: string) {
      (sandbox.Project as unknown as (this: Record<string, unknown>, n: string) => void).call(this, name);
      this.reviewInterval = { unit: 'weeks', steps: 1 };
    };
    const parsed = JSON.parse(
      vm.runInNewContext(emitProgram(buildCreateProjectProgram({ name: 'P', reviewInterval: 14 })), {
        ...sandbox,
        Project: withInstance,
      }) as string,
    );
    expect(parsed.warnings).toEqual([]);
    expect(parsed.created).toBe(true);
  });

  it('vm: create with reviewInterval on a stub with NO instance records the OMN-136 warning', () => {
    const sandbox = makeSandbox(); // ctor sets no reviewInterval → null-instance path
    const parsed = JSON.parse(
      vm.runInNewContext(emitProgram(buildCreateProjectProgram({ name: 'P', reviewInterval: 14 })), sandbox) as string,
    );
    expect(parsed.created).toBe(true);
    expect(parsed.warnings).toEqual([
      'reviewInterval: no existing typed instance to modify — OmniJS cannot construct one (OMN-41/OMN-58); value not set',
    ]);
  });

  it('vm: minimal create returns a ProjectWriteResultSchema-valid success envelope', () => {
    const program = emitProgram(buildCreateProjectProgram({ name: 'My Project' }));
    const sandbox = makeSandbox();
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expectMatchesSchema(ProjectWriteResultSchema, parsed);
    expect(parsed.created).toBe(true);
    expect(parsed.name).toBe('My Project');
    expect(parsed.projectId).toBe('proj-pk-1');
    expect(parsed.warnings).toEqual([]);
  });
});

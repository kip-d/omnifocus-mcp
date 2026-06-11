import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  emitExpr,
  emitProgram,
  emitStmt,
  wrapInLauncher,
  EMITTED_PROGRAM_SIZE_LIMIT,
} from '../../../../../src/contracts/ast/mutation/emitter.js';
import {
  ref,
  member,
  newExpr,
  enumRef,
  dateExpr,
  json,
  raw,
  constructProject,
  setProp,
  return_,
  readModifyReassign,
  assignTags,
  resolveProject,
  resolveParentTask,
  constructTask,
  batchItem,
  guard,
  bind,
  deleteObject,
  bulkDeleteItem,
  type Program,
} from '../../../../../src/contracts/ast/mutation/types.js';

describe('emitExpr', () => {
  it('ref → bare name', () => expect(emitExpr(ref('proj'))).toBe('proj'));
  it('member → dotted access', () => expect(emitExpr(member(ref('proj'), 'id.primaryKey'))).toBe('proj.id.primaryKey'));
  it('new → constructor call', () =>
    expect(emitExpr(newExpr('Project', [json('P'), ref('f')]))).toBe('new Project("P", f)'));
  it('enumRef → path verbatim', () => expect(emitExpr(enumRef('Project.Status.OnHold'))).toBe('Project.Status.OnHold'));
  it('dateExpr → new Date(...)', () => expect(emitExpr(dateExpr(json('2026-06-08')))).toBe('new Date("2026-06-08")'));
  it('json uses JSON.stringify (strings)', () => expect(emitExpr(json('hi'))).toBe('"hi"'));
  it('json is injection-safe: backticks, ${}, quotes, newlines survive as DATA', () => {
    const hostile = 'a`b${c}d"e\nf';
    const emitted = emitExpr(json(hostile));

    expect(eval(emitted)).toBe(hostile);
  });
  it('raw → emits its code verbatim (builder-internal fragments)', () => {
    expect(emitExpr(raw('proj.dueDate ? proj.dueDate.toISOString() : null'))).toBe(
      'proj.dueDate ? proj.dueDate.toISOString() : null',
    );
  });
});

describe('emitProgram', () => {
  it('emitProgram assembles an OmniJS IIFE with statements', () => {
    const program = {
      context: 'create_project',
      snippetDeps: [],
      statements: [
        constructProject('proj', json('P'), { kind: 'none' as const }),
        setProp(ref('proj'), 'flagged', json(true)),
        return_({ projectId: member(ref('proj'), 'id.primaryKey'), created: json(true) }),
      ],
    };
    const out = emitProgram(program);
    expect(out).toContain('const proj = new Project("P");');
    expect(out).toContain('proj.flagged = true;');
    expect(out).toContain('return JSON.stringify({ projectId: proj.id.primaryKey, created: true });');
    expect(out.trim().startsWith('(() => {')).toBe(true);
    expect(out.trim().endsWith('})()')).toBe(true);
  });

  it('emits setProp readModifyReassign as read → mutate → reassign', () => {
    const program = {
      context: 'update_project',
      snippetDeps: [],
      statements: [
        readModifyReassign(ref('proj'), 'reviewInterval', [
          { prop: 'steps', value: json(1) },
          { prop: 'unit', value: json('weeks') },
        ]),
      ],
    };
    const out = emitProgram(program);
    expect(out).toContain('const _rmr = proj.reviewInterval;');
    expect(out).toContain('_rmr.steps = 1;');
    expect(out).toContain('_rmr.unit = "weeks";');
    expect(out).toContain('proj.reviewInterval = _rmr;');
  });

  it('bestEffort setProp (enum) wraps the assignment in try/catch with a labeled warning (OMN-137)', () => {
    const out = emitProgram({
      context: 'create_project',
      snippetDeps: [],
      statements: [setProp(ref('proj'), 'status', enumRef('Project.Status.OnHold'), 'enum', true)],
    });
    expect(out).toContain('try { proj.status = Project.Status.OnHold; } catch (e) { _warnings.push(');
  });

  it('non-bestEffort enum setProp is NOT wrapped', () => {
    const out = emitProgram({
      context: 'create_project',
      snippetDeps: [],
      statements: [setProp(ref('proj'), 'status', enumRef('Project.Status.OnHold'), 'enum')],
    });
    expect(out).toContain('proj.status = Project.Status.OnHold;');
    expect(out).not.toContain('try { proj.status');
  });

  it('bestEffort readModifyReassign wraps the read-mutate-reassign block in try/catch with a labeled warning (OMN-137)', () => {
    const out = emitProgram({
      context: 'create_project',
      snippetDeps: [],
      statements: [readModifyReassign(ref('proj'), 'reviewInterval', [{ prop: 'steps', value: json(1) }], true)],
    });
    expect(out).toMatch(
      /try \{ \{ const _rmr = proj\.reviewInterval;.*\} catch \(e\) \{ _warnings\.push\("reviewInterval"/s,
    );
  });

  it('bestEffort dateExpr is NOT double-wrapped (already self-wraps)', () => {
    const out = emitProgram({
      context: 'create_project',
      snippetDeps: [],
      statements: [setProp(ref('proj'), 'dueDate', dateExpr(json('2026-06-30')), 'dateExpr', true)],
    });
    expect(out).toContain('try { proj.dueDate = new Date("2026-06-30"); } catch (e) {}');
    expect(out).not.toContain('try { try {');
  });

  it('bestEffort assignTags wraps only the LOOP — the consumed binding is hoisted to program scope', () => {
    const out = emitProgram({
      context: 'create_project',
      snippetDeps: ['resolveOrCreateTagByPath'],
      statements: [assignTags(ref('proj'), json(['t']), 'appliedTags', true)],
    });
    expect(out).toContain('try {');
    expect(out).toContain('proj.addTag(_tag);');
    expect(out).toContain('} catch (e) { _warnings.push(');
    // OMN-128 regression: the `let appliedTags = []` declaration MUST be hoisted OUTSIDE the
    // try (a later statement, e.g. the return envelope, consumes it). If it were trapped in
    // the try, a thrown best-effort block leaves the consumer with a ReferenceError.
    expect(out).toContain('let appliedTags = [];');
    expect(out.indexOf('let appliedTags = [];')).toBeLessThan(out.indexOf('try {'));
  });

  it('emits assignTags as a resolve-or-create loop with addTag', () => {
    const program = {
      context: 'create_project',
      snippetDeps: ['resolveOrCreateTagByPath'],
      statements: [assignTags(ref('proj'), json(['work', 'home']), 'appliedTags')],
    };
    const out = emitProgram(program);
    expect(out).toContain('let appliedTags = [];');
    expect(out).toContain('parseTagPath(_tagName)');
    expect(out).toContain('proj.addTag(_tag);');
    expect(out).toContain('appliedTags.push(_tag.name);');
  });

  // OMN-128: the bug a shape-only test cannot catch — EXECUTE the emitted OmniJS program
  // in a vm with stubbed OmniFocus globals and confirm it runs to a valid envelope.
  // Before the hoist fix, the return's reference to `appliedTags` (trapped in the
  // best-effort try) threw `ReferenceError` here. Live /verify found it; this guards it.
  it('emitted create-with-tags program EXECUTES and builds its envelope (no ReferenceError)', () => {
    const program = emitProgram({
      context: 'create_project',
      snippetDeps: ['resolveOrCreateTagByPath'],
      statements: [
        constructProject('proj', json('P'), { kind: 'none' }),
        assignTags(ref('proj'), json(['work']), 'appliedTags', true),
        return_({ tags: ref('appliedTags'), created: json(true) }),
      ],
    });
    // Minimal OmniJS runtime stubs so the program runs to its return.
    const sandbox: Record<string, unknown> = {
      Project: function (this: Record<string, unknown>, name: string) {
        this.id = { primaryKey: 'p1' };
        this.name = name;
        this.addTag = (): void => {};
      },
      Tag: function (name: string) {
        return { name };
      },
      flattenedTags: [],
      tags: [],
    };
    const result = vm.runInNewContext(program, sandbox) as string;
    const parsed = JSON.parse(result);
    expect(parsed.created).toBe(true);
    expect(parsed.tags).toEqual(['work']);
  });

  it('throws if the body calls a helper not declared in snippetDeps', () => {
    const program = {
      context: 'create_project',
      // BUG: assignTags emits parseTagPath(...) + resolveOrCreateTagByPath(...) but no dep declared
      snippetDeps: [],
      statements: [assignTags(ref('proj'), json(['work']), 'appliedTags')],
    };
    expect(() => emitProgram(program)).toThrow(/(parseTagPath|resolveOrCreateTagByPath).*snippetDeps/i);
  });

  it('does NOT throw when the helper IS declared in snippetDeps', () => {
    const program = {
      context: 'create_project',
      snippetDeps: ['resolveOrCreateTagByPath'],
      statements: [assignTags(ref('proj'), json(['work']), 'appliedTags')],
    };
    expect(() => emitProgram(program)).not.toThrow();
  });
});

// OMN-137: best-effort failures must surface as labeled envelope warnings, not be
// swallowed. The dateExpr swallow is the ONE deliberate exception (spec §3.1: an
// invalid date string yields Invalid Date, not a throw — a warning there is theater).
describe('OMN-137 warnings infrastructure', () => {
  it('every program declares _warnings at program scope', () => {
    const program = emitProgram({ statements: [return_({ ok: json(true) })], context: 'x', snippetDeps: [] });
    expect(program).toContain('let _warnings = [];');
  });

  it('bestEffort setProp failure pushes a labeled warning instead of swallowing', () => {
    const stmt = setProp(ref('proj'), 'status', enumRef('Project.Status.OnHold'), 'enum', true, 'status');
    const out = emitStmt(stmt);
    expect(out).toContain('catch (e)');
    expect(out).toContain('_warnings.push');
    expect(out).toContain('"status"');
    expect(out).not.toContain('catch (e) {}');
  });

  it('bestEffort readModifyReassign failure pushes a labeled warning (explicit label)', () => {
    const out = emitStmt(
      readModifyReassign(ref('proj'), 'reviewInterval', [{ prop: 'steps', value: json(1) }], true, 'reviewInterval'),
    );
    expect(out).toContain('_warnings.push');
    expect(out).toContain('"reviewInterval"');
    expect(out).not.toContain('catch (e) {}');
  });

  it('bestEffort assignTags guarded loop pushes a labeled warning (explicit label)', () => {
    const out = emitStmt(assignTags(ref('proj'), json(['t']), 'appliedTags', true, 'projectTags'));
    expect(out).toContain('_warnings.push');
    expect(out).toContain('"projectTags"');
    expect(out).not.toContain('catch (e) {}');
  });

  it('bestEffort assignTags label falls back to "tags" when absent', () => {
    const out = emitStmt(assignTags(ref('proj'), json(['t']), 'appliedTags', true));
    expect(out).toContain('_warnings.push("tags"');
    expect(out).not.toContain('catch (e) {}');
  });

  it('bestEffort setProp label falls back to node.prop when absent', () => {
    const out = emitStmt(setProp(ref('proj'), 'status', enumRef('Project.Status.OnHold'), 'enum', true));
    expect(out).toContain('_warnings.push("status"');
    expect(out).not.toContain('catch (e) {}');
  });

  // EXECUTE the warning path: a throwing property setter must NOT fail the program —
  // it must record a labeled warning the return envelope can carry out.
  it('a throwing best-effort setProp records a labeled warning and the program still returns ok (vm)', () => {
    const program = emitProgram({
      context: 'x',
      snippetDeps: [],
      statements: [
        setProp(ref('obj'), 'status', json('on_hold'), 'direct', true, 'status'),
        return_({ warnings: ref('_warnings'), ok: json(true) }),
      ],
    });
    const obj: Record<string, unknown> = {};
    Object.defineProperty(obj, 'status', {
      set() {
        throw new Error('boom');
      },
    });
    const sandbox: Record<string, unknown> = { obj };
    const result = vm.runInNewContext(program, sandbox) as string;
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings).toEqual(['status: boom']);
  });
});

describe('slice-2 statement emission', () => {
  it('resolveProject emits a resolveProjectFlexible call with JSON-escaped ref', () => {
    expect(emitStmt(resolveProject('p', 'My "Q" Project'))).toBe(
      'const p = resolveProjectFlexible("My \\"Q\\" Project");',
    );
  });

  it('resolveParentTask emits Task.byIdentifier with null fallback', () => {
    expect(emitStmt(resolveParentTask('pt', 'abc123'))).toBe('const pt = Task.byIdentifier("abc123") || null;');
  });

  it('constructTask: inbox has no move; resolved containers move to <var>.ending', () => {
    // `var` (not `const`): the bind must hoist out of a batchItem's try block so a
    // later item's tempIdRef can reference it (see the emitter comment).
    expect(emitStmt(constructTask('t', json('X'), { kind: 'inbox' }))).toBe('var t = new Task("X");');
    expect(emitStmt(constructTask('t', json('X'), { kind: 'project', var: 'p' }))).toBe(
      'var t = new Task("X");\nmoveTasks([t], p.ending);',
    );
    expect(emitStmt(constructTask('t', json('X'), { kind: 'parentTask', var: 'pt' }))).toBe(
      'var t = new Task("X");\nmoveTasks([t], pt.ending);',
    );
    expect(emitStmt(constructTask('t', json('X'), { kind: 'tempIdRef', var: '_t0' }))).toBe(
      'var t = new Task("X");\nmoveTasks([t], _t0.ending);',
    );
  });

  it('guard throw-mode emits a throw, not a return', () => {
    const g = guard('p === null', { message: json('Project not found: X') }, 'throw');
    expect(emitStmt(g)).toBe('if (p === null) throw new Error("Project not found: X");');
  });

  it('guard throw-mode without a message fails LOUDLY at build time', () => {
    expect(() => emitStmt(guard('p === null', { error: json(true) }, 'throw'))).toThrow(/message/);
  });

  it('guard return-mode is unchanged (default mode)', () => {
    expect(emitStmt(guard('p === null', { error: json(true) }))).toBe(
      'if (p === null) return JSON.stringify({ error: true });',
    );
  });

  it('emits deleteObject as a free-function call', () => {
    expect(emitStmt(deleteObject(ref('task')))).toBe('deleteObject(task);');
  });

  it('batchItem emits try/capture with per-item warnings slice and results push', () => {
    const node = batchItem('tmp1', 0, '_t0', [constructTask('_t0', json('A'), { kind: 'inbox' })], false);
    const out = emitStmt(node);
    expect(out).toContain('const _w0 = _warnings.length;');
    expect(out).toContain(
      'results.push({ tempId: "tmp1", taskId: _t0.id.primaryKey, success: true, warnings: _warnings.slice(_w0) });',
    );
    expect(out).toContain('catch (e)');
    expect(out).toContain('success: false');
    expect(out).not.toContain('_aborted'); // stopOnError false
    const stop = emitStmt(batchItem('tmp1', 0, '_t0', [constructTask('_t0', json('A'), { kind: 'inbox' })], true));
    expect(stop).toContain('_aborted = true;');
  });

  // VM execution: drive the WHOLE emitProgram output through a stubbed OmniJS
  // sandbox — shape-only string assertions cannot catch wiring bugs (OMN-128 lesson).
  const singleCreateProgram = () => ({
    context: 'create_task',
    snippetDeps: ['resolveProjectFlexible'],
    statements: [
      resolveProject('p', 'Work'),
      guard('p === null', {
        error: json(true),
        message: json('Project not found: Work'),
        context: json('create_task'),
      }),
      constructTask('task', json('Hello'), { kind: 'project' as const, var: 'p' }),
      return_({ taskId: member(ref('task'), 'id.primaryKey'), warnings: ref('_warnings'), created: json(true) }),
    ],
  });

  it('emitted single-create program EXECUTES: resolves project, constructs, moves to <project>.ending (vm)', () => {
    const program = emitProgram(singleCreateProgram());
    const fakeProject = { name: 'Work', ending: { marker: 'end' } };
    const moveCalls: unknown[][] = [];
    const taskCalls: unknown[] = [];
    const sandbox: Record<string, unknown> = {
      Project: { byIdentifier: () => null },
      flattenedProjects: [fakeProject],
      moveTasks: (...args: unknown[]) => {
        moveCalls.push(args);
      },
      Task: function (this: Record<string, unknown>, name: string) {
        taskCalls.push(name);
        this.id = { primaryKey: 'fake-id' };
        this.name = name;
      },
    };
    const result = vm.runInNewContext(program, sandbox) as string;
    const parsed = JSON.parse(result);
    expect(parsed.taskId).toBe('fake-id');
    expect(parsed.created).toBe(true);
    expect(parsed.warnings).toEqual([]);
    expect(taskCalls).toEqual(['Hello']);
    expect(moveCalls).toHaveLength(1);
    const [moved, destination] = moveCalls[0] as [Array<{ id: { primaryKey: string } }>, unknown];
    expect(moved).toHaveLength(1);
    expect(moved[0].id.primaryKey).toBe('fake-id');
    expect(destination).toBe(fakeProject.ending);
  });

  it('emitted single-create program EXECUTES: guard fires on missing project, Task NEVER constructed (vm)', () => {
    const program = emitProgram(singleCreateProgram());
    const taskCalls: unknown[] = [];
    const sandbox: Record<string, unknown> = {
      Project: { byIdentifier: () => null },
      flattenedProjects: [],
      moveTasks: () => {
        throw new Error('moveTasks must not be called when the guard fires');
      },
      Task: function (this: Record<string, unknown>, name: string) {
        taskCalls.push(name);
      },
    };
    const result = vm.runInNewContext(program, sandbox) as string;
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ error: true, message: 'Project not found: Work', context: 'create_task' });
    expect(taskCalls).toHaveLength(0);
  });

  // Cross-item tempIdRef (parentTempId chain): item 1 references item 0's task var.
  // Item 0's bind lives inside item 0's try block — it MUST hoist (`var`, not `const`)
  // to the program IIFE scope or item 1 throws `_t0 is not defined`. This test fails
  // if constructTask reverts to `const` (verified by local revert).
  it('emitted two-item batch EXECUTES: a later item tempIdRef sees an earlier item task (vm)', () => {
    const program = emitProgram({
      context: 'batch_create',
      snippetDeps: [],
      statements: [
        bind('results', raw('[]')),
        batchItem('a', 0, '_t0', [constructTask('_t0', json('A'), { kind: 'inbox' })], false),
        batchItem('b', 1, '_t1', [constructTask('_t1', json('B'), { kind: 'tempIdRef', var: '_t0' })], false),
        return_({ results: ref('results') }),
      ],
    });
    const created: Array<{ name: string; ending: { for: string }; id: { primaryKey: string } }> = [];
    const moveCalls: unknown[][] = [];
    const sandbox: Record<string, unknown> = {
      Task: function (this: Record<string, unknown>, name: string) {
        const ending = { for: name };
        this.name = name;
        this.ending = ending;
        this.id = { primaryKey: `id-${name}` };
        created.push(this as (typeof created)[number]);
      },
      moveTasks: (...args: unknown[]) => {
        moveCalls.push(args);
      },
    };
    const result = vm.runInNewContext(program, sandbox) as string;
    const parsed = JSON.parse(result) as { results: Array<{ tempId: string; success: boolean; taskId: string }> };
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]).toMatchObject({ tempId: 'a', success: true, taskId: 'id-A' });
    expect(parsed.results[1]).toMatchObject({ tempId: 'b', success: true, taskId: 'id-B' });
    // Identity check: item 1 moved to ITEM 0's task `.ending` — the cross-try reference.
    expect(moveCalls).toHaveLength(1);
    expect(created).toHaveLength(2);
    expect((moveCalls[0] as unknown[])[1]).toBe(created[0].ending);
  });
});

describe('emitted-program size guard', () => {
  it('throws LOUDLY when the assembled program exceeds the limit, naming both numbers', () => {
    // Many bind statements with long raw strings — built programmatically so the
    // test source stays tiny and the runtime cost is just string assembly.
    const big = 'x'.repeat(10_000);
    const statements = [
      ...Array.from({ length: 25 }, (_, i) => bind(`b${i}`, raw(`"${big}"`))),
      return_({ ok: json(true) }),
    ];
    let err: Error | undefined;
    try {
      emitProgram({ context: 'batch_create', snippetDeps: [], statements });
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeDefined();
    expect(err!.message).toContain(String(EMITTED_PROGRAM_SIZE_LIMIT));
    expect(err!.message).toMatch(/split the batch into smaller chunks/i);
    // The ACTUAL size must be named too — and it must exceed the limit.
    const sizes = (err!.message.match(/\d[\d_]*/g) ?? []).map((s) => Number(s.replace(/_/g, '')));
    expect(Math.max(...sizes)).toBeGreaterThan(EMITTED_PROGRAM_SIZE_LIMIT);
  });

  it('a normal program is far under the limit (happy path, no throw)', () => {
    const out = emitProgram({
      context: 'create_task',
      snippetDeps: [],
      statements: [constructTask('t', json('Hello'), { kind: 'inbox' }), return_({ ok: json(true) })],
    });
    expect(out.length).toBeLessThan(EMITTED_PROGRAM_SIZE_LIMIT / 10);
  });
});

describe('wrapInLauncher (JXA boundary)', () => {
  it('produces a self-contained IIFE with app init (skips OmniAutomation.wrapScript)', () => {
    const jxa = wrapInLauncher('return JSON.stringify({ok:true});', 'create_project');
    expect(jxa).toContain('(() =>');
    expect(jxa).toContain("Application('OmniFocus')");
    expect(jxa).toContain('app.evaluateJavascript(');
  });
  it('a hostile OmniJS program survives the boundary intact (injection-proof)', () => {
    const hostile = 'const x = `a${b}` + "\\" ); evil()"; \n return JSON.stringify({x});';
    const jxa = wrapInLauncher(hostile, 'create_project');
    const m = jxa.match(/app\.evaluateJavascript\((".*?")\);/s);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toBe(hostile);
  });
});

describe('bulkDeleteItem emission (slice 5)', () => {
  it('emits bulkDeleteItem as a per-id resolve/capture/delete block with per-item error capture', () => {
    const out = emitStmt(bulkDeleteItem('t1', 0));
    expect(out).toContain('const _d0 = Task.byIdentifier("t1") || null;');
    expect(out).toContain('_errors.push({ taskId: "t1", error: "Task not found" });'); // legacy bulk wording
    expect(out).toContain('const _n0 = _d0.name;'); // name captured BEFORE deleteObject
    expect(out.indexOf('const _n0')).toBeLessThan(out.indexOf('deleteObject(_d0);'));
    expect(out.indexOf('deleteObject(_d0);')).toBeLessThan(out.indexOf('_deleted.push({ id: "t1", name: _n0 });'));
    expect(out).toContain('catch (e)'); // continue-on-error: per-item try, no rethrow
  });

  it('emitProgram declares _deleted/_errors when the program contains bulkDeleteItem nodes', () => {
    const program: Program = {
      statements: [bulkDeleteItem('t1', 0), return_({ deleted: ref('_deleted'), errors: ref('_errors') })],
      context: 'bulk_delete_tasks',
      snippetDeps: [],
    };
    const omnijs = emitProgram(program);
    expect(omnijs).toContain('let _deleted = [];');
    expect(omnijs).toContain('let _errors = [];');
  });

  it('emitProgram does NOT declare _deleted/_errors for non-bulk programs', () => {
    const omnijs = emitProgram({ statements: [return_({ ok: json(true) })], context: 'x', snippetDeps: [] });
    expect(omnijs).not.toContain('_deleted');
  });
});

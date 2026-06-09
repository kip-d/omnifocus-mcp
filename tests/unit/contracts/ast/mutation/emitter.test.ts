import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { emitExpr, emitProgram, emitStmt, wrapInLauncher } from '../../../../../src/contracts/ast/mutation/emitter.js';
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

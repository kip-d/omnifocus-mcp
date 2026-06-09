import { describe, it, expect } from 'vitest';
import { emitExpr, emitProgram, wrapInLauncher } from '../../../../../src/contracts/ast/mutation/emitter.js';
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

  it('bestEffort setProp (enum) wraps the assignment in try/catch', () => {
    const out = emitProgram({
      context: 'create_project',
      snippetDeps: [],
      statements: [setProp(ref('proj'), 'status', enumRef('Project.Status.OnHold'), 'enum', true)],
    });
    expect(out).toContain('try { proj.status = Project.Status.OnHold; } catch (e) {}');
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

  it('bestEffort readModifyReassign wraps the read-mutate-reassign block in try/catch', () => {
    const out = emitProgram({
      context: 'create_project',
      snippetDeps: [],
      statements: [readModifyReassign(ref('proj'), 'reviewInterval', [{ prop: 'steps', value: json(1) }], true)],
    });
    expect(out).toMatch(/try \{ \{ const _rmr = proj\.reviewInterval;.*\} catch \(e\) \{\}/s);
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

  it('bestEffort assignTags wraps the tag block in try/catch', () => {
    const out = emitProgram({
      context: 'create_project',
      snippetDeps: [],
      statements: [assignTags(ref('proj'), json(['t']), 'appliedTags', true)],
    });
    expect(out).toContain('try {');
    expect(out).toContain('proj.addTag(_tag);');
    expect(out).toContain('} catch (e) {}');
  });

  it('emits assignTags as a resolve-or-create loop with addTag', () => {
    const program = {
      context: 'create_project',
      snippetDeps: [],
      statements: [assignTags(ref('proj'), json(['work', 'home']), 'appliedTags')],
    };
    const out = emitProgram(program);
    expect(out).toContain('const appliedTags = [];');
    expect(out).toContain('parseTagPath(_tagName)');
    expect(out).toContain('proj.addTag(_tag);');
    expect(out).toContain('appliedTags.push(_tag.name);');
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

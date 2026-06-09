import { describe, it, expect } from 'vitest';
import { emitExpr, emitProgram } from '../../../../../src/contracts/ast/mutation/emitter.js';
import {
  ref,
  member,
  newExpr,
  enumRef,
  dateExpr,
  json,
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

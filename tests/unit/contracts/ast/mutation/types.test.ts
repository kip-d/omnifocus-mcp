// tests/unit/contracts/ast/mutation/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  json,
  ref,
  member,
  setProp,
  return_,
  resolveFolder,
  constructTask,
  resolveProject,
  resolveParentTask,
  batchItem,
  guard,
  assignTags,
} from '../../../../../src/contracts/ast/mutation/types.js';

describe('mutation node factories', () => {
  it('json() wraps a value', () => {
    expect(json('a"b')).toEqual({ type: 'json', value: 'a"b' });
  });
  it('member() captures object + path', () => {
    expect(member(ref('proj'), 'id.primaryKey')).toEqual({
      type: 'member',
      object: { type: 'ref', name: 'proj' },
      path: 'id.primaryKey',
    });
  });
  it('setProp() defaults strategy to direct', () => {
    expect(setProp(ref('proj'), 'flagged', json(true))).toEqual({
      type: 'setProp',
      target: { type: 'ref', name: 'proj' },
      prop: 'flagged',
      value: { type: 'json', value: true },
      strategy: 'direct',
    });
  });
  it('resolveFolder() binds a result var + ref string', () => {
    expect(resolveFolder('folderVar', 'Work')).toEqual({ type: 'resolveFolder', bind: 'folderVar', ref: 'Work' });
  });
  it('return_() wraps an envelope', () => {
    expect(return_({ created: json(true) })).toEqual({
      type: 'return',
      envelope: { created: { type: 'json', value: true } },
    });
  });
});

describe('slice-2 node factories', () => {
  it('resolveProject / resolveParentTask carry bind + ref', () => {
    expect(resolveProject('p', 'Work')).toEqual({ type: 'resolveProject', bind: 'p', ref: 'Work' });
    // resolveParentTask is an alias for resolveTask — produces type 'resolveTask'
    expect(resolveParentTask('pt', 'abc')).toEqual({ type: 'resolveTask', bind: 'pt', ref: 'abc' });
  });

  it('constructTask carries a typed ContainerResolution', () => {
    expect(constructTask('t', json('X'), { kind: 'inbox' })).toEqual({
      type: 'constructTask',
      bind: 't',
      name: json('X'),
      container: { kind: 'inbox' },
    });
    expect(constructTask('t', json('X'), { kind: 'project', var: 'p' }).container).toEqual({
      kind: 'project',
      var: 'p',
    });
  });

  it('guard supports throw mode (default return)', () => {
    expect(guard('x === null', { message: json('nope') }).mode).toBeUndefined();
    expect(guard('x === null', { message: json('nope') }, 'throw').mode).toBe('throw');
  });

  it('setProp / assignTags accept a warnings label', () => {
    expect(setProp(ref('t'), 'repetitionRule', json(1), 'direct', true, 'repetitionRule').label).toBe('repetitionRule');
    expect(assignTags(ref('t'), json(['a']), 'applied_0', true, 'tags').label).toBe('tags');
  });

  it('batchItem wraps statements with tempId, taskVar, index, stopOnError', () => {
    const node = batchItem('tmp1', 0, '_t0', [constructTask('_t0', json('X'), { kind: 'inbox' })], true);
    expect(node.type).toBe('batchItem');
    expect(node.tempId).toBe('tmp1');
    expect(node.index).toBe(0);
    expect(node.taskVar).toBe('_t0');
    expect(node.stopOnError).toBe(true);
    expect(node.statements).toHaveLength(1);
  });
});

// tests/unit/contracts/ast/mutation/types.test.ts
import { describe, it, expect } from 'vitest';
import { json, ref, member, setProp, return_, resolveFolder } from '../../../../../src/contracts/ast/mutation/types.js';

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

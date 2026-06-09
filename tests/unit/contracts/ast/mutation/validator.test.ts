import { describe, it, expect } from 'vitest';
import { validateMutationProgram } from '../../../../../src/contracts/ast/mutation/validator.js';
import {
  constructProject,
  setProp,
  readModifyReassign,
  return_,
  ref,
  json,
} from '../../../../../src/contracts/ast/mutation/types.js';

const ok = {
  context: 'create_project',
  snippetDeps: [],
  statements: [constructProject('proj', json('P'), { kind: 'none' as const }), return_({ created: json(true) })],
};

describe('validateMutationProgram', () => {
  it('accepts a well-formed program', () => expect(() => validateMutationProgram(ok)).not.toThrow());

  it('rejects a program that does not end in return', () => {
    const bad = { ...ok, statements: [constructProject('proj', json('P'), { kind: 'none' as const })] };
    expect(() => validateMutationProgram(bad)).toThrow(/must end in a return/i);
  });

  it('rejects a constructProject whose folder is a raw string', () => {
    const bad = {
      ...ok,
      statements: [
        { ...constructProject('proj', json('P'), { kind: 'none' as const }), folder: 'Work' as any },
        return_({ created: json(true) }),
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/folder.*resolution/i);
  });

  it('rejects a constructProject whose folder is missing kind', () => {
    const bad = {
      ...ok,
      statements: [
        { ...constructProject('proj', json('P'), { kind: 'none' as const }), folder: { var: 'x' } as any },
        return_({ created: json(true) }),
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/folder.*resolution/i);
  });

  // Rule 3: notFound is illegal in a constructProject — must be Guarded earlier.
  it('rejects a constructProject whose folder kind is notFound', () => {
    const bad = {
      ...ok,
      statements: [
        constructProject('proj', json('P'), { kind: 'notFound' as const }),
        return_({ created: json(true) }),
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/notFound|not.found/i);
  });

  // Rule 4: setProp value/mutations invariants.
  it('rejects a non-readModifyReassign setProp with no value', () => {
    const broken = { ...setProp(ref('proj'), 'flagged', json(true)), value: undefined };
    const bad = { ...ok, statements: [broken as any, return_({ created: json(true) })] };
    expect(() => validateMutationProgram(bad)).toThrow(/value/i);
  });

  it('rejects a readModifyReassign setProp with no mutations', () => {
    const broken = { ...readModifyReassign(ref('proj'), 'reviewInterval', []), mutations: undefined };
    const bad = { ...ok, statements: [broken as any, return_({ created: json(true) })] };
    expect(() => validateMutationProgram(bad)).toThrow(/mutations/i);
  });

  it('accepts a valid readModifyReassign setProp (has mutations, no value)', () => {
    const good = {
      ...ok,
      statements: [
        readModifyReassign(ref('proj'), 'reviewInterval', [{ prop: 'steps', value: json(1) }]),
        return_({ created: json(true) }),
      ],
    };
    expect(() => validateMutationProgram(good)).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import {
  validateMutationProgram,
  RESERVED_EMITTER_IDENTIFIERS,
} from '../../../../../src/contracts/ast/mutation/validator.js';
import {
  constructProject,
  constructTask,
  batchItem,
  guard,
  resolveProject,
  resolveParentTask,
  resolveTask,
  bind,
  assignTags,
  setProp,
  readModifyReassign,
  return_,
  ref,
  raw,
  json,
  deleteObject,
  bulkDeleteItem,
  resolveTag,
  constructTag,
  constructTagPath,
  moveTag,
  mergeRetag,
  type Program,
  type TagResolution,
  type TagMovePosition,
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

// --- Slice 2 (OMN-128): task-node rules ---

const done = return_({ created: json(true) });

describe('constructTask container typing', () => {
  it('accepts an inbox container', () => {
    const good = { ...ok, statements: [constructTask('t', json('X'), { kind: 'inbox' as const }), done] };
    expect(() => validateMutationProgram(good)).not.toThrow();
  });

  it('accepts a project container with a var', () => {
    const good = {
      ...ok,
      statements: [
        resolveProject('p', 'Work'),
        guard('p === null', { error: json(true), message: json('nf') }),
        constructTask('t', json('X'), { kind: 'project' as const, var: 'p' }),
        done,
      ],
    };
    expect(() => validateMutationProgram(good)).not.toThrow();
  });

  it('rejects a constructTask whose container is a raw string', () => {
    const bad = {
      ...ok,
      statements: [{ ...constructTask('t', json('X'), { kind: 'inbox' as const }), container: 'Work' as any }, done],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/container.*resolution/i);
  });

  it('rejects a constructTask whose container is missing kind', () => {
    const bad = {
      ...ok,
      statements: [
        { ...constructTask('t', json('X'), { kind: 'inbox' as const }), container: { var: 'p' } as any },
        done,
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/container.*resolution/i);
  });

  it('rejects a non-inbox container with an empty var', () => {
    const bad = {
      ...ok,
      statements: [constructTask('t', json('X'), { kind: 'project' as const, var: '' }), done],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/non-empty string "var"/i);
  });

  it('rejects a non-inbox container with a missing var', () => {
    const bad = {
      ...ok,
      statements: [
        { ...constructTask('t', json('X'), { kind: 'inbox' as const }), container: { kind: 'parentTask' } as any },
        done,
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/non-empty string "var"/i);
  });
});

describe('throw-mode guard requires message', () => {
  it('rejects a throw-mode guard without envelope.message', () => {
    const bad = { ...ok, statements: [guard('x === null', { error: json(true) }, 'throw'), done] };
    expect(() => validateMutationProgram(bad)).toThrow(/throw.*message/i);
  });

  it('accepts a throw-mode guard with envelope.message', () => {
    const good = { ...ok, statements: [guard('x === null', { message: json('not found') }, 'throw'), done] };
    expect(() => validateMutationProgram(good)).not.toThrow();
  });

  it('accepts a return-mode guard without message (top level)', () => {
    const good = { ...ok, statements: [guard('x === null', { error: json(true) }), done] };
    expect(() => validateMutationProgram(good)).not.toThrow();
  });
});

describe('resolution-guard discipline', () => {
  it('accepts resolve → guard(cond mentions bind) → constructTask', () => {
    const good = {
      ...ok,
      statements: [
        resolveProject('p', 'Work'),
        guard('p === null', { error: json(true), message: json('nf') }),
        constructTask('t', json('X'), { kind: 'project' as const, var: 'p' }),
        done,
      ],
    };
    expect(() => validateMutationProgram(good)).not.toThrow();
  });

  it('rejects resolve → constructTask with NO guard between', () => {
    const bad = {
      ...ok,
      statements: [
        resolveProject('p', 'Work'),
        constructTask('t', json('X'), { kind: 'project' as const, var: 'p' }),
        done,
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/guard/i);
  });

  it('rejects a guard placed AFTER the constructTask (ordering matters)', () => {
    const bad = {
      ...ok,
      statements: [
        resolveProject('p', 'Work'),
        constructTask('t', json('X'), { kind: 'project' as const, var: 'p' }),
        guard('p === null', { error: json(true), message: json('nf') }),
        done,
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/guard/i);
  });

  it('rejects a between-guard that mentions only a DIFFERENT longer-named var (word boundary, not substring)', () => {
    // `proj === null` must NOT satisfy bind `p` — substring matching would.
    const bad = {
      ...ok,
      statements: [
        resolveProject('p', 'Work'),
        guard('proj === null', { error: json(true), message: json('nf') }),
        constructTask('t', json('X'), { kind: 'project' as const, var: 'p' }),
        done,
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/guard/i);
  });

  it('rejects a between-guard whose cond does NOT mention the bind', () => {
    const bad = {
      ...ok,
      statements: [
        resolveProject('p', 'Work'),
        guard('somethingElse === null', { error: json(true), message: json('nf') }),
        constructTask('t', json('X'), { kind: 'project' as const, var: 'p' }),
        done,
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/guard/i);
  });

  it('accepts an unguarded resolveParentTask whose bind is never consumed by a constructTask', () => {
    const good = { ...ok, statements: [resolveParentTask('pt', 'abc'), done] };
    expect(() => validateMutationProgram(good)).not.toThrow();
  });

  it('rule 7: deleteObject consuming an unguarded resolve bind is rejected', () => {
    const program = {
      statements: [resolveTask('task', 't1'), deleteObject(ref('task')), return_({ ok: json(true) })],
      context: 'delete_task',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/guard/i);
  });

  it('rule 7: deleteObject after an intervening guard passes', () => {
    const program = {
      statements: [
        resolveTask('task', 't1'),
        guard('task === null', {
          error: json(true),
          message: json('Task not found: t1'),
          context: json('delete_task'),
        }),
        deleteObject(ref('task')),
        return_({ deleted: json(true) }),
      ],
      context: 'delete_task',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).not.toThrow();
  });

  it('applies the same discipline to resolveParentTask consumed as a parentTask container', () => {
    const bad = {
      ...ok,
      statements: [
        resolveParentTask('pt', 'abc'),
        constructTask('t', json('X'), { kind: 'parentTask' as const, var: 'pt' }),
        done,
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/guard/i);
  });
});

describe('batchItem recursion + exemptions', () => {
  const batchProgram = (items: ReturnType<typeof batchItem>[]) => ({
    context: 'batch_create',
    snippetDeps: [],
    statements: [bind('results', raw('[]')), ...items, return_({ results: ref('results') })],
  });

  it('accepts a well-formed batch program (inner lists NOT return-terminated)', () => {
    const good = batchProgram([
      batchItem('a', 0, '_t0', [constructTask('_t0', json('A'), { kind: 'inbox' as const })], false),
    ]);
    expect(() => validateMutationProgram(good)).not.toThrow();
  });

  it('recurses per-statement rules into batchItem.statements (inner setProp violation detected)', () => {
    const broken = { ...setProp(ref('_t0'), 'flagged', json(true)), value: undefined };
    const bad = batchProgram([
      batchItem('a', 0, '_t0', [constructTask('_t0', json('A'), { kind: 'inbox' as const }), broken as any], false),
    ]);
    expect(() => validateMutationProgram(bad)).toThrow(/value/i);
  });

  it('rejects a return statement inside batchItem.statements', () => {
    const bad = batchProgram([
      batchItem(
        'a',
        0,
        '_t0',
        [constructTask('_t0', json('A'), { kind: 'inbox' as const }), return_({ created: json(true) })],
        false,
      ),
    ]);
    expect(() => validateMutationProgram(bad)).toThrow(/return.*batchItem|batchItem.*return/i);
  });

  it('rejects a return-mode guard inside batchItem.statements', () => {
    const bad = batchProgram([
      batchItem(
        'a',
        0,
        '_t0',
        [
          guard('p === null', { error: json(true), message: json('nf') }),
          constructTask('_t0', json('A'), { kind: 'inbox' as const }),
        ],
        false,
      ),
    ]);
    expect(() => validateMutationProgram(bad)).toThrow(/mode.*throw|throw.*mode/i);
  });

  it('accepts a throw-mode guard inside batchItem.statements', () => {
    const good = batchProgram([
      batchItem(
        'a',
        0,
        '_t0',
        [
          resolveProject('p0', 'Work'),
          guard('p0 === null', { message: json('Project not found: Work') }, 'throw'),
          constructTask('_t0', json('A'), { kind: 'project' as const, var: 'p0' }),
        ],
        false,
      ),
    ]);
    expect(() => validateMutationProgram(good)).not.toThrow();
  });

  it('enforces resolution-guard discipline INSIDE an item list', () => {
    const bad = batchProgram([
      batchItem(
        'a',
        0,
        '_t0',
        [resolveProject('p0', 'Work'), constructTask('_t0', json('A'), { kind: 'project' as const, var: 'p0' })],
        false,
      ),
    ]);
    expect(() => validateMutationProgram(bad)).toThrow(/guard/i);
  });

  // taskVar↔constructTask coupling: the emitted results push reads
  // `<taskVar>.id.primaryKey` — without a matching constructTask the item
  // throws ReferenceError, swallowed by the catch as a FALSE per-item failure.
  it('rejects a batchItem whose taskVar matches NO inner constructTask bind (mismatch)', () => {
    const bad = batchProgram([
      batchItem('a', 0, '_t9', [constructTask('_t0', json('A'), { kind: 'inbox' as const })], false),
    ]);
    expect(() => validateMutationProgram(bad)).toThrow(/taskVar/);
  });

  it('rejects a batchItem with EMPTY statements (no constructTask at all)', () => {
    const bad = batchProgram([batchItem('a', 0, '_t0', [], false)]);
    expect(() => validateMutationProgram(bad)).toThrow(/taskVar/);
  });

  it('accepts a batchItem whose taskVar matches an inner constructTask bind among other statements', () => {
    const good = batchProgram([
      batchItem(
        'a',
        0,
        '_t0',
        [constructTask('_t0', json('A'), { kind: 'inbox' as const }), setProp(ref('_t0'), 'flagged', json(true))],
        false,
      ),
    ]);
    expect(() => validateMutationProgram(good)).not.toThrow();
  });

  it('rejects a batchItem whose taskVar is itself a reserved emitter identifier', () => {
    const bad = batchProgram([
      batchItem('a', 0, '_aborted', [constructTask('_aborted', json('A'), { kind: 'inbox' as const })], false),
    ]);
    expect(() => validateMutationProgram(bad)).toThrow(/taskVar.*reserved|reserved.*taskVar/i);
  });
});

describe('batchItem uniqueness', () => {
  const item = (tempId: string, index: number, taskVar: string) =>
    batchItem(tempId, index, taskVar, [constructTask(taskVar, json(tempId), { kind: 'inbox' as const })], false);
  const batchProgram = (items: ReturnType<typeof batchItem>[]) => ({
    context: 'batch_create',
    snippetDeps: [],
    statements: [bind('results', raw('[]')), ...items, return_({ results: ref('results') })],
  });

  it('accepts distinct indexes and taskVars', () => {
    expect(() => validateMutationProgram(batchProgram([item('a', 0, '_t0'), item('b', 1, '_t1')]))).not.toThrow();
  });

  it('rejects duplicate batchItem index values', () => {
    expect(() => validateMutationProgram(batchProgram([item('a', 0, '_t0'), item('b', 0, '_t1')]))).toThrow(
      /duplicate.*index/i,
    );
  });

  it('rejects duplicate batchItem taskVar values', () => {
    expect(() => validateMutationProgram(batchProgram([item('a', 0, '_t0'), item('b', 1, '_t0')]))).toThrow(
      /duplicate.*taskVar/i,
    );
  });
});

describe('constructTag (rules 2/3/10 at the tag altitude)', () => {
  it('rejects an untyped parent value', () => {
    const program: Program = {
      statements: [
        { type: 'constructTag', bind: '_t', name: json('X'), parent: 'Work' as unknown as TagResolution },
        return_({ ok: json(true) }),
      ],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/typed TagResolution/);
  });

  it('rejects parent.kind notFound', () => {
    const program: Program = {
      statements: [constructTag('_t', json('X'), { kind: 'notFound' }), return_({ ok: json(true) })],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/notFound.*illegal/);
  });

  it('rejects a reserved bind', () => {
    const program: Program = {
      statements: [constructTag('_warnings', json('X'), { kind: 'none' }), return_({ ok: json(true) })],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/reserved emitter identifier/);
  });

  it('accepts a well-formed constructTag with parent kind none', () => {
    const program: Program = {
      statements: [constructTag('_t', json('Home'), { kind: 'none' }), return_({ ok: json(true) })],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).not.toThrow();
  });

  it('accepts a well-formed constructTag with parent kind resolved (preceded by a guard)', () => {
    const program: Program = {
      statements: [
        resolveTag('_p', 'Parent'),
        guard('_p === null', { error: json(true) }),
        constructTag('_t', json('Home'), { kind: 'resolved', var: '_p' }),
        return_({ ok: json(true) }),
      ],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).not.toThrow();
  });
});

describe('rule 7 covers resolveTag binds', () => {
  it('rejects a constructTag consuming an unguarded resolveTag bind', () => {
    const program: Program = {
      statements: [
        resolveTag('_p', 'Parent'),
        constructTag('_t', json('X'), { kind: 'resolved', var: '_p' }),
        return_({ ok: json(true) }),
      ],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/without a guard/);
  });

  it('accepts the same program with a guard between', () => {
    const program: Program = {
      statements: [
        resolveTag('_p', 'Parent'),
        guard('_p === null', { error: json(true) }),
        constructTag('_t', json('X'), { kind: 'resolved', var: '_p' }),
        return_({ ok: json(true) }),
      ],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).not.toThrow();
  });

  it('rejects a reserved resolveTag bind', () => {
    const program: Program = {
      statements: [resolveTag('_warnings', 'Home'), return_({ ok: json(true) })],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/reserved emitter identifier/);
  });
});

describe('bulkDeleteItem uniqueness (rule 9)', () => {
  const bulkProgram = (items: ReturnType<typeof bulkDeleteItem>[]): Program => ({
    context: 'bulk_delete_tasks',
    snippetDeps: [],
    statements: [...items, return_({ deleted: ref('_deleted'), errors: ref('_errors') })],
  });

  it('accepts distinct bulkDeleteItem indexes', () => {
    expect(() => validateMutationProgram(bulkProgram([bulkDeleteItem('a', 0), bulkDeleteItem('b', 1)]))).not.toThrow();
  });

  it('rejects duplicate bulkDeleteItem index values', () => {
    expect(() => validateMutationProgram(bulkProgram([bulkDeleteItem('a', 0), bulkDeleteItem('b', 0)]))).toThrow(
      /duplicate.*index/i,
    );
  });
});

describe('constructTagPath reserved-identifier enforcement (rule 10)', () => {
  it('_tagPath is reserved: a bind(_tagPath, ...) statement in a program throws /reserved emitter identifier/', () => {
    const program: Program = {
      statements: [bind('_tagPath', json(1)), return_({ ok: json(true) })],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/reserved emitter identifier/i);
  });

  it('constructTagPath bind must not be a reserved identifier (_warnings throws)', () => {
    const program: Program = {
      statements: [constructTagPath('_warnings', '_created', json(['Work'])), return_({ ok: json(true) })],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/reserved emitter identifier/i);
  });

  it('constructTagPath createdBind must not be a reserved identifier (_aborted throws)', () => {
    const program: Program = {
      statements: [constructTagPath('_tag', '_aborted', json(['Work'])), return_({ ok: json(true) })],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/reserved emitter identifier/i);
  });

  it('accepts a well-formed constructTagPath with non-reserved binds', () => {
    const program: Program = {
      statements: [constructTagPath('_tag', '_created', json(['Work', 'Active'])), return_({ ok: json(true) })],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).not.toThrow();
  });

  it('rejects two constructTagPath statements at the same level (duplicate const _tagPath = SyntaxError)', () => {
    const program: Program = {
      statements: [
        constructTagPath('_tag', '_created', json(['Work'])),
        constructTagPath('_tag2', '_created2', json(['Home'])),
        return_({ ok: json(true) }),
      ],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/at most one constructTagPath/i);
  });
});

describe('moveTag position (rule 11 at the tag altitude)', () => {
  it('rejects an untyped position', () => {
    const program: Program = {
      statements: [
        resolveTag('_t', 'X'),
        guard('_t === null', { error: json(true) }),
        { type: 'moveTag', tag: ref('_t'), position: '_p' as unknown as TagMovePosition, errorPrefix: 'p: ' },
        return_({ ok: json(true) }),
      ],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/typed TagMovePosition/);
  });

  it('rejects underTag without a var', () => {
    const program: Program = {
      statements: [
        resolveTag('_t', 'X'),
        guard('_t === null', { error: json(true) }),
        moveTag(ref('_t'), { kind: 'underTag', var: '' }, 'p: '),
        return_({ ok: json(true) }),
      ],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/requires a non-empty string "var"/);
  });

  it('counts moveTag as a rule-7 consumer of its tag ref and underTag var', () => {
    // resolveTag('_t', 'X') then moveTag(ref('_t'), {kind:'root'}, 'p: ') with no guard → /without a guard/
    const program: Program = {
      statements: [resolveTag('_t', 'X'), moveTag(ref('_t'), { kind: 'root' }, 'p: '), return_({ ok: json(true) })],
      context: 't',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/without a guard/);
  });
});

describe('reserved emitter identifiers', () => {
  it('exports the reserved list for the batch program builder', () => {
    expect(RESERVED_EMITTER_IDENTIFIERS).toEqual(['_warnings', '_aborted', '_deleted', '_errors', '_tagPath']);
  });

  it('rejects a bind statement named _warnings', () => {
    const bad = { ...ok, statements: [bind('_warnings', raw('[]')), done] };
    expect(() => validateMutationProgram(bad)).toThrow(/_warnings.*reserved|reserved.*_warnings/i);
  });

  it('rejects a bind statement named _aborted', () => {
    const bad = { ...ok, statements: [bind('_aborted', raw('false')), done] };
    expect(() => validateMutationProgram(bad)).toThrow(/_aborted.*reserved|reserved.*_aborted/i);
  });

  it('rejects a bind matching the per-item watermark pattern _w<digits>', () => {
    const bad = { ...ok, statements: [bind('_w3', raw('0')), done] };
    expect(() => validateMutationProgram(bad)).toThrow(/_w3.*reserved|reserved.*_w3/i);
  });

  it('rejects a resolveProject bind using a reserved name', () => {
    const bad = {
      ...ok,
      statements: [
        resolveProject('_warnings', 'Work'),
        guard('_warnings === null', { error: json(true) }),
        constructTask('t', json('X'), { kind: 'project' as const, var: '_warnings' }),
        done,
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/reserved/i);
  });

  it('rejects a resolveParentTask bind using a reserved name', () => {
    const bad = { ...ok, statements: [resolveParentTask('_aborted', 'abc'), done] };
    expect(() => validateMutationProgram(bad)).toThrow(/reserved/i);
  });

  it('rejects a constructTask bind using a reserved name', () => {
    const bad = { ...ok, statements: [constructTask('_w0', json('X'), { kind: 'inbox' as const }), done] };
    expect(() => validateMutationProgram(bad)).toThrow(/reserved/i);
  });

  it('rejects an assignTags bind using a reserved name', () => {
    const bad = { ...ok, statements: [assignTags(ref('t'), json(['x']), '_warnings'), done] };
    expect(() => validateMutationProgram(bad)).toThrow(/reserved/i);
  });

  it('accepts "results" as a bind name (legitimately bound by the batch program builder)', () => {
    const good = { ...ok, statements: [bind('results', raw('[]')), done] };
    expect(() => validateMutationProgram(good)).not.toThrow();
  });

  it('accepts ordinary bind names that merely RESEMBLE reserved ones (_warning, _w, _wx1)', () => {
    const good = {
      ...ok,
      statements: [bind('_warning', raw('1')), bind('_w', raw('1')), bind('_wx1', raw('1')), done],
    };
    expect(() => validateMutationProgram(good)).not.toThrow();
  });

  it('rule 10: _deleted/_errors and _d<i>/_n<i> are reserved emitter identifiers', () => {
    for (const name of ['_deleted', '_errors', '_d0', '_n12']) {
      const program: Program = {
        statements: [bind(name, raw('[]')), return_({ ok: json(true) })],
        context: 'x',
        snippetDeps: [],
      };
      expect(() => validateMutationProgram(program)).toThrow(/reserved/i);
    }
  });
});

describe('mergeRetag — rule-7 resolution-guard discipline (slice 6 §4.1)', () => {
  // mergeRetag is a CONSUMER of both sourceVar and targetVar (rule 7).
  // An unguarded resolveTag → mergeRetag must throw /without a guard/.

  it('rejects an unguarded resolveTag(_src) consumed by mergeRetag as sourceVar', () => {
    const program: Program = {
      statements: [
        resolveTag('_src', 'OldTag'),
        resolveTag('_tgt', 'NewTag'),
        guard('_tgt === null', { error: json(true) }),
        mergeRetag('_src', '_tgt', '_count'),
        return_({ count: ref('_count') }),
      ],
      context: 'merge_tag',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/without a guard/);
  });

  it('rejects an unguarded resolveTag(_tgt) consumed by mergeRetag as targetVar', () => {
    const program: Program = {
      statements: [
        resolveTag('_src', 'OldTag'),
        guard('_src === null', { error: json(true) }),
        resolveTag('_tgt', 'NewTag'),
        mergeRetag('_src', '_tgt', '_count'),
        return_({ count: ref('_count') }),
      ],
      context: 'merge_tag',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/without a guard/);
  });

  it('accepts resolveTag → guard → resolveTag → guard → mergeRetag', () => {
    const program: Program = {
      statements: [
        resolveTag('_src', 'OldTag'),
        guard('_src === null', { error: json(true) }),
        resolveTag('_tgt', 'NewTag'),
        guard('_tgt === null', { error: json(true) }),
        mergeRetag('_src', '_tgt', '_count'),
        return_({ count: ref('_count') }),
      ],
      context: 'merge_tag',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).not.toThrow();
  });
});

describe('mergeRetag — rule-10 reserved bind enforcement (slice 6 §4.1)', () => {
  it('rejects a mergeRetag whose bind is _warnings (reserved)', () => {
    const program: Program = {
      statements: [
        resolveTag('_src', 'OldTag'),
        guard('_src === null', { error: json(true) }),
        resolveTag('_tgt', 'NewTag'),
        guard('_tgt === null', { error: json(true) }),
        mergeRetag('_src', '_tgt', '_warnings'),
        return_({ count: ref('_warnings') }),
      ],
      context: 'merge_tag',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/reserved emitter identifier/);
  });

  it('accepts a mergeRetag with a non-reserved bind name', () => {
    const program: Program = {
      statements: [
        resolveTag('_src', 'OldTag'),
        guard('_src === null', { error: json(true) }),
        resolveTag('_tgt', 'NewTag'),
        guard('_tgt === null', { error: json(true) }),
        mergeRetag('_src', '_tgt', '_movedCount'),
        return_({ count: ref('_movedCount') }),
      ],
      context: 'merge_tag',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).not.toThrow();
  });
});

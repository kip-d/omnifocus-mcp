# OMN-128 Slice 6 — tag builders on the Mutation AST: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all seven tag mutation builders (create/rename/delete/merge/nest/unparent/reparent) onto the
OmniJS-native mutation AST, delete every template-string body and nested-backtick island in
`tag-mutation-script-builder.ts`, and register the seven ops in `MUTATION_DEFS` — closing the last guard-bypass entry
and eliminating the last write-side template codegen.

**Architecture:** Five new statement nodes (`resolveTag`, `constructTag`, `constructTagPath`, `moveTag`, `mergeRetag`)
plus the typed `TagResolution` union extend the mutation AST; `deleteObject` gains opt-in `bestEffort`; seven new
`MUTATION_DEFS` entries run the relocated name-prefix sandbox guard at dispatch; the seven `build*TagScript` exports
become thin dispatch wrappers so `handleTagManage` and its imports are untouched.

**Tech Stack:** TypeScript, vitest (golden + `node:vm` execution tests), the mutation AST substrate in
`src/contracts/ast/mutation/` (types → snippets → validator → emitter → defs).

**Spec:** `docs/superpowers/specs/2026-06-10-tag-mutation-ast-design.md` — section references (§) below point there.
Read it first. Reference lowerings for every pattern used here: `lowerComplete`/`lowerDelete` in
`src/contracts/ast/mutation/defs.ts` (slice 5).

**Conventions for every task:**

- TDD: write the failing test, see it fail, implement, see it pass, commit.
- Run unit tests with `npm run test:unit -- <file>` (vitest; from the worktree root).
- `npm run build` must stay clean.
- Commit messages: `feat(OMN-128): slice 6 — <what>` (or `test:`/`refactor:`/`docs:` as fits).
- All paths relative to the worktree root (`/Users/kip/src/omnifocus-mcp/.claude/worktrees/omn-128-slice-6`).
- **User data NEVER rides in `raw()`** — user-supplied strings enter programs only via `json()` (or `bind` + `raw`
  referencing the bind). The validator/emitter cannot catch a violation; reviewers must.

---

## File Structure

| File                                                      | Change | Responsibility                                                                                                                                                                                      |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/contracts/ast/mutation/types.ts`                     | modify | `TagResolution`, `TagMovePosition`; `ResolveTagNode`/`ConstructTagNode`/`ConstructTagPathNode`/`MoveTagNode`/`MergeRetagNode` + factories; `DeleteObjectNode.bestEffort`/`label`; `Stmt` union arms |
| `src/contracts/ast/mutation/snippets.ts`                  | modify | `createTagPath` snippet (find-or-create walk returning `{tag, created}`)                                                                                                                            |
| `src/contracts/ast/mutation/emitter.ts`                   | modify | emission cases for the five nodes; `deleteObject` bestEffort wrap                                                                                                                                   |
| `src/contracts/ast/mutation/validator.ts`                 | modify | rule 2/3 analog for `constructTag`; rule 11 analog for `moveTag`; rule 7 (`isResolveStmt` + `stmtConsumedRefs`) coverage; reserved `_tagPath`; reserved-bind checks                                 |
| `src/contracts/ast/mutation/defs.ts`                      | modify | seven input interfaces, `validateTagMutation` (relocated), seven `build*TagProgram` lowerings, seven `MUTATION_DEFS` entries                                                                        |
| `src/contracts/ast/tag-mutation-script-builder.ts`        | modify | REWRITE: seven thin dispatch wrappers; DELETE preamble/epilogue/islands/`validateTagMutation`/the `getUnifiedHelpers` import                                                                        |
| `tests/unit/contracts/ast/mutation/types.test.ts`         | modify | factory + union coverage for new nodes                                                                                                                                                              |
| `tests/unit/contracts/ast/mutation/emitter.test.ts`       | modify | emission coverage for new nodes + bestEffort deleteObject                                                                                                                                           |
| `tests/unit/contracts/ast/mutation/validator.test.ts`     | modify | new-rule coverage                                                                                                                                                                                   |
| `tests/unit/contracts/ast/mutation/snippets.test.ts`      | modify | `createTagPath` registration + shape                                                                                                                                                                |
| `tests/unit/contracts/ast/mutation/tag-create.test.ts`    | create | golden + vm + dispatch-guard tests for `create/tag` (flat, parent, path, conflict/error programs)                                                                                                   |
| `tests/unit/contracts/ast/mutation/tag-lifecycle.test.ts` | create | golden + vm + dispatch-guard tests for `rename/tag`, `delete/tag`, `merge/tag`                                                                                                                      |
| `tests/unit/contracts/ast/mutation/tag-move.test.ts`      | create | golden + vm + dispatch-guard tests for `nest/tag`, `unparent/tag`, `reparent/tag`                                                                                                                   |
| `tests/unit/tag-operations.test.ts`                       | modify | tag-MUTATION assertions rewritten to new emitted shape (read-side `buildTagsScript` tests untouched)                                                                                                |
| `tests/unit/tag-conversion.test.ts`                       | modify | same treatment                                                                                                                                                                                      |
| `tests/integration/tools/unified/tag-paths.test.ts`       | create | OMN-138 live coverage (sandbox-scoped `__test-` round-trip)                                                                                                                                         |
| `tests/integration/test-tag-hierarchy.ts`                 | check  | standalone script — update only if it asserts on a changed envelope key (Task 9)                                                                                                                    |

**Task order:** 1–4 substrate (nodes), 5–7 lowerings + registry, 8 wrappers + legacy deletion + existing-test rewrite, 9
live integration, 10 verification sweep. Each task is committable on its own.

---

### Task 1: `TagResolution` + `resolveTag` + `constructTag` (types + emitter + validator)

**Files:**

- Modify: `src/contracts/ast/mutation/types.ts`
- Modify: `src/contracts/ast/mutation/emitter.ts`
- Modify: `src/contracts/ast/mutation/validator.ts`
- Test: `tests/unit/contracts/ast/mutation/types.test.ts`, `emitter.test.ts`, `validator.test.ts`

- [ ] **Step 1: Write the failing tests**

In `emitter.test.ts` (follow the existing per-node `describe` style):

```typescript
describe('resolveTag', () => {
  it('emits a first-match flattenedTags scan with JSON-escaped name', () => {
    expect(emitStmt(resolveTag('_tag', 'Err"or'))).toBe(
      'const _tag = flattenedTags.find(t => t.name === "Err\\"or") || null;',
    );
  });
});

describe('constructTag', () => {
  it('emits new Tag(name) for parent kind none', () => {
    expect(emitStmt(constructTag('_t', json('Home'), { kind: 'none' }))).toBe('const _t = new Tag("Home");');
  });
  it('emits new Tag(name, parentVar) for parent kind resolved', () => {
    expect(emitStmt(constructTag('_t', json('Home'), { kind: 'resolved', var: '_parent' }))).toBe(
      'const _t = new Tag("Home", _parent);',
    );
  });
  it('throws on parent kind notFound (must be guarded earlier)', () => {
    expect(() => emitStmt(constructTag('_t', json('Home'), { kind: 'notFound' }))).toThrow(/notFound.*illegal/);
  });
});
```

In `validator.test.ts`:

```typescript
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
    /* same shape, parent: { kind: 'notFound' } → /notFound.*illegal/ */
  });
  it('rejects a reserved bind', () => {
    /* bind: '_warnings' → /reserved emitter identifier/ */
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
    /* insert guard('_p === null', {...}) → no throw */
  });
});
```

In `types.test.ts`: factory-shape tests for `resolveTag` and `constructTag` (mirror the `resolveFolder`/
`constructFolder` factory tests).

- [ ] **Step 2: Run them to verify failure**

Run:
`npm run test:unit -- tests/unit/contracts/ast/mutation/emitter.test.ts tests/unit/contracts/ast/mutation/validator.test.ts tests/unit/contracts/ast/mutation/types.test.ts`
Expected: FAIL — `resolveTag`/`constructTag` are not exported.

- [ ] **Step 3: Implement**

`types.ts` — after `FolderResolution`:

```typescript
// --- Typed fail-able tag resolution (slice 6) ---
// The TagResolution union deferred since slice 1 (see AssignTagsNode comment):
// where a constructed tag's parent comes from is a closed set of typed states.
export type TagResolution = { kind: 'resolved'; var: string } | { kind: 'none' } | { kind: 'notFound' };
```

Statement nodes (near `ResolveTaskNode` / `ConstructFolderNode`):

```typescript
/** Resolves a tag by exact name — FIRST match in flattenedTags order (spec §3:
 *  legacy ops diverged first-vs-last; slice 6 unifies on first). Name-only:
 *  the production seam passes names exclusively (spec §2.4). */
export interface ResolveTagNode {
  type: 'resolveTag';
  bind: string;
  ref: string;
}
export interface ConstructTagNode {
  type: 'constructTag';
  bind: string;
  name: Expr;
  parent: TagResolution;
}
```

Add both to the `Stmt` union; add factories:

```typescript
export const resolveTag = (bindVar: string, refStr: string): ResolveTagNode => ({
  type: 'resolveTag',
  bind: bindVar,
  ref: refStr,
});
export const constructTag = (bindVar: string, name: Expr, parent: TagResolution): ConstructTagNode => ({
  type: 'constructTag',
  bind: bindVar,
  name,
  parent,
});
```

`emitter.ts` — two `emitStmt` cases (place beside `resolveTask` / `constructFolder`):

```typescript
    case 'resolveTag':
      return `const ${node.bind} = flattenedTags.find(t => t.name === ${JSON.stringify(node.ref)}) || null;`;
    case 'constructTag': {
      // Near-clone of constructFolder at the tag altitude. `new Tag(name, parent)`
      // nests under the parent; omitted parent = top level (matches legacy
      // app.make at doc.tags / new Tag(name, null) in the path island).
      const name = emitExpr(node.name);
      switch (node.parent.kind) {
        case 'resolved':
          return `const ${node.bind} = new Tag(${name}, ${node.parent.var});`;
        case 'none':
          return `const ${node.bind} = new Tag(${name});`;
        case 'notFound':
          throw new Error(
            'constructTag with parent.kind="notFound" is illegal — it must be Guarded earlier (validator enforces this).',
          );
        default: {
          const _x: never = node.parent;
          throw new Error(`Unknown tag resolution: ${JSON.stringify(_x)}`);
        }
      }
    }
```

`validator.ts`:

1. `const TAG_KINDS = new Set(['resolved', 'none', 'notFound']);` beside `FOLDER_KINDS`.
2. `validateConstructTagStmt` — clone of `validateConstructFolderStmt` with `TAG_KINDS`, message text
   `'Invalid constructTag: parent must be a typed TagResolution object …'` / notFound-illegal /
   `assertNotReserved(stmt.bind, 'constructTag bind')`. Wire into `validateStatementList`.
3. `isResolveStmt`: add `'resolveTag'` to the type guard and the `Extract` union.
4. `stmtConsumedRefs`: add `case 'constructTag': return stmt.parent.kind === 'resolved' ? [stmt.parent.var] : [];`
5. `validateReservedBinds`: add `if (stmt.type === 'resolveTag') assertNotReserved(stmt.bind, 'resolveTag bind');`
6. Update the rule-7 doc comment to mention `resolveTag`.

- [ ] **Step 4: Run the tests, verify pass**

Same command as Step 2. Expected: PASS. Also run the full mutation suite:
`npm run test:unit -- tests/unit/contracts/ast/mutation/` — no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/types.ts src/contracts/ast/mutation/emitter.ts src/contracts/ast/mutation/validator.ts tests/unit/contracts/ast/mutation/
git commit -m "feat(OMN-128): slice 6 — TagResolution + resolveTag/constructTag nodes"
```

---

### Task 2: `moveTag` node + `deleteObject` bestEffort

**Files:** same four as Task 1.

- [ ] **Step 1: Write the failing tests**

`emitter.test.ts`:

```typescript
describe('moveTag', () => {
  it('emits moveTags to null for root, wrapped in an error-envelope catch', () => {
    expect(emitStmt(moveTag(ref('_t'), { kind: 'root' }, 'Failed to unparent tag: '))).toBe(
      'try { moveTags([_t], null); } catch (e) { return JSON.stringify({ error: true, message: "Failed to unparent tag: " + String(e) }); }',
    );
  });
  it('emits moveTags to the parent var for underTag', () => {
    expect(emitStmt(moveTag(ref('_t'), { kind: 'underTag', var: '_p' }, 'Failed to nest tag: '))).toContain(
      'moveTags([_t], _p);',
    );
  });
});

describe('deleteObject bestEffort', () => {
  it('stays a bare hard-error call without bestEffort (slice-5 posture untouched)', () => {
    expect(emitStmt(deleteObject(ref('_t')))).toBe('deleteObject(_t);');
  });
  it('wraps in a labeled warnings catch with bestEffort', () => {
    expect(emitStmt(deleteObject(ref('_t'), true, 'source delete'))).toBe(
      'try { deleteObject(_t); } catch (e) { _warnings.push("source delete" + \': \' + (e && e.message ? e.message : String(e))); }',
    );
  });
});
```

(Exact expected string for the bestEffort catch: build it by calling the same `bestEffortCatch` shape the other nodes
use — copy the literal from a `callMethod` bestEffort test and adjust.)

`validator.test.ts`:

```typescript
describe('moveTag position (rule 11 at the tag altitude)', () => {
  it('rejects an untyped position', () => {
    /* position: '_p' as unknown as TagMovePosition → /typed TagMovePosition/ */
  });
  it('rejects underTag without a var', () => {
    /* { kind: 'underTag', var: '' } → /requires a non-empty string "var"/ */
  });
  it('counts moveTag as a rule-7 consumer of its tag ref and underTag var', () => {
    // resolveTag('_t', 'X') then moveTag(ref('_t'), {kind:'root'}, 'p: ') with no guard → /without a guard/
  });
});
```

`types.test.ts`: factory tests (`moveTag`, extended `deleteObject`).

- [ ] **Step 2: Verify failure** — same command pattern as Task 1.

- [ ] **Step 3: Implement**

`types.ts`:

```typescript
/** Typed tag-move destination (slice 6): root (moveTags([t], null)) or under a
 *  resolved parent tag var. */
export type TagMovePosition = { kind: 'root' } | { kind: 'underTag'; var: string };

/** Moves one tag via OmniJS `moveTags`. Failure is a HARD error envelope (not a
 *  warning): legacy nest/unparent/reparent return `{error, message: "<prefix><err>"}`
 *  on a moveTags throw — errorPrefix is builder-internal constant text, never
 *  user data (spec §3). */
export interface MoveTagNode {
  type: 'moveTag';
  tag: Expr;
  position: TagMovePosition;
  errorPrefix: string;
}
```

`DeleteObjectNode`: add `bestEffort?: boolean; label?: string;` and AMEND its doc comment (spec §2.5):

```typescript
/** deleteObject(<target>) — OmniJS free function (NOT a method; callMethod
 *  cannot express it). Default = hard error (no partial result to preserve —
 *  spec slice-5 §2.4/§4.1). `bestEffort` (slice 6, spec §2.5) exists for ONE
 *  consumer: merge/tag, where retagging has already happened when the source
 *  delete runs — the catch records a labeled OMN-137 warning instead. */
```

Factories:

```typescript
export const moveTag = (tag: Expr, position: TagMovePosition, errorPrefix: string): MoveTagNode => ({
  type: 'moveTag',
  tag,
  position,
  errorPrefix,
});
export const deleteObject = (target: Expr, bestEffort = false, label?: string): DeleteObjectNode => ({
  type: 'deleteObject',
  target,
  ...(bestEffort ? { bestEffort } : {}),
  ...(label ? { label } : {}),
});
```

`emitter.ts`:

```typescript
    case 'moveTag': {
      const pos = node.position.kind === 'underTag' ? node.position.var : 'null';
      const move = `moveTags([${emitExpr(node.tag)}], ${pos});`;
      // HARD error envelope on failure (legacy-faithful, spec §3) — errorPrefix is
      // builder-internal constant text; String(e) matches legacy e.toString().
      return `try { ${move} } catch (e) { return JSON.stringify({ error: true, message: ${JSON.stringify(node.errorPrefix)} + String(e) }); }`;
    }
    case 'deleteObject': {
      const call = `deleteObject(${emitExpr(node.target)});`;
      return node.bestEffort ? `try { ${call} } ${bestEffortCatch(node.label ?? 'delete')}` : call;
    }
```

`validator.ts`:

1. `const TAG_MOVE_POSITION_KINDS = new Set(['root', 'underTag']);` + `validateMoveTagStmt` (clone of
   `validateMoveProjectStmt`: typed-object check, `underTag` requires non-empty `var`). Wire into
   `validateStatementList`.
2. `stmtConsumedRefs`:
   `case 'moveTag': return [...exprRefs(stmt.tag), ...(stmt.position.kind === 'underTag' ? [stmt.position.var] : [])];`

- [ ] **Step 4: Verify pass** + full mutation suite.

- [ ] **Step 5: Commit** — `feat(OMN-128): slice 6 — moveTag node + deleteObject bestEffort`

---

### Task 3: `constructTagPath` node + `createTagPath` snippet

**Files:** Task 1's four + `src/contracts/ast/mutation/snippets.ts` +
`tests/unit/contracts/ast/mutation/snippets.test.ts`.

- [ ] **Step 1: Write the failing tests**

`snippets.test.ts`: `createTagPath` is registered, `deps: []`, source contains `created.push(segments[i])` and
`return { tag: current, created: created }`.

`emitter.test.ts`:

```typescript
describe('constructTagPath', () => {
  it('emits the createTagPath call + result destructuring via _tagPath', () => {
    expect(emitStmt(constructTagPath('_tag', '_created', json(['Work', 'Active'])))).toBe(
      'const _tagPath = createTagPath(["Work","Active"]);\nconst _tag = _tagPath.tag;\nconst _created = _tagPath.created;',
    );
  });
});
```

Plus an `emitProgram` test: a program containing `constructTagPath` WITHOUT `'createTagPath'` in `snippetDeps` throws
the snippet-coverage error; with it, the assembled program contains `function createTagPath`.

`validator.test.ts`: binds `_tagPath` is now reserved (a `bind('_tagPath', …)` statement throws); both
`constructTagPath` binds go through `assertNotReserved`.

- [ ] **Step 2: Verify failure.**

- [ ] **Step 3: Implement**

`snippets.ts` — beside `resolveOrCreateTagByPath` (it is this snippet's reporting sibling; do NOT modify the original —
`assignTags` depends on it):

```typescript
// Reporting sibling of resolveOrCreateTagByPath (slice 6): same find-or-create
// walk, but returns { tag, created } so the create/tag envelope can echo
// createdSegments (legacy buildCreateTagScript path-island behavior).
const createTagPath = `
function createTagPath(segments) {
  var parent = null;
  var current = null;
  var created = [];
  for (var i = 0; i < segments.length; i++) {
    current = null;
    var children = parent ? parent.children : tags;
    for (var j = 0; j < children.length; j++) {
      if (children[j].name === segments[i]) { current = children[j]; break; }
    }
    if (!current) {
      current = parent ? new Tag(segments[i], parent) : new Tag(segments[i], null);
      created.push(segments[i]);
    }
    parent = current;
  }
  return { tag: current, created: created };
}`;
```

Register: `createTagPath: { source: createTagPath, deps: [] },`

`types.ts`:

```typescript
/** Find-or-create a tag path (spec §4.1): binds the leaf tag AND the array of
 *  created segment names. Path parsing happens at BUILD time (spec §3) — this
 *  node receives the already-split segments as a json Expr. Emission uses the
 *  reserved `_tagPath` intermediate (validator rule 10). */
export interface ConstructTagPathNode {
  type: 'constructTagPath';
  bind: string;
  createdBind: string;
  segments: Expr;
}
export const constructTagPath = (bindVar: string, createdBindVar: string, segments: Expr): ConstructTagPathNode => ({
  type: 'constructTagPath',
  bind: bindVar,
  createdBind: createdBindVar,
  segments,
});
```

Add to `Stmt` union.

`emitter.ts`:

```typescript
    case 'constructTagPath':
      // `_tagPath` is reserved (validator rule 10) — at most one constructTagPath
      // per program (create/tag path form), so a fixed intermediate is safe.
      return [
        `const _tagPath = createTagPath(${emitExpr(node.segments)});`,
        `const ${node.bind} = _tagPath.tag;`,
        `const ${node.createdBind} = _tagPath.created;`,
      ].join('\n');
```

`validator.ts`:

1. Add `'_tagPath'` to `RESERVED_EMITTER_IDENTIFIERS` (update its doc comment).
2. `validateReservedBinds`:
   `if (stmt.type === 'constructTagPath') { assertNotReserved(stmt.bind, 'constructTagPath bind'); assertNotReserved(stmt.createdBind, 'constructTagPath createdBind'); }`

- [ ] **Step 4: Verify pass** + full mutation suite (the reserved-identifier addition must not break existing programs —
      nothing binds `_tagPath` today).

- [ ] **Step 5: Commit** — `feat(OMN-128): slice 6 — constructTagPath node + createTagPath snippet`

---

### Task 4: `mergeRetag` node

**Files:** Task 1's four.

- [ ] **Step 1: Write the failing tests**

`emitter.test.ts`:

```typescript
describe('mergeRetag', () => {
  it('emits the whole-DB retag loop binding the count', () => {
    const emitted = emitStmt(mergeRetag('_src', '_tgt', '_count'));
    expect(emitted).toContain('let _count = 0;');
    expect(emitted).toContain('flattenedTasks.forEach(function (task) {');
    expect(emitted).toContain('task.removeTag(_src);');
    expect(emitted).toContain('if (!_hasTgt) task.addTag(_tgt);');
    expect(emitted).toContain('_count++;');
  });
});
```

Plus a `node:vm` execution test (mirror the vm harness in `complete.test.ts`): stub `flattenedTasks` with three fake
tasks (one with src only, one with src+tgt, one with neither; `tags` arrays + `removeTag`/`addTag` recorders), run the
emitted loop, assert: count === 2, removeTag called on both src-carrying tasks, addTag called only on the src-only task
(legacy `hasTgt` skip).

`validator.test.ts`: `mergeRetag` is a rule-7 consumer of BOTH vars (unguarded `resolveTag('_src')` →
`mergeRetag('_src', …)` throws); its `bind` goes through `assertNotReserved`.

- [ ] **Step 2: Verify failure.**

- [ ] **Step 3: Implement**

`types.ts`:

```typescript
/** Merge retagging (spec §4.1, bespoke per the bulkDeleteItem precedent): walks
 *  flattenedTasks, moves every task carrying the source tag to the target
 *  (removeTag + addTag-if-absent, legacy semantics), binds the moved count.
 *  sourceVar/targetVar are resolveTag bind NAMES (rule 7 applies to both). */
export interface MergeRetagNode {
  type: 'mergeRetag';
  sourceVar: string;
  targetVar: string;
  bind: string;
}
export const mergeRetag = (sourceVar: string, targetVar: string, bindVar: string): MergeRetagNode => ({
  type: 'mergeRetag',
  sourceVar,
  targetVar,
  bind: bindVar,
});
```

Add to `Stmt` union.

`emitter.ts`:

```typescript
    case 'mergeRetag':
      // Emitter-owned loop internals (the bulkDeleteItem discipline): _hasSrc/_hasTgt
      // live inside the forEach callback scope — no program-bind collision possible.
      return [
        `let ${node.bind} = 0;`,
        'flattenedTasks.forEach(function (task) {',
        '  var _hasSrc = false;',
        '  var _hasTgt = false;',
        `  task.tags.forEach(function (t) { if (t === ${node.sourceVar}) _hasSrc = true; if (t === ${node.targetVar}) _hasTgt = true; });`,
        '  if (_hasSrc) {',
        `    task.removeTag(${node.sourceVar});`,
        `    if (!_hasTgt) task.addTag(${node.targetVar});`,
        `    ${node.bind}++;`,
        '  }',
        '});',
      ].join('\n');
```

`validator.ts`:

1. `stmtConsumedRefs`: `case 'mergeRetag': return [stmt.sourceVar, stmt.targetVar];`
2. `validateReservedBinds`: `if (stmt.type === 'mergeRetag') assertNotReserved(stmt.bind, 'mergeRetag bind');`

- [ ] **Step 4: Verify pass** + full mutation suite.

- [ ] **Step 5: Commit** — `feat(OMN-128): slice 6 — mergeRetag node`

---

### Task 5: create/tag lowering + guard relocation + registry entry

**Files:**

- Modify: `src/contracts/ast/mutation/defs.ts`
- Create: `tests/unit/contracts/ast/mutation/tag-create.test.ts`

- [ ] **Step 1: Write the failing tests** (`tag-create.test.ts`, mirroring `create-folder.test.ts`'s structure: golden
      program-shape assertions, emitted-script content, vm execution where cheap, and dispatch-guard tests)

Required cases:

1. **Flat, no parent:** program = `resolveTag(_dup)` → guard `_dup !== null` (envelope message `Tag 'X' already exists`)
   → `constructTag(_tag, …, {kind:'none'})` → return. Emitted script contains `new Tag("X")` and the envelope keys
   `action/tagName/tagId/parentTagName/parentTagId/message`; `parentTagName` and `parentTagId` emit as `null`; NO
   `success` key (spec §2.3).
2. **Flat, with parent:** `resolveTag(_parent)` + guard `Parent tag not found: P` between resolve and
   `constructTag(…, {kind:'resolved', var:'_parent'})`; envelope reads `_parent.name` / `_parent.id.primaryKey` live.
3. **Path:** `buildCreateTagProgram({tagName: 'Work : Active'})` → program contains `constructTagPath` with segments
   `["Work","Active"]`, `snippetDeps` includes `'createTagPath'`; envelope has `path`/`createdSegments`; message via
   `_pathStr` bind (raw never carries the user string — assert the raw code references `_pathStr`).
4. **Path + parentTag conflict:** constant error program — single `return_` with the verbatim legacy message
   (`Cannot use path syntax (' : ' separator) with parentTag parameter. Use either path syntax OR parentTag, not both.`).
5. **Empty path segment:** `'Work :  : X'` → constant error program, message
   `Invalid tag path: empty segment in "Work :  : X"`.
6. **Dispatch guard (test mode):** with `NODE_ENV=test` + `SANDBOX_GUARD_ENABLED=true` env stubs (mirror how
   `create-folder.test.ts` exercises its guard), `dispatchMutation('create/tag', { tagName: 'RealTag' })` rejects with
   `/TEST GUARD/`; `__test-x` passes; `{ tagName: '__test-x', parentTagName: 'RealParent' }` rejects (spec §2.1 — parent
   now guarded on create); path form `'RealA : RealB'` rejects, `'__test-A : B'` passes (full-string prefix check).
7. **Validation runs at the dispatch seam:** all envelope/program assertions drive through
   `await dispatchMutation('create/tag', …)` — not the lowering function directly.

- [ ] **Step 2: Verify failure** — `npm run test:unit -- tests/unit/contracts/ast/mutation/tag-create.test.ts`

- [ ] **Step 3: Implement** in `defs.ts` (new section `// TAG LOWERINGS (slice 6)`):

```typescript
export interface TagCreateInput {
  tagName: string;
  parentTagName?: string;
}

/** Sandbox guard for tag ops (relocated from tag-mutation-script-builder.ts —
 *  spec §2.1): in test mode every touched tag name must be __test- prefixed.
 *  Sync (name-based; no DB lookup needed, unlike validateTaskInSandbox). */
function validateTagMutation(tagName: string): void {
  if (!isTestMode()) return;
  if (!tagName.startsWith(TEST_TAG_PREFIX)) {
    throw new Error(`TEST GUARD: Tag mutations must target "${TEST_TAG_PREFIX}"-prefixed tags. Got: "${tagName}"`);
  }
}

/** Build-time ' : ' path split (spec §3): null = not a path. Throws carry the
 *  legacy empty-segment message — the lowering converts to a constant error
 *  program so the runtime envelope is unchanged. */
function parseTagPathSegments(input: string): string[] | null {
  if (!input.includes(' : ')) return null;
  const segments = input.split(' : ').map((s) => s.trim());
  if (segments.some((s) => s.length === 0)) {
    throw new Error(`Invalid tag path: empty segment in "${input}"`);
  }
  return segments;
}

/** A constant `{error, message}` program (spec §3): build-time-decided input
 *  errors keep their legacy runtime-envelope shape. */
function constantErrorProgram(message: string, context: string): Program {
  return {
    statements: [return_({ error: json(true), message: json(message), context: json(context) })],
    context,
    snippetDeps: [],
  };
}

export function buildCreateTagProgram(data: TagCreateInput): Program {
  const _exhaustive: Record<keyof TagCreateInput, true> = { tagName: true, parentTagName: true };
  void _exhaustive;
  const context = 'create_tag';

  let segments: string[] | null;
  try {
    segments = parseTagPathSegments(data.tagName);
  } catch (e) {
    return constantErrorProgram((e as Error).message, context);
  }

  if (segments) {
    if (data.parentTagName) {
      return constantErrorProgram(
        "Cannot use path syntax (' : ' separator) with parentTag parameter. Use either path syntax OR parentTag, not both.",
        context,
      );
    }
    const statements: Stmt[] = [
      bind('_pathStr', json(data.tagName)),
      constructTagPath('_tag', '_created', json(segments)),
      return_({
        action: json('created'),
        tagName: member(ref('_tag'), 'name'),
        tagId: member(ref('_tag'), 'id.primaryKey'),
        path: ref('_pathStr'),
        createdSegments: ref('_created'),
        // Builder-internal raw: user data enters via the _pathStr bind, never inline.
        message: raw(
          `_created.length === 0 ? "Tag path '" + _pathStr + "' already exists" : "Created " + _created.length + " tag(s) in path '" + _pathStr + "'"`,
        ),
      }),
    ];
    return { statements, context, snippetDeps: ['createTagPath'] };
  }

  const statements: Stmt[] = [
    resolveTag('_dup', data.tagName),
    guard('_dup !== null', {
      error: json(true),
      message: json(`Tag '${data.tagName}' already exists`),
      context: json(context),
    }),
  ];
  let parentResolution: TagResolution = { kind: 'none' };
  if (data.parentTagName) {
    statements.push(
      resolveTag('_parent', data.parentTagName),
      guard('_parent === null', {
        error: json(true),
        message: json(`Parent tag not found: ${data.parentTagName}`),
        context: json(context),
      }),
    );
    parentResolution = { kind: 'resolved', var: '_parent' };
  }
  statements.push(
    constructTag('_tag', json(data.tagName), parentResolution),
    return_({
      action: json('created'),
      tagName: json(data.tagName),
      tagId: member(ref('_tag'), 'id.primaryKey'),
      parentTagName: data.parentTagName ? member(ref('_parent'), 'name') : json(null),
      parentTagId: data.parentTagName ? member(ref('_parent'), 'id.primaryKey') : json(null),
      message: json(
        data.parentTagName
          ? `Tag '${data.tagName}' created under '${data.parentTagName}'`
          : `Tag '${data.tagName}' created successfully`,
      ),
    }),
  );
  return { statements, context, snippetDeps: [] };
}
```

Imports to extend at the top of `defs.ts`: `isTestMode`, `TEST_TAG_PREFIX` (from `../mutation-script-builder.js` —
already the source of other guard imports), plus the new factories from `./types.js`.

Registry entry (inside `MUTATION_DEFS`):

```typescript
  'create/tag': {
    // Spec §2.1: guard EVERY name the op touches (parent included — stricter
    // than legacy, sandbox-only).
    guard: (d) => {
      validateTagMutation(d.tagName);
      if (d.parentTagName) validateTagMutation(d.parentTagName);
    },
    build: buildCreateTagProgram,
  } as MutationDef<TagCreateInput>,
```

- [ ] **Step 4: Verify pass** + full mutation suite.

- [ ] **Step 5: Commit** — `feat(OMN-128): slice 6 — create/tag lowering + relocated sandbox guard`

---

### Task 6: rename + delete + merge lowerings + registry entries

**Files:**

- Modify: `src/contracts/ast/mutation/defs.ts`
- Create: `tests/unit/contracts/ast/mutation/tag-lifecycle.test.ts`

- [ ] **Step 1: Write the failing tests** — required cases:

1. **Rename golden:** resolve target → guard `Tag 'X' not found` → resolve `_dup` (newName) → guard
   `Tag 'Y' already exists` → `setProp(_tag, 'name', json('Y'), 'direct')` → envelope
   `{action:'renamed', oldName, newName, message}`. Order preserved: target-not-found beats duplicate.
2. **Delete golden:** resolve → guard not-found → `deleteObject(ref('_tag'))` (NO bestEffort) → envelope
   `{action:'deleted', tagName, message: "Tag 'X' deleted successfully."}` (note the legacy trailing period).
3. **Merge golden:** resolve `_src` → guard `Source tag 'X' not found` → resolve `_tgt` → guard
   `Target tag 'Y' not found` → `mergeRetag('_src','_tgt','_count')` → bestEffort
   `deleteObject(ref('_src'), true, 'Tags were merged but source tag could not be deleted')` → envelope with
   `action`/`warning`/`message` raw-branching on `_warnings.length` (assert the raw code, and that user names enter via
   `_srcName`/`_tgtName` binds only).
4. **Merge vm execution (happy + warning paths):** vm harness with stub `flattenedTags`/`flattenedTasks`/
   `deleteObject`: (a) successful delete → parsed envelope `action === 'merged'`, `tasksMerged === <count>`, NO
   `warning` key, message `Merged 'X' into 'Y'. 2 tasks updated.`; (b) `deleteObject` throws →
   `action === 'merged_with_warning'`, `warning` starts `Tags were merged but source tag could not be deleted:`, message
   `Merged 2 tasks but could not delete source tag`.
5. **Dispatch guards:** rename guards BOTH names; merge guards BOTH names; delete guards its one name (all via
   `dispatchMutation`, `/TEST GUARD/`).

- [ ] **Step 2: Verify failure.**

- [ ] **Step 3: Implement** in `defs.ts`:

```typescript
export interface TagRenameInput {
  tagName: string;
  newName: string;
}
export interface TagDeleteInput {
  tagName: string;
}
export interface TagMergeInput {
  tagName: string;
  targetTag: string;
}

export function buildRenameTagProgram(data: TagRenameInput): Program {
  const _exhaustive: Record<keyof TagRenameInput, true> = { tagName: true, newName: true };
  void _exhaustive;
  const context = 'rename_tag';
  const statements: Stmt[] = [
    resolveTag('_tag', data.tagName),
    guard('_tag === null', {
      error: json(true),
      message: json(`Tag '${data.tagName}' not found`),
      context: json(context),
    }),
    resolveTag('_dup', data.newName),
    guard('_dup !== null', {
      error: json(true),
      message: json(`Tag '${data.newName}' already exists`),
      context: json(context),
    }),
    setProp(ref('_tag'), 'name', json(data.newName), 'direct'),
    return_({
      action: json('renamed'),
      oldName: json(data.tagName),
      newName: json(data.newName),
      message: json(`Tag renamed from '${data.tagName}' to '${data.newName}'`),
    }),
  ];
  return { statements, context, snippetDeps: [] };
}

export function buildDeleteTagProgram(data: TagDeleteInput): Program {
  const _exhaustive: Record<keyof TagDeleteInput, true> = { tagName: true };
  void _exhaustive;
  const context = 'delete_tag';
  const statements: Stmt[] = [
    resolveTag('_tag', data.tagName),
    guard('_tag === null', {
      error: json(true),
      message: json(`Tag '${data.tagName}' not found`),
      context: json(context),
    }),
    deleteObject(ref('_tag')),
    return_({
      action: json('deleted'),
      tagName: json(data.tagName),
      message: json(`Tag '${data.tagName}' deleted successfully.`),
    }),
  ];
  return { statements, context, snippetDeps: [] };
}

export function buildMergeTagsProgram(data: TagMergeInput): Program {
  const _exhaustive: Record<keyof TagMergeInput, true> = { tagName: true, targetTag: true };
  void _exhaustive;
  const context = 'merge_tags';
  const statements: Stmt[] = [
    resolveTag('_src', data.tagName),
    guard('_src === null', {
      error: json(true),
      message: json(`Source tag '${data.tagName}' not found`),
      context: json(context),
    }),
    resolveTag('_tgt', data.targetTag),
    guard('_tgt === null', {
      error: json(true),
      message: json(`Target tag '${data.targetTag}' not found`),
      context: json(context),
    }),
    bind('_srcName', json(data.tagName)),
    bind('_tgtName', json(data.targetTag)),
    mergeRetag('_src', '_tgt', '_count'),
    // bestEffort label IS the legacy warning prefix, so _warnings[0] reproduces
    // the legacy warning text verbatim (spec §2.5).
    deleteObject(ref('_src'), true, 'Tags were merged but source tag could not be deleted'),
    return_({
      action: raw(`_warnings.length ? "merged_with_warning" : "merged"`),
      sourceTag: ref('_srcName'),
      targetTag: ref('_tgtName'),
      tasksMerged: ref('_count'),
      // undefined-valued keys drop out of JSON.stringify — `warning` appears only
      // on the failure path (spec §2.3 envelope listing).
      warning: raw('_warnings.length ? _warnings[0] : undefined'),
      message: raw(
        `_warnings.length ? "Merged " + _count + " tasks but could not delete source tag" : "Merged '" + _srcName + "' into '" + _tgtName + "'. " + _count + " tasks updated."`,
      ),
    }),
  ];
  return { statements, context, snippetDeps: [] };
}
```

Registry entries:

```typescript
  'rename/tag': {
    guard: (d) => {
      validateTagMutation(d.tagName);
      validateTagMutation(d.newName);
    },
    build: buildRenameTagProgram,
  } as MutationDef<TagRenameInput>,
  'delete/tag': {
    guard: (d) => validateTagMutation(d.tagName),
    build: buildDeleteTagProgram,
  } as MutationDef<TagDeleteInput>,
  'merge/tag': {
    guard: (d) => {
      validateTagMutation(d.tagName);
      validateTagMutation(d.targetTag);
    },
    build: buildMergeTagsProgram,
  } as MutationDef<TagMergeInput>,
```

- [ ] **Step 4: Verify pass** + full mutation suite.

- [ ] **Step 5: Commit** — `feat(OMN-128): slice 6 — rename/delete/merge tag lowerings`

---

### Task 7: nest + unparent + reparent lowerings + registry entries

**Files:**

- Modify: `src/contracts/ast/mutation/defs.ts`
- Create: `tests/unit/contracts/ast/mutation/tag-move.test.ts`

- [ ] **Step 1: Write the failing tests** — required cases:

1. **Nest golden:** resolve `_tag` → guard not-found → resolve `_parent` → guard `Parent tag not found: P` → self-check
   guard (`_tag.id.primaryKey === _parent.id.primaryKey` → `Cannot nest tag under itself`) →
   `moveTag(ref('_tag'), {kind:'underTag', var:'_parent'}, 'Failed to nest tag: ')` → envelope
   `{action:'nested', tagName, parentTagName: <live>, parentTagId: <live>, message}`.
2. **Nest without parent:** constant error program, verbatim legacy message
   `Parent tag name or ID is required for nest action`.
3. **Unparent golden:** resolve → guard → `moveTag(…, {kind:'root'}, 'Failed to unparent tag: ')` → envelope
   `{action:'unparented', tagName, message: "Tag 'X' moved to root level"}`.
4. **Reparent with parent:** like nest but `Cannot reparent tag under itself`, `New parent tag not found: P`, prefix
   `'Failed to reparent tag: '`, envelope
   `{action:'reparented', tagName, newParentTagName, newParentTagId, message: "Tag 'X' moved under 'P'"}`.
5. **Reparent without parent (legacy quirk preserved):** moveTag root; envelope
   `{action:'reparented', tagName, message: "Tag 'X' moved to root level"}` — no parent keys.
6. **Dispatch guards:** nest/reparent guard `parentTagName` when present; all three guard `tagName`.

- [ ] **Step 2: Verify failure.**

- [ ] **Step 3: Implement** in `defs.ts`:

```typescript
export interface TagNestInput {
  tagName: string;
  parentTagName?: string;
}
export interface TagUnparentInput {
  tagName: string;
}
export interface TagReparentInput {
  tagName: string;
  parentTagName?: string;
}

/** Shared tag-move lowering: resolve target (+guard) → [resolve parent (+guard)
 *  → self-check] → moveTag → envelope. nest/unparent/reparent differ only in
 *  required-parent policy, messages, and envelope keys (spec §4.2). */
function lowerTagMove(op: 'nest' | 'unparent' | 'reparent', tagName: string, parentTagName?: string): Program {
  const context = `${op}_tag`;
  const statements: Stmt[] = [
    resolveTag('_tag', tagName),
    guard('_tag === null', { error: json(true), message: json(`Tag '${tagName}' not found`), context: json(context) }),
  ];
  if (parentTagName) {
    statements.push(
      resolveTag('_parent', parentTagName),
      guard('_parent === null', {
        error: json(true),
        message: json(`${op === 'reparent' ? 'New parent tag' : 'Parent tag'} not found: ${parentTagName}`),
        context: json(context),
      }),
      guard('_tag.id.primaryKey === _parent.id.primaryKey', {
        error: json(true),
        message: json(`Cannot ${op} tag under itself`),
        context: json(context),
      }),
      moveTag(ref('_tag'), { kind: 'underTag', var: '_parent' }, `Failed to ${op} tag: `),
    );
  } else {
    statements.push(moveTag(ref('_tag'), { kind: 'root' }, `Failed to ${op} tag: `));
  }

  if (op === 'nest') {
    statements.push(
      return_({
        action: json('nested'),
        tagName: json(tagName),
        parentTagName: member(ref('_parent'), 'name'),
        parentTagId: member(ref('_parent'), 'id.primaryKey'),
        message: json(`Tag '${tagName}' nested under '${parentTagName}'`),
      }),
    );
  } else if (op === 'unparent') {
    statements.push(
      return_({
        action: json('unparented'),
        tagName: json(tagName),
        message: json(`Tag '${tagName}' moved to root level`),
      }),
    );
  } else if (parentTagName) {
    statements.push(
      return_({
        action: json('reparented'),
        tagName: json(tagName),
        newParentTagName: member(ref('_parent'), 'name'),
        newParentTagId: member(ref('_parent'), 'id.primaryKey'),
        message: json(`Tag '${tagName}' moved under '${parentTagName}'`),
      }),
    );
  } else {
    statements.push(
      return_({
        action: json('reparented'),
        tagName: json(tagName),
        message: json(`Tag '${tagName}' moved to root level`),
      }),
    );
  }
  return { statements, context, snippetDeps: [] };
}

export function buildNestTagProgram(data: TagNestInput): Program {
  const _exhaustive: Record<keyof TagNestInput, true> = { tagName: true, parentTagName: true };
  void _exhaustive;
  if (!data.parentTagName) {
    // Verbatim legacy message — the wording predates the parentTagId erasure (§2.4)
    // and is preserved exactly (spec §3).
    return constantErrorProgram('Parent tag name or ID is required for nest action', 'nest_tag');
  }
  return lowerTagMove('nest', data.tagName, data.parentTagName);
}

export function buildUnparentTagProgram(data: TagUnparentInput): Program {
  const _exhaustive: Record<keyof TagUnparentInput, true> = { tagName: true };
  void _exhaustive;
  return lowerTagMove('unparent', data.tagName);
}

export function buildReparentTagProgram(data: TagReparentInput): Program {
  const _exhaustive: Record<keyof TagReparentInput, true> = { tagName: true, parentTagName: true };
  void _exhaustive;
  return lowerTagMove('reparent', data.tagName, data.parentTagName);
}
```

Registry entries (`nest/tag`, `unparent/tag`, `reparent/tag`) — guards: `validateTagMutation(d.tagName)` always, plus
`if (d.parentTagName) validateTagMutation(d.parentTagName)` for nest/reparent.

- [ ] **Step 4: Verify pass** + full mutation suite.

- [ ] **Step 5: Commit** — `feat(OMN-128): slice 6 — nest/unparent/reparent tag lowerings`

---

### Task 8: Wrapper rewrite + legacy deletion + existing-test rewrite

**Files:**

- Modify: `src/contracts/ast/tag-mutation-script-builder.ts` (REWRITE)
- Modify: `tests/unit/tag-operations.test.ts`, `tests/unit/tag-conversion.test.ts`

- [ ] **Step 1: Rewrite the builder module.** The whole file becomes (~100 lines; follow `buildCreateFolderScript` in
      `mutation-script-builder.ts` as the wrapper template):

```typescript
/**
 * Tag mutation builders — thin dispatch wrappers over the mutation AST
 * (OMN-128 slice 6). The legacy template-string bodies, the shared JXA
 * preamble/epilogue, and all four nested-backtick evaluateJavascript islands
 * are deleted, not migrated; quoting/escaping is emitter-owned
 * (wrapInLauncher JSON-stringifies the whole OmniJS program). The sandbox
 * guard runs at dispatchMutation (defs.ts) — it cannot be bypassed.
 */
import type { MutationTarget } from '../mutations.js';
import type { GeneratedMutationScript } from './mutation-script-builder.js';
import { dispatchMutation } from './mutation/defs.js';
import { emitProgram, wrapInLauncher } from './mutation/emitter.js';
import { validateMutationProgram } from './mutation/validator.js';

async function generate(
  key: Parameters<typeof dispatchMutation>[0],
  data: never,
  operation: string,
  description: string,
): Promise<GeneratedMutationScript> {
  /* dispatch → validate → emit → wrap → return */
}
```

Concretely, each export keeps its exact name and return contract; e.g.:

```typescript
export async function buildCreateTagScript(data: {
  tagName: string;
  parentTagName?: string;
}): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('create/tag', data);
  validateMutationProgram(program);
  const script = wrapInLauncher(emitProgram(program), program.context);
  return { script: script.trim(), operation: 'create', target: 'tag' as MutationTarget };
}
```

Seven wrappers: `buildCreateTagScript` (`create/tag`), `buildRenameTagScript` (`rename/tag`, data `{tagName, newName}`),
`buildDeleteTagScript` (`delete/tag`), `buildMergeTagsScript` (`merge/tag`, data `{tagName, targetTag}`),
`buildNestTagScript` (`nest/tag`, data `{tagName, parentTagName?}`), `buildUnparentTagScript` (`unparent/tag`),
`buildReparentTagScript` (`reparent/tag`, data `{tagName, parentTagName?}`). `operation` values keep their legacy
strings (`'create'`, `'rename'`, `'delete'`, `'merge'`, `'nest'`, `'unparent'`, `'reparent'`); if a shared `generate`
helper obscures the per-key types, write the seven wrappers longhand — clarity over DRY at 7 call sites. **`parentTagId`
does not return** (spec §2.4). The `getUnifiedHelpers` import, `tagScriptPreamble`/`tagScriptEpilogue`, and the
module-local `validateTagMutation` are all deleted with the bodies.

- [ ] **Step 2: Build + see what breaks**

Run: `npm run build && npm run test:unit -- tests/unit/tag-operations.test.ts tests/unit/tag-conversion.test.ts`
Expected: build clean (the write tool's calls match the new signatures — it never passed `parentTagId`); the two legacy
test files FAIL (they assert template internals: `parseTagPath` in the JXA shell, `app.evaluateJavascript(mergeScript)`,
`new Tag(segments[i], parent)` inline, `safeGet`).

- [ ] **Step 3: Rewrite the failing assertions to the new contract** (not the old internals):

- `tag-operations.test.ts`: keep the read-side `buildTagsScript` test untouched. Rewrite the four mutation tests: merge
  script contains `task.removeTag(_src)` / `task.addTag(_tgt)` inside a `wrapInLauncher`-shaped script (assert
  `evaluateJavascript(` present + NO backtick character in the whole script — the structural OMN-111/113 kill); plural
  `addTags(`/`removeTags(` still absent; create-path script contains `createTagPath(["A","B"])` for `'A : B'`; conflict
  envelope test now asserts the constant error program text in the emitted script.
- `tag-conversion.test.ts`: re-point its `JSON.stringify`-returns and array-handling assertions at the new emitted
  scripts (the invariants survive; the selectors change).
- Both files: builders are now async-only wrappers — assertions go through `await build*` exactly as before.

- [ ] **Step 4: Full unit suite**

Run: `npm run test:unit` Expected: PASS, including `claude-md-paths` (the file survives at its CLAUDE.md-referenced
path) and zero other consumers of the deleted internals (`grep -rn "tagScriptPreamble\|tagScriptEpilogue" src tests` →
no hits).

- [ ] **Step 5: Commit** — `feat(OMN-128): slice 6 — tag builders become dispatch wrappers; legacy templates deleted`

---

### Task 9: OMN-138 live integration coverage

**Files:**

- Create: `tests/integration/tools/unified/tag-paths.test.ts`
- Check: `tests/integration/test-tag-hierarchy.ts`

- [ ] **Step 1: Write the live round-trip test** (mirror `complete-delete-paths.test.ts`'s harness: spawned server,
      sandbox manager import for the guard env, `__test-` prefixed fixtures, teardown deletes its artifacts). Coverage
      (one serialized describe; each op asserts PERSISTED state via a follow-up read, never the envelope echo — spec
      §7):

1. create flat → read back by name: exists, `tagId` is a real id (not `'unknown'`).
2. create under parent → read back: persisted `parentId` equals the parent's real id.
3. create path `__test-h : sub` → read back leaf with correct parent chain; `createdSegments` length 2 on first create,
   0 on repeat (the already-exists success path).
4. rename → old name gone, new name present.
5. nest → persisted parent linkage; unparent → persisted root (parent null); reparent → persisted new parent.
6. merge: two tags, a task carrying source → after merge, task carries target not source (query the task's tags), source
   tag gone.
7. delete → tag gone.
8. guard refusal: an unprefixed name through the real tool seam refuses with `TEST GUARD` and writes nothing.

- [ ] **Step 2: Check `tests/integration/test-tag-hierarchy.ts`** — if it asserts on `success: true` inside the script
      envelope or on `parentTagId` params, update those expectations (spec §2.3/§2.4); if it only drives the tool seam,
      leave it.

- [ ] **Step 3: Run the integration suite** — **`run_in_background` ONLY** (OMN-143: a killed foreground shell orphans
      vitest and its teardown hits live sessions):

Run (background): `npm run test:integration` Expected: PASS including the new file. Before any live run,
`pgrep -f vitest` to confirm no orphan suite is active.

- [ ] **Step 4: Commit** — `test(OMN-128): slice 6 — live tag-path coverage (OMN-138 posture)`

---

### Task 10: Full verification sweep

- [ ] **Step 1: Gates**

```bash
npm run build          # clean
npm run test:unit      # all green
npm run test:integration   # background-run, npm, all green
```

- [ ] **Step 2: Structural sweeps**

- `grep -rn '\`' src/contracts/ast/tag-mutation-script-builder.ts` → **zero backticks** (the slice's headline structural
  claim).
- `grep -rn "parentTagId" src tests` → hits only in envelope KEY positions (defs.ts lowerings + tests asserting them),
  no parameter remnants.
- `npx ts-prune | grep -i tag` → no new orphans (the cascade-discovery rule: deleting template bodies may have unmasked
  dead helpers; budget one cleanup round).

- [ ] **Step 3: Live `/verify` matrix** (spec §7 — mandatory; template→emitter swaps are the wiring-tests-pass trap).
      Per builder at the real OmniFocus seam via the guarded dev MCP server, `__test-` fixtures, persisted read-backs:
      create flat / create under parent / create path / duplicate-create refusal / rename / rename-dup refusal / delete
      / merge (task moves) / nest / self-nest refusal / unparent / reparent / reparent-to-root. Record findings to
      Obsidian ("OMN-128 Slice 6 - Verify Findings"), slice convention.

- [ ] **Step 4: Commit any sweep fixes** — `chore(OMN-128): slice 6 — verification sweep fixes`

---

## Out of scope (recorded so it isn't lost)

- OMN-137 closure decision (the last write-path swallowers die here — whether the ticket closes is Kip's call, recorded
  on the ticket at merge).
- OMN-144 (bulk guard-refusal envelope wart) — untouched by this slice.
- `tag-script-builder.ts` (read side) and the `assignTags` machinery — already migrated/out of scope.

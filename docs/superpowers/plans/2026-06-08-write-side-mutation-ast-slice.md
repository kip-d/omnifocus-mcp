# Write-Side Mutation AST — Vertical Slice (`buildCreateProjectScript`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. TDD
> throughout (@superpowers:test-driven-development). The final live-verify gate uses
> @superpowers:verification-before-completion.

**Goal:** Stand up a new OmniJS-native mutation AST (`src/contracts/ast/mutation/`) and migrate exactly one builder —
`buildCreateProjectScript` — to emit from it, proving the architecture and establishing the test pattern for the
remaining builders.

**Architecture:** Mirror the read-side AST at the mutation altitude. A small statement/expression node set
(`resolve → construct → set → assign → envelope`) is lowered from `ProjectCreateData` by a `MUTATION_DEFS` registry,
validated, then emitted as **one OmniJS program** wrapped in a fixed, data-free JXA launcher. `JSON.stringify` owns both
boundaries (TS→OmniJS data; OmniJS-program→JXA-string), eliminating the OMN-111/113 nested-backtick injection class by
construction.

**Tech Stack:** TypeScript (strict, ESM `.js` import specifiers), Vitest (`toEqual`/`toContain`, no snapshots), OmniJS
(Omni Automation) executed via `osascript -l JavaScript`.

**Spec:** `docs/superpowers/specs/2026-06-08-write-side-mutation-ast-design.md`. Read it before starting.

---

## Scope & deliberate non-goals (YAGNI)

This plan migrates **only `buildCreateProjectScript`**. It builds **only the node subset that create/project
exercises**. The following are explicitly deferred to later plans (one per builder), per the spec's vertical-slice
strategy:

- Other builders (create-task, create-folder, updates, complete, delete, batch, bulk-delete, tag builders).
- A generic `Place` node for task/project _moves_ (create/project folds placement into construction via OmniJS
  `new Project(name, folder)`).
- `ResolveTag` (read-only) — create/project uses create-or-find (`ResolveOrCreateTag`) only.

**Spec deviation to record (decided during planning, flag at handoff):** The spec §5/§8 model `SandboxGuard` as an
_emitted runtime node_. The actual guard (`validateProjectCreate`) is a **build-time TypeScript throw** that emits
nothing into the script. Emitting a runtime guard would change behavior. This plan keeps the guard build-time and makes
it **non-bypassable at the `MUTATION_DEFS` dispatch layer** (a new op cannot be registered without declaring its guard),
which is the faithful implementation of the spec's _intent_ (the OMN-119/120 non-bypass property). The validator asserts
the structural property; it does not look for a runtime node.

---

## File structure

**New files (mirror `src/contracts/ast/` read-side layout):**

| File                                      | Responsibility                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/contracts/ast/mutation/types.ts`     | Node union (subset), type guards, factory functions (mirror read-side `types.ts`)  |
| `src/contracts/ast/mutation/snippets.ts`  | Single-source OmniJS helper snippet registry (lifts the OMN-127 resolver consts)   |
| `src/contracts/ast/mutation/emitter.ts`   | `emitProgram(program) → omnijs string`; `wrapInLauncher(omnijs, ctx) → JXA string` |
| `src/contracts/ast/mutation/validator.ts` | `validateMutationProgram(program)` — structural static checks                      |
| `src/contracts/ast/mutation/defs.ts`      | `MUTATION_DEFS` registry + `buildCreateProjectProgram(data)` + guarded `dispatch`  |
| `src/contracts/ast/mutation/index.ts`     | Public exports                                                                     |

**New test files:**

| File                                                       | Covers                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `tests/unit/contracts/ast/mutation/types.test.ts`          | factories produce expected node objects                           |
| `tests/unit/contracts/ast/mutation/snippets.test.ts`       | registry canonical source + dependency collection/dedup           |
| `tests/unit/contracts/ast/mutation/emitter.test.ts`        | expression + statement + program emission; **boundary/injection** |
| `tests/unit/contracts/ast/mutation/validator.test.ts`      | rejects malformed programs, accepts valid                         |
| `tests/unit/contracts/ast/mutation/create-project.test.ts` | create/project program structure + guarded dispatch               |

**Modified files:**

| File                                                       | Change                                                                                                                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/contracts/ast/mutation-script-builder.ts`             | `buildCreateProjectScript` body delegates to the new pipeline; the five `OMNIJS_*` resolver consts re-export from `snippets.ts` (single-source, byte-identical)                           |
| `tests/unit/contracts/ast/mutation-script-builder.test.ts` | adjust `buildCreateProjectScript` assertions to the new (OmniJS-native) output where they reference removed JXA scaffolding; keep contract assertions (`operation`/`target`/name present) |

---

## Node subset for this slice

**Statements:** `Bind`, `ResolveFolder`, `Guard`, `ConstructProject`, `SetProp`, `AssignTags`, `Return`.
**Expressions:** `Ref`, `Member`, `New`, `EnumRef`, `DateExpr`, `Json`. **Value types:**
`FolderResolution = { kind: 'resolved'; var } | { kind: 'none' } | { kind: 'notFound' }` — the typed fail-able result
`ResolveFolder` yields and `ConstructProject`/`Guard` consume. **No node accepts a folder string.**

---

## Task 1: Node types + factories

**Files:**

- Create: `src/contracts/ast/mutation/types.ts`
- Test: `tests/unit/contracts/ast/mutation/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
    expect(resolveFolder('folderVar', 'Work')).toEqual({
      type: 'resolveFolder',
      bind: 'folderVar',
      ref: 'Work',
    });
  });
  it('return_() wraps an envelope', () => {
    expect(return_({ created: json(true) })).toEqual({
      type: 'return',
      envelope: { created: { type: 'json', value: true } },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest tests/unit/contracts/ast/mutation/types.test.ts --run` Expected: FAIL — module `mutation/types.js` not
found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/contracts/ast/mutation/types.ts
// Mutation AST — node set for the create/project vertical slice (OMN-128).
// Mirrors the read-side types.ts: node union + type guards + factory functions.

export type SetPropStrategy = 'direct' | 'dateExpr' | 'enum' | 'readModifyReassign';

// --- Expressions ---
export interface RefNode {
  type: 'ref';
  name: string;
}
export interface MemberNode {
  type: 'member';
  object: Expr;
  path: string;
}
export interface NewNode {
  type: 'new';
  className: string;
  args: Expr[];
}
export interface EnumRefNode {
  type: 'enumRef';
  path: string;
} // e.g. 'Project.Status.OnHold'
export interface DateExprNode {
  type: 'dateExpr';
  value: Expr;
} // emits new Date(<value>)
export interface JsonNode {
  type: 'json';
  value: unknown;
} // ONLY data primitive → JSON.stringify
export type Expr = RefNode | MemberNode | NewNode | EnumRefNode | DateExprNode | JsonNode;

// --- Typed fail-able folder resolution ---
export type FolderResolution = { kind: 'resolved'; var: string } | { kind: 'none' } | { kind: 'notFound' };

// --- Statements ---
export interface BindNode {
  type: 'bind';
  name: string;
  expr: Expr;
}
export interface ResolveFolderNode {
  type: 'resolveFolder';
  bind: string;
  ref: string;
}
export interface GuardNode {
  type: 'guard';
  cond: string;
  envelope: Envelope;
} // emits: if (cond) return JSON.stringify(env)
export interface ConstructProjectNode {
  type: 'constructProject';
  bind: string; // variable the new Project is bound to
  name: Expr; // Json node
  folder: FolderResolution; // resolved var | none ; notFound must be Guarded earlier
}
export interface SetPropNode {
  type: 'setProp';
  target: Expr;
  prop: string;
  value: Expr;
  strategy: SetPropStrategy;
}
export interface AssignTagsNode {
  type: 'assignTags';
  target: Expr;
  tags: Expr;
  bind: string;
} // tags: Json(string[])
export interface ReturnNode {
  type: 'return';
  envelope: Envelope;
}
export type Stmt =
  | BindNode
  | ResolveFolderNode
  | GuardNode
  | ConstructProjectNode
  | SetPropNode
  | AssignTagsNode
  | ReturnNode;

export type Envelope = Record<string, Expr>;

export interface Program {
  statements: Stmt[];
  context: string; // error-envelope context tag, e.g. 'create_project'
  snippetDeps: string[]; // snippet registry keys this program needs at OmniJS program-top
}

// --- Factories (mirror read-side and/or/compare/...) ---
export const ref = (name: string): RefNode => ({ type: 'ref', name });
export const member = (object: Expr, path: string): MemberNode => ({ type: 'member', object, path });
export const newExpr = (className: string, args: Expr[]): NewNode => ({ type: 'new', className, args });
export const enumRef = (path: string): EnumRefNode => ({ type: 'enumRef', path });
export const dateExpr = (value: Expr): DateExprNode => ({ type: 'dateExpr', value });
export const json = (value: unknown): JsonNode => ({ type: 'json', value });

export const bind = (name: string, expr: Expr): BindNode => ({ type: 'bind', name, expr });
export const resolveFolder = (bindVar: string, refStr: string): ResolveFolderNode => ({
  type: 'resolveFolder',
  bind: bindVar,
  ref: refStr,
});
export const guard = (cond: string, envelope: Envelope): GuardNode => ({ type: 'guard', cond, envelope });
export const constructProject = (bindVar: string, name: Expr, folder: FolderResolution): ConstructProjectNode => ({
  type: 'constructProject',
  bind: bindVar,
  name,
  folder,
});
export const setProp = (
  target: Expr,
  prop: string,
  value: Expr,
  strategy: SetPropStrategy = 'direct',
): SetPropNode => ({ type: 'setProp', target, prop, value, strategy });
export const assignTags = (target: Expr, tags: Expr, bindVar: string): AssignTagsNode => ({
  type: 'assignTags',
  target,
  tags,
  bind: bindVar,
});
export const return_ = (envelope: Envelope): ReturnNode => ({ type: 'return', envelope });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest tests/unit/contracts/ast/mutation/types.test.ts --run` Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/types.ts tests/unit/contracts/ast/mutation/types.test.ts
git commit -m "feat(OMN-128): mutation AST node types + factories (slice subset)"
```

---

## Task 2: Snippet registry (single-source; lift OMN-127 resolvers)

**Files:**

- Create: `src/contracts/ast/mutation/snippets.ts`
- Modify: `src/contracts/ast/mutation-script-builder.ts` (re-point the five `OMNIJS_*` consts at the registry)
- Test: `tests/unit/contracts/ast/mutation/snippets.test.ts`

**Context:** The canonical resolvers currently live as `const OMNIJS_PARSE_FOLDER_PATH`, `OMNIJS_RESOLVE_FOLDER_PATH`,
`OMNIJS_RESOLVE_FOLDER_FLEXIBLE`, `OMNIJS_PARSE_TAG_PATH`, `OMNIJS_RESOLVE_OR_CREATE_TAG_PATH` in
`mutation-script-builder.ts` (~lines 450–547). This task makes the registry the single source and re-points the existing
consts at it so output stays **byte-identical** (other builders still consume the consts; their tests guard against
drift). `resolveFolderFlexible` depends on `parseFolderPath` + `resolveFolderPath` — encode that.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/contracts/ast/mutation/snippets.test.ts
import { describe, it, expect } from 'vitest';
import { SNIPPETS, collectSnippets } from '../../../../../src/contracts/ast/mutation/snippets.js';

describe('snippet registry', () => {
  it('exposes the flexible folder resolver source', () => {
    expect(SNIPPETS.resolveFolderFlexible.source).toContain('function resolveFolderFlexible');
  });
  it('collectSnippets pulls declared deps + their transitive deps, deduped, in dependency order', () => {
    const out = collectSnippets(['resolveFolderFlexible']);
    // resolveFolderFlexible depends on parseFolderPath + resolveFolderPath
    expect(out).toContain('function parseFolderPath');
    expect(out).toContain('function resolveFolderPath');
    expect(out).toContain('function resolveFolderFlexible');
    // dependencies are defined before the dependent
    expect(out.indexOf('function parseFolderPath')).toBeLessThan(out.indexOf('function resolveFolderFlexible'));
  });
  it('deduplicates a snippet requested twice', () => {
    const out = collectSnippets(['resolveFolderFlexible', 'resolveFolderFlexible']);
    expect(out.match(/function resolveFolderFlexible/g)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run** `npx vitest tests/unit/contracts/ast/mutation/snippets.test.ts --run` → FAIL (module missing).

- [ ] **Step 3: Implement.** Move the five resolver source strings verbatim into the registry, declare deps, write
      `collectSnippets` (topological, deduped). Then in `mutation-script-builder.ts` redefine the consts as
      `const OMNIJS_RESOLVE_FOLDER_FLEXIBLE = SNIPPETS.resolveFolderFlexible.source;` etc. (byte-identical).

```typescript
// src/contracts/ast/mutation/snippets.ts
export interface Snippet {
  readonly source: string;
  readonly deps: readonly string[];
}

// Sources lifted verbatim from mutation-script-builder.ts (OMN-127 consolidation).
const parseFolderPath = `\nfunction parseFolderPath(input) { /* ...verbatim... */ }`;
const resolveFolderPath = `\nfunction resolveFolderPath(segments) { /* ...verbatim... */ }`;
const resolveFolderFlexible = `\nfunction resolveFolderFlexible(target) { /* ...verbatim... */ }`;
const parseTagPath = `\nfunction parseTagPath(input) { /* ...verbatim... */ }`;
const resolveOrCreateTagByPath = `\nfunction resolveOrCreateTagByPath(segments) { /* ...verbatim... */ }`;

export const SNIPPETS: Record<string, Snippet> = {
  parseFolderPath: { source: parseFolderPath, deps: [] },
  resolveFolderPath: { source: resolveFolderPath, deps: [] },
  resolveFolderFlexible: { source: resolveFolderFlexible, deps: ['parseFolderPath', 'resolveFolderPath'] },
  parseTagPath: { source: parseTagPath, deps: [] },
  resolveOrCreateTagByPath: { source: resolveOrCreateTagByPath, deps: ['parseTagPath'] },
};

export function collectSnippets(keys: readonly string[]): string {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    const snip = SNIPPETS[key];
    if (!snip) throw new Error(`Unknown snippet: ${key}`);
    snip.deps.forEach(visit); // deps first → dependency order
    ordered.push(snip.source);
  };
  keys.forEach(visit);
  return ordered.join('\n');
}
```

> IMPORTANT: copy the snippet bodies **verbatim** from the current consts. After re-pointing the consts, run the
> existing folder/tag builder tests to prove byte-identical output:
> `npx vitest tests/unit/contracts/ast/folder-builders.test.ts tests/unit/contracts/ast/mutation-script-builder.test.ts --run`

- [ ] **Step 4: Run** the new test + the existing folder/mutation tests → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/snippets.ts src/contracts/ast/mutation-script-builder.ts tests/unit/contracts/ast/mutation/snippets.test.ts
git commit -m "feat(OMN-128): single-source OmniJS snippet registry; re-point OMN-127 resolver consts"
```

---

## Task 3: Expression emitter (incl. the `Json` injection guarantee)

**Files:**

- Create: `src/contracts/ast/mutation/emitter.ts`
- Test: `tests/unit/contracts/ast/mutation/emitter.test.ts`

- [ ] **Step 1: Write the failing test** (expression cases + the injection-safety property)

```typescript
// tests/unit/contracts/ast/mutation/emitter.test.ts
import { describe, it, expect } from 'vitest';
import { emitExpr } from '../../../../../src/contracts/ast/mutation/emitter.js';
import { ref, member, newExpr, enumRef, dateExpr, json } from '../../../../../src/contracts/ast/mutation/types.js';

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
    // The emitted text is a JS literal that evaluates back to the original string.
    // eslint-disable-next-line no-eval
    expect(eval(emitted)).toBe(hostile);
  });
});
```

- [ ] **Step 2: Run** → FAIL (module missing).

- [ ] **Step 3: Implement `emitExpr`.**

```typescript
// src/contracts/ast/mutation/emitter.ts  (part 1 of 3)
import type { Expr } from './types.js';

export function emitExpr(node: Expr): string {
  switch (node.type) {
    case 'ref':
      return node.name;
    case 'member':
      return `${emitExpr(node.object)}.${node.path}`;
    case 'new':
      return `new ${node.className}(${node.args.map(emitExpr).join(', ')})`;
    case 'enumRef':
      return node.path;
    case 'dateExpr':
      return `new Date(${emitExpr(node.value)})`;
    case 'json':
      return JSON.stringify(node.value); // the ONLY data crossing; injection-proof
    default: {
      const _exhaustive: never = node;
      throw new Error(`Unknown expr node: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(OMN-128): mutation AST expression emitter (Json = injection-safe data boundary)`

---

## Task 4: Statement + program emitter

**Files:**

- Modify: `src/contracts/ast/mutation/emitter.ts`
- Test: `tests/unit/contracts/ast/mutation/emitter.test.ts`

**Statement emission contract:**

| Node                             | Emits (OmniJS)                                                                                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bind`                           | `const <name> = <expr>;`                                                                                                                                                                                                |
| `resolveFolder`                  | `const <bind> = resolveFolderFlexible(<json(ref)>);` (declares `resolveFolderFlexible` dep)                                                                                                                             |
| `guard`                          | `if (<cond>) return JSON.stringify(<envelope>);`                                                                                                                                                                        |
| `constructProject`               | `const <bind> = new Project(<name>, <folderExpr>);` where folderExpr = the resolved var for `resolved`, or omitted (1-arg `new Project(<name>)`) for `none`. `notFound` is illegal here (validator + Guard precede it). |
| `setProp` (`direct`)             | `<target>.<prop> = <value>;`                                                                                                                                                                                            |
| `setProp` (`dateExpr`)           | `try { <target>.<prop> = <value>; } catch (e) {}` (value is a `dateExpr`)                                                                                                                                               |
| `setProp` (`enum`)               | `<target>.<prop> = <value>;` (value is an `enumRef`)                                                                                                                                                                    |
| `setProp` (`readModifyReassign`) | emit the reviewInterval read-modify-reassign block (see Task 7 for the exact body)                                                                                                                                      |
| `assignTags`                     | a `for` loop over `<tags>` calling `resolveOrCreateTagByPath`/find then `<target>.addTag(tag)` (declares `resolveOrCreateTagByPath` dep)                                                                                |
| `return`                         | `return JSON.stringify(<envelope>);`                                                                                                                                                                                    |

`emitProgram(program)` assembles: `(() => {` + injected snippets (`collectSnippets(program.snippetDeps)`) + statements

- `})()`. Envelopes emit as `{ key: <emitExpr(value)>, ... }`.

* [ ] **Step 1: Write the failing test** (small representative program)

```typescript
import { emitProgram } from '../../../../../src/contracts/ast/mutation/emitter.js';
import {
  bind,
  constructProject,
  setProp,
  return_,
  ref,
  json,
  member,
} from '../../../../../src/contracts/ast/mutation/types.js';

it('emitProgram assembles an OmniJS IIFE with statements', () => {
  const program = {
    context: 'create_project',
    snippetDeps: [],
    statements: [
      constructProject('proj', json('P'), { kind: 'none' }),
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
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** implement `emitStmt` + `emitProgram` per the table. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(OMN-128): mutation AST statement + program emitter`

---

## Task 5: JXA launcher boundary (`JSON.stringify(program)`) — the OMN-111/113 kill

**Files:**

- Modify: `src/contracts/ast/mutation/emitter.ts`
- Test: `tests/unit/contracts/ast/mutation/emitter.test.ts`

This is the load-bearing safety test. `wrapInLauncher(omnijs, context)` returns the fixed JXA launcher with the **whole
OmniJS program JSON.stringify'd** into the `evaluateJavascript` argument.

- [ ] **Step 1: Write the failing test**

```typescript
import { wrapInLauncher } from '../../../../../src/contracts/ast/mutation/emitter.js';

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
    // Extract the JSON string literal passed to evaluateJavascript and confirm it round-trips.
    const m = jxa.match(/app\.evaluateJavascript\((".*?")\);/s);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toBe(hostile); // the program is delivered byte-for-byte
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.**

```typescript
// src/contracts/ast/mutation/emitter.ts  (part 3 of 3)
export function wrapInLauncher(omnijsProgram: string, context: string): string {
  // The whole OmniJS program is escaped ONCE via JSON.stringify into a JXA string literal.
  // No nested backticks; no escapeTemplateString. Handles every quote/backslash/newline/control char.
  return `(() => {
  const app = Application('OmniFocus');
  try {
    return app.evaluateJavascript(${JSON.stringify(omnijsProgram)});
  } catch (e) {
    return JSON.stringify({ error: true, message: String(e), context: ${JSON.stringify(context)} });
  }
})()`;
}
```

- [ ] **Step 4: Run** → PASS. Note the round-trip assertion is the structural proof OMN-111/113 cannot recur here.
- [ ] **Step 5: Commit** `feat(OMN-128): JXA launcher boundary via JSON.stringify(program) — kills OMN-111/113 class`

---

## Task 6: Validator

**Files:**

- Create: `src/contracts/ast/mutation/validator.ts`
- Test: `tests/unit/contracts/ast/mutation/validator.test.ts`

**Rules:** (1) last statement is `return`; (2) every `constructProject.folder` is a `FolderResolution` object (not a
string) — enforced by the type system, but the validator guards against hand-built `as any` trees; (3) any
`constructProject` with `folder.kind === 'notFound'` must be preceded by a `guard` (notFound is unconstructable); (4)
program declares snippet deps actually used.

- [ ] **Step 1: failing test**

```typescript
// tests/unit/contracts/ast/mutation/validator.test.ts
import { describe, it, expect } from 'vitest';
import { validateMutationProgram } from '../../../../../src/contracts/ast/mutation/validator.js';
import { constructProject, setProp, return_, ref, json } from '../../../../../src/contracts/ast/mutation/types.js';

const ok = {
  context: 'create_project',
  snippetDeps: [],
  statements: [constructProject('proj', json('P'), { kind: 'none' }), return_({ created: json(true) })],
};

describe('validateMutationProgram', () => {
  it('accepts a well-formed program', () => expect(() => validateMutationProgram(ok)).not.toThrow());
  it('rejects a program that does not end in return', () => {
    const bad = { ...ok, statements: [constructProject('proj', json('P'), { kind: 'none' })] };
    expect(() => validateMutationProgram(bad)).toThrow(/must end in a return/i);
  });
  it('rejects a constructProject whose folder is a raw string', () => {
    const bad = {
      ...ok,
      statements: [
        { ...constructProject('proj', json('P'), { kind: 'none' }), folder: 'Work' as any },
        return_({ created: json(true) }),
      ],
    };
    expect(() => validateMutationProgram(bad)).toThrow(/folder.*resolution/i);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** implement the rules. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(OMN-128): mutation program validator (return-terminated, typed folder resolution)`

---

## Task 7: create/project lowering + guarded `MUTATION_DEFS` dispatch

**Files:**

- Create: `src/contracts/ast/mutation/defs.ts`
- Create: `src/contracts/ast/mutation/index.ts`
- Test: `tests/unit/contracts/ast/mutation/create-project.test.ts`

**`buildCreateProjectProgram(data: ProjectCreateData): Program`** assembles (in order):

1. `resolveFolder('targetFolder', data.folder)` — **only if** `data.folder` set; declares `resolveFolderFlexible` dep.
2. `guard('targetFolder === null', { error: json(true), message: json('Folder not found: ' + data.folder), context: json('create_project') })`
   — the OMN-127 loud failure; only when a folder was requested.
3. `constructProject('proj', json(data.name), folderResolution)` where folderResolution =
   `{kind:'resolved',var:'targetFolder'}` if folder requested else `{kind:'none'}`.
4. `setProp(proj,'note', json(data.note ?? ''))`, `flagged`, `sequential` (direct) — match current defaults.
5. date setters (`strategy: 'dateExpr'`) for due/defer/planned when present.
6. status (`strategy: 'enum'`, value `enumRef(Project.Status.X)`) only when `status && status !== 'active'`.
7. reviewInterval (`strategy: 'readModifyReassign'`) when present — emit the exact days→unit/steps +
   read-modify-reassign body from the current builder (`mutation-script-builder.ts` ~lines 1145–1167).
8. tags (`assignTags`, declares `resolveOrCreateTagByPath` dep) when present.
9. `return_` success envelope reading back `proj.id.primaryKey`, `proj.name`, etc. **No `.id()` JXA dance** — direct
   OmniJS property read.

**`MUTATION_DEFS` dispatch** wires the build-time guard non-bypassably:

```typescript
// src/contracts/ast/mutation/defs.ts (dispatch shape)
import { validateProjectCreate } from '../mutation-script-builder.js'; // or relocate guard; see note
interface MutationDef<T> {
  guard: (data: T) => void;
  build: (data: T) => Program;
}
export const MUTATION_DEFS = {
  'create/project': {
    guard: validateProjectCreate,
    build: buildCreateProjectProgram,
  } as MutationDef<ProjectCreateData>,
};
export function dispatchMutation<T>(key: keyof typeof MUTATION_DEFS, data: T): Program {
  const def = MUTATION_DEFS[key] as unknown as MutationDef<T>;
  def.guard(data); // build-time sandbox guard — cannot be skipped for a registered op
  return def.build(data);
}
```

> Note: `validateProjectCreate` is currently `function`-scoped (not exported) in `mutation-script-builder.ts`. Export it
> (or move it to a small `guards.ts`) so the registry can reference it. Keep its body unchanged.

- [ ] **Step 1: failing test**

```typescript
// tests/unit/contracts/ast/mutation/create-project.test.ts
import { describe, it, expect } from 'vitest';
import { buildCreateProjectProgram, dispatchMutation } from '../../../../../src/contracts/ast/mutation/defs.js';

describe('buildCreateProjectProgram', () => {
  it('no folder → constructProject with folder kind none, no resolveFolder/guard', () => {
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
});

describe('dispatchMutation guard (OMN-119/120 non-bypass)', () => {
  it('calls the sandbox guard before building', () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      expect(() => dispatchMutation('create/project', { name: 'P', folder: 'NotSandbox' })).toThrow(/TEST GUARD/);
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** implement `defs.ts` (+ export `validateProjectCreate`) + `index.ts`. **Step 4:
      Run** → PASS.
- [ ] **Step 5: Commit** `feat(OMN-128): create/project lowering + guarded MUTATION_DEFS dispatch`

---

## Task 8: Wire `buildCreateProjectScript` to the new pipeline

**Files:**

- Modify: `src/contracts/ast/mutation-script-builder.ts` (`buildCreateProjectScript` body)
- Modify: `tests/unit/contracts/ast/mutation-script-builder.test.ts`

- [ ] **Step 1: Update the existing test** to the new output. Keep contract assertions; replace JXA-scaffolding
      assertions. The current tests assert `script.toContain("Application('OmniFocus')")` (still true — launcher),
      `toContain('Test Project')` (still true — but now inside the JSON-encoded program), `operation==='create'`,
      `target==='project'` (unchanged). Add: the script contains `app.evaluateJavascript(` and `new Project(`. Remove
      any assertion that depended on the old JXA `app.Project({...})` literal.

      > Review **all six** `buildCreateProjectScript` sub-tests, not just the first. Most survive because their data
      > now appears inside the JSON-encoded program (`toContain('on_hold')`, `toContain('reviewInterval')`,
      > `toContain('Work Folder')`). But `includes sequential flag` (asserts `toContain('sequential')`) and the OMN-38
      > regression guards (which assert the **absence** of specific JXA patterns) target the old scaffolding — re-read
      > each and adjust any whose assertion was about removed JXA, keeping the OMN-38 *intent* (no
      > seconds-conversion / plain-object / constructor reviewInterval patterns) expressed against the new OmniJS body.

```typescript
// adjust within describe('buildCreateProjectScript', ...)
it('emits an OmniJS-native create via the launcher boundary', () => {
  const result = buildCreateProjectScript({ name: 'Test Project' });
  expect(result.operation).toBe('create');
  expect(result.target).toBe('project');
  expect(result.script).toContain("Application('OmniFocus')");
  expect(result.script).toContain('app.evaluateJavascript(');
  expect(result.script).toContain('Test Project'); // present as JSON data inside the program
  expect(result.script).toContain('new Project(');
});
```

- [ ] **Step 2: Run** the file → FAIL (old body still emits old output / new assertions unmet).

- [ ] **Step 3: Replace the body** of `buildCreateProjectScript`:

```typescript
export function buildCreateProjectScript(data: ProjectCreateData): GeneratedMutationScript {
  const program = dispatchMutation('create/project', data); // runs validateProjectCreate (guard) + builds
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  const script = wrapInLauncher(omnijs, program.context);
  return { script: script.trim(), operation: 'create', target: 'project', description: `Create project: ${data.name}` };
}
```

Remove the old template-string body and the now-unused `buildProjectDataObject` **only if** nothing else references it
(grep first — it may be shared). Leave `OMNIJS_*` consts (still consumed by un-migrated builders; now sourced from the
registry).

- [ ] **Step 4: Run** the file → PASS. Then run the whole AST suite to catch collateral:
      `npx vitest tests/unit/contracts/ast --run` → all PASS.
- [ ] **Step 5: Commit**
      `refactor(OMN-128): buildCreateProjectScript emits from the mutation AST (template body deleted)`

---

## Task 9: Full unit suite + typecheck + lint (automated gate)

- [ ] **Step 1:** `npm run build` → no TS errors (exhaustiveness guards compile).
- [ ] **Step 2:** `npm run test:unit` → all PASS (note count from output; do not hardcode).
- [ ] **Step 3:** `npm run lint` → clean (the one `eval` in the emitter test needs the inline
      `// eslint-disable-next-line no-eval`).
- [ ] **Step 4: Commit** any lint/type fixups: `chore(OMN-128): typecheck + lint clean for mutation AST slice`

---

## Task 10: LIVE `/verify` at the OmniFocus seam (mandatory human/agent gate)

> REQUIRED SUB-SKILL: @superpowers:verification-before-completion. This is the OMN-125 trap guard — string tests passing
> does NOT prove the generated OmniJS runs. Do NOT mark the slice complete without this.

- [ ] **Step 1:** Rebuild: `npm run build`.
- [ ] **Step 2:** Through the live MCP (OmniFocus running, sandbox configured), create a project that exercises every
      branch, **inside the sandbox folder** the guard requires:
  - `omnifocus_write { mutation: { operation: 'create', target: 'project', data: { name: '__test- AST slice', folder: '<SANDBOX_FOLDER_NAME>', tags: ['__test-ast'], dueDate: '2026-06-30', flagged: true, sequential: true, status: 'on_hold', reviewInterval: 7 } } }`
  - Also run a second case with `reviewInterval: 1` (and no other review-bearing fields) to exercise the `days` fallback
    branch — `reviewInterval: 7` only covers the `% 7 === 0` weekly branch.
- [ ] **Step 3: Confirm by reading back** (not by trusting the success envelope):
  - project exists in the sandbox folder (folder placement correct);
  - tags applied; due date set; flagged + sequential; status on-hold; review interval = weekly;
  - returned `projectId` is a real `id.primaryKey` (resolvable by a follow-up read).
- [ ] **Step 4: Confirm the two unknowns the spec flagged:**
  - **root placement:** separately create `{ name: '__test- root', ... }` with **no folder** and confirm
    `new Project(name)` lands it where the old builder did (DB root). If OmniJS 1-arg `new Project` does not place at
    root, adjust `constructProject` emission (`none` → `new Project(name, library.ending)` or equivalent) and re-verify.
  - **folder-not-found:** create with `folder: '__nonexistent__'` and confirm the loud error envelope
    (`Folder not found: …`), NOT a silent root-file (the OMN-127 property).
- [ ] **Step 5:** Delete the sandbox test projects. Record the verify result (what was run, what was observed) in the PR
      description.

---

## Task 11: PR + review gate

- [ ] **Step 1:** Push branch; open PR against `kip-d/omnifocus-mcp` (NOT any upstream fork). PR body: link the spec,
      summarize the slice, paste the Task 10 live-verify observations, note the spec deviation (build-time guard at
      dispatch vs. emitted node).
- [ ] **Step 2:** Run a code-review subagent (@superpowers:requesting-code-review). Gate merge on Safe/Approved.
- [ ] **Step 3:** `git pull --rebase` then `gh pr merge --squash --auto` (never `--admin`).
- [ ] **Step 4:** Comment on OMN-128 with the slice result + what it implies for sizing the remaining builders (the next
      plan).

---

## Definition of done (this slice)

- New `src/contracts/ast/mutation/` subsystem exists with types/snippets/emitter/validator/defs + unit tests.
- `buildCreateProjectScript` emits one OmniJS program via the launcher; its template-string body is gone.
- The boundary test proves a hostile program round-trips (OMN-111/113 structurally impossible at this seam).
- Folder resolution is typed fail-able (`Folder | NotFound | NoneRequested`); not-found fails loud (OMN-127 property).
- The sandbox guard runs via `MUTATION_DEFS` dispatch and cannot be bypassed (OMN-119/120 property).
- Live `/verify` passed and is recorded in the PR.
- Other builders untouched; snippet registry is the single source for the OMN-127 resolvers.

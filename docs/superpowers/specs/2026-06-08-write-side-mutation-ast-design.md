# Design: OmniJS-native write-side mutation-statement AST

**Ticket:** OMN-128 (expanded in place — see "Scope" below) **Date:** 2026-06-08 **Status:** Design — pending spec
review + implementation plan **Supersedes the write-side portion of:**
`docs/plans/2025-11-24-ast-filter-contracts-design.md` (read-side AST; this mirrors it)

---

## 1. Problem

`src/contracts/ast/` contains a real AST + emitter pipeline, but it is used **only on the read side**
(`TaskFilter → FilterAST → emit OmniJS/JXA`). The write side (`mutation-script-builder.ts`,
`tag-mutation-script-builder.ts`) is still **template-string codegen**: a `script` string assembled from JS template
literals with ~40 `${...}` interpolations and hand-written nested OmniJS backtick blocks.

This re-incurs two bug classes on every new write path:

| Class                           | Evidence                                                                                         | Today's only backstop        |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------- |
| **String-injection / escaping** | Shipped twice: OMN-111, OMN-113 (stray backticks broke `evaluateJavascript` bodies)              | Hand-review + live `/verify` |
| **Logic duplication / drift**   | OMN-127: three hand-copied folder resolvers had diverged (one silent-root-filed, one path-blind) | Hand-consolidation           |

A third, structural issue compounds both: the write side never adopted the repo's **own** documented OmniJS-First
standard (`docs/dev/OMNIJS-FIRST-PATTERN.md`, 2025-11-27). It runs as a JXA shell with **28 `evaluateJavascript`
bridge-islands** (5 in `buildCreateProjectScript` alone). Each island is a nested backtick block — i.e. the injection
hazard _is_ the architecture.

## 2. What this fixes — and what it does not

| Hardened (structural)                                                    | NOT addressed                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Injection/escaping (OMN-111/113) — _by construction_                     | Semantic/control-flow defects (an emitter faithfully emits whatever semantics it is given) |
| Resolver drift (OMN-127 mechanism) — single-source nodes                 | —                                                                                          |
| Sandbox-guard bypass (OMN-119/120) — validator _requires_ the guard node | —                                                                                          |

OMN-127's headline defect was **semantic** (a conflated `else` treating "not found" as "no folder"). An emitter would
not have _fixed_ it — but the typed-fail-able resolution model in this design (§5) would have made the conflation
**unrepresentable**, surfacing it sooner. That is the contingent benefit, and it is a hard design requirement, not a
hope.

## 3. Design principle: mirror the read side at the _mutation altitude_

The read side's real architectural move was **picking the substrate at the abstraction the domain naturally has**.
Filters _are_ boolean algebra, so:

| Read-side layer        | Concretely                                                                                     | File                 |
| ---------------------- | ---------------------------------------------------------------------------------------------- | -------------------- |
| Substrate (node set)   | boolean algebra: `and / or / not / comparison / exists / literal`                              | `types.ts`           |
| Domain → node lowering | data-driven registry `FILTER_DEFS` / `DATE_FILTER_DEFS` (`build(filter) → FilterNode \| null`) | `builder.ts`         |
| Hard-case escape hatch | `SYNTHETIC_FIELD_DEFS` — custom emitter fn keyed by field name                                 | `types.ts`           |
| Validator              | `KNOWN_FIELDS` derived from the registry; static analysis                                      | `validator.ts`       |
| Emitter                | walks generic nodes → `{ preamble, predicate }`                                                | `emitters/omnijs.ts` |

**The natural algebra of OmniFocus mutations is `resolve → construct → set → place → assign → envelope`.** The write
side mirrors the read side's four layers, pitched at that altitude — generic-enough to compose, domain-aware-enough that
the validator and typed resolution are natural. This is deliberately **not** a generic ESTree-style JS printer (too low
— we would be rebuilding a JS code generator), and **not** one-node-per-operation (too rigid).

This decision is documented because it has live alternatives: a pure-generic ESTree-lite substrate (rejected:
re-implements a JS printer, makes typed-fail-able resolution a convention not a type) and a domain-node-only AST
(rejected: each new operation needs a new node type + emitter case; least "typical AST").

## 4. Execution model: OmniJS-native, one program, data-free JXA launcher

Each mutation emits **one OmniJS program**, wrapped in a fixed, **data-free** JXA launcher:

```javascript
(() => {
  const app = Application('OmniFocus');
  try {
    return app.evaluateJavascript(<<< JSON.stringify(omnijsProgram) >>>);
  } catch (e) {
    return JSON.stringify({ error: true, message: String(e), context: '<op>' });
  }
})()
```

The `<<< … >>>` is a placeholder the emitter fills with `JSON.stringify(programString)`. The OmniJS program is a
**string**; that string is `JSON.stringify`'d into a JXA string literal which `evaluateJavascript` receives — a single,
deliberate double-encoding (data is already JSON _inside_ the program; the program is JSON _again_ into JXA). The
pseudocode is not passing an object.

Two boundaries, both owned by the emitter, both `JSON.stringify`:

| Boundary                        | Mechanism                                                      | Property                                                                                            |
| ------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| TS → OmniJS **data**            | `Json` node → `JSON.stringify(value)`                          | only data primitive; no node carries an inline-quoted string                                        |
| OmniJS **program** → JXA string | emitter wraps whole program once via `JSON.stringify(program)` | valid escaped JS string literal — injection-proof, human-readable in emitted JXA, no size inflation |

**Consequences.** Zero hand-written nested backticks remain → OMN-111/113 gone by construction. OmniJS typed APIs are
used directly (`new Project(name, folder)`, `new Tag(name, parent)`, `addTag`, `Project.Status.OnHold`, real
`try/catch`). The OMN-28 `.id()` transient-id dance **deletes** — `obj.id.primaryKey` reads correctly on a
freshly-created object in OmniJS.

> Decision (escape mechanism): `JSON.stringify(program)` over (a) base64+atob and (b) the read side's current mechanism.
> Base64 is maximally quote-free but inflates ~33% (matters near the 261 KB OmniJS-bridge limit for batch ops) and
> renders the emitted JXA opaque. `JSON.stringify` is the proven safe pattern for **data leaves** and stays debuggable.
>
> **The read side is NOT the model to mirror at this boundary — it is the cautionary tale.** The read path
> (`list-tasks-ast.ts`) crosses the same JXA→OmniJS boundary via a **nested backtick template literal** escaped by a
> hand-rolled 3-replace helper, `escapeTemplateString` (`bridge-escape.ts`): `s.replace(/\\/g,'\\\\').replace(/` +
> "`" + `/g,'\\` + "`" + `').replace(/\${/g,'\\${')`. That is the exact nested-backtick + hand-escaper mechanism behind
> OMN-111/113. Its own sibling comment warns it **does not handle newlines** — requiring a separate
> `sanitizeForScriptComment` patch for control chars. The read side has avoided the bug only because its program body
> carries no newline-bearing user data; the exposure is **latent, not absent**.
>
> `JSON.stringify(program)` deletes the nested backtick entirely (no `escapeTemplateString` dependency) and escapes
> every quote / backslash / newline / control char / unicode per the JS spec. So "mirror the read side" applies to the
> AST _layering_ (§3), not to this boundary, where we deliberately diverge to a strictly safer mechanism.
>
> _Follow-up (out of scope here) — filed as **OMN-129**:_ the read side still carries the latent `escapeTemplateString`
> exposure. Once this write-side boundary is proven, OMN-129 retrofits the read path to the same `JSON.stringify`
> boundary and retires `escapeTemplateString`.

## 5. The node set (substrate)

A `Program` is an ordered list of statements emitted into one OmniJS IIFE.

**Statements**

| Node                                                | Emits                                 | Notes                                                                                                             |
| --------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Bind { name, expr }`                               | `const <name> = <expr>;`              | binds results for later `Ref`                                                                                     |
| `ResolveFolder { ref } → FolderResolution`          | canonical resolver call               | result type: `Folder \| NotFound \| NoneRequested` (three named states)                                           |
| `ResolveTag { ref }` / `ResolveOrCreateTag { ref }` | canonical tag resolver call           | mkdir-p semantics for create variant                                                                              |
| `SetProp { target, prop, value, strategy }`         | property assignment                   | `strategy ∈ direct \| dateExpr \| enum \| readModifyReassign` — SETTER-PATTERNS as typed dispatch                 |
| `Place { project, folderResolution }`               | push into resolved folder **or** root | consumes a `FolderResolution`, **never a string**; on `NotFound` emits the loud error envelope, never a root push |
| `AssignTags { target, tagResolutions }`             | `target.addTag(...)` per tag          |                                                                                                                   |
| `Guard { cond, errorEnvelope }`                     | `if (cond) return <err>;`             | early-return                                                                                                      |
| `SandboxGuard`                                      | test-mode guard                       | **validator requires it on every write program**                                                                  |
| `Return { envelope }`                               | `return JSON.stringify({...});`       | success or error envelope                                                                                         |

**Expressions**

`Ref { name }` · `Member { obj, path }` (`proj.id.primaryKey`) · `Call { callee, args }` · `New { class, args }`
(`new Project(name, folder)`) · `EnumRef { path }` (`Project.Status.OnHold`) · `DateExpr { value }` (`new Date("...")`)
· **`Json { value }`** — the only TS→OmniJS data primitive.

**Typed-fail-able resolution (hard requirement).** `Place` and `AssignTags` consume _resolved_ results, not strings.
`ResolveFolder` yields three **named** states; "no folder requested" (`NoneRequested`) and "requested but missing"
(`NotFound`) are distinct constructor inputs. OMN-127's conflated `else` cannot be expressed.

Tag resolution carries the same discipline, split by intent:

| Node                             | Result type            | On missing                        |
| -------------------------------- | ---------------------- | --------------------------------- |
| `ResolveOrCreateTag { ref }`     | always `Tag` (mkdir-p) | cannot fail — creates the segment |
| `ResolveTag { ref }` (read-only) | `Tag \| NotFound`      | surfaced to the build site        |

`AssignTags` consumes resolved `Tag` results only. For the current create-or-find behavior (project/task create) every
entry resolves via `ResolveOrCreateTag`, so `AssignTags` can never receive a missing tag. Where a read-only `ResolveTag`
is used, the `NotFound` policy (skip-with-warning vs. fail-loud) is declared **at the `MUTATION_DEFS` build site**, not
buried in the node — the policy stays visible, mirroring §5's folder rule.

## 6. Lowering registry (mirror of `FILTER_DEFS`)

`MUTATION_DEFS`, keyed by `(operation, target)` → `build(data) → Program` (e.g.
`create/project → buildCreateProjectProgram(data)`). Builders assemble programs via typed helpers (`resolveFolder(ref)`
returns the node + its typed binding). The folder/tag resolution is emitted by **one** node type used everywhere — drift
impossible by construction (the OMN-127 win, made structural).

## 7. Snippet registry (mirror of `SYNTHETIC_FIELD_DEFS`)

The OMN-127 canonical helpers (`parseFolderPath`, `resolveFolderFlexible`, `parseTagPath`, `resolveOrCreateTagByPath`)
become **named library snippets** injected once at program-top when a node declares a dependency on them. One source.
They already exist as `const` strings in `mutation-script-builder.ts`; this lifts them into the registry.

## 8. Validator (mirror of `validator.ts`)

Static checks on each program before emit:

- every program ends in `Return`;
- `Place` consumes a `FolderResolution` (not a string);
- no raw string where a `Json` node is required;
- **a `SandboxGuard` node is present** — structurally closes the OMN-119/120 guard-bypass class (today the guard is a
  hand-call builders can forget).

## 9. Vertical slice + sequencing

**Slice:** `buildCreateProjectScript` end-to-end (it exercises folder resolution + setters + status enum +
reviewInterval read-modify-reassign + tags + id read-back). The OMN-28 `.id()`-matching loop deletes.

The **snippet registry (§7) is stood up during this slice** — the create/project program is the first consumer of
`parseFolderPath` / `resolveFolderFlexible` / `parseTagPath` / `resolveOrCreateTagByPath`. The later tag-builder
migration (`tag-mutation-script-builder.ts`, a separate file with its own snippet copies) **reuses** the registry rather
than re-introducing it; collapsing that duplication is part of the tag-builder PR, not the slice.

**Acceptance for the slice**

- golden snapshot of the emitted OmniJS program + structural assertions;
- validator unit tests (reject: missing `Return`, `Place`-takes-string, missing `SandboxGuard`);
- **live `/verify` at the OmniFocus seam** — mandatory; template→emitter swaps are exactly the "wiring tests pass,
  artifact broken" trap (OMN-125). String-`toContain` tests alone are insufficient;
- behavior-or-byte equivalence vs the current builder's observable result shape.

**Then** migrate in order, deleting template strings as each lands, each its own PR gated on code-review SAFE + live
`/verify`:

`create/project → create/task → create/folder → update/task → update/project → complete → delete → batch → bulk-delete → tag builders`.

## 10. Scope

This expands OMN-128 from "swap write-side codegen to the AST emitter" to "**OmniJS-native write-side re-architecture
via a mutation-statement AST**." The injection + drift hardening the ticket asked for is delivered _by construction_
rather than by retrofitting an emitter onto the JXA-island architecture. OMN-128 is updated in place to reflect this.
The bulk migration is multi-PR; the vertical slice sizes it before scheduling.

## 11. Risks & open questions

| Risk                                                          | Mitigation                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Some write op genuinely needs JXA (not expressible in OmniJS) | Inventory during the slice; OmniJS-First doc claims full coverage and OMN-28/127 evidence favors OmniJS. If a true JXA-only op exists, the launcher node gains a typed escape — but default is OmniJS-native. |
| Script-size limits (261 KB OmniJS bridge) for batch ops       | `JSON.stringify` (no base64 inflation) chosen partly for this; batch builder measured during its migration.                                                                                                   |
| Behavior-equivalence drift during migration                   | golden tests + live `/verify` per builder; one builder per PR.                                                                                                                                                |
| Snippet registry vs tree-shaking / dead snippet injection     | inject a snippet only when a node declares the dependency.                                                                                                                                                    |

## 12. Definition of done (whole effort)

- All write builders emit from `MUTATION_DEFS` programs; no template-string `script` literals remain in
  `mutation-script-builder.ts` / `tag-mutation-script-builder.ts`.
- Emitter owns all quoting; no builder hand-writes an inline-quoted interpolation or a nested backtick.
- Validator requires `SandboxGuard` + `Return`; `Place` is string-unable at the type level.
- Each builder has golden tests + a recorded live `/verify` pass.

// src/contracts/ast/mutation/emitter.ts
// Turns a mutation-AST Program into ONE OmniJS program string, then wraps it in a
// JXA launcher. GENERIC: emits whatever Program it is given. The create/project
// lowering and validator are separate (later) concerns and live elsewhere.
import type { Envelope, Expr, Program, ProjectMovePosition, Stmt, TagMovePosition, TaskMovePosition } from './types.js';
import { collectSnippets, SNIPPETS } from './snippets.js';

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
      return JSON.stringify(node.value);
    case 'raw':
      return node.code;
    default: {
      const _x: never = node;
      throw new Error(`Unknown expr node: ${JSON.stringify(_x)}`);
    }
  }
}

// OMN-137 (no-silent-failures): a best-effort failure executes the partial
// success but loudly announces what failed — the catch records a labeled
// warning into the program-scope `_warnings` array instead of swallowing.
function bestEffortCatch(label: string): string {
  return `catch (e) { _warnings.push(${JSON.stringify(label)} + ': ' + (e && e.message ? e.message : String(e))); }`;
}

// Exhaustive switch with never default — TypeScript enforces completeness as the
// TaskMovePosition union grows (same pattern as FolderResolution handling above).
function emitTaskMovePosition(p: TaskMovePosition): string {
  switch (p.kind) {
    case 'inboxBeginning':
      return 'inbox.beginning';
    case 'projectBeginning':
      return `${p.var}.beginning`;
    case 'parentEnding':
      return `${p.var}.ending`;
    case 'containerRoot':
      return `${p.taskVar}.containingProject ? ${p.taskVar}.containingProject.beginning : inbox.beginning`;
    default: {
      const _x: never = p;
      throw new Error(`Unknown task move position: ${JSON.stringify(_x)}`);
    }
  }
}

// Exhaustive switch with never default — a future third ProjectMovePosition kind
// must be a compile error here, not a silent `.beginning` fallback.
function emitProjectMovePosition(p: ProjectMovePosition): string {
  switch (p.kind) {
    case 'libraryBeginning':
      return 'library.beginning';
    case 'folderBeginning':
      return `${p.var}.beginning`;
    default: {
      const _x: never = p;
      throw new Error(`Unknown project move position: ${JSON.stringify(_x)}`);
    }
  }
}

// Exhaustive switch with never default — a future third TagMovePosition kind
// must be a compile error here, not a silent null fallback.
function emitTagMovePosition(p: TagMovePosition): string {
  switch (p.kind) {
    case 'root':
      return 'null';
    case 'underTag':
      return p.var;
    default: {
      const _x: never = p;
      throw new Error(`Unknown tag move position: ${JSON.stringify(_x)}`);
    }
  }
}

export function emitEnvelope(env: Envelope): string {
  const entries = Object.entries(env).map(([key, value]) => `${key}: ${emitExpr(value)}`);
  return `{ ${entries.join(', ')} }`;
}

export function emitStmt(node: Stmt): string {
  switch (node.type) {
    case 'bind':
      return `const ${node.name} = ${emitExpr(node.expr)};`;
    case 'resolveFolder':
      return `const ${node.bind} = resolveFolderFlexible(${JSON.stringify(node.ref)});`;
    case 'guard': {
      if (node.mode === 'throw') {
        // Batch items fail per-item: the throw is caught by the enclosing
        // batchItem try/capture. LOUD build-time failure when `message` is
        // absent — emitting `throw new Error(undefined)` would silently degrade
        // the per-item error text. (The validator enforces presence too —
        // belt and suspenders; this keeps the emitter safe standalone.)
        const message = node.envelope.message;
        if (!message) {
          throw new Error('guard with mode="throw" requires an envelope.message (it becomes the thrown Error text)');
        }
        return `if (${node.cond}) throw new Error(${emitExpr(message)});`;
      }
      return `if (${node.cond}) return JSON.stringify(${emitEnvelope(node.envelope)});`;
    }
    case 'constructProject': {
      const name = emitExpr(node.name);
      switch (node.folder.kind) {
        case 'resolved':
          return `const ${node.bind} = new Project(${name}, ${node.folder.var});`;
        case 'none':
          return `const ${node.bind} = new Project(${name});`;
        case 'notFound':
          throw new Error(
            'constructProject with folder.kind="notFound" is illegal — it must be Guarded earlier (validator enforces this).',
          );
        default: {
          const _x: never = node.folder;
          throw new Error(`Unknown folder resolution: ${JSON.stringify(_x)}`);
        }
      }
    }
    case 'constructFolder': {
      // Near-clone of constructProject at the folder altitude. `new Folder(name,
      // parentFolder)` appends inside the parent (OmniJS position param), matching
      // the legacy `targetParent.folders.push(folder)`; omitted position = library
      // root. `const`, not `var`: folders have no batch path, so no cross-item
      // hoisting concern (contrast constructTask).
      const name = emitExpr(node.name);
      switch (node.parent.kind) {
        case 'resolved':
          return `const ${node.bind} = new Folder(${name}, ${node.parent.var});`;
        case 'none':
          return `const ${node.bind} = new Folder(${name});`;
        case 'notFound':
          throw new Error(
            'constructFolder with parent.kind="notFound" is illegal — it must be Guarded earlier (validator enforces this).',
          );
        default: {
          const _x: never = node.parent;
          throw new Error(`Unknown folder resolution: ${JSON.stringify(_x)}`);
        }
      }
    }
    case 'setProp': {
      const target = emitExpr(node.target);
      // `bestEffort` wraps the block in try/catch so a failure does not fail the
      // surrounding mutation — and the catch records a labeled warning (OMN-137).
      // The dateExpr strategy ALREADY self-wraps, so it is never double-wrapped here.
      const wrap = (block: string): string =>
        node.bestEffort ? `try { ${block} } ${bestEffortCatch(node.label ?? node.prop)}` : block;
      switch (node.strategy) {
        case 'direct':
          return wrap(`${target}.${node.prop} = ${emitExpr(node.value as Expr)};`);
        case 'dateExpr':
          // Deliberate SWALLOW (spec §3.1), not a bestEffortCatch: an invalid date
          // string produces Invalid Date rather than a throw, so a warning here
          // would be theater — the catch only shields exotic host-object errors.
          return `try { ${target}.${node.prop} = ${emitExpr(node.value as Expr)}; } catch (e) {}`;
        case 'enum':
          return wrap(`${target}.${node.prop} = ${emitExpr(node.value as Expr)};`);
        case 'readModifyReassign': {
          const muts = (node.mutations ?? []).map((m) => `_rmr.${m.prop} = ${emitExpr(m.value)};`).join(' ');
          return wrap(`{ const _rmr = ${target}.${node.prop}; if (_rmr) { ${muts} ${target}.${node.prop} = _rmr; } }`);
        }
        default: {
          const _x: never = node.strategy;
          throw new Error(`Unknown setProp strategy: ${JSON.stringify(_x)}`);
        }
      }
    }
    case 'assignTags': {
      const target = emitExpr(node.target);
      const tags = emitExpr(node.tags);
      // The result binding is declared at PROGRAM scope (a `let`, OUTSIDE any bestEffort
      // try-wrap) because later statements — e.g. the return envelope — consume it. If it
      // were declared inside the try, a thrown best-effort block would leave the consumer
      // referencing an undeclared variable (`ReferenceError`). Only the mutating loop is
      // wrapped. (OMN-128: caught by live /verify. General rule: any bestEffort statement
      // whose binding is consumed later MUST hoist that declaration out of the try.)
      const decl = `let ${node.bind} = [];`;

      // Mode dispatch (slice 4):
      //   absent / 'add':  legacy create-or-find + addTag (original behavior)
      //   'replace':       clearTags() first (inside the best-effort wrap), then add
      //   'remove':        resolve WITHOUT creating, removeTag; missing names silently skipped
      const mode = node.mode;

      let loop: string;
      if (mode === 'remove') {
        // resolve-only: parseTagPath + resolveTagByPath for path names (shared single-source
        // helpers — parseTagPath keeps its empty-segment validation), flattenedTags.find for
        // leaf names. Missing tags are silently skipped (legacy update builder semantics).
        loop = [
          `for (const _tagName of ${tags}) {`,
          '  var _segs = parseTagPath(_tagName);',
          '  var _tag;',
          '  if (_segs) { _tag = resolveTagByPath(_segs); }',
          '  else { _tag = flattenedTags.find(t => t.name === _tagName); }',
          `  if (_tag) { ${target}.removeTag(_tag); ${node.bind}.push(_tag.name); }`,
          '}',
        ].join('\n');
      } else {
        // 'add' or absent: original create-or-find loop
        loop = [
          `for (const _tagName of ${tags}) {`,
          '  var _segs = parseTagPath(_tagName);',
          '  var _tag;',
          '  if (_segs) { _tag = resolveOrCreateTagByPath(_segs); }',
          '  else { _tag = flattenedTags.find(t => t.name === _tagName); if (!_tag) _tag = new Tag(_tagName, null); }',
          `  ${target}.addTag(_tag);`,
          `  ${node.bind}.push(_tag.name);`,
          '}',
        ].join('\n');
      }

      // 'replace' mode: prepend clearTags() INSIDE the best-effort wrap (the whole tag block
      // is best-effort, matching legacy update builder semantics — clearTags + add are one unit).
      const clearLine = mode === 'replace' ? `${target}.clearTags();\n` : '';
      const block = `${clearLine}${loop}`;

      // `bestEffort` wraps only the BLOCK so a tag failure does not fail the surrounding
      // mutation (original best-effort tag bridge semantics) — the binding survives,
      // and the catch records a labeled warning (OMN-137).
      const guardedBlock = node.bestEffort ? `try {\n${block}\n} ${bestEffortCatch(node.label ?? 'tags')}` : block;
      return `${decl}\n${guardedBlock}`;
    }
    case 'return':
      return `return JSON.stringify(${emitEnvelope(node.envelope)});`;
    case 'moveTask': {
      const pos = emitTaskMovePosition(node.position);
      const stmt = `moveTasks([${emitExpr(node.task)}], ${pos});`;
      return node.bestEffort ? `try { ${stmt} } ${bestEffortCatch(node.label ?? 'move')}` : stmt;
    }
    case 'moveProject': {
      const pos = emitProjectMovePosition(node.position);
      const stmt = `moveSections([${emitExpr(node.project)}], ${pos});`;
      return node.bestEffort ? `try { ${stmt} } ${bestEffortCatch(node.label ?? 'folder')}` : stmt;
    }
    case 'callMethod': {
      const call = `${emitExpr(node.target)}.${node.method}(${node.args.map(emitExpr).join(', ')});`;
      return node.bestEffort ? `try { ${call} } ${bestEffortCatch(node.label ?? node.method)}` : call;
    }
    case 'moveTag': {
      const pos = emitTagMovePosition(node.position);
      const move = `moveTags([${emitExpr(node.tag)}], ${pos});`;
      // HARD error envelope on failure (legacy-faithful, spec §3) — errorPrefix is
      // builder-internal constant text; String(e) matches legacy e.toString().
      return `try { ${move} } catch (e) { return JSON.stringify({ error: true, message: ${JSON.stringify(node.errorPrefix)} + String(e) }); }`;
    }
    case 'deleteObject': {
      const call = `deleteObject(${emitExpr(node.target)});`;
      return node.bestEffort ? `try { ${call} } ${bestEffortCatch(node.label ?? 'delete')}` : call;
    }
    case 'bulkDeleteItem': {
      // Ownership split (bulk-delete composition, mirrors batchItem):
      // - `let _deleted = []` and `let _errors = []` are DECLARED at the
      //   emitProgram level when the program contains any bulkDeleteItem —
      //   NOT via bind statements: the validator reserves these names, and
      //   bind emits `const` anyway. This case only READS/WRITES them.
      // - The accumulators are NOT declared here so they stay hoisted to
      //   program scope for the return envelope to consume (same discipline
      //   as `_aborted` and the assignTags binding hoist lesson).
      const idLit = JSON.stringify(node.id);
      const dVar = `_d${node.index}`;
      const nVar = `_n${node.index}`;
      return [
        `const ${dVar} = Task.byIdentifier(${idLit}) || null;`,
        `if (${dVar} === null) {`,
        `  _errors.push({ taskId: ${idLit}, error: "Task not found" });`,
        '} else {',
        '  try {',
        `    const ${nVar} = ${dVar}.name;`,
        `    deleteObject(${dVar});`,
        `    _deleted.push({ id: ${idLit}, name: ${nVar} });`,
        '  } catch (e) {',
        `    _errors.push({ taskId: ${idLit}, error: String(e && e.message ? e.message : e) });`,
        '  }',
        '}',
      ].join('\n');
    }
    case 'resolveProject':
      return `const ${node.bind} = resolveProjectFlexible(${JSON.stringify(node.ref)});`;
    case 'resolveTask':
      return `const ${node.bind} = Task.byIdentifier(${JSON.stringify(node.ref)}) || null;`;
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
    case 'constructTagPath':
      // `_tagPath` is reserved (validator rule 10) — at most one constructTagPath
      // per program (create/tag path form), so a fixed intermediate is safe.
      return [
        `const _tagPath = createTagPath(${emitExpr(node.segments)});`,
        `const ${node.bind} = _tagPath.tag;`,
        `const ${node.createdBind} = _tagPath.created;`,
      ].join('\n');
    case 'resolveProjectById':
      return `const ${node.bind} = Project.byIdentifier(${JSON.stringify(node.ref)}) || null;`;
    case 'constructTask': {
      // `new Task(name)` lands in the inbox; non-inbox containers are placed via
      // moveTasks([t], container.ending). Container resolution failures are
      // guard-handled BEFORE construct (ContainerResolution has no notFound
      // kind), so there is nothing to enforce here.
      // `var`, NOT `const`: inside a batchItem the bind lives in that item's try block,
      // but a later item's tempIdRef (parentTempId chain) must still see it. `var` hoists
      // to the program IIFE scope — same lesson as the assignTags hoist (slice 1).
      const construct = `var ${node.bind} = new Task(${emitExpr(node.name)});`;
      if (node.container.kind === 'inbox') return construct;
      return `${construct}\nmoveTasks([${node.bind}], ${node.container.var}.ending);`;
    }
    case 'batchItem': {
      // Ownership split (batch composition):
      // - `let _aborted = false;` is DECLARED at the emitProgram level
      //   (alongside `let _warnings`) when the program contains a stopOnError
      //   batchItem — NOT via a bind statement: the validator reserves
      //   `_aborted`, and bind emits `const` anyway. The per-item gating
      //   (`if (!_aborted) { ... }`) is ALSO owned by emitProgram, which wraps
      //   each batchItem's emission when any stopOnError batchItem exists.
      //   This case only SETS `_aborted = true` in its catch when stopOnError.
      // - `results` IS declared by the program builder via a bind statement
      //   (deliberately unreserved); batchItem just pushes to it.
      const wVar = `_w${node.index}`;
      const body = node.statements.map(emitStmt).join('\n');
      const ok = `results.push({ tempId: ${JSON.stringify(node.tempId)}, taskId: ${node.taskVar}.id.primaryKey, success: true, warnings: _warnings.slice(${wVar}) });`;
      const fail = `results.push({ tempId: ${JSON.stringify(node.tempId)}, taskId: null, success: false, error: String(e && e.message ? e.message : e), warnings: _warnings.slice(${wVar}) });`;
      // Binding invalidation on failure: the item's `var <taskVar>` may already
      // be assigned (constructTask succeeded, a LATER statement threw — e.g.
      // moveTasks). Because the bind hoists for cross-item tempIdRef chains, a
      // later child's pre-construct guard (`!_t<j>`, prepended by the batch
      // program builder) would otherwise read the stale live binding and the
      // child would silently nest under a FAILED parent while reporting
      // success:true — the silent-partial-failure class. Clearing the binding
      // here makes that guard fire as a loud per-item failure.
      const invalidate = `\n  ${node.taskVar} = undefined;`;
      const abort = node.stopOnError ? '\n  _aborted = true;' : '';
      return `const ${wVar} = _warnings.length;\ntry {\n${body}\n${ok}\n} catch (e) {\n${fail}${invalidate}${abort}\n}`;
    }
    default: {
      const _x: never = node;
      throw new Error(`Unknown stmt node: ${JSON.stringify(_x)}`);
    }
  }
}

// OmniJS bridge limit is 261KB measured (docs/dev/SCRIPT_SIZE_LIMITS.md); 200KB
// leaves launcher + JSON-escape headroom. Loud failure, never silent truncation.
export const EMITTED_PROGRAM_SIZE_LIMIT = 200_000;

export function emitProgram(program: Program): string {
  const snippets = program.snippetDeps.length > 0 ? collectSnippets(program.snippetDeps) : '';
  // Batch scaffolding (owned HERE, not by the program builder): when any
  // batchItem has stopOnError, emitProgram declares `let _aborted = false;`
  // (batchItem's catch assigns it — without the declaration every stopOnError
  // batch program would assign an undeclared variable) and gates EVERY
  // batchItem's emission behind `if (!_aborted) { ... }` so items after a
  // failed stopOnError item never execute. Gating every item (not just
  // stopOnError ones) is the simplest correct shape: `_aborted` only ever
  // flips when a stopOnError item fails, so the gate is a no-op until then.
  const hasStopOnError = program.statements.some((s) => s.type === 'batchItem' && s.stopOnError);
  // Bulk-delete scaffolding (owned HERE, mirrors the _aborted ownership pattern):
  // when any bulkDeleteItem is present, declare `let _deleted = []` and
  // `let _errors = []` at program scope so every item's push lands in the same
  // accumulator and the return envelope can reference them. NOT via bind
  // statements (validator reserves these names; bind emits `const` anyway).
  const hasBulkDelete = program.statements.some((s) => s.type === 'bulkDeleteItem');
  const body = program.statements
    .map((s) => {
      const emitted = emitStmt(s);
      return hasStopOnError && s.type === 'batchItem' ? `if (!_aborted) {\n${emitted}\n}` : emitted;
    })
    .join('\n');
  // `_warnings` is declared UNCONDITIONALLY as the first body line (OMN-137).
  // Conditional declaration would recreate the `appliedTags` ReferenceError class
  // (a later consumer referencing an undeclared binding); one dead `let` is free.
  let decls = hasStopOnError ? 'let _warnings = [];\nlet _aborted = false;' : 'let _warnings = [];';
  if (hasBulkDelete) {
    decls += '\nlet _deleted = [];\nlet _errors = [];';
  }
  const inner = [decls, snippets, body].filter((s) => s.length > 0).join('\n');

  // Snippet-dependency coverage guard (replaces the plan's original validator
  // Rule 4 — enforced HERE because helper usage is implicit in emission, not in
  // the typed tree). If a statement emits a CALL to a known OmniJS helper but
  // its definition is absent from the assembled program, the reference would be
  // undefined at OmniFocus runtime. Catch that at build time instead.
  for (const name of Object.keys(SNIPPETS)) {
    if (body.includes(`${name}(`) && !inner.includes(`function ${name}`)) {
      throw new Error(`Emitted program calls helper "${name}" not present in snippetDeps — declare it`);
    }
  }

  const assembled = `(() => {\n${inner}\n})()`;

  // Size guard: a program over the bridge limit would be silently truncated or
  // rejected at the OmniFocus seam — fail LOUDLY at build time instead.
  if (assembled.length > EMITTED_PROGRAM_SIZE_LIMIT) {
    throw new Error(
      `Emitted program is ${assembled.length} characters, exceeding the ${EMITTED_PROGRAM_SIZE_LIMIT}-character ` +
        'limit — split the batch into smaller chunks.',
    );
  }

  return assembled;
}

// Wraps an OmniJS program string in a JXA launcher. The OmniJS body crosses the
// JXA→OmniJS boundary as a single JSON.stringify'd string literal — no template
// interpolation, no concatenation — which is what kills the OMN-111/113
// backtick/injection class outright.
export function wrapInLauncher(omnijsProgram: string, context: string): string {
  return `(() => {
  const app = Application('OmniFocus');
  try {
    return app.evaluateJavascript(${JSON.stringify(omnijsProgram)});
  } catch (e) {
    return JSON.stringify({ error: true, message: e && e.message ? e.message : String(e), context: ${JSON.stringify(context)} });
  }
})()`;
}

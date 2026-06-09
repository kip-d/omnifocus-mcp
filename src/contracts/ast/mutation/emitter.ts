// src/contracts/ast/mutation/emitter.ts
// Turns a mutation-AST Program into ONE OmniJS program string, then wraps it in a
// JXA launcher. GENERIC: emits whatever Program it is given. The create/project
// lowering and validator are separate (later) concerns and live elsewhere.
import type { Envelope, Expr, Program, Stmt } from './types.js';
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
    case 'guard':
      return `if (${node.cond}) return JSON.stringify(${emitEnvelope(node.envelope)});`;
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
      const loop = [
        `for (const _tagName of ${tags}) {`,
        '  var _segs = parseTagPath(_tagName);',
        '  var _tag;',
        '  if (_segs) { _tag = resolveOrCreateTagByPath(_segs); }',
        '  else { _tag = flattenedTags.find(t => t.name === _tagName); if (!_tag) _tag = new Tag(_tagName, null); }',
        `  ${target}.addTag(_tag);`,
        `  ${node.bind}.push(_tag.name);`,
        '}',
      ].join('\n');
      // `bestEffort` wraps only the LOOP so a tag failure does not fail the surrounding
      // mutation (original best-effort tag bridge semantics) — the binding survives,
      // and the catch records a labeled warning (OMN-137).
      const guardedLoop = node.bestEffort ? `try {\n${loop}\n} ${bestEffortCatch(node.label ?? 'tags')}` : loop;
      return `${decl}\n${guardedLoop}`;
    }
    case 'return':
      return `return JSON.stringify(${emitEnvelope(node.envelope)});`;
    // TODO(OMN-128 Task 5/6): implemented in a later plan task
    case 'resolveProject':
      throw new Error('not implemented: resolveProject');
    // TODO(OMN-128 Task 5/6): implemented in a later plan task
    case 'resolveParentTask':
      throw new Error('not implemented: resolveParentTask');
    // TODO(OMN-128 Task 5/6): implemented in a later plan task
    case 'constructTask':
      throw new Error('not implemented: constructTask');
    // TODO(OMN-128 Task 5/6): implemented in a later plan task
    case 'batchItem':
      throw new Error('not implemented: batchItem');
    default: {
      const _x: never = node;
      throw new Error(`Unknown stmt node: ${JSON.stringify(_x)}`);
    }
  }
}

export function emitProgram(program: Program): string {
  const snippets = program.snippetDeps.length > 0 ? collectSnippets(program.snippetDeps) : '';
  const body = program.statements.map(emitStmt).join('\n');
  // `_warnings` is declared UNCONDITIONALLY as the first body line (OMN-137).
  // Conditional declaration would recreate the `appliedTags` ReferenceError class
  // (a later consumer referencing an undeclared binding); one dead `let` is free.
  const inner = ['let _warnings = [];', snippets, body].filter((s) => s.length > 0).join('\n');

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

  return `(() => {\n${inner}\n})()`;
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

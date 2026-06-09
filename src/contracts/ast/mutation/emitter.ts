// src/contracts/ast/mutation/emitter.ts
// Turns a mutation-AST Program into ONE OmniJS program string, then wraps it in a
// JXA launcher. GENERIC: emits whatever Program it is given. The create/project
// lowering and validator are separate (later) concerns and live elsewhere.
import type { Envelope, Expr, Program, Stmt } from './types.js';
import { collectSnippets } from './snippets.js';

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
    default: {
      const _x: never = node;
      throw new Error(`Unknown expr node: ${JSON.stringify(_x)}`);
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
      switch (node.strategy) {
        case 'direct':
          return `${target}.${node.prop} = ${emitExpr(node.value as Expr)};`;
        case 'dateExpr':
          return `try { ${target}.${node.prop} = ${emitExpr(node.value as Expr)}; } catch (e) {}`;
        case 'enum':
          return `${target}.${node.prop} = ${emitExpr(node.value as Expr)};`;
        case 'readModifyReassign': {
          const muts = (node.mutations ?? []).map((m) => `_rmr.${m.prop} = ${emitExpr(m.value)};`).join(' ');
          return `{ const _rmr = ${target}.${node.prop}; if (_rmr) { ${muts} ${target}.${node.prop} = _rmr; } }`;
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
      return [
        `const ${node.bind} = [];`,
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
    case 'return':
      return `return JSON.stringify(${emitEnvelope(node.envelope)});`;
    default: {
      const _x: never = node;
      throw new Error(`Unknown stmt node: ${JSON.stringify(_x)}`);
    }
  }
}

export function emitProgram(program: Program): string {
  const snippets = program.snippetDeps.length > 0 ? collectSnippets(program.snippetDeps) : '';
  const body = program.statements.map(emitStmt).join('\n');
  const inner = [snippets, body].filter((s) => s.length > 0).join('\n');
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
    return JSON.stringify({ error: true, message: String(e), context: ${JSON.stringify(context)} });
  }
})()`;
}

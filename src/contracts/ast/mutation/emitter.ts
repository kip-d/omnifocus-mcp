// src/contracts/ast/mutation/emitter.ts
// Turns a mutation-AST Program into ONE OmniJS program string, then wraps it in a
// JXA launcher. GENERIC: emits whatever Program it is given. The create/project
// lowering and validator are separate (later) concerns and live elsewhere.
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
      return JSON.stringify(node.value);
    default: {
      const _x: never = node;
      throw new Error(`Unknown expr node: ${JSON.stringify(_x)}`);
    }
  }
}

// src/contracts/ast/mutation/index.ts
// Public surface of the mutation-AST vertical slice (OMN-128).
export * from './types.js';
export { emitExpr, emitEnvelope, emitStmt, emitProgram, wrapInLauncher } from './emitter.js';
export { validateMutationProgram } from './validator.js';
export { buildCreateProjectProgram, MUTATION_DEFS, dispatchMutation } from './defs.js';
export { SNIPPETS, collectSnippets } from './snippets.js';

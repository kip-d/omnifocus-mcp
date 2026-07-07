// src/contracts/ast/mutation/index.ts
// Public surface of the mutation-AST vertical slice (OMN-128).
export * from './types.js';
export {
  emitExpr,
  emitEnvelope,
  emitStmt,
  emitProgram,
  wrapInLauncher,
  EMITTED_PROGRAM_SIZE_LIMIT,
} from './emitter.js';
export { validateMutationProgram, RESERVED_EMITTER_IDENTIFIERS } from './validator.js';
export {
  buildCreateFolderProgram,
  buildCreateProjectProgram,
  buildCreateTaskProgram,
  buildBatchCreateTasksProgram,
  buildUpdateTaskProgram,
  buildUpdateProjectProgram,
  buildCompleteTaskProgram,
  buildCompleteProjectProgram,
  buildDeleteTaskProgram,
  buildDeleteProjectProgram,
  buildBulkDeleteTasksProgram,
  buildCreateTagProgram,
  buildRenameTagProgram,
  buildDeleteTagProgram,
  buildMergeTagsProgram,
  buildNestTagProgram,
  buildUnparentTagProgram,
  buildReparentTagProgram,
  buildMarkProjectReviewedProgram,
  lowerTaskCreate,
  MUTATION_DEFS,
  dispatchMutation,
} from './defs.js';
export type {
  TaskLoweringNames,
  MarkProjectReviewedInput,
  BatchCreateTasksData,
  UpdateTaskInput,
  UpdateProjectInput,
  CompleteTaskInput,
  CompleteProjectInput,
  DeleteTaskInput,
  DeleteProjectInput,
  BulkDeleteTasksInput,
  TagCreateInput,
  TagRenameInput,
  TagDeleteInput,
  TagMergeInput,
  TagNestInput,
  TagUnparentInput,
  TagReparentInput,
} from './defs.js';
export { lowerRepetitionRule } from './repetition.js';
export type { LoweredRepetitionRule } from './repetition.js';
export { SNIPPETS, collectSnippets } from './snippets.js';

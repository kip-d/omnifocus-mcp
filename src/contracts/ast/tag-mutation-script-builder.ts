/**
 * Tag mutation builders — thin dispatch wrappers over the mutation AST.
 *
 * Each export keeps its legacy name (the import seam for OmniFocusWriteTool
 * and the tag unit tests) but is now dispatchMutation -> validateMutationProgram
 * -> emitProgram -> wrapInLauncher, same shape as buildCreateFolderScript.
 *
 * The legacy template bodies, the shared JXA preamble/epilogue, and all four
 * nested-backtick evaluateJavascript islands were DELETED, not migrated
 * (OMN-128 slice 6). Quoting/escaping is emitter-owned: wrapInLauncher passes
 * the whole OmniJS program across the JXA boundary as ONE JSON.stringify'd
 * literal, which kills the OMN-111/113 backtick/injection class structurally.
 * The sandbox guard runs inside dispatchMutation (MUTATION_DEFS guards) and
 * cannot be bypassed; the module-local validateTagMutation is gone.
 */

import type { MutationTarget } from '../mutations.js';
import type { GeneratedMutationScript } from './mutation-script-builder.js';
import { dispatchMutation } from './mutation/defs.js';
import { emitProgram, wrapInLauncher } from './mutation/emitter.js';
import { validateMutationProgram } from './mutation/validator.js';

/**
 * Build a JXA script for creating a tag: flat name, under a parent (by name),
 * or a ' : ' path (find-or-create walk via the createTagPath snippet).
 */
export async function buildCreateTagScript(data: {
  tagName: string;
  parentTagName?: string;
}): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('create/tag', data);
  validateMutationProgram(program);
  const script = wrapInLauncher(emitProgram(program), program.context);
  return { script: script.trim(), operation: 'create', target: 'tag' as MutationTarget };
}

/**
 * Build a JXA script for renaming a tag (target-not-found beats duplicate).
 */
export async function buildRenameTagScript(data: {
  tagName: string;
  newName: string;
}): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('rename/tag', data);
  validateMutationProgram(program);
  const script = wrapInLauncher(emitProgram(program), program.context);
  return { script: script.trim(), operation: 'rename', target: 'tag' as MutationTarget };
}

/**
 * Build a JXA script for deleting a tag (hard delete — no partial result to preserve).
 */
export async function buildDeleteTagScript(data: { tagName: string }): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('delete/tag', data);
  validateMutationProgram(program);
  const script = wrapInLauncher(emitProgram(program), program.context);
  return { script: script.trim(), operation: 'delete', target: 'tag' as MutationTarget };
}

/**
 * Build a JXA script for merging one tag into another: retag every affected
 * task, then best-effort delete of the source (merged_with_warning on failure).
 */
export async function buildMergeTagsScript(data: {
  tagName: string;
  targetTag: string;
}): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('merge/tag', data);
  validateMutationProgram(program);
  const script = wrapInLauncher(emitProgram(program), program.context);
  return { script: script.trim(), operation: 'merge', target: 'tag' as MutationTarget };
}

/**
 * Build a JXA script for nesting a tag under a parent (parent REQUIRED —
 * absence lowers to a constant error envelope).
 */
export async function buildNestTagScript(data: {
  tagName: string;
  parentTagName?: string;
}): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('nest/tag', data);
  validateMutationProgram(program);
  const script = wrapInLauncher(emitProgram(program), program.context);
  return { script: script.trim(), operation: 'nest', target: 'tag' as MutationTarget };
}

/**
 * Build a JXA script for moving a tag to the root level.
 */
export async function buildUnparentTagScript(data: { tagName: string }): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('unparent/tag', data);
  validateMutationProgram(program);
  const script = wrapInLauncher(emitProgram(program), program.context);
  return { script: script.trim(), operation: 'unparent', target: 'tag' as MutationTarget };
}

/**
 * Build a JXA script for reparenting a tag (parent OPTIONAL — absent moves to
 * root; legacy quirk preserved).
 */
export async function buildReparentTagScript(data: {
  tagName: string;
  parentTagName?: string;
}): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('reparent/tag', data);
  validateMutationProgram(program);
  const script = wrapInLauncher(emitProgram(program), program.context);
  return { script: script.trim(), operation: 'reparent', target: 'tag' as MutationTarget };
}

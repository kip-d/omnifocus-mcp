/**
 * OMN-167 — tasks-side synthetic folder fields registered in SYNTHETIC_FIELD_DEFS.
 *
 *   - `task.folderMatch`    — subtree path match on the task's containing project's
 *                             folder ancestry (delegates to emitFolderPathMatch).
 *   - `task.folderTopLevel` — task's containing project has no parent folder.
 *
 * Both exclude inbox tasks (no containing project) per Decision 3 / Decision 1.
 * We validate emitter behavior by instantiating the generated OmniJS via `new Function`
 * over a fake `task` (the generated JS is the production seam).
 */

import { describe, it, expect } from 'vitest';
import { SYNTHETIC_FIELD_MAP, KNOWN_FIELDS } from '../../../../src/contracts/ast/types.js';
import { type FakeFolder, web } from './fake-folder-tree.js';

type FakeProject = { parentFolder: FakeFolder | null };
type FakeTask = { containingProject: FakeProject | null };

const taskInWeb: FakeTask = { containingProject: { parentFolder: web } };
const taskTopLevel: FakeTask = { containingProject: { parentFolder: null } };
const inboxTask: FakeTask = { containingProject: null };

function evalFor(field: string, op: '==' | '!=', value: unknown): (task: FakeTask) => boolean {
  const def = SYNTHETIC_FIELD_MAP.get(field);
  if (!def) throw new Error(`synthetic field ${field} not registered`);
  const expr = def.omnijs(op, value);

  return new Function('task', `return (${expr});`) as (task: FakeTask) => boolean;
}

describe('task.folderMatch synthetic field', () => {
  it('is registered in KNOWN_FIELDS and SYNTHETIC_FIELD_MAP', () => {
    expect(KNOWN_FIELDS).toContain('task.folderMatch');
    expect(SYNTHETIC_FIELD_MAP.has('task.folderMatch')).toBe(true);
  });

  it('== matches a task whose containing project sits in the named folder subtree', () => {
    const p = evalFor('task.folderMatch', '==', 'Development');
    expect(p(taskInWeb)).toBe(true); // Web is under Development
    expect(p(taskTopLevel)).toBe(false);
  });

  it('== excludes inbox tasks (no containing project)', () => {
    expect(evalFor('task.folderMatch', '==', 'Development')(inboxTask)).toBe(false);
  });

  it('!= negates the subtree match', () => {
    const p = evalFor('task.folderMatch', '!=', 'Development');
    expect(p(taskInWeb)).toBe(false);
    expect(p(taskTopLevel)).toBe(true);
  });

  it('!= still EXCLUDES inbox tasks (no containing project) — invariant holds under negation', () => {
    // Review finding: a bare `!match` would let inbox tasks (match===false) pass a
    // `folder != X` filter. Inbox tasks must never match a folder filter, == or !=.
    expect(evalFor('task.folderMatch', '!=', 'Development')(inboxTask)).toBeFalsy();
  });

  it('throws on an unsupported operator', () => {
    const def = SYNTHETIC_FIELD_MAP.get('task.folderMatch')!;
    expect(() => def.omnijs('<', 'Development')).toThrow();
  });
});

describe('task.folderTopLevel synthetic field', () => {
  it('is registered in KNOWN_FIELDS and SYNTHETIC_FIELD_MAP', () => {
    expect(KNOWN_FIELDS).toContain('task.folderTopLevel');
    expect(SYNTHETIC_FIELD_MAP.has('task.folderTopLevel')).toBe(true);
  });

  it('== true matches a task whose containing project has no parent folder', () => {
    const p = evalFor('task.folderTopLevel', '==', true);
    expect(p(taskTopLevel)).toBe(true);
    expect(p(taskInWeb)).toBe(false);
  });

  it('== true excludes inbox tasks (no containing project)', () => {
    // The guard `task.containingProject && …` short-circuits to the (null) project
    // for inbox tasks — falsy in the predicate's boolean context, matching the
    // existing synthetic-emitter convention (cf. task.parentTaskId's null guard).
    expect(evalFor('task.folderTopLevel', '==', true)(inboxTask)).toBeFalsy();
  });

  it('the NEGATED form (!= true) STILL excludes inbox tasks — guard survives negation', () => {
    // Symmetric to the folderMatch != fix: a bare `!(guard)` would let inbox tasks
    // (guard===false) pass `folderTopLevel != true`. Inbox must never match, either way.
    expect(evalFor('task.folderTopLevel', '!=', true)(inboxTask)).toBeFalsy();
  });
});

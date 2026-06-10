// tests/unit/contracts/ast/mutation/update-substrate.test.ts
// OMN-128 slice 4 — new substrate nodes for the update family.
import { describe, it, expect } from 'vitest';
import {
  resolveTask,
  resolveParentTask,
  resolveProjectById,
  emitStmt,
} from '../../../../../src/contracts/ast/mutation/index.js';

describe('resolveTask node (generalizes resolveParentTask)', () => {
  it('factory builds the typed node', () => {
    expect(resolveTask('task', 'abc123')).toEqual({ type: 'resolveTask', bind: 'task', ref: 'abc123' });
  });

  it('resolveParentTask remains as an alias producing the same node', () => {
    expect(resolveParentTask('parentTask', 'p1')).toEqual({ type: 'resolveTask', bind: 'parentTask', ref: 'p1' });
  });

  it('emits Task.byIdentifier with JSON-quoted ref', () => {
    expect(emitStmt(resolveTask('task', 'abc"123'))).toBe('const task = Task.byIdentifier("abc\\"123") || null;');
  });
});

describe('resolveProjectById node (strict, no name fallback)', () => {
  it('factory builds the typed node', () => {
    expect(resolveProjectById('proj', 'pid1')).toEqual({ type: 'resolveProjectById', bind: 'proj', ref: 'pid1' });
  });

  it('emits Project.byIdentifier ONLY — no flattenedProjects name fallback', () => {
    const emitted = emitStmt(resolveProjectById('proj', 'pid1'));
    expect(emitted).toBe('const proj = Project.byIdentifier("pid1") || null;');
    expect(emitted).not.toContain('flattenedProjects');
  });
});

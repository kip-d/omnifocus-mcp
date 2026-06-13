import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QueryCompiler } from '../../../../../src/tools/unified/compilers/QueryCompiler.js';

const compiler = new QueryCompiler();
const compileTasks = (filters: unknown) => compiler.compile({ query: { type: 'tasks', filters } } as never);

describe('OMN-172 F8: unsatisfiable terminal OR-branch rejection', () => {
  it('rejects {OR:[{status:dropped},{flagged:true}]} naming OR[0] + the top-level fix', () => {
    try {
      compileTasks({ OR: [{ status: 'dropped' }, { flagged: true }] });
      throw new Error('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(z.ZodError);
      const issue = (e as z.ZodError).issues[0];
      expect(issue.path).toEqual(['query', 'filters', 'OR', 0, 'dropped']);
      expect(issue.message).toMatch(/dropped/i);
      expect(issue.message).toMatch(/top level/i);
    }
  });

  it('rejects {OR:[{status:completed},{flagged:true}]} symmetrically (the completed sibling)', () => {
    try {
      compileTasks({ OR: [{ status: 'completed' }, { flagged: true }] });
      throw new Error('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(z.ZodError);
      const issue = (e as z.ZodError).issues[0];
      expect(issue.path).toEqual(['query', 'filters', 'OR', 0, 'completed']);
      expect(issue.message).toMatch(/completed/i);
    }
  });

  // Note: top-level `dropped` is expressible publicly ONLY via status:'dropped' (transformStatus
  // maps it to dropped:true). There is no public form for dropped:false, so the explicit-false
  // cases the rule also handles are not reachable through compile() and are not tested here.
  it('ACCEPTS top-level status:dropped + branch status:dropped (base lifts the exclusion)', () => {
    const c = compileTasks({ status: 'dropped', OR: [{ status: 'dropped' }, { flagged: true }] });
    expect(c.type).toBe('tasks');
  });

  it('ACCEPTS top-level completed:true + branch completed:true (completed is a public alias)', () => {
    const c = compileTasks({ completed: true, OR: [{ status: 'completed' }, { flagged: true }] });
    expect(c.type).toBe('tasks');
  });

  it('ACCEPTS {OR:[{flagged:true},{available:true}]} (no terminal request)', () => {
    const c = compileTasks({ OR: [{ flagged: true }, { available: true }] });
    expect(c.type).toBe('tasks');
  });

  it('rejects identically on the countOnly variant (same compile path)', () => {
    expect(() =>
      compiler.compile({
        query: { type: 'tasks', countOnly: true, filters: { OR: [{ status: 'dropped' }, { flagged: true }] } },
      } as never),
    ).toThrow(z.ZodError);
  });

  it('rejects the second branch when the first is satisfiable (scans all branches)', () => {
    try {
      compileTasks({ OR: [{ flagged: true }, { status: 'dropped' }] });
      throw new Error('expected rejection');
    } catch (e) {
      expect((e as z.ZodError).issues[0].path).toEqual(['query', 'filters', 'OR', 1, 'dropped']);
    }
  });
});

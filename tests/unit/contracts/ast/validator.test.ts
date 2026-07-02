import { describe, it, expect } from 'vitest';
import { validateFilterAST } from '../../../../src/contracts/ast/validator.js';
import type { FilterNode } from '../../../../src/contracts/ast/types.js';

describe('validateFilterAST', () => {
  describe('valid ASTs', () => {
    it('returns valid for literal true', () => {
      const ast: FilterNode = { type: 'literal', value: true };
      const result = validateFilterAST(ast);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for simple comparison with known field', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.completed',
        operator: '==',
        value: false,
      };
      const result = validateFilterAST(ast);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for AND of valid conditions', () => {
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.completed', operator: '==', value: false },
          { type: 'comparison', field: 'task.flagged', operator: '==', value: true },
        ],
      };
      const result = validateFilterAST(ast);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('unknown fields', () => {
    it('returns error for unknown field', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.complted', // Typo!
        operator: '==',
        value: false,
      };
      const result = validateFilterAST(ast);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('UNKNOWN_FIELD');
      expect(result.errors[0].message).toContain('task.complted');
    });

    it('returns error for nested unknown field', () => {
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.completed', operator: '==', value: false },
          { type: 'comparison', field: 'task.tgas', operator: '==', value: true }, // Typo!
        ],
      };
      const result = validateFilterAST(ast);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNKNOWN_FIELD')).toBe(true);
    });
  });

  describe('contradictions', () => {
    it('returns error for direct contradiction', () => {
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.completed', operator: '==', value: true },
          { type: 'comparison', field: 'task.completed', operator: '==', value: false },
        ],
      };
      const result = validateFilterAST(ast);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CONTRADICTION')).toBe(true);
    });
  });

  describe('contradictions — AND-scope boundaries (OMN-226)', () => {
    it('does not flag different values on the same field across OR branches', () => {
      // AND(completed==false, OR(project==AAA, project==BBB)) — an ordinary "A or B" query
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.completed', operator: '==', value: false },
          {
            type: 'or',
            children: [
              { type: 'comparison', field: 'task.containingProject', operator: '==', value: 'AAA' },
              { type: 'comparison', field: 'task.containingProject', operator: '==', value: 'BBB' },
            ],
          },
        ],
      };
      const result = validateFilterAST(ast);

      expect(result.errors.filter((e) => e.code === 'CONTRADICTION')).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    it('does not flag a comparison against a NOT-wrapped comparison on the same field', () => {
      // AND(project==AAA, NOT(project==BBB)) — satisfiable
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.containingProject', operator: '==', value: 'AAA' },
          {
            type: 'not',
            child: { type: 'comparison', field: 'task.containingProject', operator: '==', value: 'BBB' },
          },
        ],
      };
      const result = validateFilterAST(ast);

      expect(result.errors.filter((e) => e.code === 'CONTRADICTION')).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    it('still flags a genuine AND contradiction alongside an OR sibling', () => {
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.completed', operator: '==', value: true },
          { type: 'comparison', field: 'task.completed', operator: '==', value: false },
          {
            type: 'or',
            children: [
              { type: 'comparison', field: 'task.containingProject', operator: '==', value: 'AAA' },
              { type: 'comparison', field: 'task.containingProject', operator: '==', value: 'BBB' },
            ],
          },
        ],
      };
      const result = validateFilterAST(ast);

      expect(result.errors.some((e) => e.code === 'CONTRADICTION' && e.message.includes('task.completed'))).toBe(true);
      expect(
        result.errors.some((e) => e.code === 'CONTRADICTION' && e.message.includes('task.containingProject')),
      ).toBe(false);
    });

    it('still flags contradictions across nested AND flattening', () => {
      // AND(completed==true, AND(completed==false, flagged==true)) — genuinely unsatisfiable
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.completed', operator: '==', value: true },
          {
            type: 'and',
            children: [
              { type: 'comparison', field: 'task.completed', operator: '==', value: false },
              { type: 'comparison', field: 'task.flagged', operator: '==', value: true },
            ],
          },
        ],
      };
      const result = validateFilterAST(ast);

      const contradictions = result.errors.filter((e) => e.code === 'CONTRADICTION');
      expect(contradictions).toHaveLength(1);
      expect(contradictions[0].message).toContain('task.completed');
    });

    it('flags a contradictory AND nested inside an OR branch', () => {
      // AND(flagged==true, OR(AND(completed==true, completed==false), inInbox==true))
      // — the first OR branch can never match; each branch is its own AND scope
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.flagged', operator: '==', value: true },
          {
            type: 'or',
            children: [
              {
                type: 'and',
                children: [
                  { type: 'comparison', field: 'task.completed', operator: '==', value: true },
                  { type: 'comparison', field: 'task.completed', operator: '==', value: false },
                ],
              },
              { type: 'comparison', field: 'task.inInbox', operator: '==', value: true },
            ],
          },
        ],
      };
      const result = validateFilterAST(ast);

      const contradictions = result.errors.filter((e) => e.code === 'CONTRADICTION');
      expect(contradictions).toHaveLength(1);
      expect(contradictions[0].message).toContain('task.completed');
    });
  });

  describe('tautologies', () => {
    it('returns warning for always-true OR', () => {
      const ast: FilterNode = {
        type: 'or',
        children: [
          { type: 'comparison', field: 'task.completed', operator: '==', value: true },
          { type: 'comparison', field: 'task.completed', operator: '==', value: false },
        ],
      };
      const result = validateFilterAST(ast);

      // Tautology is a warning, not an error (filter will work, just always matches)
      expect(result.warnings.some((w) => w.code === 'TAUTOLOGY')).toBe(true);
    });
  });

  describe('empty children', () => {
    it('returns warning for empty AND node', () => {
      const ast: FilterNode = {
        type: 'and',
        children: [],
      };
      const result = validateFilterAST(ast);

      expect(result.warnings.some((w) => w.code === 'EMPTY_NODE')).toBe(true);
    });

    it('returns warning for empty OR node', () => {
      const ast: FilterNode = {
        type: 'or',
        children: [],
      };
      const result = validateFilterAST(ast);

      expect(result.warnings.some((w) => w.code === 'EMPTY_NODE')).toBe(true);
    });
  });

  describe('type validation', () => {
    it('returns error when boolean field compared to non-boolean', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.completed',
        operator: '==',
        value: 'yes', // Should be boolean
      };
      const result = validateFilterAST(ast);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'TYPE_MISMATCH')).toBe(true);
    });
  });

  describe('exists nodes', () => {
    it('validates exists node with known field', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.dueDate',
        exists: true,
      };
      const result = validateFilterAST(ast);

      expect(result.valid).toBe(true);
    });

    it('returns error for exists with unknown field', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.dueData', // Typo!
        exists: true,
      };
      const result = validateFilterAST(ast);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNKNOWN_FIELD')).toBe(true);
    });
  });
});

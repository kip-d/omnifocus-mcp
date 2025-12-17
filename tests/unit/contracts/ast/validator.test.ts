import { describe, it, expect } from 'vitest';
import { validateFilterAST, ValidationResult } from '../../../../src/contracts/ast/validator.js';
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

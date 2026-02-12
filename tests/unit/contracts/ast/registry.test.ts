/**
 * Unified FilterDef Registry Tests
 *
 * Validates that the FILTER_DEFS registry in builder.ts:
 * - Covers all filter types
 * - Produces non-trivial AST for each filter
 * - Has no duplicate field definitions
 * - Stays in sync with KNOWN_FIELDS
 */

import { describe, it, expect } from 'vitest';
import {
  buildAST,
  FILTER_DEFS,
  REGISTRY_KNOWN_FIELDS,
  DATE_FILTER_DEFS,
} from '../../../../src/contracts/ast/builder.js';
import { KNOWN_FIELDS } from '../../../../src/contracts/ast/types.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';

describe('FILTER_DEFS unified registry', () => {
  describe('registry structure', () => {
    it('has expected number of entries (16+)', () => {
      // 13 non-date entries + 3 date entries = 16
      expect(FILTER_DEFS.length).toBeGreaterThanOrEqual(16);
    });

    it('every entry has a non-empty fields array', () => {
      for (const def of FILTER_DEFS) {
        expect(def.fields.length, 'FilterDef has empty fields array').toBeGreaterThan(0);
      }
    });

    it('every entry has a build function', () => {
      for (const def of FILTER_DEFS) {
        expect(typeof def.build).toBe('function');
      }
    });

    it('every entry returns null for an empty filter', () => {
      const emptyFilter: TaskFilter = {};
      for (const def of FILTER_DEFS) {
        const result = def.build(emptyFilter);
        expect(
          result,
          `FilterDef for fields [${def.fields.join(', ')}] should return null for empty filter`,
        ).toBeNull();
      }
    });
  });

  describe('filter type coverage', () => {
    const filterCases: Array<{ name: string; filter: TaskFilter }> = [
      { name: 'id', filter: { id: 'task-xyz' } },
      { name: 'completed', filter: { completed: false } },
      { name: 'flagged', filter: { flagged: true } },
      { name: 'blocked', filter: { blocked: true } },
      { name: 'available', filter: { available: true } },
      { name: 'inInbox', filter: { inInbox: true } },
      { name: 'dropped', filter: { dropped: true } },
      { name: 'hasRepetitionRule', filter: { hasRepetitionRule: true } },
      { name: 'tagStatusValid', filter: { tagStatusValid: true } },
      { name: 'tags (OR)', filter: { tags: ['work'], tagsOperator: 'OR' } },
      { name: 'text (CONTAINS)', filter: { text: 'search' } },
      { name: 'projectId', filter: { projectId: 'abc123' } },
      { name: 'dueAfter', filter: { dueAfter: '2025-01-01' } },
      { name: 'deferBefore', filter: { deferBefore: '2025-12-31' } },
      { name: 'plannedAfter', filter: { plannedAfter: '2025-06-01' } },
    ];

    for (const { name, filter } of filterCases) {
      it(`buildAST() produces non-trivial output for ${name}`, () => {
        const ast = buildAST(filter);
        expect(ast, `buildAST for ${name} should not produce literal(true)`).not.toEqual({
          type: 'literal',
          value: true,
        });
      });
    }
  });

  describe('todayMode special handling', () => {
    it('todayMode consumes flagged (no standalone flagged node)', () => {
      const filter: TaskFilter = {
        todayMode: true,
        dueBefore: '2026-02-12T00:00:00.000Z',
        flagged: true,
        completed: false,
      };
      const ast = buildAST(filter);

      expect(ast.type).toBe('and');
      if (ast.type !== 'and') return;

      // No standalone flagged comparison at the top level
      const standaloneFlagged = ast.children.filter(
        (c) => c.type === 'comparison' && (c as { field: string }).field === 'task.flagged',
      );
      expect(standaloneFlagged).toHaveLength(0);

      // Should have OR node containing flagged
      const orNode = ast.children.find((c) => c.type === 'or');
      expect(orNode).toBeDefined();
    });

    it('todayMode suppresses regular due date handler via skipWhen', () => {
      const filter: TaskFilter = {
        todayMode: true,
        dueBefore: '2026-02-12T00:00:00.000Z',
        completed: false,
      };
      const ast = buildAST(filter);

      expect(ast.type).toBe('and');
      if (ast.type !== 'and') return;

      // No standalone AND(exists(dueDate), dueDate <= ...) at top level
      const topLevelDueDateAnd = ast.children.filter(
        (c) => c.type === 'and' && c.children.some((gc) => gc.type === 'exists' && gc.field === 'task.dueDate'),
      );
      expect(topLevelDueDateAnd).toHaveLength(0);
    });
  });

  describe('REGISTRY_KNOWN_FIELDS derivation', () => {
    it('is auto-derived from FILTER_DEFS', () => {
      const expected = Array.from(new Set(FILTER_DEFS.flatMap((def) => def.fields)));
      expect(REGISTRY_KNOWN_FIELDS).toEqual(expected);
    });

    it('contains no duplicates', () => {
      const unique = new Set(REGISTRY_KNOWN_FIELDS);
      expect(unique.size).toBe(REGISTRY_KNOWN_FIELDS.length);
    });

    it('every entry appears in KNOWN_FIELDS', () => {
      const knownFieldsSet = new Set(KNOWN_FIELDS);
      for (const field of REGISTRY_KNOWN_FIELDS) {
        expect(
          knownFieldsSet.has(field as (typeof KNOWN_FIELDS)[number]),
          `REGISTRY_KNOWN_FIELDS has "${field}" but KNOWN_FIELDS does not`,
        ).toBe(true);
      }
    });
  });

  describe('DATE_FILTER_DEFS backward compatibility', () => {
    it('DATE_FILTER_DEFS is still exported and has 3 entries', () => {
      expect(DATE_FILTER_DEFS).toHaveLength(3);
    });

    it('DATE_FILTER_DEFS fields are subset of REGISTRY_KNOWN_FIELDS', () => {
      const registrySet = new Set(REGISTRY_KNOWN_FIELDS);
      for (const def of DATE_FILTER_DEFS) {
        expect(registrySet.has(def.field), `DATE_FILTER_DEFS field "${def.field}" not in registry`).toBe(true);
      }
    });
  });
});

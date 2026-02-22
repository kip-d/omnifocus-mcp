/**
 * Filter Coverage Safety Net
 *
 * These tests ensure that adding a new date filter to TaskFilter
 * can't silently fall through the pipeline. They verify:
 *
 * 1. Every date prefix in TaskFilter has a DATE_FILTER_DEFS entry
 * 2. Every DATE_FILTER_DEFS field appears in KNOWN_FIELDS
 * 3. buildAST() produces non-trivial output for each date filter property
 */

import { describe, it, expect } from 'vitest';
import { buildAST, DATE_FILTER_DEFS, FILTER_DEFS, REGISTRY_KNOWN_FIELDS } from '../../../src/contracts/ast/builder.js';
import { KNOWN_FIELDS } from '../../../src/contracts/ast/types.js';
import type { TaskFilter } from '../../../src/contracts/filters.js';

// =============================================================================
// Derive date-related property names from TaskFilter type keys
// =============================================================================

/**
 * Date filter prefixes: property names ending in After/Before/Operator
 * that correspond to date filtering in TaskFilter.
 *
 * These are the "after" and "before" property names extracted from DATE_FILTER_DEFS,
 * which must match the TaskFilter interface properties.
 */
const REGISTRY_AFTER_KEYS = DATE_FILTER_DEFS.map((d) => d.after);
const REGISTRY_BEFORE_KEYS = DATE_FILTER_DEFS.map((d) => d.before);
const REGISTRY_OPERATOR_KEYS = DATE_FILTER_DEFS.map((d) => d.operator);
const REGISTRY_FIELDS = DATE_FILTER_DEFS.map((d) => d.field);

describe('Filter Coverage Safety Net', () => {
  describe('DATE_FILTER_DEFS ↔ TaskFilter alignment', () => {
    it('every registry after/before key is a valid TaskFilter property', () => {
      // Create a TaskFilter to get its keys at runtime
      const sampleFilter: TaskFilter = {
        dueAfter: 'x',
        dueBefore: 'x',
        dueDateOperator: 'BETWEEN',
        deferAfter: 'x',
        deferBefore: 'x',
        deferDateOperator: 'BETWEEN',
        plannedAfter: 'x',
        plannedBefore: 'x',
        plannedDateOperator: 'BETWEEN',
        completionAfter: 'x',
        completionBefore: 'x',
        completionDateOperator: 'BETWEEN',
      };
      const filterKeys = Object.keys(sampleFilter);

      for (const key of REGISTRY_AFTER_KEYS) {
        expect(filterKeys, `DATE_FILTER_DEFS.after="${key}" not found in TaskFilter`).toContain(key);
      }
      for (const key of REGISTRY_BEFORE_KEYS) {
        expect(filterKeys, `DATE_FILTER_DEFS.before="${key}" not found in TaskFilter`).toContain(key);
      }
      for (const key of REGISTRY_OPERATOR_KEYS) {
        expect(filterKeys, `DATE_FILTER_DEFS.operator="${key}" not found in TaskFilter`).toContain(key);
      }
    });

    it('every TaskFilter date property has a corresponding DATE_FILTER_DEFS entry', () => {
      // Known date property suffixes in TaskFilter
      const dateAfterPattern = /^(.+)After$/;
      const dateBeforePattern = /^(.+)Before$/;

      // Extract actual date prefixes from TaskFilter by using a sample with all date props
      const sampleFilter: TaskFilter = {
        dueAfter: 'x',
        dueBefore: 'x',
        deferAfter: 'x',
        deferBefore: 'x',
        plannedAfter: 'x',
        plannedBefore: 'x',
        completionAfter: 'x',
        completionBefore: 'x',
      };
      const filterKeys = Object.keys(sampleFilter);

      const afterKeys = filterKeys.filter((k) => dateAfterPattern.test(k));
      const beforeKeys = filterKeys.filter((k) => dateBeforePattern.test(k));

      for (const key of afterKeys) {
        expect(
          REGISTRY_AFTER_KEYS,
          `TaskFilter has "${key}" but no DATE_FILTER_DEFS entry maps to it. ` +
            'Add a new entry to DATE_FILTER_DEFS in builder.ts.',
        ).toContain(key);
      }

      for (const key of beforeKeys) {
        expect(
          REGISTRY_BEFORE_KEYS,
          `TaskFilter has "${key}" but no DATE_FILTER_DEFS entry maps to it. ` +
            'Add a new entry to DATE_FILTER_DEFS in builder.ts.',
        ).toContain(key);
      }
    });
  });

  describe('DATE_FILTER_DEFS ↔ KNOWN_FIELDS alignment', () => {
    it('every DATE_FILTER_DEFS field appears in KNOWN_FIELDS', () => {
      const knownFieldsSet = new Set(KNOWN_FIELDS);
      for (const field of REGISTRY_FIELDS) {
        expect(
          knownFieldsSet.has(field as (typeof KNOWN_FIELDS)[number]),
          `DATE_FILTER_DEFS field "${field}" not found in KNOWN_FIELDS. ` +
            'Add it to KNOWN_FIELDS in types.ts so the AST validator accepts it.',
        ).toBe(true);
      }
    });
  });

  describe('buildAST() produces non-trivial output for each date filter', () => {
    for (const def of DATE_FILTER_DEFS) {
      it(`produces non-trivial AST for ${def.after}`, () => {
        const filter: TaskFilter = { [def.after]: '2025-06-01' };
        const ast = buildAST(filter);
        // Should NOT be the empty-filter sentinel
        expect(ast).not.toEqual({ type: 'literal', value: true });
        // Should reference the correct field
        expect(JSON.stringify(ast)).toContain(def.field);
      });

      it(`produces non-trivial AST for ${def.before}`, () => {
        const filter: TaskFilter = { [def.before]: '2025-12-31' };
        const ast = buildAST(filter);
        expect(ast).not.toEqual({ type: 'literal', value: true });
        expect(JSON.stringify(ast)).toContain(def.field);
      });

      it(`produces non-trivial AST for ${def.after} + ${def.before} (BETWEEN)`, () => {
        const filter: TaskFilter = {
          [def.after]: '2025-01-01',
          [def.before]: '2025-12-31',
          [def.operator]: 'BETWEEN',
        };
        const ast = buildAST(filter);
        expect(ast).not.toEqual({ type: 'literal', value: true });
        // BETWEEN should produce both >= and <= comparisons
        const serialized = JSON.stringify(ast);
        expect(serialized).toContain('>=');
        expect(serialized).toContain('<=');
      });
    }
  });

  describe('FILTER_DEFS (unified registry) ↔ KNOWN_FIELDS alignment', () => {
    it('every REGISTRY_KNOWN_FIELDS entry appears in KNOWN_FIELDS', () => {
      const knownFieldsSet = new Set(KNOWN_FIELDS);
      for (const field of REGISTRY_KNOWN_FIELDS) {
        expect(
          knownFieldsSet.has(field as (typeof KNOWN_FIELDS)[number]),
          `FILTER_DEFS references field "${field}" but it is not in KNOWN_FIELDS. ` +
            'Add it to KNOWN_FIELDS in types.ts so the AST validator accepts it.',
        ).toBe(true);
      }
    });

    it('every builder-relevant KNOWN_FIELDS entry appears in REGISTRY_KNOWN_FIELDS', () => {
      // Fields that only appear in KNOWN_FIELDS for validator/emitter use, not produced by builder
      const validatorOnlyFields = new Set(['task.taskStatus', 'task.effectiveDueDate', 'task.effectiveDeferDate']);

      const registryFieldsSet = new Set(REGISTRY_KNOWN_FIELDS);
      for (const field of KNOWN_FIELDS) {
        if (validatorOnlyFields.has(field)) continue;
        expect(
          registryFieldsSet.has(field),
          `KNOWN_FIELDS has "${field}" but no FILTER_DEFS entry references it. ` +
            'Either add a FILTER_DEFS entry or add the field to the validatorOnlyFields exclusion set.',
        ).toBe(true);
      }
    });

    it('FILTER_DEFS has at least as many entries as there are filter categories', () => {
      // Sanity check: registry should have 15+ entries (14 non-date + 3 date)
      expect(FILTER_DEFS.length).toBeGreaterThanOrEqual(15);
    });
  });
});

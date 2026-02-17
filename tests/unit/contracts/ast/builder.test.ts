import { describe, it, expect } from 'vitest';
import { buildAST } from '../../../../src/contracts/ast/builder.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';

describe('buildAST', () => {
  describe('empty filter', () => {
    it('returns literal true for empty filter', () => {
      const filter: TaskFilter = {};
      const ast = buildAST(filter);

      expect(ast).toEqual({ type: 'literal', value: true });
    });
  });

  describe('boolean filters', () => {
    it('transforms completed: false', () => {
      const filter: TaskFilter = { completed: false };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.completed',
        operator: '==',
        value: false,
      });
    });

    it('transforms completed: true', () => {
      const filter: TaskFilter = { completed: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.completed',
        operator: '==',
        value: true,
      });
    });

    it('transforms flagged: true', () => {
      const filter: TaskFilter = { flagged: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.flagged',
        operator: '==',
        value: true,
      });
    });

    it('transforms blocked: true', () => {
      const filter: TaskFilter = { blocked: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.blocked',
        operator: '==',
        value: true,
      });
    });

    it('transforms available: true', () => {
      const filter: TaskFilter = { available: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.available',
        operator: '==',
        value: true,
      });
    });

    it('transforms inInbox: true', () => {
      const filter: TaskFilter = { inInbox: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.inInbox',
        operator: '==',
        value: true,
      });
    });

    it('transforms dropped: true', () => {
      const filter: TaskFilter = { dropped: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.dropped',
        operator: '==',
        value: true,
      });
    });

    it('transforms dropped: false', () => {
      const filter: TaskFilter = { dropped: false };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.dropped',
        operator: '==',
        value: false,
      });
    });
  });

  describe('repetition filters', () => {
    it('transforms hasRepetitionRule: true', () => {
      const filter: TaskFilter = { hasRepetitionRule: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'exists',
        field: 'task.repetitionRule',
        exists: true,
      });
    });

    it('transforms hasRepetitionRule: false', () => {
      const filter: TaskFilter = { hasRepetitionRule: false };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'exists',
        field: 'task.repetitionRule',
        exists: false,
      });
    });
  });

  describe('tag filters', () => {
    it('transforms tags with OR operator', () => {
      const filter: TaskFilter = { tags: ['work', 'urgent'], tagsOperator: 'OR' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'taskTags',
        operator: 'some',
        value: ['work', 'urgent'],
      });
    });

    it('transforms tags with AND operator', () => {
      const filter: TaskFilter = { tags: ['work', 'urgent'], tagsOperator: 'AND' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'taskTags',
        operator: 'every',
        value: ['work', 'urgent'],
      });
    });

    it('transforms tags with NOT_IN operator', () => {
      const filter: TaskFilter = { tags: ['waiting'], tagsOperator: 'NOT_IN' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'not',
        child: {
          type: 'comparison',
          field: 'taskTags',
          operator: 'some',
          value: ['waiting'],
        },
      });
    });

    it('defaults to AND operator when not specified', () => {
      const filter: TaskFilter = { tags: ['work'] };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'taskTags',
        operator: 'every',
        value: ['work'],
      });
    });
  });

  describe('text filters', () => {
    it('transforms text with CONTAINS operator - checks both name AND note', () => {
      const filter: TaskFilter = { text: 'review', textOperator: 'CONTAINS' };
      const ast = buildAST(filter);

      // Should generate OR node that matches either name or note
      expect(ast).toEqual({
        type: 'or',
        children: [
          { type: 'comparison', field: 'task.name', operator: 'includes', value: 'review' },
          { type: 'comparison', field: 'task.note', operator: 'includes', value: 'review' },
        ],
      });
    });

    it('transforms text with MATCHES operator - checks both name AND note', () => {
      const filter: TaskFilter = { text: '^review.*', textOperator: 'MATCHES' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'or',
        children: [
          { type: 'comparison', field: 'task.name', operator: 'matches', value: '^review.*' },
          { type: 'comparison', field: 'task.note', operator: 'matches', value: '^review.*' },
        ],
      });
    });

    it('defaults to CONTAINS operator for both name and note', () => {
      const filter: TaskFilter = { text: 'review' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'or',
        children: [
          { type: 'comparison', field: 'task.name', operator: 'includes', value: 'review' },
          { type: 'comparison', field: 'task.note', operator: 'includes', value: 'review' },
        ],
      });
    });

    it('transforms search alias (legacy) the same as text', () => {
      const filter: TaskFilter = { search: 'meeting notes' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'or',
        children: [
          { type: 'comparison', field: 'task.name', operator: 'includes', value: 'meeting notes' },
          { type: 'comparison', field: 'task.note', operator: 'includes', value: 'meeting notes' },
        ],
      });
    });
  });

  describe('date filters', () => {
    it('transforms dueBefore', () => {
      const filter: TaskFilter = { dueBefore: '2025-12-31' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.dueDate', exists: true },
          { type: 'comparison', field: 'task.dueDate', operator: '<=', value: '2025-12-31' },
        ],
      });
    });

    it('transforms dueAfter', () => {
      const filter: TaskFilter = { dueAfter: '2025-01-01' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.dueDate', exists: true },
          { type: 'comparison', field: 'task.dueDate', operator: '>=', value: '2025-01-01' },
        ],
      });
    });

    it('transforms due date range (BETWEEN)', () => {
      const filter: TaskFilter = {
        dueAfter: '2025-01-01',
        dueBefore: '2025-12-31',
        dueDateOperator: 'BETWEEN',
      };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.dueDate', exists: true },
          { type: 'comparison', field: 'task.dueDate', operator: '>=', value: '2025-01-01' },
          { type: 'comparison', field: 'task.dueDate', operator: '<=', value: '2025-12-31' },
        ],
      });
    });

    it('transforms deferBefore', () => {
      const filter: TaskFilter = { deferBefore: '2025-12-31' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.deferDate', exists: true },
          { type: 'comparison', field: 'task.deferDate', operator: '<=', value: '2025-12-31' },
        ],
      });
    });

    it('transforms deferAfter', () => {
      const filter: TaskFilter = { deferAfter: '2025-01-01' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.deferDate', exists: true },
          { type: 'comparison', field: 'task.deferDate', operator: '>=', value: '2025-01-01' },
        ],
      });
    });

    it('transforms dueBefore with exclusive operator', () => {
      const filter: TaskFilter = { dueBefore: '2025-12-31', dueDateOperator: '<' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.dueDate', exists: true },
          { type: 'comparison', field: 'task.dueDate', operator: '<', value: '2025-12-31' },
        ],
      });
    });

    it('transforms dueAfter with exclusive operator', () => {
      const filter: TaskFilter = { dueAfter: '2025-01-01', dueDateOperator: '>' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.dueDate', exists: true },
          { type: 'comparison', field: 'task.dueDate', operator: '>', value: '2025-01-01' },
        ],
      });
    });

    it('transforms deferBefore with exclusive operator', () => {
      const filter: TaskFilter = { deferBefore: '2025-12-31', deferDateOperator: '<' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.deferDate', exists: true },
          { type: 'comparison', field: 'task.deferDate', operator: '<', value: '2025-12-31' },
        ],
      });
    });

    it('transforms deferAfter with exclusive operator', () => {
      const filter: TaskFilter = { deferAfter: '2025-01-01', deferDateOperator: '>' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.deferDate', exists: true },
          { type: 'comparison', field: 'task.deferDate', operator: '>', value: '2025-01-01' },
        ],
      });
    });
  });

  describe('planned date filters', () => {
    it('transforms plannedBefore', () => {
      const filter: TaskFilter = { plannedBefore: '2025-12-31' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.plannedDate', exists: true },
          { type: 'comparison', field: 'task.plannedDate', operator: '<=', value: '2025-12-31' },
        ],
      });
    });

    it('transforms plannedAfter', () => {
      const filter: TaskFilter = { plannedAfter: '2025-01-01' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.plannedDate', exists: true },
          { type: 'comparison', field: 'task.plannedDate', operator: '>=', value: '2025-01-01' },
        ],
      });
    });

    it('transforms planned date range (BETWEEN)', () => {
      const filter: TaskFilter = {
        plannedAfter: '2025-01-01',
        plannedBefore: '2025-12-31',
        plannedDateOperator: 'BETWEEN',
      };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.plannedDate', exists: true },
          { type: 'comparison', field: 'task.plannedDate', operator: '>=', value: '2025-01-01' },
          { type: 'comparison', field: 'task.plannedDate', operator: '<=', value: '2025-12-31' },
        ],
      });
    });

    it('transforms plannedBefore with exclusive operator', () => {
      const filter: TaskFilter = { plannedBefore: '2025-12-31', plannedDateOperator: '<' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.plannedDate', exists: true },
          { type: 'comparison', field: 'task.plannedDate', operator: '<', value: '2025-12-31' },
        ],
      });
    });

    it('transforms plannedAfter with exclusive operator', () => {
      const filter: TaskFilter = { plannedAfter: '2025-01-01', plannedDateOperator: '>' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.plannedDate', exists: true },
          { type: 'comparison', field: 'task.plannedDate', operator: '>', value: '2025-01-01' },
        ],
      });
    });
  });

  describe('project filter', () => {
    it('transforms projectId', () => {
      const filter: TaskFilter = { projectId: 'abc123' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.containingProject',
        operator: '==',
        value: 'abc123',
      });
    });
  });

  describe('id filter', () => {
    it('transforms id', () => {
      const filter: TaskFilter = { id: 'task-xyz' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.id.primaryKey',
        operator: '==',
        value: 'task-xyz',
      });
    });
  });

  describe('combined filters', () => {
    it('combines multiple filters with AND', () => {
      const filter: TaskFilter = {
        completed: false,
        flagged: true,
        tags: ['work'],
        tagsOperator: 'OR',
      };
      const ast = buildAST(filter);

      expect(ast.type).toBe('and');
      if (ast.type === 'and') {
        expect(ast.children).toHaveLength(3);
        expect(ast.children).toContainEqual({
          type: 'comparison',
          field: 'task.completed',
          operator: '==',
          value: false,
        });
        expect(ast.children).toContainEqual({
          type: 'comparison',
          field: 'task.flagged',
          operator: '==',
          value: true,
        });
        expect(ast.children).toContainEqual({
          type: 'comparison',
          field: 'taskTags',
          operator: 'some',
          value: ['work'],
        });
      }
    });

    it('unwraps single-child AND to the child itself', () => {
      const filter: TaskFilter = { flagged: true };
      const ast = buildAST(filter);

      // Should NOT be wrapped in an AND node
      expect(ast.type).toBe('comparison');
    });
  });

  describe('todayMode filters', () => {
    it('produces OR node with dueSoon AND flagged when todayMode is true', () => {
      const filter: TaskFilter = {
        todayMode: true,
        dueBefore: '2026-02-12T00:00:00.000Z',
        completed: false,
        dropped: false,
      };
      const ast = buildAST(filter);

      expect(ast.type).toBe('and');
      if (ast.type !== 'and') return;

      // Should have OR node as one of the children
      const orNode = ast.children.find((c) => c.type === 'or');
      expect(orNode).toBeDefined();
      if (!orNode || orNode.type !== 'or') return;

      // OR node should have 2 children: dueSoon condition and flagged condition
      expect(orNode.children).toHaveLength(2);

      // First child: AND(exists(dueDate), dueDate < cutoff)
      expect(orNode.children[0].type).toBe('and');
      if (orNode.children[0].type === 'and') {
        expect(orNode.children[0].children).toHaveLength(2);
        expect(orNode.children[0].children[0]).toEqual({
          type: 'exists',
          field: 'task.dueDate',
          exists: true,
        });
        expect(orNode.children[0].children[1]).toEqual({
          type: 'comparison',
          field: 'task.dueDate',
          operator: '<',
          value: '2026-02-12T00:00:00.000Z',
        });
      }

      // Second child: flagged == true
      expect(orNode.children[1]).toEqual({
        type: 'comparison',
        field: 'task.flagged',
        operator: '==',
        value: true,
      });
    });

    it('skips regular flagged handler when todayMode is active', () => {
      const filter: TaskFilter = {
        todayMode: true,
        dueBefore: '2026-02-12T00:00:00.000Z',
        flagged: true,
        completed: false,
      };
      const ast = buildAST(filter);

      expect(ast.type).toBe('and');
      if (ast.type !== 'and') return;

      // Should NOT have a standalone flagged comparison (it's consumed by OR node)
      const standaloneFlagged = ast.children.filter(
        (c) => c.type === 'comparison' && (c as { field: string }).field === 'task.flagged',
      );
      expect(standaloneFlagged).toHaveLength(0);
    });

    it('skips regular due date handlers when todayMode is active', () => {
      const filter: TaskFilter = {
        todayMode: true,
        dueBefore: '2026-02-12T00:00:00.000Z',
        completed: false,
      };
      const ast = buildAST(filter);

      expect(ast.type).toBe('and');
      if (ast.type !== 'and') return;

      // Should NOT have a standalone AND(exists(dueDate), dueDate <= ...) node
      // from the regular due date handler. The only dueDate references should be
      // inside the OR node.
      const topLevelDueDateExists = ast.children.filter(
        (c) => c.type === 'and' && c.children.some((gc) => gc.type === 'exists' && gc.field === 'task.dueDate'),
      );
      // The only AND with dueDate exists should be inside the OR node, not at top level
      expect(topLevelDueDateExists).toHaveLength(0);
    });

    it('does not produce OR node when todayMode is false or missing', () => {
      const filter: TaskFilter = {
        dueBefore: '2026-02-12T00:00:00.000Z',
        flagged: true,
        completed: false,
      };
      const ast = buildAST(filter);

      expect(ast.type).toBe('and');
      if (ast.type !== 'and') return;

      // Should NOT have an OR node
      const orNode = ast.children.find((c) => c.type === 'or');
      expect(orNode).toBeUndefined();
    });
  });

  describe('boolean flag false values', () => {
    it('transforms flagged: false', () => {
      const filter: TaskFilter = { flagged: false };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.flagged',
        operator: '==',
        value: false,
      });
    });

    it('transforms blocked: false', () => {
      const filter: TaskFilter = { blocked: false };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.blocked',
        operator: '==',
        value: false,
      });
    });

    it('transforms available: false', () => {
      const filter: TaskFilter = { available: false };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.available',
        operator: '==',
        value: false,
      });
    });

    it('transforms inInbox: false', () => {
      const filter: TaskFilter = { inInbox: false };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.inInbox',
        operator: '==',
        value: false,
      });
    });
  });

  describe('project filter with name', () => {
    it('transforms project string to containingProject comparison', () => {
      const filter: TaskFilter = { project: 'Work Projects' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.containingProject',
        operator: '==',
        value: 'Work Projects',
      });
    });

    it('does not add project condition when project is null', () => {
      const filter: TaskFilter = { project: null };
      const ast = buildAST(filter);

      expect(ast).toEqual({ type: 'literal', value: true });
    });

    it('prefers projectId over project when both are set', () => {
      const filter: TaskFilter = { projectId: 'abc123', project: 'Work' };
      const ast = buildAST(filter);

      // projectId comes before project in builder logic, but both produce containingProject
      // With both set, the builder uses projectId ?? project (projectId wins)
      expect(ast.type).toBe('comparison');
      if (ast.type === 'comparison') {
        expect(ast.field).toBe('task.containingProject');
        expect(ast.value).toBe('abc123');
      }
    });
  });

  describe('date filter data-driven registry', () => {
    it('skips due date handler when todayMode is active', () => {
      const filter: TaskFilter = {
        todayMode: true,
        dueBefore: '2026-02-12T00:00:00.000Z',
        dueAfter: '2026-01-01',
        completed: false,
      };
      const ast = buildAST(filter);

      expect(ast.type).toBe('and');
      if (ast.type !== 'and') return;

      // dueAfter should NOT generate a standalone date condition because
      // todayMode skipWhen suppresses the entire due date handler
      const standaloneDateAnds = ast.children.filter(
        (c) => c.type === 'and' && c.children.some((gc) => gc.type === 'exists' && gc.field === 'task.dueDate'),
      );
      expect(standaloneDateAnds).toHaveLength(0);
    });

    it('does not skip defer date handler when todayMode is active', () => {
      const filter: TaskFilter = {
        todayMode: true,
        dueBefore: '2026-02-12T00:00:00.000Z',
        deferBefore: '2026-03-01',
        completed: false,
      };
      const ast = buildAST(filter);

      expect(ast.type).toBe('and');
      if (ast.type !== 'and') return;

      // Defer date should still be present even in todayMode
      const deferDateNode = ast.children.find(
        (c) => c.type === 'and' && c.children.some((gc) => gc.type === 'exists' && gc.field === 'task.deferDate'),
      );
      expect(deferDateNode).toBeDefined();
    });
  });

  describe('tagStatusValid filter', () => {
    it('transforms tagStatusValid: true to comparison node', () => {
      const filter: TaskFilter = { tagStatusValid: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.tagStatusValid',
        operator: '==',
        value: true,
      });
    });

    it('transforms tagStatusValid: false to comparison node', () => {
      const filter: TaskFilter = { tagStatusValid: false };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.tagStatusValid',
        operator: '==',
        value: false,
      });
    });
  });
});

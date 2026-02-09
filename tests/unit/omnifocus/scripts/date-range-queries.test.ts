import { describe, it, expect } from 'vitest';
import { GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT } from '../../../../src/omnifocus/scripts/date-range-queries';
import { buildListTasksScriptV4 } from '../../../../src/omnifocus/scripts/tasks/list-tasks-ast';

/**
 * Overdue & upcoming mode migration: Both handlers in QueryTasksTool now use the AST builder
 * (buildListTasksScriptV4) instead of legacy scripts.
 *
 * The legacy scripts are retained for benchmark comparison tests only.
 * These tests verify both legacy script integrity and the AST approach.
 */

describe('GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT (legacy, retained for benchmark)', () => {
  function extractOmniScriptParts(): string[] {
    const template = GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT;
    const omniScriptStart = template.indexOf("const omniScript = '(' +");
    const omniScriptEnd = template.indexOf("')';", omniScriptStart);

    if (omniScriptStart === -1 || omniScriptEnd === -1) {
      throw new Error('Could not locate omniScript in template');
    }

    const omniScriptRegion = template.slice(omniScriptStart, omniScriptEnd + 4);
    const stringLiterals: string[] = [];
    const stringRegex = /'([^']*)'/g;
    let match;
    while ((match = stringRegex.exec(omniScriptRegion)) !== null) {
      stringLiterals.push(match[1]);
    }

    return stringLiterals;
  }

  function buildOmniScriptString(): string {
    const template = GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT;
    const omniScriptStart = template.indexOf("const omniScript = '(' +");
    const omniScriptEnd = template.indexOf("')';", omniScriptStart);
    const omniScriptRegion = template.slice(omniScriptStart, omniScriptEnd + 4);

    const buildFn = new Function(
      'limit',
      'includeCompleted',
      `const omniScript = ${omniScriptRegion.replace('const omniScript = ', '')}; return omniScript;`,
    );
    return buildFn(25, false) as string;
  }

  it('should not contain single-line comments in the concatenated OmniJS script', () => {
    const parts = extractOmniScriptParts();
    const commentParts = parts.filter((part) => part.trim().startsWith('//'));
    expect(commentParts).toEqual([]);
  });

  it('should produce a parseable JavaScript expression', () => {
    const script = buildOmniScriptString();
    expect(() => {
      new Function(script);
    }).not.toThrow();
  });

  it('should contain expected functional elements', () => {
    const script = buildOmniScriptString();
    expect(script).toContain('flattenedTasks');
    expect(script).toContain('dueDate');
    expect(script).toContain('daysOverdue');
    expect(script).toContain('JSON.stringify');
  });
});

describe('AST-based overdue query (current implementation)', () => {
  it('should build a script with dueBefore filter and completed: false', () => {
    const now = new Date();
    const filter = {
      completed: false,
      dueBefore: now.toISOString(),
      dueDateOperator: '<' as const,
      limit: 25,
    };

    const script = buildListTasksScriptV4({
      filter,
      fields: [],
      limit: 25,
    });

    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
    // The generated script should contain OmniJS bridge code
    expect(script).toContain('evaluateJavascript');
  });

  it('should support tag filters in overdue query', () => {
    const now = new Date();
    const filter = {
      completed: false,
      dueBefore: now.toISOString(),
      dueDateOperator: '<' as const,
      tags: ['work'],
      tagsOperator: 'OR',
      limit: 25,
    };

    const script = buildListTasksScriptV4({
      filter,
      fields: [],
      limit: 25,
    });

    expect(typeof script).toBe('string');
    expect(script).toContain('work');
  });

  it('should support project filter in overdue query', () => {
    const now = new Date();
    const filter = {
      completed: false,
      dueBefore: now.toISOString(),
      dueDateOperator: '<' as const,
      project: 'My Project',
      limit: 25,
    };

    const script = buildListTasksScriptV4({
      filter,
      fields: [],
      limit: 25,
    });

    expect(typeof script).toBe('string');
    expect(script).toContain('My Project');
  });

  it('should respect offset parameter', () => {
    const now = new Date();
    const filter = {
      completed: false,
      dueBefore: now.toISOString(),
      dueDateOperator: '<' as const,
      limit: 10,
    };

    const script = buildListTasksScriptV4({
      filter,
      fields: [],
      limit: 10,
      offset: 5,
    });

    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
  });
});

describe('AST-based upcoming query (current implementation)', () => {
  it('should build a script with dueAfter/dueBefore date range and completed: false', () => {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    const filter = {
      completed: false,
      dueAfter: startDate.toISOString(),
      dueBefore: endDate.toISOString(),
      limit: 50,
    };

    const script = buildListTasksScriptV4({
      filter,
      fields: [],
      limit: 50,
    });

    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
    expect(script).toContain('evaluateJavascript');
  });

  it('should support tag filters in upcoming query', () => {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    const filter = {
      completed: false,
      dueAfter: startDate.toISOString(),
      dueBefore: endDate.toISOString(),
      tags: ['work'],
      tagsOperator: 'OR',
      limit: 25,
    };

    const script = buildListTasksScriptV4({
      filter,
      fields: [],
      limit: 25,
    });

    expect(typeof script).toBe('string');
    expect(script).toContain('work');
  });

  it('should support project filter in upcoming query', () => {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 14);

    const filter = {
      completed: false,
      dueAfter: startDate.toISOString(),
      dueBefore: endDate.toISOString(),
      project: 'My Project',
      limit: 25,
    };

    const script = buildListTasksScriptV4({
      filter,
      fields: [],
      limit: 25,
    });

    expect(typeof script).toBe('string');
    expect(script).toContain('My Project');
  });
});

describe('AST-based flagged query (current implementation)', () => {
  it('should build a script with flagged: true filter', () => {
    const filter = {
      flagged: true,
      completed: false,
      limit: 50,
    };

    const script = buildListTasksScriptV4({
      filter,
      fields: [],
      limit: 50,
    });

    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
    expect(script).toContain('evaluateJavascript');
    expect(script).toContain('flagged');
  });

  it('should support tag filters in flagged query', () => {
    const filter = {
      flagged: true,
      completed: false,
      tags: ['urgent'],
      tagsOperator: 'OR',
      limit: 25,
    };

    const script = buildListTasksScriptV4({
      filter,
      fields: [],
      limit: 25,
    });

    expect(typeof script).toBe('string');
    expect(script).toContain('urgent');
  });
});

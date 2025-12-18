/**
 * Unit tests for Phase 4 AST builders - Recurring Task Analysis
 */

import { describe, it, expect } from 'vitest';
import {
  buildRecurringTasksScript,
  buildRecurringSummaryScript,
} from '../../src/omnifocus/scripts/recurring/analyze-recurring-tasks-ast.js';

describe('Phase 4 AST Builders - Recurring Tasks', () => {
  describe('buildRecurringTasksScript', () => {
    it('should generate valid script with default options', () => {
      const result = buildRecurringTasksScript();
      expect(result.script).toContain('evaluateJavascript');
      expect(result.script).toContain('flattenedTasks.forEach');
      expect(result.script).toContain('repetitionRule');
      expect(result.filterDescription).toContain('recurring tasks');
    });

    it('should include completed tasks when requested', () => {
      const result = buildRecurringTasksScript({ includeCompleted: true });
      expect(result.script).toContain('includeCompleted = true');
    });

    it('should include dropped tasks when requested', () => {
      const result = buildRecurringTasksScript({ includeDropped: true });
      expect(result.script).toContain('includeDropped = true');
    });

    it('should filter by project name', () => {
      const result = buildRecurringTasksScript({ project: 'Work' });
      expect(result.script).toContain('"Work"');
    });

    it('should filter by project ID', () => {
      const result = buildRecurringTasksScript({ projectId: 'abc123' });
      expect(result.script).toContain('"abc123"');
    });

    it('should respect sortBy option', () => {
      const resultDueDate = buildRecurringTasksScript({ sortBy: 'dueDate' });
      expect(resultDueDate.script).toContain("'dueDate'");

      const resultFrequency = buildRecurringTasksScript({ sortBy: 'frequency' });
      expect(resultFrequency.script).toContain("'frequency'");

      const resultProject = buildRecurringTasksScript({ sortBy: 'project' });
      expect(resultProject.script).toContain("'project'");
    });

    it('should respect limit option', () => {
      const result = buildRecurringTasksScript({ limit: 50 });
      expect(result.script).toContain('50');
    });

    it('should include history when requested', () => {
      const result = buildRecurringTasksScript({ includeHistory: true });
      expect(result.script).toContain('includeHistory = true');
      expect(result.script).toContain('lastCompleted');
    });

    it('should generate frequency parsing logic', () => {
      const result = buildRecurringTasksScript();
      expect(result.script).toContain('parseRuleString');
      expect(result.script).toContain('FREQ=DAILY');
      expect(result.script).toContain('FREQ=WEEKLY');
      expect(result.script).toContain('FREQ=MONTHLY');
    });

    it('should generate name inference logic', () => {
      const result = buildRecurringTasksScript();
      expect(result.script).toContain('inferFrequencyFromName');
      expect(result.script).toContain('daily');
      expect(result.script).toContain('weekly');
      expect(result.script).toContain('monthly');
    });

    it('should calculate summary statistics', () => {
      const result = buildRecurringTasksScript();
      expect(result.script).toContain('totalRecurring');
      expect(result.script).toContain('overdue');
      expect(result.script).toContain('dueThisWeek');
      expect(result.script).toContain('byFrequency');
    });
  });

  describe('buildRecurringSummaryScript', () => {
    it('should generate valid summary script', () => {
      const result = buildRecurringSummaryScript();
      expect(result.script).toContain('evaluateJavascript');
      expect(result.script).toContain('flattenedTasks.forEach');
      expect(result.script).toContain('repetitionRule');
    });

    it('should not include task details in summary', () => {
      const result = buildRecurringSummaryScript();
      // Summary script should be simpler - no task array building
      expect(result.script).toContain('totalRecurring');
      expect(result.script).toContain('overdue');
      expect(result.filterDescription).toContain('summary');
    });

    it('should count by frequency', () => {
      const result = buildRecurringSummaryScript();
      expect(result.script).toContain('byFrequency');
      expect(result.script).toContain('Daily');
      expect(result.script).toContain('Weekly');
      expect(result.script).toContain('Monthly');
    });
  });
});

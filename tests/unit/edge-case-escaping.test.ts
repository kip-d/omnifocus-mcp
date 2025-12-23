import { describe, test, expect } from 'vitest';
import { OmniAutomation } from '../../src/omnifocus/OmniAutomation.js';

/**
 * Edge case tests for JSON escaping in script generation
 *
 * Tests that formatValue() properly handles:
 * - Quotes (single and double)
 * - Newlines
 * - Backslashes
 * - Curly braces
 * - Unicode/emoji
 * - Mixed special characters
 *
 * Note: These tests use a minimal template to test buildScript() escaping.
 * The actual task creation uses AST builders (Phase 2 consolidation).
 */

// Minimal template for testing formatValue() escaping behavior
const ESCAPING_TEST_TEMPLATE = `
  (() => {
    const taskData = {{taskData}};
    return JSON.stringify(taskData);
  })();
`;

describe('JSON Escaping Edge Cases', () => {
  const omni = new OmniAutomation();

  describe('formatValue escaping', () => {
    test('should handle double quotes in task name', () => {
      const taskData = {
        name: 'Task "quoted" name',
        note: '',
        projectId: null,
        tags: [],
        dueDate: null,
        deferDate: null,
        estimatedMinutes: null,
        flagged: false,
        sequential: false,
      };

      const script = omni.buildScript(ESCAPING_TEST_TEMPLATE, { taskData });

      // Should contain properly escaped quotes
      expect(script).toContain('Task \\"quoted\\" name');
      // Should not contain raw unescaped quotes that would break syntax
      expect(script).not.toMatch(/name: "Task "quoted" name"/);
    });

    test('should handle single quotes in task name', () => {
      const taskData = {
        name: "Task's name with apostrophe",
        note: '',
        projectId: null,
        tags: [],
        dueDate: null,
        deferDate: null,
        estimatedMinutes: null,
        flagged: false,
        sequential: false,
      };

      const script = omni.buildScript(ESCAPING_TEST_TEMPLATE, { taskData });

      // Single quotes should be preserved (they're safe in double-quoted strings)
      expect(script).toContain("Task's name");
    });

    test('should handle newlines in task note', () => {
      const taskData = {
        name: 'Test Task',
        note: 'Line 1\\nLine 2\\nLine 3',
        projectId: null,
        tags: [],
        dueDate: null,
        deferDate: null,
        estimatedMinutes: null,
        flagged: false,
        sequential: false,
      };

      const script = omni.buildScript(ESCAPING_TEST_TEMPLATE, { taskData });

      // Should contain escaped newlines
      expect(script).toContain('\\\\n');
      // Should not contain raw newlines that would break syntax
      expect(script).not.toMatch(/note: "Line 1\nLine 2"/);
    });

    test('should handle backslashes in task note', () => {
      const taskData = {
        name: 'Path Task',
        note: 'Path\\\\to\\\\file',
        projectId: null,
        tags: [],
        dueDate: null,
        deferDate: null,
        estimatedMinutes: null,
        flagged: false,
        sequential: false,
      };

      const script = omni.buildScript(ESCAPING_TEST_TEMPLATE, { taskData });

      // Should contain double-escaped backslashes
      expect(script).toContain('\\\\\\\\');
    });

    test('should handle curly braces in task name', () => {
      const taskData = {
        name: 'Template {{variable}} test',
        note: '',
        projectId: null,
        tags: [],
        dueDate: null,
        deferDate: null,
        estimatedMinutes: null,
        flagged: false,
        sequential: false,
      };

      const script = omni.buildScript(ESCAPING_TEST_TEMPLATE, { taskData });

      // Should preserve curly braces (they're safe in JSON strings)
      expect(script).toContain('{{variable}}');
    });

    test('should handle emoji in task name', () => {
      const taskData = {
        name: 'Task 🚀 with emoji',
        note: '',
        projectId: null,
        tags: [],
        dueDate: null,
        deferDate: null,
        estimatedMinutes: null,
        flagged: false,
        sequential: false,
      };

      const script = omni.buildScript(ESCAPING_TEST_TEMPLATE, { taskData });

      // Should preserve emoji
      expect(script).toContain('🚀');
    });

    test('should handle mixed special characters', () => {
      const taskData = {
        name: 'Complex: "quote\\\\n{{test}}"',
        note: 'Mixed\\nspecial\\tcharacters\\r\\ntest',
        projectId: null,
        tags: [],
        dueDate: null,
        deferDate: null,
        estimatedMinutes: null,
        flagged: false,
        sequential: false,
      };

      const script = omni.buildScript(ESCAPING_TEST_TEMPLATE, { taskData });

      // Should be valid JavaScript (no syntax errors)
      expect(() => {
        // Simple validation: check that the script doesn't have obvious syntax errors
        // by looking for properly balanced quotes and braces
        const openBraces = (script.match(/\{/g) || []).length;
        const closeBraces = (script.match(/\}/g) || []).length;
        expect(openBraces).toBeGreaterThan(0);
        expect(openBraces).toBe(closeBraces);
      }).not.toThrow();
    });

    test('should handle null and undefined values', () => {
      const taskData = {
        name: 'Test Task',
        note: null,
        projectId: undefined,
        tags: [],
        dueDate: null,
        deferDate: null,
        estimatedMinutes: null,
        flagged: false,
        sequential: false,
      };

      const script = omni.buildScript(ESCAPING_TEST_TEMPLATE, { taskData });

      // Should contain properly formatted taskData with null values
      // (not the string 'undefined' as a value)
      expect(script).toContain('const taskData = {');
      expect(script).toContain('null');

      // Should not have 'undefined' as a literal value in taskData
      // (but it's OK in helper code for checks like "!== undefined")
      const taskDataMatch = script.match(/const taskData = \{[\s\S]*?\};/);
      if (taskDataMatch) {
        const taskDataStr = taskDataMatch[0];
        // taskData object should not contain literal 'undefined' values
        expect(taskDataStr).not.toMatch(/:\s*undefined[,\s}]/);
      }
    });

    test('should handle array of tags with special characters', () => {
      const taskData = {
        name: 'Test Task',
        note: '',
        projectId: null,
        tags: ['urgent "high priority"', 'work\\nproject', 'test{{tag}}'],
        dueDate: null,
        deferDate: null,
        estimatedMinutes: null,
        flagged: false,
        sequential: false,
      };

      const script = omni.buildScript(ESCAPING_TEST_TEMPLATE, { taskData });

      // Should properly escape each tag
      expect(script).toContain('urgent \\"high priority\\"');
      expect(script).toContain('work\\\\nproject');
      expect(script).toContain('test{{tag}}');
    });

    test('should handle nested objects with special characters', () => {
      const updates = {
        name: 'Updated "name"',
        note: 'New\\nnote',
        projectId: 'proj-"123"',
      };

      const script = omni.buildScript('const updates = {{updates}};', { updates });

      // Should properly escape nested object properties
      expect(script).toContain('Updated \\"name\\"');
      expect(script).toContain('New\\\\nnote');
      expect(script).toContain('proj-\\"123\\"');
    });
  });

  describe('Script syntax validation', () => {
    test('generated scripts should be valid JavaScript', () => {
      const edgeCases = [
        { name: 'Quotes "test"', note: 'Note\\nwith\\nnewlines' },
        { name: "Apostrophe's test", note: 'Path\\\\to\\\\file' },
        { name: 'Emoji 🎯', note: 'Complex: "quote\\\\n{{test}}"' },
        { name: 'Mixed {{var}} test', note: 'All\\nspecial\\tchars\\r\\nhere' },
      ];

      for (const testCase of edgeCases) {
        const taskData = {
          ...testCase,
          projectId: null,
          tags: [],
          dueDate: null,
          deferDate: null,
          estimatedMinutes: null,
          flagged: false,
          sequential: false,
        };

        const script = omni.buildScript(ESCAPING_TEST_TEMPLATE, { taskData });

        // Basic syntax validation
        expect(() => {
          // Check balanced braces
          const openBraces = (script.match(/\{/g) || []).length;
          const closeBraces = (script.match(/\}/g) || []).length;
          expect(openBraces).toBe(closeBraces);

          // Check balanced parens
          const openParens = (script.match(/\(/g) || []).length;
          const closeParens = (script.match(/\)/g) || []).length;
          expect(openParens).toBe(closeParens);

          // Check balanced brackets
          const openBrackets = (script.match(/\[/g) || []).length;
          const closeBrackets = (script.match(/\]/g) || []).length;
          expect(openBrackets).toBe(closeBrackets);
        }).not.toThrow();
      }
    });
  });
});

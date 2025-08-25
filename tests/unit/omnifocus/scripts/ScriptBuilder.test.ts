import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptBuilder } from '../../../../src/omnifocus/scripts/builders/ScriptBuilder';

describe('ScriptBuilder', () => {
  let builder: ScriptBuilder;

  beforeEach(() => {
    builder = new ScriptBuilder();
  });

  describe('addHelpers', () => {
    it('should add a single helper', () => {
      builder.addHelpers('formatDate');
      const result = builder.build();
      
      expect(result).toContain('// Helper: formatDate');
    });

    it('should add multiple helpers', () => {
      builder.addHelpers('formatDate', 'parseJSON', 'validateInput');
      const result = builder.build();
      
      expect(result).toContain('// Helper: formatDate');
      expect(result).toContain('// Helper: parseJSON');
      expect(result).toContain('// Helper: validateInput');
    });

    it('should deduplicate helpers', () => {
      builder.addHelpers('formatDate', 'formatDate', 'parseJSON', 'formatDate');
      const result = builder.build();
      
      // Should only appear once
      const matches = result.match(/Helper: formatDate/g);
      expect(matches).toHaveLength(1);
    });

    it('should chain method calls', () => {
      const result = builder
        .addHelpers('helper1')
        .addHelpers('helper2')
        .addHelpers('helper3');
      
      expect(result).toBe(builder); // Should return this for chaining
    });

    it('should handle empty helper list', () => {
      builder.addHelpers();
      const result = builder.build();
      
      expect(result).toBe('');
    });
  });

  describe('addRaw', () => {
    it('should add raw script content', () => {
      builder.addRaw('const x = 5;');
      const result = builder.build();
      
      expect(result).toBe('const x = 5;');
    });

    it('should add multiple raw parts', () => {
      builder
        .addRaw('const x = 5;')
        .addRaw('const y = 10;')
        .addRaw('return x + y;');
      
      const result = builder.build();
      
      expect(result).toBe('const x = 5;\nconst y = 10;\nreturn x + y;');
    });

    it('should preserve formatting in raw content', () => {
      const formatted = `
    if (condition) {
      doSomething();
    }
  `;
      builder.addRaw(formatted);
      const result = builder.build();
      
      expect(result).toBe(formatted);
    });

    it('should handle empty raw content', () => {
      builder.addRaw('');
      const result = builder.build();
      
      expect(result).toBe('');
    });

    it('should chain method calls', () => {
      const result = builder
        .addRaw('line1')
        .addRaw('line2');
      
      expect(result).toBe(builder);
    });
  });

  describe('addMain', () => {
    it('should add main script content', () => {
      builder.addMain('return "Hello World";');
      const result = builder.build();
      
      expect(result).toBe('return "Hello World";');
    });

    it('should combine with other methods', () => {
      builder
        .addHelpers('helper1')
        .addMain('const result = helper1();')
        .addRaw('return result;');
      
      const result = builder.build();
      
      expect(result).toContain('// Helper: helper1');
      expect(result).toContain('const result = helper1();');
      expect(result).toContain('return result;');
    });

    it('should handle multiline main content', () => {
      const mainContent = `
const app = Application('OmniFocus');
const doc = app.defaultDocument;
return doc.name();
`;
      builder.addMain(mainContent);
      const result = builder.build();
      
      expect(result).toBe(mainContent);
    });

    it('should chain method calls', () => {
      const result = builder.addMain('main content');
      expect(result).toBe(builder);
    });
  });

  describe('wrapInTryCatch', () => {
    it('should wrap simple content in try-catch', () => {
      builder
        .addRaw('const x = risky();')
        .wrapInTryCatch('testOperation');
      
      const result = builder.build();
      
      expect(result).toContain('try {');
      expect(result).toContain('const x = risky();');
      expect(result).toContain('} catch (error) {');
      expect(result).toContain("return formatError(error, 'testOperation');");
      expect(result).toContain('}');
    });

    it('should wrap multiple parts in try-catch', () => {
      builder
        .addRaw('const a = 1;')
        .addRaw('const b = 2;')
        .addMain('return a + b;')
        .wrapInTryCatch('addition');
      
      const result = builder.build();
      const lines = result.split('\n');
      
      expect(lines[0]).toBe('try {');
      expect(lines[1]).toBe('const a = 1;');
      expect(lines[2]).toBe('const b = 2;');
      expect(lines[3]).toBe('return a + b;');
      expect(lines[4]).toBe('} catch (error) {');
      expect(lines[5]).toContain("formatError(error, 'addition')");
    });

    it('should handle operation names with special characters', () => {
      builder
        .addRaw('risky();')
        .wrapInTryCatch('test-operation_v2.0');
      
      const result = builder.build();
      
      expect(result).toContain("return formatError(error, 'test-operation_v2.0');");
    });

    it('should work with helpers', () => {
      builder
        .addHelpers('formatError', 'logger')
        .addMain('const data = fetchData();')
        .wrapInTryCatch('fetchOperation');
      
      const result = builder.build();
      
      expect(result).toContain('// Helper: formatError');
      expect(result).toContain('// Helper: logger');
      expect(result).toContain('try {');
      expect(result).toContain('const data = fetchData();');
    });

    it('should chain method calls', () => {
      const result = builder
        .addRaw('code')
        .wrapInTryCatch('op');
      
      expect(result).toBe(builder);
    });

    it('should handle empty content', () => {
      builder.wrapInTryCatch('emptyOp');
      const result = builder.build();
      
      expect(result).toBe(`try {
} catch (error) {
  return formatError(error, 'emptyOp');
}`);
    });
  });

  describe('build', () => {
    it('should build empty script', () => {
      const result = builder.build();
      expect(result).toBe('');
    });

    it('should combine all parts in order', () => {
      builder
        .addHelpers('helper1', 'helper2')
        .addRaw('// Comment')
        .addMain('const x = 5;')
        .addRaw('return x;');
      
      const result = builder.build();
      const lines = result.split('\n');
      
      expect(lines[0]).toBe('// Helper: helper1');
      expect(lines[1]).toBe('// Helper: helper2');
      expect(lines[2]).toBe('// Comment');
      expect(lines[3]).toBe('const x = 5;');
      expect(lines[4]).toBe('return x;');
    });

    it('should filter out empty parts', () => {
      builder
        .addRaw('')
        .addRaw('const x = 5;')
        .addRaw('')
        .addRaw('return x;');
      
      const result = builder.build();
      
      // Empty strings still get joined with newlines
      expect(result).toBe('const x = 5;\nreturn x;');
    });

    it('should handle complex nested script', () => {
      builder
        .addHelpers('safeGet', 'formatDate', 'logger')
        .addRaw('const app = Application("OmniFocus");')
        .addRaw('const doc = app.defaultDocument;')
        .addMain(`
function getTasks() {
  const tasks = doc.flattenedTasks();
  return tasks.map(t => ({
    name: safeGet(() => t.name()),
    due: formatDate(t.dueDate())
  }));
}
`)
        .addRaw('const result = getTasks();')
        .addRaw('logger.log(result);')
        .addRaw('return result;')
        .wrapInTryCatch('getTasks');
      
      const result = builder.build();
      
      // Check structure
      expect(result).toContain('// Helper: safeGet');
      expect(result).toContain('// Helper: formatDate');
      expect(result).toContain('// Helper: logger');
      expect(result).toContain('try {');
      expect(result).toContain('function getTasks()');
      expect(result).toContain('} catch (error) {');
      expect(result).toContain("formatError(error, 'getTasks')");
    });

    it('should be idempotent', () => {
      builder
        .addHelpers('helper1')
        .addRaw('const x = 5;')
        .addMain('return x;');
      
      const result1 = builder.build();
      const result2 = builder.build();
      
      expect(result1).toBe(result2);
    });
  });

  describe('Complex Scenarios', () => {
    it('should build a complete task query script', () => {
      builder
        .addHelpers('safeGet', 'formatTask')
        .addRaw('const app = Application("OmniFocus");')
        .addRaw('const doc = app.defaultDocument;')
        .addMain(`
const tasks = doc.flattenedTasks();
const results = [];
for (let i = 0; i < tasks.length && i < 10; i++) {
  const task = tasks[i];
  results.push(formatTask(task));
}
`)
        .addRaw('return JSON.stringify(results);')
        .wrapInTryCatch('queryTasks');
      
      const result = builder.build();
      
      expect(result).toContain('// Helper: safeGet');
      expect(result).toContain('// Helper: formatTask');
      expect(result).toContain('try {');
      expect(result).toContain('const app = Application("OmniFocus");');
      expect(result).toContain('for (let i = 0; i < tasks.length && i < 10; i++)');
      expect(result).toContain('return JSON.stringify(results);');
      expect(result).toContain("formatError(error, 'queryTasks')");
    });

    it('should handle multiple try-catch wraps correctly', () => {
      builder
        .addRaw('step1();')
        .wrapInTryCatch('operation1');
      
      // Wrapping again should replace the previous wrap
      builder.wrapInTryCatch('operation2');
      
      const result = builder.build();
      
      // Should have nested try-catch blocks
      const tryCount = (result.match(/try \{/g) || []).length;
      expect(tryCount).toBe(2);
      expect(result).toContain("formatError(error, 'operation1')");
      expect(result).toContain("formatError(error, 'operation2')");
    });

    it('should handle special characters in content', () => {
      builder
        .addRaw('const regex = /\\d+/g;')
        .addRaw('const str = "Line 1\\nLine 2";')
        .addMain('const quote = "He said \\"Hello\\"";');
      
      const result = builder.build();
      
      expect(result).toContain('const regex = /\\d+/g;');
      expect(result).toContain('const str = "Line 1\\nLine 2";');
      expect(result).toContain('const quote = "He said \\"Hello\\"";');
    });

    it('should build script with conditional logic', () => {
      builder
        .addHelpers('isValidTask')
        .addMain(`
if (isValidTask(task)) {
  task.complete();
  return { success: true };
} else {
  return { success: false, error: 'Invalid task' };
}
`);
      
      const result = builder.build();
      
      expect(result).toContain('// Helper: isValidTask');
      expect(result).toContain('if (isValidTask(task))');
      expect(result).toContain('task.complete()');
      expect(result).toContain('return { success: true }');
      expect(result).toContain('return { success: false, error: \'Invalid task\' }');
    });
  });
});
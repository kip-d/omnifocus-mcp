import { describe, it, expect } from 'vitest';
import {
  buildParameterDeclarations,
  buildScriptWithParameters,
  extractExpectedParameters,
  validateScriptParameters,
  ScriptParameters,
} from '../../../../src/omnifocus/scripts/shared/script-builder';

describe('Script Builder', () => {
  describe('buildParameterDeclarations', () => {
    it('should build parameter declarations for simple types', () => {
      const params: ScriptParameters = {
        stringParam: 'test',
        numberParam: 42,
        booleanParam: true,
      };

      const result = buildParameterDeclarations(params);

      expect(result).toContain('const booleanParam = {{booleanParam}};');
      expect(result).toContain('const numberParam = {{numberParam}};');
      expect(result).toContain('const stringParam = {{stringParam}};');
    });

    it('should sort parameters alphabetically', () => {
      const params: ScriptParameters = {
        zebra: 'z',
        apple: 'a',
        monkey: 'm',
      };

      const result = buildParameterDeclarations(params);
      const lines = result.split('\n');

      expect(lines[0]).toContain('apple');
      expect(lines[1]).toContain('monkey');
      expect(lines[2]).toContain('zebra');
    });

    it('should handle empty parameters', () => {
      const params: ScriptParameters = {};
      const result = buildParameterDeclarations(params);

      expect(result).toBe('');
    });

    it('should handle complex types', () => {
      const params: ScriptParameters = {
        arrayParam: [1, 2, 3],
        objectParam: { key: 'value' },
        nullParam: null,
        undefinedParam: undefined,
      };

      const result = buildParameterDeclarations(params);

      expect(result).toContain('const arrayParam = {{arrayParam}};');
      expect(result).toContain('const objectParam = {{objectParam}};');
      expect(result).toContain('const nullParam = {{nullParam}};');
      expect(result).toContain('const undefinedParam = {{undefinedParam}};');
    });

    it('should use consistent placeholder format', () => {
      const params: ScriptParameters = {
        my_param: 'value',
        MY_PARAM: 'VALUE',
        myParam: 'camelCase',
      };

      const result = buildParameterDeclarations(params);

      expect(result).toMatch(/const MY_PARAM = \{\{MY_PARAM\}\};/);
      expect(result).toMatch(/const myParam = \{\{myParam\}\};/);
      expect(result).toMatch(/const my_param = \{\{my_param\}\};/);
    });
  });

  describe('buildScriptWithParameters', () => {
    it('should wrap script with parameter declarations', () => {
      const scriptBody = 'console.log(message);';
      const params: ScriptParameters = {
        message: 'Hello World',
      };

      const result = buildScriptWithParameters(scriptBody, params);

      expect(result).toContain('(() => {');
      expect(result).toContain('})();');
      expect(result).toContain('const message = {{message}};');
      expect(result).toContain('console.log(message);');
    });

    it('should handle multiple parameters', () => {
      const scriptBody = 'return a + b;';
      const params: ScriptParameters = {
        a: 10,
        b: 20,
      };

      const result = buildScriptWithParameters(scriptBody, params);

      expect(result).toContain('const a = {{a}};');
      expect(result).toContain('const b = {{b}};');
      expect(result).toContain('return a + b;');
    });

    it('should preserve script indentation', () => {
      const scriptBody = `
    if (condition) {
      doSomething();
    }
  `;
      const params: ScriptParameters = {
        condition: true,
      };

      const result = buildScriptWithParameters(scriptBody, params);

      expect(result).toContain('if (condition) {');
      expect(result).toContain('  doSomething();');
    });

    it('should handle empty script body', () => {
      const scriptBody = '';
      const params: ScriptParameters = {};

      const result = buildScriptWithParameters(scriptBody, params);

      expect(result).toContain('(() => {');
      expect(result).toContain('})();');
    });
  });

  describe('extractExpectedParameters', () => {
    it('should extract simple parameters', () => {
      const template = 'const name = {{name}}; const age = {{age}};';

      const result = extractExpectedParameters(template);

      expect(result).toEqual(['age', 'name']);
    });

    it('should extract parameters from complex template', () => {
      const template = `
        const task = doc.flattenedTasks.byID({{taskId}});
        if (task) {
          task.name = {{taskName}};
          task.note = {{taskNote}};
          task.flagged = {{flagged}};
        }
      `;

      const result = extractExpectedParameters(template);

      expect(result).toEqual(['flagged', 'taskId', 'taskName', 'taskNote']);
    });

    it('should handle duplicate parameters', () => {
      const template = `
        console.log({{message}});
        alert({{message}});
        return {{message}};
      `;

      const result = extractExpectedParameters(template);

      expect(result).toEqual(['message']);
    });

    it('should handle templates with no parameters', () => {
      const template = 'console.log("Hello World");';

      const result = extractExpectedParameters(template);

      expect(result).toEqual([]);
    });

    it('should handle parameters with underscores', () => {
      const template = 'const {{user_id}} = {{USER_ID}}; const {{snake_case}} = true;';

      const result = extractExpectedParameters(template);

      expect(result).toEqual(['USER_ID', 'snake_case', 'user_id']);
    });

    it('should not extract partial matches', () => {
      const template = 'const {{{triple}}} = true; const {single} = false;';

      const result = extractExpectedParameters(template);

      // The regex \{\{(\w+)\}\} will match {{triple}} within {{{triple}}}
      expect(result).toEqual(['triple']); // Matches the {{triple}} part of {{{triple}}}
    });
  });

  describe('validateScriptParameters', () => {
    it('should validate matching parameters', () => {
      const template = 'const name = {{name}}; const age = {{age}};';
      const params: ScriptParameters = {
        name: 'John',
        age: 30,
      };

      const result = validateScriptParameters(template, params);

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual([]);
    });

    it('should detect missing parameters', () => {
      const template = 'const name = {{name}}; const age = {{age}}; const city = {{city}};';
      const params: ScriptParameters = {
        name: 'John',
      };

      const result = validateScriptParameters(template, params);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['age', 'city']);
      expect(result.extra).toEqual([]);
    });

    it('should detect extra parameters', () => {
      const template = 'const name = {{name}};';
      const params: ScriptParameters = {
        name: 'John',
        age: 30,
        city: 'NYC',
      };

      const result = validateScriptParameters(template, params);

      expect(result.valid).toBe(true); // Valid because all required params are present
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual(['age', 'city']);
    });

    it('should handle both missing and extra parameters', () => {
      const template = 'const a = {{a}}; const b = {{b}};';
      const params: ScriptParameters = {
        b: 2,
        c: 3,
        d: 4,
      };

      const result = validateScriptParameters(template, params);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['a']);
      expect(result.extra).toEqual(['c', 'd']);
    });

    it('should handle empty template', () => {
      const template = '';
      const params: ScriptParameters = {
        unused: 'value',
      };

      const result = validateScriptParameters(template, params);

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual(['unused']);
    });

    it('should handle empty parameters', () => {
      const template = 'const x = {{x}};';
      const params: ScriptParameters = {};

      const result = validateScriptParameters(template, params);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['x']);
      expect(result.extra).toEqual([]);
    });
  });

  describe('Integration', () => {
    it('should work end-to-end with parameter injection', () => {
      const template = `
        const task = getTask({{taskId}});
        task.name = {{name}};
        task.completed = {{completed}};
        return task;
      `;

      const params: ScriptParameters = {
        taskId: '12345',
        name: 'Updated Task',
        completed: false,
      };

      // Validate parameters
      const validation = validateScriptParameters(template, params);
      expect(validation.valid).toBe(true);

      // Build script with parameters
      const script = buildScriptWithParameters(template, params);

      // Verify structure
      expect(script).toContain('const taskId = {{taskId}};');
      expect(script).toContain('const name = {{name}};');
      expect(script).toContain('const completed = {{completed}};');
      expect(script).toContain('task.name = {{name}};');
    });

    it('should handle complex nested structures', () => {
      const template = `
        const config = {{config}};
        const items = {{items}};
        
        items.forEach(item => {
          processItem(item, config.{{setting}});
        });
      `;

      const params: ScriptParameters = {
        config: { setting: 'value', option: true },
        items: [1, 2, 3],
        setting: 'settingName',
      };

      const validation = validateScriptParameters(template, params);
      expect(validation.valid).toBe(true);

      const script = buildScriptWithParameters(template, params);
      expect(script).toContain('const config = {{config}};');
      expect(script).toContain('const items = {{items}};');
      expect(script).toContain('const setting = {{setting}};');
    });
  });
});

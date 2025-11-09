import { describe, it, expect } from 'vitest';
import {
  formatBridgeScript,
  BridgeTemplates,
  BridgeTemplateParams,
} from '../../../../src/omnifocus/scripts/shared/bridge-template';

describe('Bridge Template', () => {
  describe('formatBridgeScript', () => {
    it('should replace string placeholders with JSON stringified values', () => {
      const template = 'const name = $NAME$; const title = $TITLE$;';
      const params: BridgeTemplateParams = {
        NAME: 'John Doe',
        TITLE: 'Engineer',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const name = "John Doe"; const title = "Engineer";');
    });

    it('should properly escape special characters in strings', () => {
      const template = 'const message = $MESSAGE$;';
      const params: BridgeTemplateParams = {
        MESSAGE: 'Hello "World"\nNew Line\t Tab',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const message = "Hello \\"World\\"\\nNew Line\\t Tab";');
    });

    it('should handle boolean values without quotes', () => {
      const template = 'const flagged = $FLAGGED$; const completed = $COMPLETED$;';
      const params: BridgeTemplateParams = {
        FLAGGED: true,
        COMPLETED: false,
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const flagged = true; const completed = false;');
    });

    it('should handle number values without quotes', () => {
      const template = 'const count = $COUNT$; const price = $PRICE$;';
      const params: BridgeTemplateParams = {
        COUNT: 42,
        PRICE: 19.99,
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const count = 42; const price = 19.99;');
    });

    it('should handle null and undefined values', () => {
      const template = 'const nullVal = $NULL_VAL$; const undefinedVal = $UNDEFINED_VAL$;';
      const params: BridgeTemplateParams = {
        NULL_VAL: null,
        UNDEFINED_VAL: undefined,
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const nullVal = null; const undefinedVal = null;');
    });

    it('should handle array values', () => {
      const template = 'const tags = $TAGS$; const numbers = $NUMBERS$;';
      const params: BridgeTemplateParams = {
        TAGS: ['work', 'urgent', 'review'],
        NUMBERS: [1, 2, 3],
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const tags = ["work","urgent","review"]; const numbers = [1,2,3];');
    });

    it('should handle object values', () => {
      const template = 'const config = $CONFIG$;';
      const params: BridgeTemplateParams = {
        CONFIG: {
          name: 'Test',
          enabled: true,
          count: 5,
        },
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const config = {"name":"Test","enabled":true,"count":5};');
    });

    it('should handle multiple occurrences of the same placeholder', () => {
      const template = 'const a = $VALUE$; const b = $VALUE$; const c = $VALUE$;';
      const params: BridgeTemplateParams = {
        VALUE: 'test',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const a = "test"; const b = "test"; const c = "test";');
    });

    it('should throw error for missing parameters', () => {
      const template = 'const name = $NAME$; const age = $AGE$;';
      const params: BridgeTemplateParams = {
        NAME: 'John',
      };
      
      expect(() => formatBridgeScript(template, params)).toThrow('Missing template parameters: $AGE$');
    });

    it('should handle empty template', () => {
      const template = '';
      const params: BridgeTemplateParams = {
        UNUSED: 'value',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('');
    });

    it('should handle template with no placeholders', () => {
      const template = 'const x = 5; return x * 2;';
      const params: BridgeTemplateParams = {
        UNUSED: 'value',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const x = 5; return x * 2;');
    });

    it('should preserve template formatting', () => {
      const template = `
    const task = $TASK_ID$;
    if (task) {
      task.name = $NAME$;
    }
  `;
      const params: BridgeTemplateParams = {
        TASK_ID: '12345',
        NAME: 'Updated Task',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toContain('\n    const task = "12345";\n');
      expect(result).toContain('      task.name = "Updated Task";\n');
    });

    it('should handle special regex characters in placeholder names', () => {
      const template = 'const val = $VALUE_1$;';
      const params: BridgeTemplateParams = {
        VALUE_1: 'test',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const val = "test";');
    });

    it('should handle injection attack attempts', () => {
      const template = 'const cmd = $COMMAND$;';
      const params: BridgeTemplateParams = {
        COMMAND: '"; maliciousCode(); "',
      };
      
      const result = formatBridgeScript(template, params);
      
      // Should properly escape the malicious input
      expect(result).toBe('const cmd = "\\"; maliciousCode(); \\"";');
    });

    it('should handle very long strings', () => {
      const template = 'const text = $TEXT$;';
      const longString = 'a'.repeat(10000);
      const params: BridgeTemplateParams = {
        TEXT: longString,
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe(`const text = "${longString}";`);
    });

    it('should handle unicode characters', () => {
      const template = 'const text = $TEXT$;';
      const params: BridgeTemplateParams = {
        TEXT: '😀 Unicode 文字 Test',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const text = "😀 Unicode 文字 Test";');
    });

    it('should handle nested quotes properly', () => {
      const template = 'const html = $HTML$;';
      const params: BridgeTemplateParams = {
        HTML: '<div class="container" id=\'main\'>Content</div>',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const html = "<div class=\\"container\\" id=\'main\'>Content</div>";');
    });

    it('should detect multiple missing parameters', () => {
      const template = 'const a = $A$; const b = $B$; const c = $C$;';
      const params: BridgeTemplateParams = {
        B: 'value',
      };
      
      expect(() => formatBridgeScript(template, params))
        .toThrow('Missing template parameters: $A$, $C$');
    });
  });

  describe('BridgeTemplates', () => {
    it('should have GET_TASK template', () => {
      expect(BridgeTemplates.GET_TASK).toBeDefined();
      expect(BridgeTemplates.GET_TASK).toContain('$TASK_ID$');
      expect(BridgeTemplates.GET_TASK).toContain('Task.byIdentifier');
    });

    it('should have ASSIGN_TAGS template', () => {
      expect(BridgeTemplates.ASSIGN_TAGS).toBeDefined();
      expect(BridgeTemplates.ASSIGN_TAGS).toContain('$TASK_ID$');
      expect(BridgeTemplates.ASSIGN_TAGS).toContain('$TAGS$');
      expect(BridgeTemplates.ASSIGN_TAGS).toContain('task.clearTags()');
      expect(BridgeTemplates.ASSIGN_TAGS).toContain('task.addTag');
    });

    it('GET_TASK template should format correctly', () => {
      const params: BridgeTemplateParams = {
        TASK_ID: 'abc123',
      };
      
      const result = formatBridgeScript(BridgeTemplates.GET_TASK, params);
      
      expect(result).toContain('Task.byIdentifier("abc123")');
      expect(result).toContain('JSON.stringify({ success: true');
      expect(result).toContain('JSON.stringify({ success: false');
    });

    it('ASSIGN_TAGS template should format correctly', () => {
      const params: BridgeTemplateParams = {
        TASK_ID: 'xyz789',
        TAGS: ['work', 'urgent'],
      };
      
      const result = formatBridgeScript(BridgeTemplates.ASSIGN_TAGS, params);
      
      expect(result).toContain('Task.byIdentifier("xyz789")');
      expect(result).toContain('const tagNames = ["work","urgent"]');
      expect(result).toContain('flattenedTags.byName(name)');
    });
  });

  describe('Security', () => {
    it('should prevent code injection via string parameters', () => {
      const template = 'app.doShellScript($SCRIPT$);';
      const params: BridgeTemplateParams = {
        SCRIPT: 'rm -rf /"; echo "pwned',
      };
      
      const result = formatBridgeScript(template, params);
      
      // The dangerous command should be safely escaped as a string
      expect(result).toBe('app.doShellScript("rm -rf /\\"; echo \\"pwned");');
    });

    it('should prevent code injection via object parameters', () => {
      const template = 'const config = $CONFIG$;';
      const params: BridgeTemplateParams = {
        CONFIG: {
          value: '"); alert("XSS"); //',
        },
      };
      
      const result = formatBridgeScript(template, params);
      
      // Should be safely JSON stringified
      expect(result).toBe('const config = {"value":"\\"); alert(\\"XSS\\"); //"};');
    });

    it('should handle backslashes safely', () => {
      const template = 'const path = $PATH$;';
      const params: BridgeTemplateParams = {
        PATH: 'C:\\Users\\Test\\File.txt',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const path = "C:\\\\Users\\\\Test\\\\File.txt";');
    });

    it('should handle control characters safely', () => {
      const template = 'const text = $TEXT$;';
      const params: BridgeTemplateParams = {
        TEXT: 'Line 1\nLine 2\rLine 3\tTabbed',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const text = "Line 1\\nLine 2\\rLine 3\\tTabbed";');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string values', () => {
      const template = 'const empty = $EMPTY$;';
      const params: BridgeTemplateParams = {
        EMPTY: '',
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const empty = "";');
    });

    it('should handle zero values', () => {
      const template = 'const zero = $ZERO$;';
      const params: BridgeTemplateParams = {
        ZERO: 0,
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const zero = 0;');
    });

    it('should handle negative numbers', () => {
      const template = 'const negative = $NEG$;';
      const params: BridgeTemplateParams = {
        NEG: -42.5,
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const negative = -42.5;');
    });

    it('should handle empty arrays', () => {
      const template = 'const empty = $EMPTY_ARRAY$;';
      const params: BridgeTemplateParams = {
        EMPTY_ARRAY: [],
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const empty = [];');
    });

    it('should handle empty objects', () => {
      const template = 'const empty = $EMPTY_OBJ$;';
      const params: BridgeTemplateParams = {
        EMPTY_OBJ: {},
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const empty = {};');
    });

    it('should handle scientific notation numbers', () => {
      const template = 'const sci = $SCI$;';
      const params: BridgeTemplateParams = {
        SCI: 1.23e-10,
      };
      
      const result = formatBridgeScript(template, params);
      
      expect(result).toBe('const sci = 1.23e-10;');
    });

    it('should handle Infinity and NaN', () => {
      const template = 'const inf = $INF$; const nan = $NAN$;';
      const params: BridgeTemplateParams = {
        INF: Infinity,
        NAN: NaN,
      };
      
      const result = formatBridgeScript(template, params);
      
      // Numbers are converted to strings directly, including Infinity and NaN
      expect(result).toBe('const inf = Infinity; const nan = NaN;');
    });
  });
});
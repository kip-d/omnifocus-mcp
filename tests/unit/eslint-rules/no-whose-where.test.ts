import { afterAll, describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import plugin from '../../../eslint-rules/index.js';

// Wire ESLint's RuleTester into vitest's runner (see use-standard-response.test.ts).
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const rule = (plugin as { rules: Record<string, unknown> }).rules['no-whose-where'];
if (!rule) {
  throw new Error('no-whose-where rule not found on plugin export');
}

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
});

// The rule double-gates: config scopes it to src/omnifocus/scripts/**, and the
// body re-checks the path. IN_SCOPE must engage the rule; OUT_OF_SCOPE must not.
const IN_SCOPE = 'src/omnifocus/scripts/tasks/list-tasks-ast.ts';
const OUT_OF_SCOPE = 'src/tools/unified/OmniFocusReadTool.ts';

ruleTester.run('no-whose-where', rule as never, {
  valid: [
    // The sanctioned pattern: direct iteration over the array.
    {
      filename: IN_SCOPE,
      code: 'const out = doc.flattenedTasks.filter((t) => !t.completed());',
    },
    // A `.where(` outside the script layer is some other library's method, not
    // the JXA footgun — the path gate must keep the rule from firing here.
    {
      filename: OUT_OF_SCOPE,
      code: 'const q = builder.where({ flagged: true });',
    },
  ],
  invalid: [
    {
      // The classic JXA timeout footgun.
      filename: IN_SCOPE,
      code: 'const r = doc.flattenedTasks.whose({ completed: false })();',
      errors: [{ messageId: 'noWhoseWhere' }],
    },
    {
      // `.where` is the alias form of the same Apple Event predicate.
      filename: IN_SCOPE,
      code: 'const r = doc.flattenedTasks.where({ flagged: true })();',
      errors: [{ messageId: 'noWhoseWhere' }],
    },
  ],
});

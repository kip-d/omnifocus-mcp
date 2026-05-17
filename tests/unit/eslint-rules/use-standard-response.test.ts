import { afterAll, describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import plugin from '../../../eslint-rules/index.js';

// Wire ESLint's RuleTester into vitest's runner (see metadata-snake-case.test.ts).
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const rule = (plugin as { rules: Record<string, unknown> }).rules['use-standard-response'];
if (!rule) {
  throw new Error('use-standard-response rule not found on plugin export');
}

// This rule inspects TS return-type annotations (fn.returnType) — espree
// cannot parse those; the typescript-eslint parser is required or the rule
// silently never engages (vacuous green).
const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
});

// The rule is gated to files matching /tools/ AND ending in Tool.ts.
const FILENAME = 'src/tools/system/SystemTool.ts';

ruleTester.run('use-standard-response', rule as never, {
  valid: [
    {
      // SystemResponse-alias method that DOES use a builder — must not report,
      // and (post-fix) proves the rule engages on the alias without false-firing.
      filename: FILENAME,
      code: 'class T { async f(): Promise<SystemResponse> { return createSuccessResponseV2("op", {}); } }',
    },
  ],
  invalid: [
    {
      // GAP BEING CLOSED: SystemResponse is a type alias for StandardResponseV2.
      // The substring gate missed it, so this bare {success,data} return was
      // silently unchecked. Must report after the fix.
      filename: FILENAME,
      code: 'class T { async f(): Promise<SystemResponse> { return { success: true, data: {} }; } }',
      errors: [{ messageId: 'useStandardResponse' }],
    },
    {
      // REGRESSION GUARD: a StandardResponseV2-annotated method must STILL be
      // checked after the gate change. Locks against the trailing-\b class of
      // regression (would match SystemResponse but break StandardResponseV2).
      filename: FILENAME,
      code: 'class T { async f(): Promise<StandardResponseV2<Foo>> { return { success: true, data: {} }; } }',
      errors: [{ messageId: 'useStandardResponse' }],
    },
  ],
});

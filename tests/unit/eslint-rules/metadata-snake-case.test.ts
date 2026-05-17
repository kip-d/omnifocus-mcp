import { afterAll, describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import plugin from '../../../eslint-rules/index.js';

// Wire ESLint's RuleTester into vitest's runner. Without this, RuleTester's
// internal it()/describe() calls no-op when nested inside a vitest test,
// causing assertions to silently never run.
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const rule = (plugin as { rules: Record<string, unknown> }).rules['metadata-snake-case'];

if (!rule) {
  throw new Error('metadata-snake-case rule not found on plugin export');
}

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('metadata-snake-case', rule as never, {
  valid: [
    // snake_case metadata is fine, for each V2 builder
    'createSuccessResponseV2(\'op\', {}, undefined, { total_count: 1 });',
    'createErrorResponseV2(\'op\', \'CODE\', \'msg\', undefined, undefined, { from_cache: false });',
    'createTaskResponseV2(\'op\', [], { returned_count: 0 });',
    'createAnalyticsResponseV2(\'op\', {}, \'type\', [], { total_items_analyzed: 1 });',
    // camelCase in the DATA arg (not metadata) — must NOT report (proves correct arg targeting)
    'createSuccessResponseV2(\'op\', { camelCaseInData: 1 }, undefined, { snake_case: 1 });',
    // unrelated function — must NOT report
    'someOtherFn({ camelCaseKey: 1 });',
  ],
  invalid: [
    {
      // createSuccessResponseV2: metadata is arg index 3
      code: 'createSuccessResponseV2(\'op\', {}, undefined, { camelCaseKey: 1 });',
      errors: [{ messageId: 'snakeCaseMetadata' }],
    },
    {
      // createErrorResponseV2: metadata is arg index 5
      code: 'createErrorResponseV2(\'op\', \'CODE\', \'msg\', undefined, undefined, { camelCaseKey: 1 });',
      errors: [{ messageId: 'snakeCaseMetadata' }],
    },
    {
      // createTaskResponseV2: metadata is arg index 2
      code: 'createTaskResponseV2(\'op\', [], { camelCaseKey: 1 });',
      errors: [{ messageId: 'snakeCaseMetadata' }],
    },
    {
      // createListResponseV2: metadata is arg index 3
      code: 'createListResponseV2(\'op\', [], \'tasks\', { camelCaseKey: 1 });',
      errors: [{ messageId: 'snakeCaseMetadata' }],
    },
    {
      // createAnalyticsResponseV2: metadata is arg index 4
      // Regression guard: this builder was missing from METADATA_ARG_INDEX,
      // so the rule silently never checked its 9 call-sites' metadata.
      code: 'createAnalyticsResponseV2(\'op\', {}, \'type\', [], { camelCaseKey: 1 });',
      errors: [{ messageId: 'snakeCaseMetadata' }],
    },
    {
      // member-expression callee form: this.createSuccessResponseV2(...)
      code: 'this.createSuccessResponseV2(\'op\', {}, undefined, { camelCaseKey: 1 });',
      errors: [{ messageId: 'snakeCaseMetadata' }],
    },
  ],
});

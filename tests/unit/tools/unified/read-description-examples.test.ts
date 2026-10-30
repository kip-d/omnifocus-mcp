/**
 * COMMON QUERIES in omnifocus_read's description is the block models copy
 * from when writing a call. An example there that the schema rejects teaches
 * a failing call, so every example must parse.
 *
 * The text-search example exists because transcripts showed ~180 failed reads
 * guessing the search shape (`filters: { search: "x" }`, bare `text: "x"`)
 * while the correct syntax sat only further down, under FILTER OPERATORS.
 */

import { describe, it, expect, vi } from 'vitest';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { ReadSchema } from '../../../../src/tools/unified/schemas/read-schema.js';

vi.mock('../../../../src/cache/CacheManager');
vi.mock('../../../../src/omnifocus/OmniAutomation');

// The object literal starting at `start`, found by brace depth so trailing
// prose on the line can't leak into it.
function objectLiteralAt(line: string, start: number): string {
  let depth = 0;
  let inString = false;
  for (let i = start; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return line.slice(start, i + 1);
  }
  throw new Error(`Unbalanced example: ${line}`);
}

// Every line in the block carrying `{ query:` is an example; one that can't be
// extracted throws rather than silently dropping out of coverage.
function commonQueryExamples(): { label: string; payload: unknown }[] {
  const description = new OmniFocusReadTool({} as CacheManager).description;
  const block = description.split('COMMON QUERIES:')[1].split('\n\n')[0];
  return block
    .split('\n')
    .filter((line) => line.includes('{ query:'))
    .map((line) => {
      const literal = objectLiteralAt(line, line.indexOf('{ query:'));
      // Examples are JS object literals; quote bare keys (only after `{` or `,`,
      // so a colon inside a string value is left alone) to read them as JSON.
      const json = literal.replace(/([{,]\s*)(\w+):/g, '$1"$2":');
      return { label: line.slice(2, line.indexOf(':')), payload: JSON.parse(json) as unknown };
    });
}

describe('omnifocus_read COMMON QUERIES examples', () => {
  const examples = commonQueryExamples();

  it('finds the examples', () => {
    expect(examples.length).toBeGreaterThanOrEqual(10);
  });

  it.each(examples)('$label parses against ReadSchema', ({ payload }) => {
    expect(ReadSchema.safeParse(payload).error?.issues).toBeUndefined();
  });

  it('includes a text-search example using the filters.text object form', () => {
    const textSearch = examples.find(({ payload }) => {
      const filters = (payload as { query: { filters?: Record<string, unknown> } }).query.filters;
      return typeof filters?.text === 'object' && filters.text !== null && 'contains' in filters.text;
    });
    expect(textSearch).toBeDefined();
  });
});

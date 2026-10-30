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

function commonQueryExamples(): { label: string; payload: unknown }[] {
  const description = new OmniFocusReadTool({} as CacheManager).description;
  const block = description.split('COMMON QUERIES:')[1].split('\n\n')[0];
  return block
    .split('\n')
    .map((line) => /^- ([^:]+): (\{ query: .*\} \})/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      label: m[1],
      // Examples are JS object literals; quote the bare keys to read them as JSON.
      payload: JSON.parse(m[2].replace(/(\w+):/g, '"$1":')) as unknown,
    }));
}

describe('omnifocus_read COMMON QUERIES examples', () => {
  const examples = commonQueryExamples();

  it('finds the examples', () => {
    expect(examples.length).toBeGreaterThanOrEqual(10);
  });

  it.each(examples)('$label parses against ReadSchema', ({ payload }) => {
    expect(ReadSchema.safeParse(payload).success).toBe(true);
  });

  it('includes a text-search example using the filters.text object form', () => {
    const textSearch = examples.find(({ payload }) => {
      const filters = (payload as { query: { filters?: Record<string, unknown> } }).query.filters;
      return typeof filters?.text === 'object' && filters.text !== null && 'contains' in filters.text;
    });
    expect(textSearch).toBeDefined();
  });
});

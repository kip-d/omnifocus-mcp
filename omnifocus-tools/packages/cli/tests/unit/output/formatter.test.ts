import { describe, expect, it } from 'vitest';
import { formatOutput, OutputFormat } from '../../../src/output/formatter.js';

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleTasks = [
  {
    id: 'abc123',
    name: 'Buy groceries',
    flagged: true,
    completed: false,
    dueDate: '2026-03-01 17:00',
    tags: ['errands', 'home'],
  },
  {
    id: 'def456',
    name: 'Write report',
    flagged: false,
    completed: false,
    dueDate: null,
    tags: [],
  },
  {
    id: 'ghi789',
    name: 'Review PR',
    flagged: true,
    completed: true,
    dueDate: '2026-02-28 17:00',
    tags: ['work'],
  },
];

const singleTask = {
  id: 'abc123',
  name: 'Buy groceries',
  flagged: true,
  completed: false,
  dueDate: '2026-03-01 17:00',
  tags: ['errands', 'home'],
};

// ---------------------------------------------------------------------------
// JSON format
// ---------------------------------------------------------------------------

describe('formatOutput: json', () => {
  it('returns valid JSON for array data', () => {
    const result = formatOutput(sampleTasks, 'json');
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(sampleTasks);
  });

  it('returns valid JSON for single object', () => {
    const result = formatOutput(singleTask, 'json');
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(singleTask);
  });

  it('pretty-prints with 2-space indent', () => {
    const result = formatOutput(sampleTasks, 'json');
    // Second line should have 2-space indent
    const lines = result.split('\n');
    expect(lines[1]).toMatch(/^ {2}/);
  });

  it('handles empty array', () => {
    expect(formatOutput([], 'json')).toBe('No results');
  });
});

// ---------------------------------------------------------------------------
// Text format (LLM-friendly)
// ---------------------------------------------------------------------------

describe('formatOutput: text', () => {
  it('contains task names', () => {
    const result = formatOutput(sampleTasks, 'text');
    expect(result).toContain('Buy groceries');
    expect(result).toContain('Write report');
    expect(result).toContain('Review PR');
  });

  it('uses pipe separator between fields', () => {
    const result = formatOutput(sampleTasks, 'text');
    expect(result).toContain(' | ');
  });

  it('uses key:value pairs', () => {
    const result = formatOutput(sampleTasks, 'text');
    expect(result).toContain('name:Buy groceries');
    expect(result).toContain('id:abc123');
  });

  it('shows boolean keys by name when true, omits when false', () => {
    const result = formatOutput(sampleTasks, 'text');
    const lines = result.split('\n');
    // First task: flagged=true, completed=false
    expect(lines[0]).toContain('flagged');
    expect(lines[0]).not.toContain('completed');
    // Second task: flagged=false, completed=false
    expect(lines[1]).not.toContain('flagged');
    expect(lines[1]).not.toContain('completed');
  });

  it('joins array values with comma', () => {
    const result = formatOutput(sampleTasks, 'text');
    expect(result).toContain('tags:errands,home');
  });

  it('omits null and empty string values', () => {
    const result = formatOutput(sampleTasks, 'text');
    const lines = result.split('\n');
    // Second task has dueDate:null and tags:[] (empty array)
    // null dueDate should be omitted
    expect(lines[1]).not.toContain('dueDate');
  });

  it('outputs one record per line', () => {
    const result = formatOutput(sampleTasks, 'text');
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
  });

  it('returns "No results" for empty array', () => {
    expect(formatOutput([], 'text')).toBe('No results');
  });

  it('handles single object (not wrapped in array)', () => {
    const result = formatOutput(singleTask, 'text');
    expect(result).toContain('Buy groceries');
    expect(result).toContain('flagged');
  });
});

// ---------------------------------------------------------------------------
// Markdown format
// ---------------------------------------------------------------------------

describe('formatOutput: markdown', () => {
  it('contains pipe characters for table structure', () => {
    const result = formatOutput(sampleTasks, 'markdown');
    expect(result).toContain('|');
  });

  it('contains task names', () => {
    const result = formatOutput(sampleTasks, 'markdown');
    expect(result).toContain('Buy groceries');
    expect(result).toContain('Write report');
    expect(result).toContain('Review PR');
  });

  it('has header row with field names', () => {
    const result = formatOutput(sampleTasks, 'markdown');
    const lines = result.split('\n');
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('name');
    expect(lines[0]).toContain('flagged');
  });

  it('has separator row with dashes', () => {
    const result = formatOutput(sampleTasks, 'markdown');
    const lines = result.split('\n');
    expect(lines[1]).toContain('---');
  });

  it('has data rows after separator', () => {
    const result = formatOutput(sampleTasks, 'markdown');
    const lines = result.split('\n');
    // header + separator + 3 data rows = 5 lines
    expect(lines).toHaveLength(5);
  });

  it('quiet mode suppresses header and separator', () => {
    const result = formatOutput(sampleTasks, 'markdown', { quiet: true });
    const lines = result.split('\n');
    // Only data rows: 3 lines
    expect(lines).toHaveLength(3);
    expect(lines[0]).not.toContain('---');
  });

  it('returns "No results" for empty array', () => {
    expect(formatOutput([], 'markdown')).toBe('No results');
  });
});

// ---------------------------------------------------------------------------
// CSV format
// ---------------------------------------------------------------------------

describe('formatOutput: csv', () => {
  it('has header row with field names', () => {
    const result = formatOutput(sampleTasks, 'csv');
    const lines = result.split('\n');
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('name');
  });

  it('has data rows after header', () => {
    const result = formatOutput(sampleTasks, 'csv');
    const lines = result.split('\n');
    // header + 3 data rows = 4 lines
    expect(lines).toHaveLength(4);
  });

  it('escapes values containing commas', () => {
    const data = [{ name: 'Task with, comma', id: '1' }];
    const result = formatOutput(data, 'csv');
    expect(result).toContain('"Task with, comma"');
  });

  it('escapes values containing double quotes', () => {
    const data = [{ name: 'Task with "quotes"', id: '1' }];
    const result = formatOutput(data, 'csv');
    // CSV escapes " as ""
    expect(result).toContain('"Task with ""quotes"""');
  });

  it('escapes values containing newlines', () => {
    const data = [{ name: 'Line 1\nLine 2', id: '1' }];
    const result = formatOutput(data, 'csv');
    expect(result).toContain('"Line 1\nLine 2"');
  });

  it('quiet mode suppresses header row', () => {
    const result = formatOutput(sampleTasks, 'csv', { quiet: true });
    const lines = result.split('\n');
    // Only data rows: 3 lines
    expect(lines).toHaveLength(3);
    expect(lines[0]).not.toContain('id,name');
  });

  it('returns "No results" for empty array', () => {
    expect(formatOutput([], 'csv')).toBe('No results');
  });
});

// ---------------------------------------------------------------------------
// Field selection
// ---------------------------------------------------------------------------

describe('formatOutput: field selection', () => {
  it('text: only includes specified fields', () => {
    const result = formatOutput(sampleTasks, 'text', { fields: ['name', 'flagged'] });
    expect(result).toContain('name:Buy groceries');
    expect(result).toContain('flagged');
    expect(result).not.toContain('id:');
    expect(result).not.toContain('dueDate');
  });

  it('markdown: only includes specified fields in header and rows', () => {
    const result = formatOutput(sampleTasks, 'markdown', { fields: ['name', 'dueDate'] });
    const lines = result.split('\n');
    // Header should have name and dueDate but not id
    expect(lines[0]).toContain('name');
    expect(lines[0]).toContain('dueDate');
    expect(lines[0]).not.toContain('id');
  });

  it('csv: only includes specified fields', () => {
    const result = formatOutput(sampleTasks, 'csv', { fields: ['id', 'name'] });
    const lines = result.split('\n');
    expect(lines[0]).toBe('id,name');
  });

  it('json: field selection does not apply (returns full data)', () => {
    const result = formatOutput(sampleTasks, 'json', { fields: ['name'] });
    const parsed = JSON.parse(result);
    // JSON format returns the full data structure, field selection is a display concern
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('name');
  });

  it('ignores fields that do not exist in data', () => {
    const result = formatOutput(sampleTasks, 'text', { fields: ['name', 'nonexistent'] });
    expect(result).toContain('name:Buy groceries');
    expect(result).not.toContain('nonexistent');
  });
});

// ---------------------------------------------------------------------------
// Count-only
// ---------------------------------------------------------------------------

describe('formatOutput: count-only', () => {
  it('returns just the number for count-only data', () => {
    const data = { count: 42 };
    expect(formatOutput(data, 'text')).toBe('42');
  });

  it('returns the number regardless of format', () => {
    const data = { count: 7 };
    const formats: OutputFormat[] = ['text', 'json', 'csv', 'markdown'];
    for (const fmt of formats) {
      expect(formatOutput(data, fmt)).toBe('7');
    }
  });

  it('returns "0" for zero count', () => {
    const data = { count: 0 };
    expect(formatOutput(data, 'text')).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Empty results
// ---------------------------------------------------------------------------

describe('formatOutput: empty results', () => {
  it('returns "No results" for empty array in all formats', () => {
    const formats: OutputFormat[] = ['text', 'json', 'csv', 'markdown'];
    for (const fmt of formats) {
      expect(formatOutput([], fmt)).toBe('No results');
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('formatOutput: edge cases', () => {
  it('handles data with mixed value types', () => {
    const data = [{ name: 'Test', count: 5, active: true, score: 3.14 }];
    const result = formatOutput(data, 'text');
    expect(result).toContain('name:Test');
    expect(result).toContain('count:5');
    expect(result).toContain('active');
    expect(result).toContain('score:3.14');
  });

  it('serializes nested objects as JSON', () => {
    const data = [{ name: 'Test', meta: { key: 'value' } }];
    const result = formatOutput(data, 'text');
    expect(result).toContain('name:Test');
    expect(result).toContain('meta:{"key":"value"}');
    expect(result).not.toContain('[object Object]');
  });

  it('serializes nested objects in markdown cells', () => {
    const data = [{ name: 'Test', meta: { a: 1 } }];
    const result = formatOutput(data, 'markdown');
    expect(result).toContain('{"a":1}');
    expect(result).not.toContain('[object Object]');
  });

  it('serializes nested objects in csv cells', () => {
    const data = [{ name: 'Test', meta: { a: 1 } }];
    const result = formatOutput(data, 'csv');
    // CSV escapes quotes: {"a":1} becomes "{""a"":1}"
    expect(result).toContain('{""a"":1}');
    expect(result).not.toContain('[object Object]');
  });

  it('text omits empty arrays from output', () => {
    const data = [{ name: 'Test', tags: [] }];
    const result = formatOutput(data, 'text');
    // Empty array produces empty string via formatTextValue, which is omitted
    expect(result).not.toContain('tags');
  });

  it('handles undefined options gracefully', () => {
    const result = formatOutput(sampleTasks, 'text');
    expect(result).toContain('Buy groceries');
  });
});

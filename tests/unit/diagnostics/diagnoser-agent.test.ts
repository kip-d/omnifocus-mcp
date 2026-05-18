// tests/unit/diagnostics/diagnoser-agent.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('mcp-failure-diagnoser agent', () => {
  it('has frontmatter name/description and enumerates the five classifications', () => {
    const md = readFileSync(join(process.cwd(), '.claude/agents/mcp-failure-diagnoser.md'), 'utf-8');
    expect(md).toMatch(/^---[\s\S]*name:\s*mcp-failure-diagnoser[\s\S]*---/);
    for (const k of ['SCHEMA_DRIFT', 'DESCRIPTION_GAP', 'COERCION_MISSING', 'LLM_EXPLORATION', 'DATA_ERROR']) {
      expect(md).toContain(k);
    }
  });
});

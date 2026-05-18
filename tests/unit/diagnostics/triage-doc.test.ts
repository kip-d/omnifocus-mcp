// tests/unit/diagnostics/triage-doc.test.ts
import { describe, it, expect } from 'vitest';
import { renderTriageDoc } from '../../../src/diagnostics/triage-doc.js';

describe('renderTriageDoc', () => {
  it('renders a tables-over-prose markdown doc, one row per pattern, with fingerprint', () => {
    const md = renderTriageDoc(
      [
        {
          fingerprint: 'abc123',
          tool: 'omnifocus_write',
          classification: 'SCHEMA_DRIFT',
          suggestedFix: 'add coerceNumber to limit',
          firstSeen: '2026-05-10',
          lastSeen: '2026-05-18',
          count: 7,
        },
      ],
      new Date('2026-05-18T12:00:00Z'),
    );
    expect(md).toContain('# MCP Failure Triage');
    expect(md).toContain('| Fingerprint | Tool | Classification |');
    expect(md).toContain('| abc123 | omnifocus_write | SCHEMA_DRIFT |');
    expect(md).toContain('CAP_GUARD'); // legend documents the sentinel even when unused
  });
});

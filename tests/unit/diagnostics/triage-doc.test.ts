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
    expect(md).toContain('NEEDS_LLM'); // legend documents the agent-unconfigured sentinel
  });

  it('sorts rows by count desc, then fingerprint asc (deterministic), tie-break included', () => {
    // Deliberately wrong input order: low count first, and two equal-count rows out of
    // fingerprint order so the tie-break is actually exercised.
    const md = renderTriageDoc(
      [
        {
          fingerprint: 'ddd',
          tool: 't',
          classification: 'SCHEMA_DRIFT',
          suggestedFix: 'f',
          firstSeen: '',
          lastSeen: '',
          count: 2,
        }, // lowest count
        {
          fingerprint: 'bbb',
          tool: 't',
          classification: 'SCHEMA_DRIFT',
          suggestedFix: 'f',
          firstSeen: '',
          lastSeen: '',
          count: 9,
        }, // tie count=9, fp 'bbb'
        {
          fingerprint: 'aaa',
          tool: 't',
          classification: 'SCHEMA_DRIFT',
          suggestedFix: 'f',
          firstSeen: '',
          lastSeen: '',
          count: 9,
        }, // tie count=9, fp 'aaa'
        {
          fingerprint: 'ccc',
          tool: 't',
          classification: 'SCHEMA_DRIFT',
          suggestedFix: 'f',
          firstSeen: '',
          lastSeen: '',
          count: 5,
        }, // middle count
      ],
      new Date('2026-05-18T12:00:00Z'),
    );
    // Expected render order: count desc → [9,9,5,2]; within the count=9 tie, fingerprint asc → aaa before bbb.
    // So: aaa (9), bbb (9), ccc (5), ddd (2).
    const iAaa = md.indexOf('| aaa |');
    const iBbb = md.indexOf('| bbb |');
    const iCcc = md.indexOf('| ccc |');
    const iDdd = md.indexOf('| ddd |');
    expect(iAaa).toBeGreaterThan(-1);
    expect(iBbb).toBeGreaterThan(-1);
    expect(iCcc).toBeGreaterThan(-1);
    expect(iDdd).toBeGreaterThan(-1);
    // Monotonic increasing position == correct sorted order.
    expect(iAaa).toBeLessThan(iBbb); // count tie broken by fingerprint asc
    expect(iBbb).toBeLessThan(iCcc); // count 9 before count 5
    expect(iCcc).toBeLessThan(iDdd); // count 5 before count 2
  });
});

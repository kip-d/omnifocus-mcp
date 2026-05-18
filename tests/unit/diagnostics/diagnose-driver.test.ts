// tests/unit/diagnostics/diagnose-driver.test.ts
import { it, expect, vi } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runDiagnosis } from '../../../scripts/diagnose-failures.js';
import { z } from 'zod';

it('deterministically classifies a coercion-gap cluster without invoking the agent', async () => {
  const agentRunner = vi.fn();
  const sink = vi.fn();
  await runDiagnosis({
    records: (() => {
      const base = {
        tool: 'omnifocus_x',
        errorType: 'VALIDATION_ERROR',
        errorMessage: 'Expected number, received string',
        inputArgs: { limit: '5' },
        schemaDescription: 'test',
      };
      return [
        { ...base, timestamp: '2026-05-16T10:00:00.000Z' },
        { ...base, timestamp: '2026-05-17T10:00:00.000Z' },
        { ...base, timestamp: '2026-05-18T10:00:00.000Z' },
      ];
    })(),
    registry: [
      {
        name: 'omnifocus_x',
        getInputSchema: () => ({ type: 'object', properties: { limit: { type: 'number' } } }),
        zodSchema: z.object({ limit: z.number() }),
      },
    ],
    ledgerPath: join(mkdtempSync(join(tmpdir(), 'omn37-drv-')), 'ledger.json'),
    now: new Date('2026-05-18T12:00:00Z'),
    thresholds: { minOccurrences: 3, minSpanDays: 2 },
    writeTriageDoc: sink,
    agentRunner,
  });
  // The agent is bypassed because the cluster was resolved DETERMINISTICALLY
  // (advertised limit:number vs Zod z.number() rejecting the string '5' → COERCION_GAP),
  // not because there was nothing to classify.
  expect(agentRunner).not.toHaveBeenCalled();
  expect(sink).toHaveBeenCalledOnce();
  const md = sink.mock.calls[0][0] as string;

  // Assert the actual classified table row is present — NOT the static legend.
  // The legend line for COERCION_MISSING does not contain the tool name, so a line
  // carrying BOTH 'omnifocus_x' and 'COERCION_MISSING' can only be the data row.
  const classifiedRow = md
    .split('\n')
    .find((line) => line.includes('omnifocus_x') && line.includes('COERCION_MISSING'));
  expect(classifiedRow, `expected a triage table row classifying omnifocus_x as COERCION_MISSING\n${md}`).toBeDefined();
  expect(classifiedRow).toMatch(/^\|.*\|.*\|/); // it is a markdown table row
});

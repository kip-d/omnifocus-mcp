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
    records: [
      /* 3x omnifocus_x failures whose inputShape includes a numeric field the Zod rejects as string */
    ],
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
  expect(agentRunner).not.toHaveBeenCalled(); // deterministic class → no LLM
  expect(sink).toHaveBeenCalledOnce();
  const md = sink.mock.calls[0][0] as string;
  expect(md).toContain('COERCION');
});

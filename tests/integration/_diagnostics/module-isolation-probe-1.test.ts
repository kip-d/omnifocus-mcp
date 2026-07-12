import { describe, it } from 'vitest';
import { runModuleIsolationProbe } from './module-isolation-probe.helper.js';

describe('module isolation probe (file 1)', () => {
  it('sees fresh module-scope state; records a persistent globalThis observation', () => {
    runModuleIsolationProbe();
  });
});

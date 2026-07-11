import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('getGlobalSlot', () => {
  const KEY = 'unit-test-probe';
  const globalKey = Symbol.for(`omnifocus-mcp:${KEY}`);

  beforeEach(() => {
    delete (globalThis as unknown as Record<symbol, unknown>)[globalKey];
  });

  it('returns the same instance on repeated calls, ignoring the factory after first creation', async () => {
    const { getGlobalSlot } = await import('../../integration/helpers/global-singleton.js');
    const a = getGlobalSlot(KEY, () => ({ n: 0 }));
    const b = getGlobalSlot(KEY, () => ({ n: 999 }));
    expect(b).toBe(a);
    expect(b.n).toBe(0);
  });

  it('survives a fresh module re-import (the mechanism vitest per-file isolation relies on)', async () => {
    const mod1 = await import('../../integration/helpers/global-singleton.js');
    const slot1 = mod1.getGlobalSlot(KEY, () => ({ n: 0 }));
    slot1.n = 42;

    vi.resetModules();
    const mod2 = await import('../../integration/helpers/global-singleton.js');
    const slot2 = mod2.getGlobalSlot(KEY, () => ({ n: 0 }));

    expect(slot2.n).toBe(42);
  });
});

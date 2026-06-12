import { vi } from 'vitest';
import { OmniAutomation } from '../../src/omnifocus/OmniAutomation.js';

// Default: disable real JXA during unit tests
if (process.env.VITEST_ALLOW_JXA !== '1') {
  vi.spyOn(OmniAutomation.prototype, 'executeJson').mockImplementation(
    vi.fn(async (_script: string, _schema?: any) => ({ success: true, data: {} })),
  );
}

// Helper for suites to create a full mock omni quickly
export function createMockOmni(overrides: Partial<Record<keyof OmniAutomation, any>> = {}) {
  const base: any = {
    buildScript: vi.fn((_t: string, _p?: unknown) => 'script with {}'),
    execute: vi.fn(async (_s: string) => ({})),
    executeJson: vi.fn(async (_s: string, _schema?: any) => ({ success: true, data: {} })),
  };
  Object.assign(base, overrides);
  return base;
}

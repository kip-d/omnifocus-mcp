import { describe, it, expect } from 'vitest';
import {
  HelperContext,
  DEFAULT_HELPER_CONTEXT,
  mergeHelperContext,
  generateHelperConfig,
} from '../../src/omnifocus/scripts/shared/helper-context.js';
import { getUnifiedHelpers } from '../../src/omnifocus/scripts/shared/helpers.js';

describe('HelperContext', () => {
  describe('mergeHelperContext', () => {
    it('should use default values when no context provided', () => {
      const result = mergeHelperContext();
      expect(result).toEqual(DEFAULT_HELPER_CONTEXT);
    });

    it('should merge partial context with defaults', () => {
      const result = mergeHelperContext({ skipAnalysis: false });
      expect(result).toEqual({
        ...DEFAULT_HELPER_CONTEXT,
        skipAnalysis: false,
      });
    });

    it('should override multiple defaults', () => {
      const result = mergeHelperContext({
        skipAnalysis: false,
        performanceTracking: true,
        timeout: 60000,
      });
      expect(result).toEqual({
        ...DEFAULT_HELPER_CONTEXT,
        skipAnalysis: false,
        performanceTracking: true,
        timeout: 60000,
      });
    });
  });

  describe('generateHelperConfig', () => {
    it('should generate valid JavaScript config object', () => {
      const config = generateHelperConfig();
      expect(config).toContain('const HELPER_CONFIG = {');
      expect(config).toContain('skipAnalysis: true');
      expect(config).toContain('performanceTracking: false');
      expect(config).toContain('timeout: 120000');
      expect(config).toContain("cacheStrategy: 'aggressive'");
      expect(config).toContain("helperLevel: 'standard'");
    });

    it('should generate config with custom values', () => {
      const config = generateHelperConfig({
        skipAnalysis: false,
        performanceTracking: true,
      });
      expect(config).toContain('skipAnalysis: false');
      expect(config).toContain('performanceTracking: true');
    });
  });

  describe('Helper Functions with Context', () => {
    it('getUnifiedHelpers should include HELPER_CONFIG', () => {
      const helpers = getUnifiedHelpers();
      expect(helpers).toContain('const HELPER_CONFIG = {');
      expect(helpers).toContain('skipAnalysis: true');
    });

    it('getUnifiedHelpers should accept custom context', () => {
      const helpers = getUnifiedHelpers({ skipAnalysis: false, timeout: 60000 });
      expect(helpers).toContain('skipAnalysis: false');
      expect(helpers).toContain('timeout: 60000');
    });

    it('getUnifiedHelpers should include HELPER_CONFIG', () => {
      const helpers = getUnifiedHelpers();
      expect(helpers).toContain('const HELPER_CONFIG = {');
    });

    it('getUnifiedHelpers should include HELPER_CONFIG', () => {
      const helpers = getUnifiedHelpers();
      expect(helpers).toContain('const HELPER_CONFIG = {');
      expect(helpers).toContain('function safeGet(');
    });

    it('getUnifiedHelpers should include HELPER_CONFIG', () => {
      const helpers = getUnifiedHelpers();
      expect(helpers).toContain('const HELPER_CONFIG = {');
    });

    it('helper functions should work without context (backwards compatible)', () => {
      expect(() => getUnifiedHelpers()).not.toThrow();
      expect(() => getUnifiedHelpers()).not.toThrow();
      expect(() => getUnifiedHelpers()).not.toThrow();
      expect(() => getUnifiedHelpers()).not.toThrow();
    });

    it('should generate valid JavaScript (no syntax errors)', () => {
      const helpers = getUnifiedHelpers({ performanceTracking: true });
      // Should not have unresolved template literal syntax
      expect(helpers).not.toMatch(/\$\{[^}]+\}/);
      // Should have valid HELPER_CONFIG object
      expect(helpers).toContain('const HELPER_CONFIG = {');
      expect(helpers).toContain('};');
    });
  });

  describe('Context Options', () => {
    it('should respect all context options', () => {
      const context: HelperContext = {
        skipAnalysis: false,
        performanceTracking: true,
        maxRetries: 5,
        timeout: 60000,
        cacheStrategy: 'conservative',
        helperLevel: 'full',
      };

      const config = generateHelperConfig(context);
      expect(config).toContain('skipAnalysis: false');
      expect(config).toContain('performanceTracking: true');
      expect(config).toContain('maxRetries: 5');
      expect(config).toContain('timeout: 60000');
      expect(config).toContain("cacheStrategy: 'conservative'");
      expect(config).toContain("helperLevel: 'full'");
    });
  });
});

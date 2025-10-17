import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOmniFocusVersion,
  supportsFeature,
  getVersionInfo,
  clearVersionCache
} from '../../../src/omnifocus/version-detection';

describe('OmniFocus Version Detection', () => {
  beforeEach(() => {
    clearVersionCache();
  });

  describe('getOmniFocusVersion', () => {
    it('should return version info with cached result on second call', () => {
      const first = getOmniFocusVersion();
      const second = getOmniFocusVersion();

      expect(first).toEqual(second);
      expect(first.detectedAt).toBeLessThanOrEqual(second.detectedAt);
    });

    it('should have major version 4 or higher', () => {
      const version = getOmniFocusVersion();
      expect(version.version.major).toBeGreaterThanOrEqual(4);
    });

    it('should parse version correctly', () => {
      const version = getOmniFocusVersion();
      expect(version.version).toBeDefined();
      expect(version.version.major).toBeGreaterThanOrEqual(0);
      expect(version.version.minor).toBeGreaterThanOrEqual(0);
      expect(version.version.patch).toBeGreaterThanOrEqual(0);
    });
  });

  describe('supportsFeature', () => {
    it('should return boolean for plannedDates feature', () => {
      const supports = supportsFeature('plannedDates');
      expect(typeof supports).toBe('boolean');
    });

    it('should return boolean for mutuallyExclusiveTags feature', () => {
      const supports = supportsFeature('mutuallyExclusiveTags');
      expect(typeof supports).toBe('boolean');
    });

    it('should return boolean for enhancedRepeats feature', () => {
      const supports = supportsFeature('enhancedRepeats');
      expect(typeof supports).toBe('boolean');
    });

    it('should return false for unknown features', () => {
      const supports = supportsFeature('unknownFeature' as any);
      expect(supports).toBe(false);
    });

    it('should be consistent across multiple calls', () => {
      const first = supportsFeature('plannedDates');
      const second = supportsFeature('plannedDates');
      expect(first).toBe(second);
    });
  });

  describe('getVersionInfo', () => {
    it('should return version info object', () => {
      const info = getVersionInfo();
      expect(info).toBeDefined();
      expect(info.version).toBeDefined();
      expect(info.features).toBeDefined();
      expect(info.detectedAt).toBeDefined();
    });

    it('should have feature flags', () => {
      const info = getVersionInfo();
      expect(info.features.hasPlannedDates).toBeDefined();
      expect(info.features.hasMutuallyExclusiveTags).toBeDefined();
      expect(info.features.hasEnhancedRepeats).toBeDefined();
    });

    it('should return boolean values for features', () => {
      const info = getVersionInfo();
      expect(typeof info.features.hasPlannedDates).toBe('boolean');
      expect(typeof info.features.hasMutuallyExclusiveTags).toBe('boolean');
      expect(typeof info.features.hasEnhancedRepeats).toBe('boolean');
    });
  });

  describe('clearVersionCache', () => {
    it('should clear cached version info', () => {
      const first = getOmniFocusVersion();
      const cachedTimestamp = first.detectedAt;
      clearVersionCache();

      // Add small delay to ensure different timestamp
      const delay = new Promise(resolve => setTimeout(resolve, 1));
      return delay.then(() => {
        const second = getOmniFocusVersion();
        // After cache clear, should call getOmniFocusVersion again
        expect(second.detectedAt).toBeGreaterThanOrEqual(cachedTimestamp);
      });
    });
  });
});

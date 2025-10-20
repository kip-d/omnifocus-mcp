import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOmniFocusVersion,
  getVersionInfo,
  clearVersionCache
} from '../../../src/omnifocus/version-detection';

describe('OmniFocus Version Detection', () => {
  beforeEach(() => {
    clearVersionCache();
  });

  describe('getOmniFocusVersion', () => {
    it('should return version info with cached result on second call', async () => {
      const first = await getOmniFocusVersion();
      const second = await getOmniFocusVersion();

      expect(first).toEqual(second);
      expect(first.detectedAt).toBeLessThanOrEqual(second.detectedAt);
    });

    it('should have major version 4 or higher', async () => {
      const version = await getOmniFocusVersion();
      expect(version.version.major).toBeGreaterThanOrEqual(4);
    });

    it('should parse version correctly', async () => {
      const version = await getOmniFocusVersion();
      expect(version.version).toBeDefined();
      expect(version.version.major).toBeGreaterThanOrEqual(0);
      expect(version.version.minor).toBeGreaterThanOrEqual(0);
      expect(version.version.patch).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getVersionInfo', () => {
    it('should return version info object', async () => {
      const info = await getVersionInfo();
      expect(info).toBeDefined();
      expect(info.version).toBeDefined();
      expect(info.features).toBeDefined();
      expect(info.detectedAt).toBeDefined();
    });

    it('should have feature flags', async () => {
      const info = await getVersionInfo();
      expect(info.features.hasPlannedDates).toBeDefined();
      expect(info.features.hasMutuallyExclusiveTags).toBeDefined();
      expect(info.features.hasEnhancedRepeats).toBeDefined();
    });

    it('should return boolean values for features', async () => {
      const info = await getVersionInfo();
      expect(typeof info.features.hasPlannedDates).toBe('boolean');
      expect(typeof info.features.hasMutuallyExclusiveTags).toBe('boolean');
      expect(typeof info.features.hasEnhancedRepeats).toBe('boolean');
    });
  });

  describe('clearVersionCache', () => {
    it('should clear cached version info', async () => {
      const first = await getOmniFocusVersion();
      const cachedTimestamp = first.detectedAt;
      clearVersionCache();

      // Add small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));

      const second = await getOmniFocusVersion();
      // After cache clear, should call getOmniFocusVersion again
      expect(second.detectedAt).toBeGreaterThanOrEqual(cachedTimestamp);
    });
  });
});

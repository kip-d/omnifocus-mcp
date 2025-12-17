/**
 * OmniFocus version detection and feature flag system
 * Lazy evaluation: Only checks version when a feature is requested
 */

import { OmniAutomation } from './OmniAutomation.js';
import { GET_VERSION_SCRIPT } from './scripts/system/get-version.js';
import { z } from 'zod';

interface OmniFocusVersion {
  version: string;
  major: number;
  minor: number;
  patch: number;
}

interface OmniFocusFeatures {
  hasPlannedDates: boolean; // 4.7+
  hasMutuallyExclusiveTags: boolean; // 4.7+
  hasEnhancedRepeats: boolean; // 4.7+
}

interface VersionInfo {
  version: OmniFocusVersion;
  features: OmniFocusFeatures;
  detectedAt: number; // timestamp of detection
}

// Cached version info (lazy loaded)
let cachedVersionInfo: VersionInfo | null = null;

// Schema for version script response
const VersionResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  v: z.string(),
});

/**
 * Parse version string like "4.8.4" into components
 */
function parseVersion(versionString: string): OmniFocusVersion {
  const parts = versionString.split('.');
  const major = parseInt(parts[0] || '4', 10);
  const minor = parseInt(parts[1] || '6', 10);
  const patch = parseInt(parts[2] || '1', 10);

  return {
    version: versionString,
    major,
    minor,
    patch,
  };
}

/**
 * Check if version is 4.7 or later
 */
function isVersion47OrLater(version: OmniFocusVersion): boolean {
  if (version.major > 4) return true;
  if (version.major === 4 && version.minor >= 7) return true;
  return false;
}

/**
 * Detect OmniFocus version by querying the application
 * Returns cached result if available
 */
export async function getOmniFocusVersion(): Promise<VersionInfo> {
  // Return cached version if available
  if (cachedVersionInfo) {
    return cachedVersionInfo;
  }

  // Query OmniFocus for actual version
  let detectedVersion: OmniFocusVersion = {
    version: 'unknown',
    major: 4,
    minor: 7,
    patch: 0,
  };

  try {
    const omni = new OmniAutomation();
    const result = await omni.executeJson(GET_VERSION_SCRIPT, VersionResponseSchema);

    if (result.success && result.data.ok && result.data.version) {
      detectedVersion = parseVersion(result.data.version);
    }
  } catch (e) {
    // If we can't detect version, fall back to safe defaults (OmniFocus 4.7.0 is minimum)
    console.error('[version-detection] Failed to detect OmniFocus version:', e);
  }

  // Determine features based on version
  const is47Plus = isVersion47OrLater(detectedVersion);

  cachedVersionInfo = {
    version: detectedVersion,
    features: {
      hasPlannedDates: is47Plus,
      hasMutuallyExclusiveTags: is47Plus,
      hasEnhancedRepeats: is47Plus,
    },
    detectedAt: Date.now(),
  };

  return cachedVersionInfo;
}

/**
 * Get version info for logging/debugging
 */
export async function getVersionInfo(): Promise<VersionInfo> {
  return await getOmniFocusVersion();
}

/**
 * Clear cached version (for testing)
 */
export function clearVersionCache(): void {
  cachedVersionInfo = null;
}

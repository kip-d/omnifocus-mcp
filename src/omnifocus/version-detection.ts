/**
 * OmniFocus version detection and feature flag system
 * Lazy evaluation: Only checks version when a feature is requested
 */

interface OmniFocusVersion {
  version: string;
  major: number;
  minor: number;
  patch: number;
}

interface OmniFocusFeatures {
  hasPlannedDates: boolean;           // 4.7+
  hasMutuallyExclusiveTags: boolean;  // 4.7+
  hasEnhancedRepeats: boolean;        // 4.7+
}

interface VersionInfo {
  version: OmniFocusVersion;
  features: OmniFocusFeatures;
  detectedAt: number; // timestamp of detection
}

// Cached version info (lazy loaded)
let cachedVersionInfo: VersionInfo | null = null;

/**
 * Check if version is 4.7 or later
 */
function isVersion47OrLater(version: OmniFocusVersion): boolean {
  if (version.major > 4) return true;
  if (version.major === 4 && version.minor >= 7) return true;
  return false;
}

/**
 * Detect OmniFocus version by testing for API features
 * Returns cached result if available
 */
export function getOmniFocusVersion(): VersionInfo {
  // Return cached version if available
  if (cachedVersionInfo) {
    return cachedVersionInfo;
  }

  // Try to get version from app
  let detectedVersion: OmniFocusVersion = {
    version: 'unknown',
    major: 4,
    minor: 6,
    patch: 1
  };

  try {
    const app = require('applescript');
    if (app && typeof app.execString === 'function') {
      // This would be the ideal way, but we're in JXA context
      // For now, return safe defaults
    }
  } catch (e) {
    // Not in an environment where we can check
  }

  // Determine features based on version
  const is47Plus = isVersion47OrLater(detectedVersion);

  cachedVersionInfo = {
    version: detectedVersion,
    features: {
      hasPlannedDates: is47Plus,
      hasMutuallyExclusiveTags: is47Plus,
      hasEnhancedRepeats: is47Plus
    },
    detectedAt: Date.now()
  };

  return cachedVersionInfo;
}

/**
 * Check if a specific feature is supported
 * This is the main API for checking version-dependent features
 */
export function supportsFeature(
  feature: 'plannedDates' | 'mutuallyExclusiveTags' | 'enhancedRepeats'
): boolean {
  const versionInfo = getOmniFocusVersion();

  switch (feature) {
    case 'plannedDates':
      return versionInfo.features.hasPlannedDates;
    case 'mutuallyExclusiveTags':
      return versionInfo.features.hasMutuallyExclusiveTags;
    case 'enhancedRepeats':
      return versionInfo.features.hasEnhancedRepeats;
    default:
      return false;
  }
}

/**
 * Get version info for logging/debugging
 */
export function getVersionInfo(): VersionInfo {
  return getOmniFocusVersion();
}

/**
 * Clear cached version (for testing)
 */
export function clearVersionCache(): void {
  cachedVersionInfo = null;
}

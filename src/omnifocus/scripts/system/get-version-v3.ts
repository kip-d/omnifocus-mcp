/**
 * Pure OmniJS v3 get-version - zero helper dependencies
 *
 * Detect OmniFocus version
 *
 * Features:
 * - Returns version string like "4.8.4"
 * - Simple direct property access
 *
 * Performance: Direct property access, minimal overhead
 */
export const GET_VERSION_V3 = `
(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;

  const startTime = Date.now();

  try {
    // Get version from OmniFocus application (direct property access)
    const version = app.version();

    return {
      ok: true,
      v: '3',
      data: {
        version: version
      },
      query_time_ms: Date.now() - startTime
    };
  } catch (error) {
    return {
      ok: false,
      v: '3',
      error: {
        message: error.message || 'Unknown error getting OmniFocus version',
        stack: error.stack
      }
    };
  }
})();
`;

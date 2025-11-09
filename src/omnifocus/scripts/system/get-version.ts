/**
 * JXA script to detect OmniFocus version
 * Returns version string like "4.8.4"
 */

export const GET_VERSION_SCRIPT = `
(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;

  try {
    // Get version from OmniFocus application
    const version = app.version();

    return JSON.stringify({
      ok: true,
      version: version,
      v: "1"
    });
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: error.toString(),
      v: "1"
    });
  }
})();
`;

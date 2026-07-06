/**
 * Robust "run directly, not imported" check (OMN-234 gate review; hoisted for
 * OMN-238). The naive `import.meta.url === \`file://${argv[1]}\`` breaks on
 * percent-encoded characters (spaces, non-ASCII) and symlinked paths, silently
 * turning a direct run into an exit-0 no-op. `pathToFileURL` handles encoding;
 * `realpathSync` resolves symlinks on the argv side.
 *
 * Canonical copy: also duplicated (with a pointer back here) in
 * `tests/support/claude-code-mcp.ts` and `tests/support/gherkin-test-runner.ts`,
 * and inlined in `scripts/measure-actual-script-sizes.js` (plain JS, can't
 * import this TS module without a loader).
 */

import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';

export function isRunDirectly(importMetaUrl: string): boolean {
  if (!process.argv[1]) return false;
  try {
    return importMetaUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

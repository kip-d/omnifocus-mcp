/**
 * The ONE authoritative absolute path to THIS checkout's built MCP server
 * entrypoint. Everything that spawns `node dist/index.js` for tests
 * (mcp-test-client.ts, unified-test-server.ts) and everything that later
 * IDENTIFIES such a spawned process by its command line (shared-server.ts's
 * killOrphanedSharedServer, OMN-263) must import this same constant — the
 * codebase briefly carried two independently-computed copies (one via
 * import.meta.url, one via __dirname), and if a helper ever moved a
 * directory level, fixing one copy while missing the other would silently
 * reopen the PID-reuse identity gap in whichever file was missed, with no
 * compiler or test signal pointing at it.
 *
 * OMN-263: this MUST stay an absolute, checkout-specific path (anchored via
 * import.meta.url, never process.cwd()) — a relative './dist/index.js', or a
 * bare 'dist/index.js' substring, can't distinguish this checkout's spawned
 * test server from an unrelated `node dist/index.js` process. Worst case:
 * a real production OmniFocus MCP server (e.g. one launched by Claude
 * Desktop from a different install directory) that happens to reuse the
 * same PID after this checkout's server crashed uncleanly would be
 * SIGTERM'd by killOrphanedSharedServer. An absolute, checkout-specific
 * path can't collide with a different install directory.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SERVER_PATH = join(REPO_ROOT, 'dist', 'index.js');

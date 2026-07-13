/**
 * The ONE authoritative absolute path to THIS checkout's built MCP server
 * entrypoint. Everything that spawns `node dist/index.js` for tests
 * (mcp-test-client.ts, unified-test-server.ts) imports this constant, and
 * shared-server.ts's recordSharedServerPid RECORDS it in the PID file at
 * spawn time so a later reaper — possibly running in a different worktree —
 * can verify the orphan's identity against what was actually spawned
 * (OMN-263). The codebase briefly carried two independently-computed copies
 * (one via import.meta.url, one via __dirname); if a helper ever moved a
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
 * path can't collide with a different install directory — and because the
 * REAPER checks against the path recorded in the file rather than its own
 * copy of this constant, a sibling worktree's genuine orphan still matches
 * (see shared-server.ts's pass-4 comments).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SERVER_PATH = join(REPO_ROOT, 'dist', 'index.js');

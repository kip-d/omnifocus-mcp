import { describe, it, expect } from 'vitest';
import { isAbsolute } from 'node:path';
import { MCPTestClient } from '../../integration/helpers/mcp-test-client.js';
import { SERVER_PATH } from '../../integration/helpers/server-path.js';

describe('MCPTestClient.pid', () => {
  it('returns undefined (does not throw) before startServer() has spawned a child', () => {
    // OMN-261 review: shared-server.ts's init-failure recovery path probes
    // client.pid from a catch block to decide whether to stop an
    // already-spawned child. The transport's own `child` getter throws when
    // never started — pid must swallow that, or the catch block that's
    // guarding against poisoned shared state can itself throw and skip the
    // reset it exists to guarantee.
    const client = new MCPTestClient();
    expect(() => client.pid).not.toThrow();
    expect(client.pid).toBeUndefined();
  });
});

describe('SERVER_PATH', () => {
  it('is an absolute, checkout-specific path, not a bare relative literal', () => {
    // OMN-263 code-review follow-up: shared-server.ts's killOrphanedSharedServer
    // matches a live orphan's `ps` command line against this exact string to
    // confirm identity before signaling it. A relative './dist/index.js' (the
    // pre-fix value) is indistinguishable from ANY other checkout's spawned
    // server via a substring match — including a real production OmniFocus
    // MCP server. Absolute + checkout-specific is what makes that collision
    // impossible; a regression back to a relative or bare literal reopens it.
    expect(isAbsolute(SERVER_PATH)).toBe(true);
    expect(SERVER_PATH.endsWith('dist/index.js')).toBe(true);
    expect(SERVER_PATH).not.toBe('./dist/index.js');
    expect(SERVER_PATH).not.toBe('dist/index.js');
  });
});

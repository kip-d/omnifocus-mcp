import { describe, it, expect } from 'vitest';
import { MCPTestClient } from '../../integration/helpers/mcp-test-client.js';

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

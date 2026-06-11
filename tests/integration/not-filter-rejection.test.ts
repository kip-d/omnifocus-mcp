/**
 * OMN-131 regression: unsupported NOT filters must REJECT, not silently
 * return all tasks.
 *
 * The bug: `transformLogicalOperator` special-cased only NOT:{status:
 * 'completed'|'active'}; every other NOT payload warned to the console and
 * compiled to an EMPTY filter — so `NOT:{tags:[...]}` returned the whole
 * database with no diagnostic. The caller trusted a silently-wrong result
 * set (the same failure class as OMN-142's name/note over-match).
 *
 * Contract under test, end to end through the MCP protocol:
 * - unsupported NOT payloads produce an InvalidParams tool error
 * - the supported status inversions keep working
 *
 * Read-only — no fixtures, no sandbox, no cleanup.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

d('OMN-131: unsupported NOT filters reject (no silent match-all)', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = await getSharedClient();
  });

  it('NOT:{tags:{any}} returns a validation error instead of ALL tasks', async () => {
    await expect(
      client.callTool('omnifocus_read', {
        query: { type: 'tasks', filters: { NOT: { tags: { any: ['__test-omn131-nonexistent'] } } }, limit: 5 },
      }),
    ).rejects.toThrow(/NOT/);
  }, 30000);

  it('NOT:{flagged:true} returns a validation error naming the alternative', async () => {
    await expect(
      client.callTool('omnifocus_read', {
        query: { type: 'tasks', filters: { NOT: { flagged: true } }, limit: 5 },
      }),
    ).rejects.toThrow(/flagged/);
  }, 30000);

  it("NOT:{status:'completed'} still compiles and succeeds", async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { NOT: { status: 'completed' } }, limit: 1, countOnly: true },
    })) as { success: boolean };

    expect(result.success).toBe(true);
  }, 60000);
});

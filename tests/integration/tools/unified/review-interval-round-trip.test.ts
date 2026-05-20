/**
 * OMN-60 / OMN-41 #14 — review interval round-trip.
 *
 * Proves the full path works end-to-end: omnifocus_analyze set_schedule with a
 * reviewInterval → the value actually persists on the project (read back).
 *
 * Before the fix this FAILS: the analyze path hardcoded reviewInterval:null
 * (so the script never received it) and set-review-schedule.ts assigned a
 * plain object OmniFocus rejects. The assertFieldPersisted helper (OMN-41) is
 * dogfooded here — it is exactly the silent-no-op detector this bug needed.
 *
 * Sandbox conventions: project created in __MCP_TEST_SANDBOX__, name __TEST__,
 * deleted in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { expectOk } from '../../helpers/expect-ok.js';
import { assertFieldPersisted } from '../../helpers/assert-field-persisted.js';
import { SANDBOX_FOLDER_NAME, ensureSandboxFolder } from '../../helpers/sandbox-manager.js';
import { runScopedName } from '../../helpers/run-id.js';

describe('Review interval round-trip (OMN-60)', () => {
  let serverProcess: ChildProcess;
  let createdProjectId: string | undefined;
  let nextId = 1;

  async function sendRequest(request: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      let response = '';
      const timeout = setTimeout(() => reject(new Error('Request timeout after 120s')), 120000);

      const onData = (data: Buffer) => {
        response += data.toString();
        for (const line of response.split('\n')) {
          if (line.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.jsonrpc === '2.0' && 'result' in parsed) {
                clearTimeout(timeout);
                serverProcess.stdout?.off('data', onData);
                resolve(parsed.result);
                return;
              }
              if (parsed.jsonrpc === '2.0' && 'error' in parsed) {
                clearTimeout(timeout);
                serverProcess.stdout?.off('data', onData);
                reject(new Error(`MCP error: ${JSON.stringify(parsed.error)}`));
                return;
              }
            } catch {
              /* keep collecting */
            }
          }
        }
      };
      serverProcess.stdout?.on('data', onData);
      serverProcess.stdin?.write(requestStr);
    });
  }

  // assertFieldPersisted ClientLike adapter: tools/call → parsed StandardResponseV2.
  const client = {
    callTool: async (name: string, args: unknown) => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: ++nextId,
        method: 'tools/call',
        params: { name, arguments: args },
      });
      const content = (result as { content: Array<{ text: string }> }).content;
      return JSON.parse(content[0].text);
    },
  };

  beforeAll(async () => {
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    serverProcess = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    await sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    });
    await ensureSandboxFolder();
  }, 60000);

  afterAll(async () => {
    if (createdProjectId) {
      try {
        await client.callTool('omnifocus_write', {
          mutation: { operation: 'delete', target: 'project', target_id: createdProjectId },
        });
      } catch {
        /* best-effort cleanup */
      }
    }
    serverProcess?.kill();
  });

  it('persists a reviewInterval set via omnifocus_analyze set_schedule', async () => {
    const createRes = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'project',
        data: {
          name: runScopedName(`OMN-60_ReviewInterval_${Date.now()}`),
          folder: SANDBOX_FOLDER_NAME,
        },
      },
    });
    expectOk(createRes, 'create sandbox project');
    createdProjectId = createRes.data?.project?.id ?? createRes.data?.project?.projectId ?? createRes.data?.id;
    expect(createdProjectId, 'created project id').toBeTruthy();

    // Use a NON-DEFAULT interval. OmniFocus' default review interval is
    // {weeks,2}; setting weeks/2 would pass even if the write no-op'd. months/5
    // is unambiguous proof the value was actually written.
    const setRes = await client.callTool('omnifocus_analyze', {
      analysis: {
        type: 'manage_reviews',
        params: {
          operation: 'set_schedule',
          projectId: createdProjectId,
          reviewInterval: { unit: 'month', steps: 5 },
        },
      },
    });
    expectOk(setRes, 'set_schedule reviewInterval');

    // Read back through the public API: reviewInterval is now a requestable
    // ProjectFieldEnum field emitted by the AST projects script (OMN-60).
    await assertFieldPersisted(client, {
      readTool: 'omnifocus_read',
      readParams: {
        query: {
          type: 'projects',
          filters: { folder: SANDBOX_FOLDER_NAME },
          fields: ['id', 'reviewInterval'],
        },
      },
      extract: (r) => {
        const projects =
          (r.data as { projects?: Array<{ id: string; reviewInterval?: { steps?: number } }> } | undefined)?.projects ??
          [];
        return projects.find((p) => p.id === createdProjectId)?.reviewInterval?.steps;
      },
      expected: 5,
      context: 'set_schedule reviewInterval steps round-trip',
    });
  }, 120000);
});

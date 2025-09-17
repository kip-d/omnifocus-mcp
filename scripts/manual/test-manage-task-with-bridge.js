#!/usr/bin/env node

import { spawn, spawnSync } from 'child_process';
import readline from 'readline';
import { writeFileSync } from 'fs';

function parseTextResponse(response) {
  const content = response?.result?.content;
  if (!Array.isArray(content)) return null;
  const textEntry = content.find(item => item.type === 'text');
  if (!textEntry) return null;
  try {
    return JSON.parse(textEntry.text);
  } catch (error) {
    return null;
  }
}

async function run() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const createTag = `BridgeMcpCreateTag-${timestamp}`;
  const updateTag = `BridgeMcpUpdateTag-${timestamp}`;
  const createTaskName = `BridgeMcpCreate-${timestamp}`;
  const updateTaskName = `BridgeMcpUpdate-${timestamp}`;

  const server = spawn('node', ['dist/index.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: server.stdout, crlfDelay: Infinity });

  let nextId = 1;
  const pending = new Map();

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      console.error('[client] non-JSON line:', trimmed);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(message, 'id') && pending.has(message.id)) {
      const { resolve } = pending.get(message.id);
      pending.delete(message.id);
      resolve(message);
    }
  });

  function send(method, params = {}) {
    const id = nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    server.stdin.write(JSON.stringify(payload) + '\n');
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }, 60000);
      pending.set(id, {
        resolve: (message) => {
          clearTimeout(timeout);
          if (message.error) {
            reject(new Error(`RPC error for ${method}: ${JSON.stringify(message.error)}`));
            return;
          }
          resolve(message);
        },
      });
    });
  }

  let createdTaskId = null;
  let updatedTaskId = null;

  try {
    await send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'bridge-test-client', version: '1.0.0' },
    });
    await send('tools/list');

    const createResp = await send('tools/call', {
      name: 'manage_task',
      arguments: {
        operation: 'create',
        name: createTaskName,
        note: 'Bridge MCP tag reliability test',
        tags: [createTag],
      },
    });
    const createData = parseTextResponse(createResp);
    createdTaskId = createData?.data?.task?.taskId || createData?.data?.task?.id || null;
    if (!createdTaskId) {
      throw new Error('Failed to retrieve created task ID');
    }

    const updateCreateResp = await send('tools/call', {
      name: 'manage_task',
      arguments: {
        operation: 'create',
        name: updateTaskName,
        note: 'Bridge MCP update test',
      },
    });
    const updateCreateData = parseTextResponse(updateCreateResp);
    updatedTaskId = updateCreateData?.data?.task?.taskId || updateCreateData?.data?.task?.id || null;
    if (!updatedTaskId) {
      throw new Error('Failed to create task for update scenario');
    }

    await send('tools/call', {
      name: 'manage_task',
      arguments: {
        operation: 'update',
        taskId: updatedTaskId,
        tags: [updateTag],
      },
    });

    const initialQuery = await send('tools/call', {
      name: 'tasks',
      arguments: {
        mode: 'all',
        tags: [updateTag],
        limit: '10',
        details: 'true',
      },
    });
    const initialData = parseTextResponse(initialQuery);

    const bridgeResult = spawnSync('node', ['scripts/manual/apply-tag-bridge.js', updatedTaskId, updateTag]);
    const bridgeStdout = bridgeResult.stdout.toString().trim();
    const bridgeStderr = bridgeResult.stderr.toString().trim();
    let bridgeData = null;
    if (bridgeStdout) {
      try {
        bridgeData = JSON.parse(bridgeStdout);
      } catch (parseError) {
        bridgeData = { parseError: String(parseError), raw: bridgeStdout };
      }
    }
    if (bridgeStderr) {
      console.error('apply-tag-bridge stderr:', bridgeStderr);
    }
    if (bridgeResult.status !== 0) {
      throw new Error('apply-tag-bridge script failed');
    }

    const postBridgeQuery = await send('tools/call', {
      name: 'tasks',
      arguments: {
        mode: 'all',
        tags: [updateTag],
        limit: '10',
        details: 'true',
      },
    });
    const postBridgeData = parseTextResponse(postBridgeQuery);

    const summary = {
      initialData,
      bridgeData,
      postBridgeData,
    };
    writeFileSync('/tmp/manage-task-bridge-summary.json', JSON.stringify(summary, null, 2));
    console.log('Bridge test summary written to /tmp/manage-task-bridge-summary.json');

    await send('tools/call', {
      name: 'manage_task',
      arguments: {
        operation: 'delete',
        taskId: createdTaskId,
      },
    });
    await send('tools/call', {
      name: 'manage_task',
      arguments: {
        operation: 'delete',
        taskId: updatedTaskId,
      },
    });
    await send('tools/call', {
      name: 'tags',
      arguments: {
        operation: 'manage',
        action: 'delete',
        tagName: createTag,
      },
    }).catch(() => {});
    await send('tools/call', {
      name: 'tags',
      arguments: {
        operation: 'manage',
        action: 'delete',
        tagName: updateTag,
      },
    }).catch(() => {});
  } finally {
    try {
      server.stdin.end();
    } catch (error) {
      /* ignore */
    }
    await new Promise((resolve) => server.once('exit', resolve));
  }
}

run().catch((error) => {
  console.error('manage-task bridge test failed:', error);
  process.exitCode = 1;
});

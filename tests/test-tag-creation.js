#!/usr/bin/env node

/**
 * Direct test of tag creation and retrieval
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const server = spawn('node', ['./dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test' }
});

let messageId = 1;
const pendingRequests = new Map();

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    if (response.id && pendingRequests.has(response.id)) {
      const resolver = pendingRequests.get(response.id);
      pendingRequests.delete(response.id);
      resolver(response);
    }
  } catch (e) {
    // Ignore non-JSON output
  }
});

function sendRequest(method, params = {}, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const requestId = messageId++;
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params
    };

    pendingRequests.set(requestId, resolve);
    server.stdin.write(JSON.stringify(request) + '\n');

    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
      }
    }, timeout);
  });
}

async function parseResponse(response) {
  if (response.error) {
    throw new Error(`Tool error: ${response.error.message}`);
  }

  try {
    const first = response.result?.content?.[0];
    if (!first || !first.type) return response.result;
    if (first.type === 'json') return first.json;
    if (first.type === 'text') return JSON.parse(first.text);
    return response.result;
  } catch (e) {
    return response.result;
  }
}

async function main() {
  try {
    console.log('🚀 Initializing MCP server...');

    // Initialize
    const initResponse = await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'tag-test', version: '1.0.0' }
    });
    console.log('✅ Server initialized');

    // Send initialized notification
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');

    await new Promise(resolve => setTimeout(resolve, 100));

    // Create a task with a tag
    const uniqueName = `Tag Test ${Date.now()}`;
    console.log(`\n📝 Creating task "${uniqueName}" with tag "test-tag"...`);

    const createResponse = await sendRequest('tools/call', {
      name: 'manage_task',
      arguments: {
        operation: 'create',
        name: uniqueName,
        tags: ['test-tag']
      }
    });

    const createResult = await parseResponse(createResponse);
    console.log('📊 Create result:', JSON.stringify(createResult, null, 2));

    if (createResult.success && createResult.data?.task?.taskId) {
      const taskId = createResult.data.task.taskId;
      console.log(`✅ Task created with ID: ${taskId}`);
      console.log(`   Tags in create response: ${JSON.stringify(createResult.data.task.tags)}`);

      // Wait a moment for OmniFocus to process
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Query the task by name
      console.log(`\n🔍 Querying task "${uniqueName}"...`);
      const queryResponse = await sendRequest('tools/call', {
        name: 'tasks',
        arguments: {
          mode: 'search',
          search: uniqueName,
          limit: 10,
          details: true
        }
      });

      const queryResult = await parseResponse(queryResponse);
      console.log('📊 Query result:', JSON.stringify(queryResult, null, 2));

      if (queryResult.success && queryResult.data?.tasks?.length > 0) {
        const foundTask = queryResult.data.tasks.find(t => t.id === taskId);
        if (foundTask) {
          console.log(`✅ Task found in query`);
          console.log(`   Tags in query response: ${JSON.stringify(foundTask.tags)}`);

          if (foundTask.tags && foundTask.tags.includes('test-tag')) {
            console.log(`\n✅ SUCCESS: Tags are working correctly!`);
          } else {
            console.log(`\n❌ PROBLEM: Task created with tags but query returned: ${JSON.stringify(foundTask.tags)}`);
          }
        } else {
          console.log(`❌ Task not found in query results`);
        }
      }

      // Clean up
      console.log(`\n🧹 Cleaning up test task...`);
      const deleteResponse = await sendRequest('tools/call', {
        name: 'manage_task',
        arguments: {
          operation: 'delete',
          taskId
        }
      });
      console.log('✅ Cleanup complete');
    }

    // Shut down
    console.log('\n👋 Shutting down...');
    server.stdin.end();

    setTimeout(() => {
      if (!server.killed) {
        server.kill('SIGTERM');
      }
      process.exit(0);
    }, 2000);

  } catch (error) {
    console.error('❌ Error:', error);
    server.kill('SIGTERM');
    process.exit(1);
  }
}

main();

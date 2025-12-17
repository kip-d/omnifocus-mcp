#!/usr/bin/env node

/**
 * Test tag update operations with bridge
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const server = spawn('node', ['./dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test' },
});

let messageId = 1;
const pendingRequests = new Map();

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity,
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
      params,
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
    console.log('🚀 Testing tag UPDATE operations with bridge...\n');

    // Initialize
    const initResponse = await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'tag-update-test', version: '1.0.0' },
    });
    console.log('✅ Server initialized');

    // Send initialized notification
    server.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }) + '\n',
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Step 1: Create a task with initial tag
    const uniqueName = `Tag Update Test ${Date.now()}`;
    console.log(`\n📝 Step 1: Creating task "${uniqueName}" with initial tag "initial-tag"...`);

    const createResponse = await sendRequest('tools/call', {
      name: 'manage_task',
      arguments: {
        operation: 'create',
        name: uniqueName,
        tags: ['initial-tag'],
      },
    });

    const createResult = await parseResponse(createResponse);
    console.log('📊 Create result tags:', JSON.stringify(createResult.data?.task?.tags));

    if (!createResult.success || !createResult.data?.task?.taskId) {
      console.log('❌ FAILED: Could not create task');
      server.kill('SIGTERM');
      process.exit(1);
    }

    const taskId = createResult.data.task.taskId;
    console.log(`✅ Task created with ID: ${taskId}`);
    console.log(`   Initial tags: ${JSON.stringify(createResult.data.task.tags)}`);

    // Wait for OmniFocus to process
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 2: Update task tags
    console.log(`\n🔄 Step 2: Updating task tags to ["updated-tag", "second-tag"]...`);

    const updateResponse = await sendRequest('tools/call', {
      name: 'manage_task',
      arguments: {
        operation: 'update',
        taskId: taskId,
        tags: ['updated-tag', 'second-tag'],
      },
    });

    const updateResult = await parseResponse(updateResponse);
    console.log('📊 Update result:', JSON.stringify(updateResult, null, 2));

    if (!updateResult.success) {
      console.log(`❌ FAILED: Update operation failed`);
      console.log(`   Error: ${updateResult.error?.message}`);
    } else {
      console.log(`✅ Update operation succeeded`);
    }

    // Wait longer for OmniFocus to process and update indexes
    console.log('   Waiting 3 seconds for OmniFocus to update indexes...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Step 3: Query the task to verify tags were updated
    console.log(`\n🔍 Step 3: Querying task to verify tag update...`);
    const queryResponse = await sendRequest('tools/call', {
      name: 'tasks',
      arguments: {
        mode: 'search',
        search: uniqueName,
        limit: 10,
        details: true,
        // Add timestamp to bust cache
        _cacheBuster: Date.now(),
      },
    });

    const queryResult = await parseResponse(queryResponse);
    console.log(`📊 Query returned ${queryResult.data?.tasks?.length || 0} tasks`);

    if (queryResult.success && queryResult.data?.tasks?.length > 0) {
      const foundTask = queryResult.data.tasks.find((t) => t.id === taskId);
      if (foundTask) {
        console.log(`✅ Task found in query`);
        console.log(`   Tags after update: ${JSON.stringify(foundTask.tags)}`);

        if (foundTask.tags && foundTask.tags.includes('updated-tag') && foundTask.tags.includes('second-tag')) {
          console.log(`\n✅ SUCCESS: Tag update working correctly!`);
          console.log(`   ✓ Tags updated from ["initial-tag"] to ["updated-tag", "second-tag"]`);
        } else {
          console.log(`\n❌ PROBLEM: Tags not updated correctly`);
          console.log(`   Expected: ["updated-tag", "second-tag"]`);
          console.log(`   Got: ${JSON.stringify(foundTask.tags)}`);
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
        taskId,
      },
    });
    console.log('✅ Cleanup complete');

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

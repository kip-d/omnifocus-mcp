#!/usr/bin/env node

/**
 * Test moving tasks to parent (action groups) with debugging
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '../../dist/index.js');

function sendRequest(proc: any, method: string, params: any = {}): Promise<any> {
  return new Promise((resolve) => {
    const id = Date.now();
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    const listener = (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            if (response.id === id) {
              proc.stdout.off('data', listener);
              resolve(response);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    };

    proc.stdout.on('data', listener);
    proc.stdin.write(JSON.stringify(request) + '\n');
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('🧪 Testing Move Task to Parent Functionality with Debugging\n');

  const proc = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  try {
    // Initialize
    await sendRequest(proc, 'initialize', {
      clientInfo: { name: 'test-client', version: '1.0.0' },
      capabilities: {},
    });

    // Step 1: Create a parent task
    console.log('1️⃣ Creating parent task...');
    const parentResult = await sendRequest(proc, 'tools/call', {
      name: 'create_task',
      arguments: {
        name: `Action Group ${Date.now()}`,
        sequential: true,
      },
    });

    const parentData = JSON.parse(parentResult.result.content[0].text);
    const parentTaskId = parentData.data.task.taskId;
    console.log(`✅ Created parent task: ${parentTaskId}`);

    // Step 2: Create a standalone task
    console.log('\n2️⃣ Creating standalone task...');
    const standaloneResult = await sendRequest(proc, 'tools/call', {
      name: 'create_task',
      arguments: {
        name: `Standalone Task ${Date.now()}`,
        note: 'This will be moved to the parent',
      },
    });

    const standaloneData = JSON.parse(standaloneResult.result.content[0].text);
    const standaloneTaskId = standaloneData.data.task.taskId;
    console.log(`✅ Created standalone task: ${standaloneTaskId}`);

    // Step 3: Move standalone task to become a subtask
    console.log('\n3️⃣ Moving task to parent...');
    const moveResult = await sendRequest(proc, 'tools/call', {
      name: 'update_task',
      arguments: {
        taskId: standaloneTaskId,
        parentTaskId: parentTaskId,
      },
    });

    const moveData = JSON.parse(moveResult.result.content[0].text);
    console.log('Move result:', JSON.stringify(moveData, null, 2));
    
    if (moveData.data) {
      console.log('✅ Update operation returned success');
    } else {
      console.log('❌ Failed to move task:', moveData);
    }

    // Wait a bit for cache to expire (tasks cache TTL is 60 seconds)
    console.log('\n⏳ Waiting 2 seconds for operations to settle...');
    await sleep(2000);

    // Step 4: List the parent task to see its children
    console.log('\n4️⃣ Listing parent task to check children...');
    const parentListResult = await sendRequest(proc, 'tools/call', {
      name: 'list_tasks',
      arguments: {
        search: 'Action Group',
        limit: 5,
        includeDetails: true,
      },
    });

    const parentListData = JSON.parse(parentListResult.result.content[0].text);
    if (parentListData.data?.items?.length > 0) {
      const parentTask = parentListData.data.items.find((t: any) => t.id === parentTaskId);
      if (parentTask) {
        console.log('\n📊 Parent task details:');
        console.log(`   ID: ${parentTask.id}`);
        console.log(`   Name: ${parentTask.name}`);
        console.log(`   Child counts:`, parentTask.childCounts);
        console.log(`   Sequential: ${parentTask.sequential}`);
      }
    }

    // Step 5: List the moved task to verify parent relationship
    console.log('\n5️⃣ Verifying child task parent relationship...');
    const childListResult = await sendRequest(proc, 'tools/call', {
      name: 'list_tasks',
      arguments: {
        search: 'Standalone Task',
        limit: 5,
        includeDetails: true,
      },
    });

    const childListData = JSON.parse(childListResult.result.content[0].text);
    if (childListData.data?.items?.length > 0) {
      const movedTask = childListData.data.items.find((t: any) => t.id === standaloneTaskId);
      if (movedTask) {
        console.log('\n📊 Moved task details:');
        console.log(`   ID: ${movedTask.id}`);
        console.log(`   Name: ${movedTask.name}`);
        console.log(`   Parent ID: ${movedTask.parentTaskId || 'None'}`);
        console.log(`   Parent Name: ${movedTask.parentTaskName || 'None'}`);
        console.log(`   Project: ${movedTask.project || 'None'}`);
        
        if (movedTask.parentTaskId === parentTaskId) {
          console.log('\n✅ Parent-child relationship successfully established!');
        } else {
          console.log('\n❌ Parent relationship not properly set');
          console.log(`   Expected parent ID: ${parentTaskId}`);
          console.log(`   Actual parent ID: ${movedTask.parentTaskId}`);
        }
      } else {
        console.log('❌ Could not find moved task in search results');
      }
    }

    // Step 6: Try to get the task directly by ID
    console.log('\n6️⃣ Getting task directly by ID...');
    const directListResult = await sendRequest(proc, 'tools/call', {
      name: 'list_tasks',
      arguments: {
        limit: 1000, // Get many tasks to find ours
        includeDetails: true,
      },
    });

    const directListData = JSON.parse(directListResult.result.content[0].text);
    const foundById = directListData.data?.items?.find((t: any) => t.id === standaloneTaskId);
    if (foundById) {
      console.log('\n📊 Task found by ID search:');
      console.log(`   Parent ID: ${foundById.parentTaskId || 'None'}`);
      console.log(`   Parent Name: ${foundById.parentTaskName || 'None'}`);
    }

    console.log('\n✨ Test completed!');

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    proc.kill();
  }
}

runTest().catch(console.error);
#!/usr/bin/env node

/**
 * Test moving tasks to parent (action groups)
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

async function runTest() {
  console.log('🧪 Testing Move Task to Parent Functionality\n');

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
    if (moveData.success) {
      console.log('✅ Successfully moved task to parent!');
    } else {
      console.log('❌ Failed to move task:', moveData);
    }

    // Step 4: List tasks to verify parent relationship
    console.log('\n4️⃣ Verifying parent-child relationship...');
    const listResult = await sendRequest(proc, 'tools/call', {
      name: 'list_tasks',
      arguments: {
        search: 'Standalone Task',
        limit: 5,
      },
    });

    const listData = JSON.parse(listResult.result.content[0].text);
    if (listData.data?.items?.length > 0) {
      const movedTask = listData.data.items[0];
      console.log('\n📊 Task details after move:');
      console.log(`   Name: ${movedTask.name}`);
      console.log(`   Parent ID: ${movedTask.parentTaskId || 'None'}`);
      console.log(`   Parent Name: ${movedTask.parentTaskName || 'None'}`);
      
      if (movedTask.parentTaskId === parentTaskId) {
        console.log('\n✅ Parent-child relationship successfully established!');
      } else {
        console.log('\n❌ Parent relationship not properly set');
      }
    }

    console.log('\n✨ Test completed!');

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    proc.kill();
  }
}

runTest().catch(console.error);
#!/usr/bin/env node

/**
 * Test parent-child task relationships
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
  console.log('🧪 Testing Parent-Child Task Relationships\n');

  const proc = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  try {
    // Initialize
    await sendRequest(proc, 'initialize', {
      clientInfo: { name: 'test-client', version: '1.0.0' },
      capabilities: {},
    });

    // Step 1: Create a parent task (action group)
    console.log('1️⃣ Creating parent task (action group)...');
    const parentResult = await sendRequest(proc, 'tools/call', {
      name: 'create_task',
      arguments: {
        name: `Plan Party ${Date.now()}`,
        sequential: true,  // Subtasks must be done in order
        note: 'This is an action group with sequential subtasks',
      },
    });

    const parentData = JSON.parse(parentResult.result.content[0].text);
    
    if (!parentData.success || !parentData.data?.task?.taskId) {
      console.error('❌ Failed to create parent task:', parentData);
      return;
    }
    
    const parentTaskId = parentData.data.task.taskId;
    console.log(`✅ Created parent task: ${parentTaskId}`);

    // Step 2: Create child tasks
    console.log('\n2️⃣ Creating subtasks...');
    
    // First subtask
    const child1Result = await sendRequest(proc, 'tools/call', {
      name: 'create_task',
      arguments: {
        name: 'Make guest list',
        parentTaskId: parentTaskId,
        note: 'Must be done first',
      },
    });
    
    const child1Data = JSON.parse(child1Result.result.content[0].text);
    if (child1Data.success) {
      console.log('✅ Created subtask 1: Make guest list');
    } else {
      console.error('❌ Failed to create subtask 1:', child1Data);
    }

    // Second subtask
    const child2Result = await sendRequest(proc, 'tools/call', {
      name: 'create_task',
      arguments: {
        name: 'Send invitations',
        parentTaskId: parentTaskId,
        note: 'Can only be done after guest list is complete',
      },
    });
    
    const child2Data = JSON.parse(child2Result.result.content[0].text);
    if (child2Data.success) {
      console.log('✅ Created subtask 2: Send invitations');
    } else {
      console.error('❌ Failed to create subtask 2:', child2Data);
    }

    // Third subtask
    const child3Result = await sendRequest(proc, 'tools/call', {
      name: 'create_task',
      arguments: {
        name: 'Buy decorations',
        parentTaskId: parentTaskId,
        note: 'Can be done anytime',
      },
    });
    
    const child3Data = JSON.parse(child3Result.result.content[0].text);
    if (child3Data.success) {
      console.log('✅ Created subtask 3: Buy decorations');
    } else {
      console.error('❌ Failed to create subtask 3:', child3Data);
    }

    // Step 3: List tasks to verify hierarchy
    console.log('\n3️⃣ Listing parent task to check children...');
    const listResult = await sendRequest(proc, 'tools/call', {
      name: 'list_tasks',
      arguments: {
        search: 'Plan Party',
        limit: 10,
      },
    });

    const listData = JSON.parse(listResult.result.content[0].text);
    if (listData.data?.items) {
      const parentTask = listData.data.items.find((t: any) => t.id === parentTaskId);
      if (parentTask) {
        console.log('\n📊 Parent task details:');
        console.log(`   Name: ${parentTask.name}`);
        console.log(`   Sequential: ${parentTask.sequential}`);
        if (parentTask.childCounts) {
          console.log(`   Children: ${parentTask.childCounts.total}`);
          console.log(`   Available: ${parentTask.childCounts.available}`);
        }
      }
    }

    console.log('\n✨ Test completed! Check OmniFocus to see the action group structure.');

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    proc.kill();
  }
}

runTest().catch(console.error);
#!/usr/bin/env node

/**
 * Test CRUD operations with fixed ID extraction
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.join(__dirname, '..', '..', 'dist', 'index.js');

function sendRequest(proc, method, params = {}) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };
    
    proc.stdin!.write(JSON.stringify(request) + '\n');
    
    const timeout = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, 30000); // 30 second timeout for OmniFocus operations
    
    const handleResponse = (data) => {
      try {
        const lines = data.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          const response = JSON.parse(line) as any;
          if (response.id === request.id) {
            clearTimeout(timeout);
            proc.stdout.off('data', handleResponse);
            resolve(response);
          }
        }
      } catch (e) {
        // Continue waiting for valid response
      }
    };
    
    proc.stdout.on('data', handleResponse);
  });
}

async function runTest(): void: Promise<void> {
  console.log('🧪 Testing CRUD operations with fixed ID extraction...\n');
  
  const proc: ChildProcess = spawn('node', [serverPath], {
    env: { ...process.env, NODE_ENV: 'test' }
  });
  
  let testPassed = true;
  let createdTaskId = null;
  
  try {
    // Initialize
    console.log('1. Initializing MCP server...');
    const initResponse = await sendRequest(proc, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    if (initResponse.error) {
      throw new Error(`Initialize failed: ${initResponse.error.message}`);
    }
    console.log('✓ Server initialized\n');
    
    // Test 1: Create a task
    console.log('2. Creating a test task...');
    const taskName = `CRUD Test Task ${Date.now()}`;
    const createResponse = await sendRequest(proc, 'tools/call', {
      name: 'create_task',
      arguments: {
        name: taskName,
        note: 'Testing CRUD operations with proper ID handling',
        flagged: true
      }
    });
    
    if (createResponse.error) {
      throw new Error(`Create task failed: ${createResponse.error.message}`);
    }
    
    // Parse the response to get the task ID
    const createResult = JSON.parse(createResponse.result?.content?.[0]?.text || '{}');
    createdTaskId = createResult.taskId || createResult.task?.id;
    
    if (!createdTaskId) {
      console.log('❌ Task created but no ID returned!');
      testPassed = false;
    } else {
      console.log(`✓ Task created with ID: ${createdTaskId}\n`);
    }
    
    // Test 2: List tasks to verify ID is included
    console.log('3. Listing tasks to verify ID is in response...');
    const listResponse = await sendRequest(proc, 'tools/call', {
      name: 'list_tasks',
      arguments: {
        limit: 5,
        flagged: true,
        completed: false
      }
    });
    
    if (listResponse.error) {
      throw new Error(`List tasks failed: ${listResponse.error.message}`);
    }
    
    const listResult = JSON.parse(listResponse.result?.content?.[0]?.text || '{}');
    const tasks = listResult.tasks || [];
    
    // Check if our task is in the list with an ID
    const ourTask = tasks.find(t => t.name === taskName);
    if (!ourTask) {
      console.log('❌ Created task not found in list!');
      testPassed = false;
    } else if (!ourTask.id) {
      console.log('❌ Task found but has no ID!');
      testPassed = false;
    } else {
      console.log(`✓ Task found in list with ID: ${ourTask.id}\n`);
      createdTaskId = ourTask.id; // Use the ID from the list
    }
    
    // Test 3: Update the task
    if (createdTaskId) {
      console.log('4. Updating the task...');
      const updateResponse = await sendRequest(proc, 'tools/call', {
        name: 'update_task',
        arguments: {
          taskId: createdTaskId,
          updates: {
            name: `${taskName} - UPDATED`,
            note: 'Successfully updated via API'
          }
        }
      });
      
      if (updateResponse.error) {
        console.log(`❌ Update failed: ${updateResponse.error.message}`);
        testPassed = false;
      } else {
        console.log('✓ Task updated successfully\n');
      }
    }
    
    // Test 4: Complete the task
    if (createdTaskId && testPassed) {
      console.log('5. Completing the task...');
      const completeResponse = await sendRequest(proc, 'tools/call', {
        name: 'complete_task',
        arguments: {
          taskId: createdTaskId
        }
      });
      
      if (completeResponse.error) {
        console.log(`❌ Complete failed: ${completeResponse.error.message}`);
        testPassed = false;
      } else {
        console.log('✓ Task completed successfully\n');
      }
    }
    
    // Test 5: Verify task is completed
    if (createdTaskId && testPassed) {
      console.log('6. Verifying task is completed...');
      const verifyResponse = await sendRequest(proc, 'tools/call', {
        name: 'list_tasks',
        arguments: {
          limit: 5,
          completed: true,
          search: taskName
        }
      });
      
      if (verifyResponse.error) {
        throw new Error(`Verify failed: ${verifyResponse.error.message}`);
      }
      
      const verifyResult = JSON.parse(verifyResponse.result?.content?.[0]?.text || '{}');
      const completedTask = verifyResult.tasks?.find(t => t.id === createdTaskId);
      
      if (!completedTask) {
        console.log('❌ Completed task not found!');
        testPassed = false;
      } else if (!completedTask.completed) {
        console.log('❌ Task found but not marked as completed!');
        testPassed = false;
      } else {
        console.log('✓ Task verified as completed');
      }
    }
    
  } catch (error) {
    console.error(`\n❌ Test error: ${error.message}`);
    testPassed = false;
  } finally {
    proc.kill();
  }
  
  console.log('\n' + '='.repeat(50));
  if (testPassed) {
    console.log('✅ All CRUD tests passed! ID extraction is working correctly.');
  } else {
    console.log('❌ Some tests failed. Check the output above for details.');
  }
  
  process.exit(testPassed ? 0 : 1);
}

runTest().catch(console.error);
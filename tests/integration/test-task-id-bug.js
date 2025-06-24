#!/usr/bin/env node

/**
 * Test to reproduce the missing task ID bug
 * This test demonstrates that tasks returned from list operations don't include IDs
 */

import { spawn } from 'child_process';
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
    
    proc.stdin.write(JSON.stringify(request) + '\n');
    
    const timeout = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, 10000);
    
    const handleResponse = (data) => {
      try {
        const lines = data.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          const response = JSON.parse(line);
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

async function runTest() {
  console.log('🧪 Testing task ID extraction bug...\n');
  
  const proc = spawn('node', [serverPath], {
    env: { ...process.env, NODE_ENV: 'test' }
  });
  
  let testPassed = true;
  
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
    console.log('✓ Server initialized');
    
    // Create a test task
    console.log('\n2. Creating a test task...');
    const createResponse = await sendRequest(proc, 'tools/call', {
      name: 'create_task',
      arguments: {
        name: `Test Task ID Bug ${Date.now()}`,
        note: 'This task tests if IDs are properly returned'
      }
    });
    
    if (createResponse.error) {
      throw new Error(`Create task failed: ${createResponse.error.message}`);
    }
    
    const createdTaskId = createResponse.result?.content?.[0]?.text?.match(/ID: ([^\s]+)/)?.[1];
    console.log(`✓ Task created with ID: ${createdTaskId || 'UNKNOWN'}`);
    
    // List tasks to check if ID is included
    console.log('\n3. Listing tasks to check for ID field...');
    const listResponse = await sendRequest(proc, 'tools/call', {
      name: 'list_tasks',
      arguments: {
        limit: 10,
        completed: false
      }
    });
    
    if (listResponse.error) {
      throw new Error(`List tasks failed: ${listResponse.error.message}`);
    }
    
    // Parse the response to check for task IDs
    const responseText = listResponse.result?.content?.[0]?.text || '';
    const tasks = responseText.match(/\d+\.\s+\*\*(.*?)\*\*/g) || [];
    
    console.log(`✓ Found ${tasks.length} tasks`);
    
    // Check if any task entries include an ID
    console.log('\n4. Checking if task entries include IDs...');
    const hasIds = responseText.includes('ID:') || responseText.includes('id:');
    
    if (!hasIds) {
      console.log('\n❌ BUG CONFIRMED: Task listings do not include IDs!');
      console.log('   This prevents update, complete, and delete operations from working.');
      testPassed = false;
    } else {
      console.log('✓ Task IDs are included in the response');
    }
    
    // Try to update the created task (this should fail without proper IDs)
    if (createdTaskId && createdTaskId !== 'UNKNOWN') {
      console.log('\n5. Testing task update with ID...');
      const updateResponse = await sendRequest(proc, 'tools/call', {
        name: 'update_task',
        arguments: {
          taskId: createdTaskId,
          updates: {
            name: 'Updated Test Task'
          }
        }
      });
      
      if (updateResponse.error) {
        console.log(`❌ Update failed: ${updateResponse.error.message}`);
        testPassed = false;
      } else {
        console.log('✓ Task update succeeded');
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
    console.log('✅ All tests passed - No ID bug detected');
  } else {
    console.log('❌ Test failed - ID bug confirmed');
    console.log('\nNext steps:');
    console.log('1. Fix task.id.primaryKey to task.id.primaryKey() in JXA scripts');
    console.log('2. Ensure IDs are included in list-tasks response format');
    console.log('3. Update type definitions to include id field');
  }
  
  process.exit(testPassed ? 0 : 1);
}

runTest().catch(console.error);
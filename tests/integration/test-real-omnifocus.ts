#!/usr/bin/env node

/**
 * Real-life test of OmniFocus MCP server with actual OmniFocus application
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
    }, 30000);
    
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
        // Continue waiting
      }
    };
    
    proc.stdout.on('data', handleResponse);
  });
}

async function runTests(): void: Promise<void> {
  console.log('🧪 Running real-life OmniFocus MCP tests...\n');
  
  const proc: ChildProcess = spawn('node', [serverPath], {
    env: { ...process.env, NODE_ENV: 'test' }
  });
  
  let createdTaskId = null;
  let testsPassed: number = 0;
  let testsFailed: number = 0;
  
  try {
    // Initialize server
    console.log('1️⃣  Initializing MCP server...');
    const initResponse = await sendRequest(proc, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'real-test', version: '1.0.0' }
    });
    
    if (initResponse.error) {
      throw new Error(`Initialize failed: ${initResponse.error.message}`);
    }
    console.log('✅ Server initialized successfully\n');
    testsPassed++;
    
    // Test 1: List existing tasks
    console.log('2️⃣  Listing existing tasks...');
    const listResponse = await sendRequest(proc, 'tools/call', {
      name: 'list_tasks',
      arguments: {
        limit: 5,
        completed: false
      }
    });
    
    if (listResponse.error) {
      console.log(`❌ List tasks failed: ${listResponse.error.message}`);
      testsFailed++;
    } else {
      const result = JSON.parse(listResponse.result?.content?.[0]?.text || '{}');
      console.log(`✅ Found ${result.tasks?.length || 0} tasks`);
      
      // Check if tasks have IDs
      if (result.tasks?.length > 0) {
        const firstTask = result.tasks[0];
        if (firstTask.id) {
          console.log(`   ✓ First task has ID: ${firstTask.id}`);
          console.log(`   ✓ Task name: ${firstTask.name}`);
        } else {
          console.log('   ❌ Tasks missing IDs!');
          testsFailed++;
        }
      }
      testsPassed++;
    }
    console.log();
    
    // Test 2: Create a new task
    console.log('3️⃣  Creating a new task...');
    const taskName = `MCP Test Task ${new Date().toLocaleString()}`;
    const createResponse = await sendRequest(proc, 'tools/call', {
      name: 'create_task',
      arguments: {
        name: taskName,
        note: 'Created by MCP real-life test',
        flagged: true,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Due in 7 days
      }
    });
    
    if (createResponse.error) {
      console.log(`❌ Create task failed: ${createResponse.error.message}`);
      testsFailed++;
    } else {
      const result = JSON.parse(createResponse.result?.content?.[0]?.text || '{}');
      createdTaskId = result.taskId || result.task?.id;
      
      if (createdTaskId) {
        console.log(`✅ Task created with ID: ${createdTaskId}`);
        console.log(`   Name: ${taskName}`);
        testsPassed++;
      } else {
        console.log('❌ Task created but no ID returned');
        testsFailed++;
      }
    }
    console.log();
    
    // Test 3: Update the task
    if (createdTaskId) {
      console.log('4️⃣  Updating the created task...');
      const updateResponse = await sendRequest(proc, 'tools/call', {
        name: 'update_task',
        arguments: {
          taskId: createdTaskId,
          updates: {
            name: `${taskName} - UPDATED`,
            note: 'Updated via MCP API test',
            flagged: false
          }
        }
      });
      
      if (updateResponse.error) {
        console.log(`❌ Update task failed: ${updateResponse.error.message}`);
        testsFailed++;
      } else {
        console.log('✅ Task updated successfully');
        testsPassed++;
      }
      console.log();
    }
    
    // Test 4: Add a tag
    if (createdTaskId) {
      console.log('5️⃣  Adding a tag to the task...');
      const tagResponse = await sendRequest(proc, 'tools/call', {
        name: 'update_task',
        arguments: {
          taskId: createdTaskId,
          updates: {
            tags: ['test', 'mcp']
          }
        }
      });
      
      if (tagResponse.error) {
        console.log(`❌ Add tags failed: ${tagResponse.error.message}`);
        testsFailed++;
      } else {
        console.log('✅ Tags added successfully');
        testsPassed++;
      }
      console.log();
    }
    
    // Test 5: List projects
    console.log('6️⃣  Listing projects...');
    const projectsResponse = await sendRequest(proc, 'tools/call', {
      name: 'list_projects',
      arguments: {
        limit: 5,
        status: ['active']
      }
    });
    
    if (projectsResponse.error) {
      console.log(`❌ List projects failed: ${projectsResponse.error.message}`);
      testsFailed++;
    } else {
      const result = JSON.parse(projectsResponse.result?.content?.[0]?.text || '{}');
      console.log(`✅ Found ${result.projects?.length || 0} active projects`);
      
      if (result.projects?.length > 0 && result.projects[0].id) {
        console.log('   ✓ Projects have IDs');
      }
      testsPassed++;
    }
    console.log();
    
    // Test 6: Get productivity stats
    console.log('7️⃣  Getting productivity stats...');
    const statsResponse = await sendRequest(proc, 'tools/call', {
      name: 'productivity_stats',
      arguments: {
        period: 'weekly'
      }
    });
    
    if (statsResponse.error) {
      console.log(`❌ Productivity stats failed: ${statsResponse.error.message}`);
      testsFailed++;
    } else {
      const result = JSON.parse(statsResponse.result?.content?.[0]?.text || '{}');
      console.log(`✅ Weekly stats: ${result.tasksCompleted || 0} tasks completed`);
      testsPassed++;
    }
    console.log();
    
    // Test 7: Complete the task
    if (createdTaskId) {
      console.log('8️⃣  Completing the test task...');
      const completeResponse = await sendRequest(proc, 'tools/call', {
        name: 'complete_task',
        arguments: {
          taskId: createdTaskId
        }
      });
      
      if (completeResponse.error) {
        console.log(`❌ Complete task failed: ${completeResponse.error.message}`);
        testsFailed++;
      } else {
        console.log('✅ Task completed successfully');
        testsPassed++;
      }
      console.log();
    }
    
    // Test 8: Verify completion
    if (createdTaskId) {
      console.log('9️⃣  Verifying task completion...');
      const verifyResponse = await sendRequest(proc, 'tools/call', {
        name: 'list_tasks',
        arguments: {
          completed: true,
          limit: 10
        }
      });
      
      if (verifyResponse.error) {
        console.log(`❌ Verify failed: ${verifyResponse.error.message}`);
        testsFailed++;
      } else {
        const result = JSON.parse(verifyResponse.result?.content?.[0]?.text || '{}');
        const completedTask = result.tasks?.find(t => t.id === createdTaskId);
        
        if (completedTask && completedTask.completed) {
          console.log('✅ Task verified as completed');
          testsPassed++;
        } else {
          console.log('❌ Task not found in completed tasks');
          testsFailed++;
        }
      }
    }
    
  } catch (error) {
    console.error(`\n❌ Test error: ${error.message}`);
    testsFailed++;
  } finally {
    proc.kill();
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary:');
  console.log(`   ✅ Passed: ${testsPassed}`);
  console.log(`   ❌ Failed: ${testsFailed}`);
  console.log(`   📈 Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
  console.log('='.repeat(60));
  
  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! The OmniFocus MCP server is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
  }
  
  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(console.error);
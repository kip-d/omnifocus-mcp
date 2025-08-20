#!/usr/bin/env node
/**
 * Debug test for repeat rule updates
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

console.log('🔍 Debugging Repeat Rule Updates\n');
console.log('=' .repeat(60));

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

let requestId = 1;
let testTaskId = null;
let stage = 'init';

// Helper to send JSON-RPC request
const sendRequest = (method, params = {}) => {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId++
  };
  
  console.log(`\n→ [${new Date().toISOString()}] Sending ${method}:`, 
    method === 'tools/call' ? params.name : '');
  server.stdin.write(JSON.stringify(request) + '\n');
};

// Cleanup
const cleanup = () => {
  server.stdin.end();
  server.kill('SIGTERM');
  process.exit(0);
};

// Handle responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    
    console.log(`← [${new Date().toISOString()}] Response ${response.id}:`, 
      response.error ? 'ERROR' : 'SUCCESS');
    
    if (response.id === 1) {
      // Initialize complete
      stage = 'create';
      console.log('\n📝 Stage 1: Creating task with initial daily repeat rule...');
      sendRequest('tools/call', {
        name: 'create_task',
        arguments: {
          name: 'Repeat Debug Test ' + Date.now(),
          flagged: 'false',
          sequential: 'false',
          repeatRule: {
            unit: 'day',
            steps: '1',
            method: 'fixed'
          }
        }
      });
      
    } else if (response.id === 2) {
      // Task created
      if (response.error) {
        console.error('❌ Failed to create task:', response.error);
        cleanup();
        return;
      }
      
      const content = JSON.parse(response.result.content[0].text);
      const task = content.data?.task || content;
      testTaskId = task.taskId || task.id;
      
      console.log('✅ Created task:', testTaskId);
      console.log('   Has repeat rule:', task.hasRepeatRule || task.repeatRule?.applied);
      console.log('   Full task data:', JSON.stringify(task, null, 2));
      
      // Wait a moment then update
      setTimeout(() => {
        stage = 'update';
        console.log('\n📝 Stage 2: Updating to weekly repeat (Mon/Fri)...');
        sendRequest('tools/call', {
          name: 'update_task',
          arguments: {
            taskId: testTaskId,
            repeatRule: {
              unit: 'week',
              steps: '2',
              method: 'fixed',
              weekdays: ['monday', 'friday']
            }
          }
        });
      }, 1000); // 1 second delay
      
    } else if (response.id === 3) {
      // Task updated
      if (response.error) {
        console.error('❌ Failed to update task:', response.error);
        cleanup();
        return;
      }
      
      const content = JSON.parse(response.result.content[0].text);
      const task = content.data?.task || content;
      
      console.log('✅ Updated task');
      console.log('   Has repeat rule:', task.hasRepeatRule);
      console.log('   Full task data:', JSON.stringify(task, null, 2));
      
      // Query the task again to verify
      setTimeout(() => {
        stage = 'verify';
        console.log('\n📝 Stage 3: Querying task to verify repeat rule...');
        sendRequest('tools/call', {
          name: 'tasks',
          arguments: {
            mode: 'search',
            search: testTaskId,
            limit: '1',
            details: 'true'
          }
        });
      }, 1000);
      
    } else if (response.id === 4) {
      // Task queried
      if (response.error) {
        console.error('❌ Failed to query task:', response.error);
        cleanup();
        return;
      }
      
      const content = JSON.parse(response.result.content[0].text);
      const tasks = content.data?.tasks || content.tasks || [];
      const task = tasks.find(t => t.id === testTaskId);
      
      if (task) {
        console.log('✅ Queried task');
        console.log('   Has repeat rule:', task.hasRepeatRule);
        console.log('   Repeat info:', task.repeatRule || task.recurrence || 'none');
        console.log('   Full task data:', JSON.stringify(task, null, 2));
      } else {
        console.log('⚠️ Task not found in query results');
      }
      
      // Test clear repeat rule
      setTimeout(() => {
        stage = 'clear';
        console.log('\n📝 Stage 4: Clearing repeat rule...');
        sendRequest('tools/call', {
          name: 'update_task',
          arguments: {
            taskId: testTaskId,
            clearRepeatRule: true
          }
        });
      }, 1000);
      
    } else if (response.id === 5) {
      // Repeat rule cleared
      if (response.error) {
        console.error('❌ Failed to clear repeat rule:', response.error);
        cleanup();
        return;
      }
      
      const content = JSON.parse(response.result.content[0].text);
      const task = content.data?.task || content;
      
      console.log('✅ Cleared repeat rule');
      console.log('   Has repeat rule:', task.hasRepeatRule);
      console.log('   Full task data:', JSON.stringify(task, null, 2));
      
      // Final verification
      setTimeout(() => {
        stage = 'final';
        console.log('\n📝 Stage 5: Final query to verify cleared...');
        sendRequest('tools/call', {
          name: 'tasks',
          arguments: {
            mode: 'search',
            search: testTaskId,
            limit: '1',
            details: 'true'
          }
        });
      }, 1000);
      
    } else if (response.id === 6) {
      // Final query
      if (response.error) {
        console.error('❌ Failed to query task:', response.error);
        cleanup();
        return;
      }
      
      const content = JSON.parse(response.result.content[0].text);
      const tasks = content.data?.tasks || content.tasks || [];
      const task = tasks.find(t => t.id === testTaskId);
      
      if (task) {
        console.log('✅ Final query');
        console.log('   Has repeat rule:', task.hasRepeatRule);
        console.log('   Full task data:', JSON.stringify(task, null, 2));
      }
      
      console.log('\n' + '=' .repeat(60));
      console.log('🎯 Test complete!');
      cleanup();
    }
    
  } catch (e) {
    // Ignore non-JSON lines
  }
});

// Start with initialize
sendRequest('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: {
    name: 'repeat-rule-debug',
    version: '1.0.0'
  }
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('\n❌ Test timeout!');
  cleanup();
}, 30000);

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
  cleanup();
});

// Handle unexpected server exit
server.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Server exited with code ${code}`);
  }
});
#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

const server: ChildProcess = spawn('/usr/local/bin/omnifocus-mcp-cached', [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, LOG_LEVEL: 'info' }
});

let msgId = 1;
let testTaskId = null;

function sendMessage(method, params = {}) {
  const msg = {
    jsonrpc: "2.0",
    id: msgId++,
    method,
    params
  };
  server.stdin!.write(JSON.stringify(msg) + '\n');
}

// Monitor stderr
server.stderr!.on('data', (data: Buffer) => {
  console.log(`[LOG] ${data.toString().trim()}`);
});

// Monitor stdout
server.stdout!.on('data', (data: Buffer) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  
  lines.forEach(line => {
    try {
      const msg = JSON.parse(line) as any;
      
      if (msg.id === 1) {
        console.log('✅ Initialize successful!');
        
        // Test 1: Create a task
        console.log('\n🧪 Test 1: Creating a task...');
        sendMessage('tools/call', {
          name: 'create_task',
          arguments: {
            name: 'Test Task from MCP',
            note: 'This is a test task created via the MCP server',
            flagged: true,
            tags: ['test', 'mcp']
          }
        });
      } else if (msg.id === 2 && msg.result) {
        const result = JSON.parse(msg.result.content[0].text);
        if (result.created && result.id) {
          testTaskId = result.id;
          console.log(`✅ Task created with ID: ${testTaskId}`);
          
          // Test 2: Update the task
          console.log('\n🧪 Test 2: Updating the task...');
          sendMessage('tools/call', {
            name: 'update_task',
            arguments: {
              taskId: testTaskId,
              updates: {
                name: 'Updated Test Task',
                note: 'This note has been updated',
                flagged: false
              }
            }
          });
        } else {
          console.error('❌ Task creation failed:', result);
          process.exit(1);
        }
      } else if (msg.id === 3 && msg.result) {
        const result = JSON.parse(msg.result.content[0].text);
        if (result.updated) {
          console.log('✅ Task updated successfully!');
          
          // Test 3: Complete the task
          console.log('\n🧪 Test 3: Completing the task...');
          sendMessage('tools/call', {
            name: 'complete_task',
            arguments: {
              taskId: testTaskId
            }
          });
        } else {
          console.error('❌ Task update failed:', result);
        }
      } else if (msg.id === 4 && msg.result) {
        const result = JSON.parse(msg.result.content[0].text);
        if (result.completed) {
          console.log('✅ Task completed successfully!');
          
          // Test 4: Delete the task
          console.log('\n🧪 Test 4: Deleting the task...');
          sendMessage('tools/call', {
            name: 'delete_task',
            arguments: {
              taskId: testTaskId
            }
          });
        } else {
          console.error('❌ Task completion failed:', result);
        }
      } else if (msg.id === 5 && msg.result) {
        const result = JSON.parse(msg.result.content[0].text);
        if (result.deleted) {
          console.log('✅ Task deleted successfully!');
          console.log('\n🎉 All CRUD tests passed!');
          server.kill();
          process.exit(0);
        } else {
          console.error('❌ Task deletion failed:', result);
        }
      }
    } catch (e) {
      // Not JSON, ignore
    }
  });
});

// Start by initializing
console.log('🔍 Testing CRUD operations...\n');
sendMessage('initialize', {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: {
    name: "test-client",
    version: "1.0.0"
  }
});

// Timeout
setTimeout(() => {
  console.error('❌ Test timed out');
  server.kill();
  process.exit(1);
}, 30000);
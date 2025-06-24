#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

const server: ChildProcess = spawn('/usr/local/bin/omnifocus-mcp-cached', [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, LOG_LEVEL: 'info' }
});

let msgId = 1;

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
        
        // Test 1: Search for "vibe coding"
        console.log('\n🧪 Test 1: Search for "vibe coding"...');
        sendMessage('tools/call', {
          name: 'list_tasks',
          arguments: {
            search: 'vibe coding',
            completed: false,
            limit: 10
          }
        });
      } else if (msg.id === 2 && msg.result) {
        const result = JSON.parse(msg.result.content[0].text);
        console.log(`📊 Search Results:
- Total matching: ${result.metadata.total_items}
- Items returned: ${result.metadata.items_returned}
- Query time: ${result.metadata.query_time_ms}ms`);
        
        if (result.tasks.length > 0) {
          console.log('- First task:', result.tasks[0].name);
        } else {
          console.log('- No tasks found (correct if "vibe coding" doesn\'t exist)');
        }
        
        // Test 2: Search for a common word
        console.log('\n🧪 Test 2: Search for "projet" (French for project)...');
        sendMessage('tools/call', {
          name: 'list_tasks',
          arguments: {
            search: 'projet',
            completed: false,
            limit: 5
          }
        });
      } else if (msg.id === 3 && msg.result) {
        const result = JSON.parse(msg.result.content[0].text);
        console.log(`📊 Search Results:
- Total matching: ${result.metadata.total_items}
- Items returned: ${result.metadata.items_returned}`);
        
        if (result.tasks.length > 0) {
          console.log('Tasks found:');
          result.tasks.forEach((task, i) => {
            console.log(`  ${i+1}. ${task.name}`);
          });
        }
        
        // Test 3: Complex filter combination
        console.log('\n🧪 Test 3: Search + flagged filter...');
        sendMessage('tools/call', {
          name: 'list_tasks',
          arguments: {
            search: 'linkedin',
            flagged: true,
            completed: false,
            limit: 5
          }
        });
      } else if (msg.id === 4 && msg.result) {
        const result = JSON.parse(msg.result.content[0].text);
        console.log(`📊 Search + Flagged Results:
- Total matching: ${result.metadata.total_items}
- Filters applied:`, JSON.stringify(result.metadata.filters_applied, null, 2));
        
        if (result.tasks.length > 0) {
          result.tasks.forEach((task, i) => {
            console.log(`  ${i+1}. ${task.name} (flagged: ${task.flagged})`);
          });
        }
        
        console.log('\n✅ All tests completed!');
        console.log('The search bug appears to be fixed if:');
        console.log('1. Search returns only matching tasks');
        console.log('2. Total count reflects actual matches');
        console.log('3. Filter combinations work correctly');
        
        server.kill();
        process.exit(0);
      }
    } catch (e) {
      // Not JSON, ignore
    }
  });
});

// Start by initializing
console.log('🔍 Testing search functionality fixes...\n');
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
}, 15000);
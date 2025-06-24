#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';

console.log('🤖 OmniFocus MCP Read-Only Test');
console.log('================================\n');

const server: ChildProcess = spawn('node', ['/Users/guillaume/Dev/tools/omnifocus-mcp/dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, LOG_LEVEL: 'info' }
});

const rl: Interface = createInterface({
  input: server.stdout!,
  crlfDelay: Infinity
});

let requestId = 1;
const tests = [];

const sendRequest = (method, params = {}) => {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId++
  };
  
  console.log(`\n[${request.id}] ${method}`);
  server.stdin!.write(JSON.stringify(request) + '\n');
};

rl.on('line', (line) => {
  try {
    const response = JSON.parse(line) as any;
    
    switch(response.id) {
      case 1: // Initialize
        if (response.result?.serverInfo) {
          tests.push({ test: 'Initialize', pass: true });
          console.log('✅ Server initialized');
          sendRequest('tools/list');
        }
        break;
        
      case 2: // List tools
        const tools = response.result?.tools || [];
        tests.push({ test: 'List tools', pass: tools.length === 2 });
        console.log(`✅ Found ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
        
        // Test 1: List tasks
        sendRequest('tools/call', {
          name: 'list_tasks',
          arguments: { completed: false, limit: 5 }
        });
        break;
        
      case 3: // First list tasks
        const result1 = JSON.parse(response.result.content[0].text);
        tests.push({ test: 'List tasks (fresh)', pass: !result1.error && !result1.cached });
        console.log(`✅ Listed ${result1.tasks?.length || 0} tasks (cached: ${result1.cached})`);
        
        // Test 2: List tasks again (should be cached)
        sendRequest('tools/call', {
          name: 'list_tasks',
          arguments: { completed: false, limit: 5 }
        });
        break;
        
      case 4: // Second list tasks (cached)
        const result2 = JSON.parse(response.result.content[0].text);
        tests.push({ test: 'List tasks (cached)', pass: !result2.error && result2.cached === true });
        console.log(`✅ Listed ${result2.tasks?.length || 0} tasks (cached: ${result2.cached})`);
        
        // Test 3: List projects
        sendRequest('tools/call', {
          name: 'list_projects',
          arguments: { status: ['active'] }
        });
        break;
        
      case 5: // List projects
        const result3 = JSON.parse(response.result.content[0].text);
        tests.push({ test: 'List projects', pass: !result3.error });
        console.log(`✅ Listed ${result3.projects?.length || 0} projects`);
        
        // Test 4: Filter tasks by flags
        sendRequest('tools/call', {
          name: 'list_tasks',
          arguments: { flagged: true, limit: 10 }
        });
        break;
        
      case 6: // Filtered tasks
        const result4 = JSON.parse(response.result.content[0].text);
        tests.push({ test: 'Filter tasks', pass: !result4.error });
        console.log(`✅ Found ${result4.tasks?.length || 0} flagged tasks`);
        
        // Summary
        console.log('\n================================');
        console.log('TEST SUMMARY\n');
        
        const passed = tests.filter(t => t.pass).length;
        console.log(`Total: ${tests.length}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${tests.length - passed}`);
        
        tests.forEach(t => {
          console.log(`${t.pass ? '✅' : '❌'} ${t.test}`);
        });
        
        if (passed === tests.length) {
          console.log('\n🎉 All tests passed! Cache-enabled read operations working perfectly.');
        }
        
        server.kill();
        process.exit(passed === tests.length ? 0 : 1);
        break;
    }
  } catch (e) {
    // Ignore non-JSON
  }
});

// Start
sendRequest('initialize', {
  protocolVersion: '0.1.0',
  capabilities: {},
  clientInfo: { name: 'test-client', version: '1.0.0' }
});

setTimeout(() => {
  console.error('\nTimeout!');
  server.kill();
  process.exit(1);
}, 15000);
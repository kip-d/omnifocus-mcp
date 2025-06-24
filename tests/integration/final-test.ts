#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';

console.log('Final OmniFocus MCP Server Test\n');
console.log('================================\n');

const server: ChildProcess = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

const rl: Interface = createInterface({
  input: server.stdout!,
  crlfDelay: Infinity
});

let requestId = 1;
const testResults = [];

// Helper to send JSON-RPC request
const sendRequest = (method, params = {}) => {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId++
  };
  
  console.log(`[TEST ${request.id}] ${method}`);
  server.stdin!.write(JSON.stringify(request) + '\n');
};

// Track test results
const recordTest = (testName, success, details = '') => {
  testResults.push({ testName, success, details });
  console.log(`  ${success ? '✅' : '❌'} ${testName}${details ? ': ' + details : ''}`);
};

// Handle responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line) as any;
    
    if (response.id === 1) {
      // Initialize response
      const success = response.result && response.result.serverInfo;
      recordTest('Server initialization', success);
      
      // List tools
      sendRequest('tools/list');
      
    } else if (response.id === 2) {
      // Tools list response
      const tools = response.result?.tools || [];
      recordTest('List tools', tools.length === 7, `Found ${tools.length} tools`);
      
      // Test list tasks
      sendRequest('tools/call', {
        name: 'list_tasks',
        arguments: { completed: false, limit: 3 }
      });
      
    } else if (response.id === 3) {
      // List tasks response
      const result = JSON.parse(response.result.content[0].text);
      const success = Array.isArray(result.tasks);
      recordTest('List tasks', success, success ? `Retrieved ${result.tasks.length} tasks` : result.message);
      
      // Test list projects
      sendRequest('tools/call', {
        name: 'list_projects',
        arguments: { status: ['active'] }
      });
      
    } else if (response.id === 4) {
      // List projects response
      const result = JSON.parse(response.result.content[0].text);
      const success = Array.isArray(result.projects);
      recordTest('List projects', success, success ? `Retrieved ${result.projects.length} projects` : result.message);
      
      // Test cache by listing tasks again
      sendRequest('tools/call', {
        name: 'list_tasks',
        arguments: { completed: false, limit: 3 }
      });
      
    } else if (response.id === 5) {
      // Cache test response
      const result = JSON.parse(response.result.content[0].text);
      const success = result.cached === true;
      recordTest('Cache functionality', success, success ? 'Tasks retrieved from cache' : 'Cache not working');
      
      // Print summary
      console.log('\n================================');
      console.log('TEST SUMMARY\n');
      
      const passed = testResults.filter(t => t.success).length;
      const total = testResults.length;
      
      console.log(`Total tests: ${total}`);
      console.log(`Passed: ${passed}`);
      console.log(`Failed: ${total - passed}`);
      console.log(`Success rate: ${Math.round((passed/total) * 100)}%`);
      
      if (passed === total) {
        console.log('\n🎉 All tests passed! Server is ready for production.');
      } else {
        console.log('\n⚠️  Some tests failed. Please review the results above.');
      }
      
      // Cleanup
      server.kill();
      process.exit(passed === total ? 0 : 1);
    }
    
  } catch (e) {
    // Ignore non-JSON lines (like log output)
  }
});

// Handle errors
server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

// Start tests
console.log('Starting tests...\n');
sendRequest('initialize', {
  protocolVersion: '0.1.0',
  capabilities: {},
  clientInfo: {
    name: 'mcp-test-client',
    version: '1.0.0'
  }
});

// Timeout
setTimeout(() => {
  console.error('\n❌ Test timeout!');
  server.kill();
  process.exit(1);
}, 15000);
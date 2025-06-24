#!/usr/bin/env node
import { spawn } from 'child_process';
import { createInterface } from 'readline';

console.log('🤖 Claude Desktop MCP Integration Test');
console.log('=====================================\n');
console.log('This test simulates exactly how Claude Desktop communicates with MCP servers.\n');

// Start the server exactly as Claude Desktop would
const server = spawn('node', ['/Users/guillaume/Dev/tools/omnifocus-mcp/dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    LOG_LEVEL: 'info'
  }
});

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

const errRl = createInterface({
  input: server.stderr,
  crlfDelay: Infinity
});

let requestId = 1;
const testPhases = [];
let currentPhase = '';

// Helper to send JSON-RPC request (exactly as Claude Desktop does)
const sendRequest = (method, params = {}) => {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId++
  };
  
  console.log(`\n📤 REQUEST ${request.id}: ${method}`);
  console.log(JSON.stringify(request, null, 2));
  server.stdin.write(JSON.stringify(request) + '\n');
};

// Capture stderr (logs)
errRl.on('line', (line) => {
  console.log(`📝 LOG: ${line}`);
});

// Handle responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log(`\n📥 RESPONSE ${response.id}:`);
    console.log(JSON.stringify(response, null, 2));
    
    // Process based on request ID
    switch(response.id) {
      case 1:
        // Initialize response
        currentPhase = 'Initialization';
        if (response.result?.serverInfo) {
          testPhases.push({ phase: currentPhase, success: true, details: `Server: ${response.result.serverInfo.name} v${response.result.serverInfo.version}` });
          
          // Phase 2: List available tools
          setTimeout(() => {
            sendRequest('tools/list');
          }, 100);
        } else {
          testPhases.push({ phase: currentPhase, success: false, details: 'No server info received' });
        }
        break;
        
      case 2:
        // Tools list response
        currentPhase = 'Tool Discovery';
        const tools = response.result?.tools || [];
        testPhases.push({ 
          phase: currentPhase, 
          success: tools.length > 0, 
          details: `Found ${tools.length} tools: ${tools.map(t => t.name).join(', ')}` 
        });
        
        // Phase 3: Call list_tasks
        setTimeout(() => {
          sendRequest('tools/call', {
            name: 'list_tasks',
            arguments: {
              completed: false,
              limit: 2,
              inInbox: false
            }
          });
        }, 100);
        break;
        
      case 3:
        // List tasks response
        currentPhase = 'List Tasks Tool';
        if (response.result?.content?.[0]?.text) {
          const taskResult = JSON.parse(response.result.content[0].text);
          const success = !taskResult.error && Array.isArray(taskResult.tasks);
          testPhases.push({ 
            phase: currentPhase, 
            success, 
            details: success ? `Retrieved ${taskResult.tasks.length} tasks (cached: ${taskResult.cached})` : taskResult.message 
          });
          
          // Phase 4: Test create task
          setTimeout(() => {
            sendRequest('tools/call', {
              name: 'create_task',
              arguments: {
                name: 'Test task from Claude Desktop integration test',
                note: 'This task was created to verify MCP server functionality',
                flagged: true,
                tags: ['test', 'mcp']
              }
            });
          }, 100);
        } else {
          testPhases.push({ phase: currentPhase, success: false, details: 'Invalid response format' });
        }
        break;
        
      case 4:
        // Create task response
        currentPhase = 'Create Task Tool';
        if (response.result?.content?.[0]?.text) {
          const createResult = JSON.parse(response.result.content[0].text);
          const success = !createResult.error;
          testPhases.push({ 
            phase: currentPhase, 
            success, 
            details: success ? `Created task with ID: ${createResult.task?.id}` : createResult.message 
          });
          
          // Phase 5: List projects
          setTimeout(() => {
            sendRequest('tools/call', {
              name: 'list_projects',
              arguments: {
                status: ['active'],
                flagged: false
              }
            });
          }, 100);
        }
        break;
        
      case 5:
        // List projects response
        currentPhase = 'List Projects Tool';
        if (response.result?.content?.[0]?.text) {
          const projectResult = JSON.parse(response.result.content[0].text);
          const success = !projectResult.error && Array.isArray(projectResult.projects);
          testPhases.push({ 
            phase: currentPhase, 
            success, 
            details: success ? `Found ${projectResult.projects.length} projects` : projectResult.message 
          });
          
          // Phase 6: Test error handling
          setTimeout(() => {
            sendRequest('tools/call', {
              name: 'update_task',
              arguments: {
                // Missing required taskId to test error handling
                name: 'This should fail'
              }
            });
          }, 100);
        }
        break;
        
      case 6:
        // Error handling test
        currentPhase = 'Error Handling';
        if (response.result?.content?.[0]?.text) {
          const errorResult = JSON.parse(response.result.content[0].text);
          const success = errorResult.error === true; // We expect an error
          testPhases.push({ 
            phase: currentPhase, 
            success, 
            details: success ? 'Properly handled missing required parameter' : 'Did not detect error condition' 
          });
          
          // Final summary
          setTimeout(() => {
            printSummary();
          }, 100);
        }
        break;
    }
    
  } catch (e) {
    console.error('❌ Failed to parse response:', e.message);
    console.error('Raw line:', line);
  }
});

// Handle server errors
server.on('error', (err) => {
  console.error('\n❌ Server process error:', err);
  process.exit(1);
});

server.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`\n❌ Server exited with code ${code}`);
  }
});

// Print final summary
function printSummary() {
  console.log('\n\n========================================');
  console.log('📊 CLAUDE DESKTOP INTEGRATION TEST SUMMARY');
  console.log('========================================\n');
  
  let passed = 0;
  let failed = 0;
  
  testPhases.forEach(({ phase, success, details }) => {
    console.log(`${success ? '✅' : '❌'} ${phase}`);
    console.log(`   ${details}\n`);
    if (success) passed++; else failed++;
  });
  
  console.log('----------------------------------------');
  console.log(`Total Phases: ${testPhases.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${Math.round((passed / testPhases.length) * 100)}%`);
  
  if (passed === testPhases.length) {
    console.log('\n🎉 ALL TESTS PASSED! Server is ready for Claude Desktop.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the results above.');
  }
  
  console.log('\n👋 Shutting down server...');
  server.kill();
  
  setTimeout(() => {
    process.exit(passed === testPhases.length ? 0 : 1);
  }, 500);
}

// Start the test sequence
console.log('🚀 Starting MCP server and beginning test sequence...\n');

// Phase 1: Initialize (exactly as Claude Desktop does)
sendRequest('initialize', {
  protocolVersion: '0.1.0',
  capabilities: {},
  clientInfo: {
    name: 'claude-desktop',
    version: '0.7.2'  // Current Claude Desktop version
  }
});

// Safety timeout
setTimeout(() => {
  console.error('\n⏱️  Test timeout after 30 seconds');
  printSummary();
}, 30000);
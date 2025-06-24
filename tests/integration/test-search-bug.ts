#!/usr/bin/env node

import { spawn, ChildProcess } from 'child_process';

console.log('Testing search functionality that should catch the bug...\n');

const serverProcess = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

serverProcess.stderr.on('data', (data: Buffer) => {
  const message = data.toString();
  if (!message.includes('[INFO]') && !message.includes('Cleared 0 entries')) {
    console.error(`Server error: ${message}`);
  }
});

const sendRequest = (request) => {
  console.log(`→ Testing: ${request.method || request.params?.name || 'unknown'}`);
  serverProcess.stdin.write(JSON.stringify(request) + '\n');
};

let messageBuffer = '';
let testsPassed: number = 0;
let testsFailed: number = 0;

serverProcess.stdout.on('data', (data: Buffer) => {
  messageBuffer += data.toString();
  const lines = messageBuffer.split('\n');
  messageBuffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line) as any;
        
        if (response.id === 1) {
          // After initialize, test search
          sendRequest({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'list_tasks',
              arguments: {
                search: 'Outsized'
              }
            }
          });
        } else if (response.id === 2) {
          // Check search response
          const content = response.result?.content?.[0]?.text;
          if (content) {
            const result = JSON.parse(content);
            
            // This is where we catch the bug!
            if (result.error) {
              console.error('❌ Search failed with error:', result.message);
              testsFailed++;
              
              // The specific bug we're catching
              if (result.message.includes('projects.map is not a function')) {
                console.error('❌ FOUND THE BUG: "projects.map is not a function"');
                console.error('   This happens when result.tasks is undefined but we try to map over it');
              }
            } else if (result.tasks && Array.isArray(result.tasks)) {
              console.log('✅ Search returned valid tasks array');
              testsPassed++;
            } else {
              console.error('❌ Search response missing tasks array');
              testsFailed++;
            }
          }
          
          // Test empty search
          sendRequest({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
              name: 'list_tasks',
              arguments: {
                search: 'NonExistentTaskName12345'
              }
            }
          });
        } else if (response.id === 3) {
          // Check empty search response
          const content = response.result?.content?.[0]?.text;
          if (content) {
            const result = JSON.parse(content);
            
            if (result.error) {
              console.error('❌ Empty search failed with error:', result.message);
              testsFailed++;
            } else if (result.tasks && Array.isArray(result.tasks) && result.tasks.length === 0) {
              console.log('✅ Empty search returned empty array correctly');
              testsPassed++;
            } else {
              console.error('❌ Empty search response invalid');
              testsFailed++;
            }
          }
          
          // Test with special characters
          sendRequest({
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: {
              name: 'list_tasks',
              arguments: {
                search: 'test & "quotes" (parens)'
              }
            }
          });
        } else if (response.id === 4) {
          // Check special characters response
          const content = response.result?.content?.[0]?.text;
          if (content) {
            const result = JSON.parse(content);
            
            if (result.error && !result.message.includes('projects.map')) {
              // Some errors are OK (like OmniFocus syntax errors)
              console.log('⚠️  Special chars search returned error (may be OK):', result.message);
            } else if (result.tasks && Array.isArray(result.tasks)) {
              console.log('✅ Special chars search handled correctly');
              testsPassed++;
            } else {
              console.error('❌ Special chars search failed');
              testsFailed++;
            }
          }
          
          // Summary
          console.log('\n📊 Test Summary:');
          console.log(`   Passed: ${testsPassed}`);
          console.log(`   Failed: ${testsFailed}`);
          
          if (testsFailed > 0) {
            console.log('\n❌ TESTS FAILED - This test would have caught the bug!');
            process.exit(1);
          } else {
            console.log('\n✅ All tests passed!');
            process.exit(0);
          }
        }
      } catch (e) {
        console.error('Failed to parse response:', line);
      }
    }
  }
});

// Start with initialize
sendRequest({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  }
});

// Cleanup on exit
process.on('SIGINT', () => {
  serverProcess.kill();
  process.exit(0);
});

// Timeout
setTimeout(() => {
  console.error('❌ Tests timed out');
  serverProcess.kill();
  process.exit(1);
}, 10000);
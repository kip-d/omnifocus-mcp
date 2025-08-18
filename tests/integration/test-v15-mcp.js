#!/usr/bin/env node

/**
 * Test v1.15.0 through MCP server
 */

import { spawn } from 'child_process';

async function testMCPServer() {
  console.log('Testing v1.15.0 through MCP server...\n');
  
  const server = spawn('node', ['dist/index.js'], {
    env: { ...process.env, LOG_LEVEL: 'error' }
  });
  
  let requestId = 1;
  
  function sendRequest(method, params = {}) {
    const request = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: requestId++
    }) + '\n';
    
    server.stdin.write(request);
  }
  
  return new Promise((resolve) => {
    let buffer = '';
    let initialized = false;
    let testComplete = false;
    
    server.stdout.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete JSON messages
      let lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const response = JSON.parse(line);
          
          if (!initialized && response.result?.protocolVersion) {
            console.log('✅ Server initialized');
            initialized = true;
            
            // Test get_upcoming_tasks
            console.log('\nTesting get_upcoming_tasks...');
            const startTime = Date.now();
            
            sendRequest('tools/call', {
              name: 'get_upcoming_tasks',
              arguments: {
                days: 7,
                includeToday: true,
                limit: 10
              }
            });
            
            // Store start time for later
            server.testStartTime = startTime;
          } else if (response.result?.content) {
            const totalTime = Date.now() - server.testStartTime;
            const content = JSON.parse(response.result.content[0].text);
            
            if (content.success && content.data) {
              console.log('✅ get_upcoming_tasks executed successfully!');
              console.log(`   Tasks found: ${content.data.length}`);
              console.log(`   Query time: ${content.metadata.query_time_ms}ms`);
              console.log(`   Total time: ${totalTime}ms`);
              
              if (content.metadata.summary) {
                console.log(`   Tasks scanned: ${content.metadata.summary.tasks_scanned}`);
                console.log(`   Query method: ${content.metadata.summary.query_method}`);
              }
              
              if (content.metadata.query_time_ms < 1000) {
                console.log('   ⚡ Performance: EXCELLENT (sub-second)');
              } else if (content.metadata.query_time_ms < 2000) {
                console.log('   ✅ Performance: GOOD (under 2 seconds)');
              } else if (content.metadata.query_time_ms < 5000) {
                console.log('   ⚠️  Performance: ACCEPTABLE (under 5 seconds)');
              } else {
                console.log('   ❌ Performance: POOR (over 5 seconds)');
              }
            } else {
              console.log('❌ Query failed:', content.error?.message);
            }
            
            if (!testComplete) {
              testComplete = true;
              
              // Test overdue tasks too
              console.log('\nTesting get_overdue_tasks...');
              const overdueStart = Date.now();
              server.overdueStartTime = overdueStart;
              
              sendRequest('tools/call', {
                name: 'get_overdue_tasks',
                arguments: {
                  limit: 10,
                  includeCompleted: false
                }
              });
            } else {
              // This is the overdue response
              const overdueTime = Date.now() - server.overdueStartTime;
              
              if (content.success && content.data) {
                console.log('✅ get_overdue_tasks executed successfully!');
                console.log(`   Tasks found: ${content.data.length}`);
                console.log(`   Query time: ${content.metadata.query_time_ms}ms`);
                console.log(`   Total time: ${overdueTime}ms`);
                
                if (content.metadata.query_time_ms < 1000) {
                  console.log('   ⚡ Performance: EXCELLENT (sub-second)');
                } else if (content.metadata.query_time_ms < 2000) {
                  console.log('   ✅ Performance: GOOD (under 2 seconds)');
                } else {
                  console.log('   ⚠️  Performance: NEEDS ATTENTION');
                }
              }
              
              console.log('\n✅ All v1.15.0 tests complete!');
              server.stdin.end();
              server.kill();
              resolve();
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });
    
    server.on('exit', () => {
      resolve();
    });
    
    // Initialize the server
    sendRequest('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
  });
}

testMCPServer()
  .then(() => {
    console.log('\n✅ v1.5.0 MCP test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ v1.5.0 MCP test failed:', error);
    process.exit(1);
  });
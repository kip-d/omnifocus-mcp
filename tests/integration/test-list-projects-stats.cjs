#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

// Start the MCP server
const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, LOG_LEVEL: 'debug' }
});

const rl = readline.createInterface({
  input: server.stdout,
  output: process.stdout,
  terminal: false
});

let buffer = '';
let initialized = false;

// Handle server stderr
server.stderr.on('data', (data) => {
  console.error('[Server Error]:', data.toString());
});

// Handle server output
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    
    if (!initialized && response.result) {
      console.log('✅ Server initialized successfully');
      initialized = true;
      
      // Test 1: List projects without stats (should be fast)
      console.log('\n📋 Test 1: List projects WITHOUT stats...');
      const request1 = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'list_projects',
          arguments: {
            limit: 5,
            includeStats: false
          }
        }
      };
      server.stdin.write(JSON.stringify(request1) + '\n');
      
    } else if (response.id === 2) {
      console.log('\nResponse WITHOUT stats:');
      if (response.result?.content?.[0]?.text) {
        const result = JSON.parse(response.result.content[0].text);
        if (result.data?.projects?.[0]) {
          console.log('First project:', JSON.stringify(result.data.projects[0], null, 2));
          console.log('Query time:', result.metadata?.query_time_ms, 'ms');
        }
      }

      // Test 2: List projects with stats (should be slower but include more data)
      console.log('\n📊 Test 2: List projects WITH stats...');
      const request2 = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'list_projects',
          arguments: {
            limit: 5,
            includeStats: true
          }
        }
      };
      server.stdin.write(JSON.stringify(request2) + '\n');
      
    } else if (response.id === 3) {
      console.log('\nResponse WITH stats:');
      if (response.result?.content?.[0]?.text) {
        const result = JSON.parse(response.result.content[0].text);
        if (result.data?.projects?.[0]) {
          console.log('First project:', JSON.stringify(result.data.projects[0], null, 2));
          console.log('Query time:', result.metadata?.query_time_ms, 'ms');
        }
      }

      console.log('\n✅ All tests completed');
      process.exit(0);
    }
    
  } catch (e) {
    // Not JSON, skip
  }
});

// Send initialization request
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '0.1.0',
    capabilities: {}
  }
};

server.stdin.write(JSON.stringify(initRequest) + '\n');

// Handle errors
server.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Cleanup on exit
process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});
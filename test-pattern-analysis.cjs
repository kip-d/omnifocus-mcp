#!/usr/bin/env node

const { spawn } = require('child_process');

// Test request for pattern analysis
const request = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'pattern_analysis',
    arguments: {
      patterns: ['duplicates', 'dormant_projects'],
      dormantThresholdDays: '30',
      includeCompleted: 'false'
    }
  }
};

// Also prepare exit request
const exitRequest = {
  jsonrpc: '2.0',
  method: 'quit'
};

console.log('Testing pattern analysis tool...\n');

const mcp = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';

mcp.stdout.on('data', (data) => {
  output += data.toString();
  
  // Look for the response
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.trim() && !line.includes('Content-Length')) {
      try {
        const json = JSON.parse(line);
        if (json.result) {
          console.log('✅ Pattern Analysis Response:');
          console.log(JSON.stringify(json.result, null, 2));
          process.exit(0);
        } else if (json.error) {
          console.error('❌ Error:', json.error);
          process.exit(1);
        }
      } catch (e) {
        // Not JSON, skip
      }
    }
  }
});

mcp.stderr.on('data', (data) => {
  console.error('Error:', data.toString());
});

// Send the requests
mcp.stdin.write(JSON.stringify(request) + '\n');
mcp.stdin.write(JSON.stringify(exitRequest) + '\n');

// Timeout after 10 seconds
setTimeout(() => {
  console.error('❌ Timeout - no response received');
  mcp.kill();
  process.exit(1);
}, 10000);
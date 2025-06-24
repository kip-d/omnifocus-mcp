#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

console.log('Testing OmniFocus MCP Server...\n');

const server: ChildProcess = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

// Send test request
const testRequest = {
  jsonrpc: '2.0',
  method: 'tools/list',
  id: 1
};

server.stdin!.write(JSON.stringify(testRequest) + '\n');

// Handle response
server.stdout!.on('data', (data: Buffer) => {
  try {
    const response = JSON.parse(data.toString()) as any;
    console.log('Server Response:', JSON.stringify(response, null, 2));
    
    if (response.result && response.result.tools) {
      console.log('\nAvailable tools:');
      response.result.tools.forEach(tool => {
        console.log(`- ${tool.name}: ${tool.description}`);
      });
    }
  } catch (e) {
    console.log('Raw output:', data.toString());
  }
});

// Exit after 2 seconds
setTimeout(() => {
  server.kill();
  process.exit(0);
}, 2000);
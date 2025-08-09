#!/usr/bin/env tsx

import { spawn } from 'child_process';

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, LOG_LEVEL: 'info' }
});

let msgId = 1;

function sendMessage(method: string, params: any = {}) {
  const msg = {
    jsonrpc: "2.0",
    id: msgId++,
    method,
    params
  };
  console.log(`→ Sending: ${method} (${msgId - 1})`);
  server.stdin!.write(JSON.stringify(msg) + '\n');
}

// Monitor stderr for errors
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
        console.log('✅ Initialize successful');
        
        // Test version info
        console.log('\n🧪 Testing get_version_info after path fix...');
        sendMessage('tools/call', {
          name: 'get_version_info',
          arguments: {}
        });
      } else if (msg.id === 2) {
        if (msg.result) {
          const result = JSON.parse(msg.result.content[0].text);
          
          if (result.error) {
            console.error('❌ Version info failed:', result.message);
          } else {
            console.log('✅ Version info retrieved successfully');
            console.log(`   Name: ${result.name}`);
            console.log(`   Version: ${result.version}`);
            console.log(`   Build ID: ${result.build.buildId}`);
          }
        } else if (msg.error) {
          console.error('❌ Tool call failed:', msg.error);
        }
        
        console.log('\n🎉 Version info path fix test completed!');
        server.kill();
        process.exit(0);
      }
    } catch (e) {
      // Not JSON, ignore
    }
  });
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

// Start by initializing
console.log('🔍 Testing version info path fix...\n');
sendMessage('initialize', {
  protocolVersion: "2025-06-18",
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
}, 10000);
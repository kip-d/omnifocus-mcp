#!/usr/bin/env node
import { spawn } from 'child_process';

console.log('🔍 MCP Server Validation for Claude Desktop');
console.log('==========================================\n');

console.log('Testing configuration:');
console.log('Command: /usr/local/bin/omnifocus-mcp-cached');
console.log('Environment: LOG_LEVEL=info\n');

const server = spawn('/usr/local/bin/omnifocus-mcp-cached', [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, LOG_LEVEL: 'info' }
});

let serverReady = false;

// Monitor stderr for startup
server.stderr.on('data', (data) => {
  const log = data.toString();
  console.log(`[LOG] ${log.trim()}`);
  if (log.includes('server started successfully')) {
    serverReady = true;
    runTest();
  }
});

function runTest() {
  console.log('\n🧪 Running MCP protocol test...\n');
  
  // Test 1: Initialize
  const initMsg = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "0.1.0",
      capabilities: {},
      clientInfo: {
        name: "claude-desktop",
        version: "0.7.2"
      }
    }
  };
  
  console.log('→ Sending initialize...');
  server.stdin.write(JSON.stringify(initMsg) + '\n');
}

// Monitor stdout for responses
server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  
  lines.forEach(line => {
    try {
      const msg = JSON.parse(line);
      console.log(`← Response: ${JSON.stringify(msg, null, 2)}\n`);
      
      if (msg.id === 1 && msg.result) {
        console.log('✅ Initialize successful!');
        console.log(`   Protocol: ${msg.result.protocolVersion}`);
        console.log(`   Server: ${msg.result.serverInfo?.name}\n`);
        
        // Test 2: List tools
        const listMsg = {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {}
        };
        
        console.log('→ Sending tools/list...');
        server.stdin.write(JSON.stringify(listMsg) + '\n');
      } else if (msg.id === 2 && msg.result) {
        console.log('✅ Tools list successful!');
        console.log(`   Found ${msg.result.tools?.length || 0} tools:`);
        msg.result.tools?.forEach(tool => {
          console.log(`   - ${tool.name}: ${tool.description}`);
        });
        
        console.log('\n🎉 MCP server is working correctly!');
        console.log('\\nIf this server still doesn\'t appear in Claude Desktop:');
        console.log('1. Make sure you restarted Claude Desktop');
        console.log('2. Check the Claude Desktop logs for errors');
        console.log('3. Try removing and re-adding the server config');
        
        server.kill();
        process.exit(0);
      }
    } catch (e) {
      // Not JSON, ignore
    }
  });
});

// Timeout
setTimeout(() => {
  if (!serverReady) {
    console.error('❌ Server failed to start within 5 seconds');
  } else {
    console.error('❌ Test timed out');
  }
  server.kill();
  process.exit(1);
}, 5000);
#!/usr/bin/env node

/**
 * Proper MCP testing tool that emulates Claude Desktop's initialization sequence
 * Fixes the issue where direct stdin calls don't work because they skip initialization
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

// Get command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node test-single-tool-proper.js <tool-name> [arguments-json]');
  console.log('');
  console.log('Examples:');
  console.log('  node test-single-tool-proper.js system \'{"operation":"version"}\'');
  console.log('  node test-single-tool-proper.js tasks \'{"mode":"today","limit":"5"}\'');
  console.log('  node test-single-tool-proper.js manage_task \'{"operation":"create","name":"Test Task"}\'');
  process.exit(1);
}

const toolName = args[0];
const toolArgs = args[1] ? JSON.parse(args[1]) : {};

console.log(`🔧 Testing Tool: ${toolName} (Proper MCP Initialization)`);
console.log('=' .repeat(60));
console.log(`Arguments: ${JSON.stringify(toolArgs, null, 2)}`);
console.log('');

// Launch MCP server
const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

let requestId = 1;
let cleanupDone = false;
let testStartTime;

// Cleanup function
const cleanup = () => {
  if (cleanupDone) return;
  cleanupDone = true;
  
  server.stdin.end();
  server.kill('SIGTERM');
  
  setTimeout(() => {
    if (!server.killed) {
      server.kill('SIGKILL');
    }
    process.exit(0);
  }, 1000);
};

// Helper to send JSON-RPC request
const sendRequest = (method, params = {}) => {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId++
  };
  
  console.log(`📨 Sending: ${method}${params.name ? ` (${params.name})` : ''}`);
  server.stdin.write(JSON.stringify(request) + '\n');
};

// Handle responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    
    if (response.id === 1) {
      // After initialize, call our target tool
      console.log('✅ MCP server initialized');
      console.log('⏱️  Starting tool test...');
      testStartTime = Date.now();
      
      sendRequest('tools/call', {
        name: toolName,
        arguments: toolArgs
      });
    } else if (response.id === 2) {
      // Our tool response
      const executionTime = Date.now() - testStartTime;
      console.log(`✅ Tool completed in ${executionTime}ms`);
      console.log('');
      
      console.log('📋 MCP Response:');
      console.log(JSON.stringify(response, null, 2));
      console.log('');
      
      if (response.result && response.result.content && response.result.content[0]) {
        console.log('🔍 Tool Response:');
        try {
          const toolResponse = JSON.parse(response.result.content[0].text);
          console.log(JSON.stringify(toolResponse, null, 2));
          
          // Analysis
          console.log('');
          console.log('📊 Analysis:');
          if (toolResponse.success) {
            console.log('✅ Status: SUCCESS');
            
            if (toolResponse.summary) {
              console.log(`📊 Summary: ${JSON.stringify(toolResponse.summary, null, 2)}`);
            }
            
            if (toolResponse.data) {
              if (Array.isArray(toolResponse.data)) {
                console.log(`📝 Data: Array with ${toolResponse.data.length} items`);
              } else if (typeof toolResponse.data === 'object') {
                console.log(`📝 Data: Object with keys: ${Object.keys(toolResponse.data).join(', ')}`);
              }
            }
            
            if (toolResponse.metadata) {
              const meta = toolResponse.metadata;
              console.log(`⏱️  Query time: ${meta.query_time_ms || meta.operation_time_ms || 'N/A'}ms`);
              console.log(`💾 From cache: ${meta.from_cache === true ? 'YES' : 'NO'}`);
              if (meta.total_count !== undefined) console.log(`🔢 Total count: ${meta.total_count}`);
            }
          } else {
            console.log('❌ Status: FAILED');
            console.log(`🚫 Error: ${toolResponse.error?.message || toolResponse.message || 'Unknown error'}`);
            console.log(`📍 Code: ${toolResponse.error?.code || 'N/A'}`);
          }
          
        } catch (e) {
          console.log('❌ Could not parse tool response as JSON:');
          console.log(`Error: ${e.message}`);
          console.log(`Raw: ${response.result.content[0].text.substring(0, 500)}...`);
        }
      } else if (response.error) {
        console.log('❌ MCP Error:');
        console.log(`Message: ${response.error.message}`);
        console.log(`Code: ${response.error.code}`);
      }
      
      // Test complete
      cleanup();
    }
  } catch (e) {
    // Ignore non-JSON lines (logs)
  }
});

// Start with proper MCP initialization
sendRequest('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: {
    name: 'mcp-test-client',
    version: '1.0.0'
  }
});

// Timeout after 15 seconds
setTimeout(() => {
  console.error('\n❌ Test timeout!');
  cleanup();
  process.exit(1);
}, 15000);

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
  cleanup();
  process.exit(1);
});

// Handle unexpected server exit
server.on('exit', (code) => {
  if (!cleanupDone) {
    console.error(`Server exited unexpectedly with code ${code}`);
    process.exit(1);
  }
});
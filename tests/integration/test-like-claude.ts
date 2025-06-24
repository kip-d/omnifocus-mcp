#!/usr/bin/env node

/**
 * Replicate an MCP call exactly as Claude Desktop would do it
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';

console.log('🤖 Replicating Claude Desktop MCP Call\n');

// Start the MCP server exactly as Claude Desktop does
const server: ChildProcess = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit'], // inherit stderr to see logs
  cwd: '/Users/guillaume/Dev/tools/omnifocus-mcp'
});

// Set up line reader for responses
const rl: Interface = createInterface({
  input: server.stdout!,
  crlfDelay: Infinity
});

// Handle responses
const responses = new Map();
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line) as any;
    if (response.id !== undefined) {
      responses.set(response.id, response);
    }
  } catch (e) {
    // Ignore non-JSON lines
  }
});

// Helper to send request and wait for response
async function sendRequest(method, params = {}) {
  const id = Date.now();
  const request = {
    jsonrpc: '2.0',
    id,
    method,
    params
  };
  
  console.log(`📤 Sending: ${method}`);
  server.stdin!.write(JSON.stringify(request) + '\n');
  
  // Wait for response
  return new Promise((resolve) => {
    const checkResponse = setInterval(() => {
      if (responses.has(id)) {
        clearInterval(checkResponse);
        const response = responses.get(id);
        responses.delete(id);
        resolve(response);
      }
    }, 100);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkResponse);
      resolve({ error: { message: 'Request timed out' } });
    }, 10000);
  });
}

async function runTest(): void: Promise<void> {
  try {
    // Step 1: Initialize (exactly as Claude Desktop does)
    const initResponse = await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'claude-desktop',
        version: '0.7.2'
      }
    });
    
    if (initResponse.error) {
      console.log('❌ Initialize failed:', initResponse.error.message);
      return;
    }
    console.log('✅ Initialized successfully\n');
    
    // Step 2: List available tools
    console.log('📋 Getting available tools...');
    const toolsResponse = await sendRequest('tools/list');
    
    if (toolsResponse.result?.tools) {
      console.log(`✅ Found ${toolsResponse.result.tools.length} tools\n`);
    }
    
    // Step 3: Make a simple call - just get task count
    console.log('📊 Getting task count...');
    const countResponse = await sendRequest('tools/call', {
      name: 'get_task_count',
      arguments: {
        completed: false
      }
    });
    
    if (countResponse.error) {
      console.log('❌ Get task count failed:', countResponse.error.message);
    } else {
      const result = JSON.parse(countResponse.result?.content?.[0]?.text || '{}');
      console.log('✅ Result:', result);
      
      if (result.count !== undefined) {
        console.log(`\n📈 You have ${result.count} incomplete tasks`);
      }
    }
    
    // Step 4: Try to list a few tasks
    console.log('\n📝 Listing first 3 tasks...');
    const listResponse = await sendRequest('tools/call', {
      name: 'list_tasks',
      arguments: {
        completed: false,
        limit: 3
      }
    });
    
    if (listResponse.error) {
      console.log('❌ List tasks failed:', listResponse.error.message);
    } else {
      const result = JSON.parse(listResponse.result?.content?.[0]?.text || '{}');
      
      if (result.tasks) {
        console.log(`✅ Retrieved ${result.tasks.length} tasks:`);
        result.tasks.forEach((task, i) => {
          console.log(`   ${i + 1}. ${task.name} ${task.id ? `(ID: ${task.id})` : '(NO ID!)'}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  } finally {
    // Clean up
    server.kill();
    process.exit(0);
  }
}

// Give server time to start
setTimeout(runTest, 1000);
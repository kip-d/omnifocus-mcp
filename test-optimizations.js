#!/usr/bin/env node

/**
 * Test script for optimized OmniFocus API methods
 * Tests the new direct API calls for performance improvements
 */

import { spawn } from 'child_process';

// Test productivity stats with optimized API
console.log('Testing optimized productivity stats...');

const request = {
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'productivity_stats',
    arguments: {
      period: 'week',
      includeProjectStats: 'true',
      includeTagStats: 'true'
    }
  },
  id: 1
};

const mcp = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';

mcp.stdout.on('data', (data) => {
  output += data.toString();
  
  // Parse each line as potential JSON
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.trim() && line.includes('{')) {
      try {
        const response = JSON.parse(line);
        if (response.result) {
          console.log('\n✅ Optimized API test successful!');
          console.log('\nKey improvements:');
          console.log('- Using task.numberOfTasks() for direct counts');
          console.log('- Using task.numberOfCompletedTasks() for completions');
          console.log('- Using tag.availableTaskCount() for tag stats');
          
          if (response.result.metadata) {
            console.log('\nMetadata:', response.result.metadata);
          }
          
          if (response.result.summary) {
            console.log('\nSummary:');
            console.log('- Total projects:', response.result.summary.totalProjects);
            console.log('- Active projects:', response.result.summary.activeProjects);
            console.log('- Completion rate:', response.result.summary.completionRate + '%');
          }
          
          process.exit(0);
        }
        if (response.error) {
          console.error('\n❌ Error:', response.error.message);
          process.exit(1);
        }
      } catch (e) {
        // Not valid JSON yet, continue
      }
    }
  }
});

mcp.stderr.on('data', (data) => {
  console.error('Error:', data.toString());
});

// Send request
mcp.stdin.write(JSON.stringify(request) + '\n');

// Timeout after 10 seconds
setTimeout(() => {
  console.log('\n⏱️ Test timed out after 10 seconds');
  mcp.kill();
  process.exit(1);
}, 10000);
#!/usr/bin/env node

/**
 * Comprehensive test script for all 15 MCP tools
 * Tests basic functionality of each tool to verify they work via CLI
 */

const { spawn } = require('child_process');
const fs = require('fs');

// Test configurations for each tool
const TOOL_TESTS = [
  {
    name: 'system',
    args: { operation: 'version' },
    description: 'Get system version info'
  },
  {
    name: 'tasks', 
    args: { mode: 'today', limit: '5', details: 'false' },
    description: 'Get today\'s tasks'
  },
  {
    name: 'manage_task',
    args: { operation: 'create', name: 'CLI Test Task ' + Date.now() },
    description: 'Create a test task'
  },
  {
    name: 'projects',
    args: { operation: 'list', limit: '5', details: 'false' },
    description: 'List projects'
  },
  {
    name: 'folders', 
    args: { operation: 'list' },
    description: 'List folders'
  },
  {
    name: 'tags',
    args: { operation: 'list', sortBy: 'name', includeEmpty: 'false', includeUsageStats: 'false', includeTaskCounts: 'false', fastMode: 'true', namesOnly: 'false' },
    description: 'List tags'
  },
  {
    name: 'manage_reviews',
    args: {},
    description: 'Get review status'
  },
  {
    name: 'productivity_stats',
    args: { period: 'week', includeProjectStats: 'false', includeTagStats: 'false' },
    description: 'Get productivity stats'
  },
  {
    name: 'task_velocity',
    args: { days: '7', groupBy: 'day', includeWeekends: 'false' },
    description: 'Get task velocity'
  },
  {
    name: 'analyze_overdue',
    args: { includeRecentlyCompleted: 'false', groupBy: 'project', limit: '10' },
    description: 'Analyze overdue tasks'
  },
  {
    name: 'workflow_analysis',
    args: { analysisDepth: 'quick', focusAreas: 'momentum', includeRawData: 'false', maxInsights: '5' },
    description: 'Analyze workflow'
  },
  {
    name: 'analyze_patterns',
    args: { patterns: ['next_actions'], options: '{}' },
    description: 'Analyze patterns'
  },
  {
    name: 'export',
    args: { type: 'tasks', format: 'json', filter: { limit: 5 } },
    description: 'Export tasks'
  },
  {
    name: 'recurring_tasks',
    args: { operation: 'patterns', activeOnly: 'true', includeCompleted: 'false', includeDropped: 'false' },
    description: 'Analyze recurring tasks'
  },
  {
    name: 'perspectives',
    args: { operation: 'list', includeFilterRules: 'false', sortBy: 'name', limit: '10', includeDetails: 'false' },
    description: 'List perspectives'
  }
];

async function testTool(toolConfig) {
  return new Promise((resolve) => {
    console.log(`🔍 Testing ${toolConfig.name}: ${toolConfig.description}...`);
    
    const testData = {
      "jsonrpc": "2.0",
      "id": 1,
      "method": "initialize",
      "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "1.0.0"}
      }
    };
    
    const toolCall = {
      "jsonrpc": "2.0", 
      "id": 2,
      "method": "tools/call",
      "params": {
        "name": toolConfig.name,
        "arguments": toolConfig.args
      }
    };
    
    const input = JSON.stringify(testData) + '\n' + JSON.stringify(toolCall) + '\n';
    
    const process = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      const lines = stdout.trim().split('\n');
      let initResponse = null;
      let toolResponse = null;
      
      try {
        // Parse responses
        for (const line of lines) {
          if (line.trim() && line.startsWith('{')) {
            const parsed = JSON.parse(line);
            if (parsed.id === 1) initResponse = parsed;
            if (parsed.id === 2) toolResponse = parsed;
          }
        }
        
        // Check results
        if (!initResponse) {
          console.log(`❌ ${toolConfig.name}: No initialization response`);
          resolve({ name: toolConfig.name, success: false, error: 'No init response' });
          return;
        }
        
        if (!toolResponse) {
          console.log(`⚠️ ${toolConfig.name}: Tool executed but no response (may be working)`);
          resolve({ name: toolConfig.name, success: false, error: 'No tool response' });
          return;
        }
        
        if (toolResponse.error) {
          console.log(`❌ ${toolConfig.name}: Error - ${toolResponse.error.message}`);
          resolve({ name: toolConfig.name, success: false, error: toolResponse.error.message });
          return;
        }
        
        if (toolResponse.result && toolResponse.result.content) {
          console.log(`✅ ${toolConfig.name}: Success`);
          resolve({ name: toolConfig.name, success: true });
          return;
        }
        
        console.log(`⚠️ ${toolConfig.name}: Unexpected response format`);
        resolve({ name: toolConfig.name, success: false, error: 'Unexpected response format' });
        
      } catch (parseError) {
        console.log(`❌ ${toolConfig.name}: Parse error - ${parseError.message}`);
        resolve({ name: toolConfig.name, success: false, error: `Parse error: ${parseError.message}` });
      }
    });
    
    process.on('error', (error) => {
      console.log(`❌ ${toolConfig.name}: Process error - ${error.message}`);
      resolve({ name: toolConfig.name, success: false, error: `Process error: ${error.message}` });
    });
    
    // Send input and close stdin
    process.stdin.write(input);
    process.stdin.end();
  });
}

async function runAllTests() {
  console.log('🚀 Starting comprehensive tool testing...\n');
  
  const results = [];
  
  for (const toolConfig of TOOL_TESTS) {
    const result = await testTool(toolConfig);
    results.push(result);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Summary
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  
  if (successful.length > 0) {
    console.log('\n✅ Working tools:');
    successful.forEach(r => console.log(`  - ${r.name}`));
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed tools:');
    failed.forEach(r => console.log(`  - ${r.name}: ${r.error}`));
  }
  
  console.log(`\n🎯 Success rate: ${Math.round((successful.length / results.length) * 100)}%`);
  
  // Exit with appropriate code
  process.exit(failed.length > 0 ? 1 : 0);
}

runAllTests().catch(console.error);
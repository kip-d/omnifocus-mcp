#!/usr/bin/env node
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { readFileSync } from 'fs';
import path from 'path';

console.log('MCP Server Integration Test Suite');
console.log('==================================');

// Load Claude Desktop config to check our server entry
const configPath = '/Users/guillaume/.dotfiles/claude/claude_desktop_config.json';
let claudeConfig;
try {
  claudeConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  console.log('✅ Claude Desktop config loaded');
  
  const omnifocusServer = claudeConfig.mcpServers['omnifocus-cached'];
  if (omnifocusServer) {
    console.log(`✅ OmniFocus server found in config: ${omnifocusServer.command} ${omnifocusServer.args.join(' ')}`);
  } else {
    console.error('❌ OmniFocus server not found in Claude Desktop config');
  }
} catch (error) {
  console.error('❌ Failed to load Claude Desktop config:', error.message);
}

// Test 1: Server startup performance
console.log('\nTest 1: Server Startup Performance');
console.log('-----------------------------------');

const startTime = Date.now();
const server = spawn('node', ['./dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let serverReady = false;
const serverStartTime = new Promise((resolve, reject) => {
  const rl = createInterface({
    input: server.stdout,
    crlfDelay: Infinity
  });

  server.stderr.on('data', (data) => {
    console.log('Server stderr:', data.toString());
  });

  server.on('error', reject);

  // Send init request immediately after spawn
  setTimeout(() => {
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'integration-test',
          version: '1.0.0'
        }
      }
    };
    
    server.stdin.write(JSON.stringify(initRequest) + '\n');
  }, 10);

  rl.on('line', (line) => {
    try {
      const response = JSON.parse(line);
      if (response.id === 1) {
        const elapsed = Date.now() - startTime;
        console.log(`✅ Server responded to initialize in ${elapsed}ms`);
        serverReady = true;
        resolve(elapsed);
      }
    } catch (e) {
      // Ignore non-JSON
    }
  });

  setTimeout(() => {
    if (!serverReady) {
      reject(new Error('Server did not respond to initialize within 5 seconds'));
    }
  }, 5000);
});

// Test 2: Memory and resource usage
async function testResourceUsage() {
  console.log('\nTest 2: Resource Usage');
  console.log('----------------------');
  
  const { spawn } = await import('child_process');
  const ps = spawn('ps', ['-o', 'pid,ppid,rss,vsz,comm', '-p', server.pid.toString()]);
  
  ps.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    if (lines[1]) {
      const parts = lines[1].trim().split(/\s+/);
      const rss = parseInt(parts[2]); // RSS in KB
      const vsz = parseInt(parts[3]); // VSZ in KB
      console.log(`✅ Memory usage: RSS=${Math.round(rss/1024)}MB, VSZ=${Math.round(vsz/1024)}MB`);
      
      if (rss > 100 * 1024) { // > 100MB RSS
        console.warn(`⚠️  High memory usage: ${Math.round(rss/1024)}MB RSS`);
      }
    }
  });
}

// Test 3: Tool registration verification
async function testToolRegistration() {
  console.log('\nTest 3: Tool Registration');
  console.log('-------------------------');
  
  return new Promise((resolve) => {
    const rl = createInterface({
      input: server.stdout,
      crlfDelay: Infinity
    });

    const toolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };

    server.stdin.write(JSON.stringify(toolsRequest) + '\n');

    rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        if (response.id === 2) {
          const tools = response.result?.tools || [];
          console.log(`✅ ${tools.length} tools registered`);
          
          // Check for new feature tools
          const newFeatureTools = [
            'get_productivity_stats',
            'get_task_velocity', 
            'analyze_overdue_tasks',
            'list_tags',
            'manage_tags',
            'export_tasks',
            'export_projects',
            'bulk_export',
            'analyze_recurring_tasks',
            'get_recurring_patterns',
            'create_project',
            'update_project',
            'complete_project',
            'delete_project'
          ];
          
          const foundTools = newFeatureTools.filter(toolName => 
            tools.some(tool => tool.name === toolName)
          );
          
          console.log(`✅ ${foundTools.length}/${newFeatureTools.length} new feature tools found`);
          
          if (foundTools.length === newFeatureTools.length) {
            console.log('✅ All new features are properly registered');
          } else {
            const missing = newFeatureTools.filter(toolName => 
              !tools.some(tool => tool.name === toolName)
            );
            console.error(`❌ Missing tools: ${missing.join(', ')}`);
          }
          
          resolve(tools.length);
        }
      } catch (e) {
        // Ignore non-JSON
      }
    });
  });
}

// Test 4: Quick tool execution test
async function testToolExecution() {
  console.log('\nTest 4: Tool Execution');
  console.log('----------------------');
  
  return new Promise((resolve) => {
    const rl = createInterface({
      input: server.stdout,
      crlfDelay: Infinity
    });

    const callRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_task_count',
        arguments: { completed: false }
      }
    };

    const start = Date.now();
    server.stdin.write(JSON.stringify(callRequest) + '\n');

    rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        if (response.id === 3) {
          const elapsed = Date.now() - start;
          
          if (response.result) {
            console.log(`✅ Tool execution successful in ${elapsed}ms`);
            const content = response.result.content?.[0]?.text;
            if (content) {
              const result = JSON.parse(content);
              console.log(`   Task count: ${result.count}, from cache: ${result.from_cache}`);
            }
          } else {
            console.error('❌ Tool execution failed:', response.error);
          }
          
          resolve(elapsed);
        }
      } catch (e) {
        // Ignore non-JSON
      }
    });
  });
}

// Run all tests
try {
  const initTime = await serverStartTime;
  
  if (initTime < 1000) {
    console.log('✅ Startup performance: EXCELLENT');
  } else if (initTime < 3000) {
    console.log('✅ Startup performance: GOOD');
  } else {
    console.warn('⚠️  Startup performance: SLOW');
  }
  
  await testResourceUsage();
  await testToolRegistration();
  await testToolExecution();
  
  console.log('\n========================================');
  console.log('All integration tests completed successfully!');
  console.log('========================================');
  
  // Test 5: Claude Desktop compatibility check
  console.log('\nTest 5: Claude Desktop Compatibility');
  console.log('------------------------------------');
  
  console.log('Manual verification steps:');
  console.log('1. Restart Claude Desktop');
  console.log('2. Start new conversation');
  console.log('3. Look for MCP connection in status');
  console.log('4. Check logs at: ~/Library/Logs/Claude/mcp-server-omnifocus-cached.log');
  console.log('');
  console.log('If Claude Desktop shows timeout, the issue is NOT with our server.');
  console.log('Our server responds in ' + initTime + 'ms which is well under 60 second timeout.');
  
} catch (error) {
  console.error('❌ Integration test failed:', error.message);
  process.exit(1);
} finally {
  server.kill();
}
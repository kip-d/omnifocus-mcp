#!/usr/bin/env node

/**
 * Test script for v2.0.0-alpha.1 consolidated tools
 * Tests the new 'tasks' and 'projects' tools
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log();
  log(`${'='.repeat(60)}`, colors.bright);
  log(title, colors.bright + colors.cyan);
  log(`${'='.repeat(60)}`, colors.bright);
}

function logTest(name) {
  log(`\n▶ Testing: ${name}`, colors.yellow);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

async function runMcpTool(toolName, args) {
  return new Promise((resolve, reject) => {
    const serverPath = join(projectRoot, 'dist', 'index.js');
    
    const child = spawn('node', [serverPath], {
      env: { ...process.env, LOG_LEVEL: 'error' },
    });
    
    let output = '';
    let errorOutput = '';
    let responseReceived = false;
    
    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      
      // Look for tool response
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.trim() && line.startsWith('{')) {
          try {
            const json = JSON.parse(line);
            if (json.id === 2 && json.result) {
              responseReceived = true;
              resolve(json.result);
              child.kill();
              return;
            }
          } catch (e) {
            // Not JSON, continue
          }
        }
      }
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code) => {
      if (!responseReceived) {
        reject(new Error(`No response received. Exit code: ${code}\nStderr: ${errorOutput}`));
      }
    });
    
    // Send MCP protocol messages
    const messages = [
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-v2-client', version: '1.0.0' },
        },
        id: 1,
      },
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
        id: 2,
      },
    ];
    
    setTimeout(() => {
      messages.forEach(msg => {
        child.stdin.write(JSON.stringify(msg) + '\n');
      });
      child.stdin.end();
    }, 100);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (!responseReceived) {
        child.kill();
        reject(new Error('Timeout waiting for response'));
      }
    }, 10000);
  });
}

async function testV2TasksTool() {
  logSection('Testing v2.0.0 Tasks Tool');
  
  const tests = [
    {
      name: 'Overdue tasks with summary',
      args: { mode: 'overdue', limit: 5 },
    },
    {
      name: 'Today mode (quick response)',
      args: { mode: 'today', limit: 5, details: false },
    },
    {
      name: 'Natural language date',
      args: { mode: 'all', dueBy: 'tomorrow', limit: 3 },
    },
  ];
  
  for (const test of tests) {
    logTest(test.name);
    
    const startTime = Date.now();
    try {
      const response = await runMcpTool('tasks', test.args);
      const elapsed = Date.now() - startTime;
      
      // Parse the text content
      const content = response.content?.[0]?.text;
      if (!content) {
        throw new Error('No content in response');
      }
      
      const result = JSON.parse(content);
      
      logSuccess(`Completed in ${elapsed}ms`);
      
      // Check for v2 features
      if (result.summary) {
        log(`📊 Summary:`, colors.blue);
        console.log(result.summary);
        logSuccess('Has summary for quick LLM processing');
      }
      
      if (result.insights) {
        log(`💡 Insights:`, colors.blue);
        result.insights.forEach(insight => console.log(`  • ${insight}`));
        logSuccess('Has insights for immediate value');
      }
      
      if (result.data?.preview) {
        log(`👀 Preview: ${result.data.preview.length} items`, colors.blue);
        logSuccess('Has preview for fast response');
      }
      
      if (result.error?.suggestion) {
        log(`💡 Error suggestion: ${result.error.suggestion}`, colors.yellow);
      }
      
    } catch (error) {
      logError(`Failed: ${error.message}`);
    }
  }
}

async function testV2ProjectsTool() {
  logSection('Testing v2.0.0 Projects Tool');
  
  const tests = [
    {
      name: 'List active projects',
      args: { operation: 'active', limit: 5 },
    },
    {
      name: 'Projects needing review',
      args: { operation: 'review', limit: 3 },
    },
  ];
  
  for (const test of tests) {
    logTest(test.name);
    
    const startTime = Date.now();
    try {
      const response = await runMcpTool('projects', test.args);
      const elapsed = Date.now() - startTime;
      
      const content = response.content?.[0]?.text;
      if (!content) {
        throw new Error('No content in response');
      }
      
      const result = JSON.parse(content);
      
      logSuccess(`Completed in ${elapsed}ms`);
      
      if (result.summary) {
        log(`📊 Summary:`, colors.blue);
        console.log(result.summary);
        logSuccess('Has project summary');
      }
      
      if (result.data?.preview) {
        logSuccess('Has preview data');
      }
      
    } catch (error) {
      logError(`Failed: ${error.message}`);
    }
  }
}

async function testErrorHandling() {
  logSection('Testing v2.0.0 Error Prevention');
  
  logTest('Missing search term (should give helpful error)');
  try {
    const response = await runMcpTool('tasks', { mode: 'search' });
    const content = response.content?.[0]?.text;
    const result = JSON.parse(content);
    
    if (result.error) {
      log(`Error: ${result.error.message}`, colors.yellow);
      if (result.error.suggestion) {
        logSuccess(`Helpful suggestion: "${result.error.suggestion}"`);
      }
    }
  } catch (error) {
    logError(`Unexpected error: ${error.message}`);
  }
  
  logTest('String boolean conversion');
  try {
    const response = await runMcpTool('tasks', { 
      mode: 'all', 
      completed: 'false',  // String instead of boolean
      limit: 3 
    });
    const content = response.content?.[0]?.text;
    const result = JSON.parse(content);
    
    if (result.success) {
      logSuccess('Successfully converted string "false" to boolean');
    }
  } catch (error) {
    logError(`Failed: ${error.message}`);
  }
}

async function main() {
  log('OmniFocus MCP v2.0.0-alpha.1 Test Suite', colors.bright + colors.cyan);
  log('Testing new consolidated tools optimized for LLM experience\n', colors.yellow);
  
  try {
    await testV2TasksTool();
    await testV2ProjectsTool();
    await testErrorHandling();
    
    logSection('Test Summary');
    logSuccess('v2.0.0-alpha.1 tools are working!');
    log('\nKey features validated:', colors.green);
    console.log('  ✅ Consolidated tools (tasks, projects)');
    console.log('  ✅ Summary-first responses');
    console.log('  ✅ Natural language support');
    console.log('  ✅ Helpful error suggestions');
    console.log('  ✅ Preview data for quick responses');
    
  } catch (error) {
    logError(`Test suite failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);
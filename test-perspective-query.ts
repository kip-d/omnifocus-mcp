#!/usr/bin/env node

/**
 * Test script for perspective query functionality
 * Tests both built-in and custom perspectives
 */

import { spawn } from 'child_process';

interface TestCase {
  name: string;
  perspectiveName: string;
  expectedType: 'builtin' | 'custom';
  shouldHaveRules: boolean;
}

const testCases: TestCase[] = [
  {
    name: 'Flagged perspective',
    perspectiveName: 'Flagged',
    expectedType: 'builtin',
    shouldHaveRules: true,
  },
  {
    name: 'Inbox perspective',
    perspectiveName: 'Inbox',
    expectedType: 'builtin',
    shouldHaveRules: true,
  },
  {
    name: 'Forecast perspective', 
    perspectiveName: 'Forecast',
    expectedType: 'builtin',
    shouldHaveRules: true,
  },
];

async function runTest(testCase: TestCase): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`   Perspective: ${testCase.perspectiveName}`);
    
    const proc = spawn('node', ['dist/index.js']);
    
    let output = '';
    proc.stdout.on('data', d => output += d.toString());
    proc.stderr.on('data', d => console.error('Error:', d.toString()));
    
    // Initialize MCP
    setTimeout(() => {
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: { 
          protocolVersion: '2025-06-18',
          capabilities: {} 
        },
        id: 1
      }) + '\n');
    }, 100);
    
    // Query perspective
    setTimeout(() => {
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'query_perspective',
          arguments: {
            perspectiveName: testCase.perspectiveName,
            limit: '5',
            includeDetails: 'false'
          }
        },
        id: 2
      }) + '\n');
    }, 500);
    
    // Process results
    setTimeout(() => {
      proc.kill();
      
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('"id":2')) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.result && parsed.result.content) {
              const content = JSON.parse(parsed.result.content[0].text);
              
              if (content.success) {
                const data = content.data;
                console.log(`   ✅ Success!`);
                console.log(`   Type: ${data.perspectiveType}`);
                console.log(`   Tasks found: ${data.tasks ? data.tasks.length : 0}`);
                console.log(`   Has filter rules: ${!!data.filterRules}`);
                console.log(`   Aggregation: ${data.aggregation}`);
                
                if (data.tasks && data.tasks.length > 0) {
                  console.log(`   Sample task: "${data.tasks[0].name}"`);
                }
                
                // Validate expectations
                if (data.perspectiveType !== testCase.expectedType) {
                  console.log(`   ⚠️  Expected type ${testCase.expectedType}, got ${data.perspectiveType}`);
                }
                if (testCase.shouldHaveRules && !data.filterRules) {
                  console.log(`   ⚠️  Expected filter rules but got none`);
                }
              } else {
                console.log(`   ❌ Failed: ${content.error || content.message}`);
              }
            }
          } catch (e) {
            console.log(`   ❌ Parse error:`, e);
          }
          break;
        }
      }
      
      resolve();
    }, 3000);
  });
}

async function main() {
  console.log('🔍 Testing Perspective Query Functionality');
  console.log('==========================================');
  
  for (const testCase of testCases) {
    await runTest(testCase);
  }
  
  console.log('\n✨ All tests completed!');
}

main().catch(console.error);
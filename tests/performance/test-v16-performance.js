#!/usr/bin/env node

/**
 * Performance test for v1.16.0 optimizations
 * Compares against v1.15.0 baseline
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, '..', '..', 'dist', 'index.js');

function runTest(name, toolName, args) {
  return new Promise((resolve) => {
    const server = spawn('node', [serverPath], {
      env: { ...process.env, LOG_LEVEL: 'error' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    // Send initialization
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    }) + '\n');

    // Send test request after init
    setTimeout(() => {
      const startTime = Date.now();
      server.stdin.write(JSON.stringify(request) + '\n');
      
      let buffer = '';
      server.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === 1) {
                const elapsed = Date.now() - startTime;
                server.kill();
                
                if (response.error) {
                  resolve({ name, error: response.error.message, time: elapsed });
                } else {
                  // Try to extract query_time_ms from metadata
                  let queryTime = elapsed;
                  if (response.result?.content?.[0]?.text) {
                    const match = response.result.content[0].text.match(/query_time_ms[": ]+(\d+)/);
                    if (match) {
                      queryTime = parseInt(match[1]);
                    }
                  }
                  resolve({ name, time: queryTime, taskCount: response.result?.content?.length || 0 });
                }
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      });
    }, 500);

    // Timeout after 30 seconds
    setTimeout(() => {
      server.kill();
      resolve({ name, error: 'Timeout', time: 30000 });
    }, 30000);
  });
}

async function runAllTests() {
  console.log('🔬 v1.16.0 Performance Testing\n');
  console.log('Testing with optimized hybrid safeGet approach...\n');
  
  const tests = [
    {
      name: 'Basic List (100 tasks)',
      tool: 'list_tasks',
      args: {
        completed: false,
        skipAnalysis: 'true',
        includeDetails: 'false',
        limit: '100'
      }
    },
    {
      name: 'With Details (100 tasks)',
      tool: 'list_tasks',
      args: {
        completed: false,
        skipAnalysis: 'true',
        includeDetails: 'true',
        limit: '100'
      }
    },
    {
      name: 'Small Query (25 tasks)',
      tool: 'list_tasks',
      args: {
        completed: false,
        skipAnalysis: 'true',
        includeDetails: 'false',
        limit: '25'
      }
    },
    {
      name: 'Medium Query (200 tasks)',
      tool: 'list_tasks',
      args: {
        completed: false,
        skipAnalysis: 'true',
        includeDetails: 'false',
        limit: '200'
      }
    },
    {
      name: "Today's Agenda",
      tool: 'todays_agenda',
      args: {
        includeFlagged: 'true',
        includeOverdue: 'true',
        includeAvailable: 'true',
        includeDetails: 'false',
        limit: '50'
      }
    }
  ];
  
  console.log('Running tests...\n');
  const results = [];
  
  for (const test of tests) {
    process.stdout.write(`Running ${test.name}... `);
    const result = await runTest(test.name, test.tool, test.args);
    results.push(result);
    
    if (result.error) {
      console.log(`❌ ERROR: ${result.error}`);
    } else {
      console.log(`✅ ${result.time}ms`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  console.log('\nTest Name                           Time (ms)   vs v1.15.0');
  console.log('-'.repeat(60));
  
  // v1.15.0 baseline times from testing
  const baseline = {
    'Basic List (100 tasks)': 5500,
    'With Details (100 tasks)': 6200,
    'Small Query (25 tasks)': 1800,
    'Medium Query (200 tasks)': 8500,
    "Today's Agenda": 870
  };
  
  for (const result of results) {
    if (!result.error) {
      const baseTime = baseline[result.name] || 0;
      const improvement = baseTime ? ((baseTime - result.time) / baseTime * 100).toFixed(1) : 'N/A';
      const arrow = improvement !== 'N/A' && parseFloat(improvement) > 0 ? '↓' : 
                    improvement !== 'N/A' && parseFloat(improvement) < 0 ? '↑' : '→';
      
      console.log(
        `${result.name.padEnd(35)} ${String(result.time).padStart(8)} ${arrow} ${improvement}%`
      );
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('OPTIMIZATION ASSESSMENT');
  console.log('='.repeat(60));
  
  // Calculate average improvement
  const improvements = results
    .filter(r => !r.error && baseline[r.name])
    .map(r => ((baseline[r.name] - r.time) / baseline[r.name] * 100));
  
  if (improvements.length > 0) {
    const avgImprovement = (improvements.reduce((a, b) => a + b, 0) / improvements.length).toFixed(1);
    
    console.log(`\nAverage Improvement: ${avgImprovement}%`);
    
    if (parseFloat(avgImprovement) > 15) {
      console.log('✅ Optimization successful! Target of 15-20% improvement achieved.');
    } else if (parseFloat(avgImprovement) > 10) {
      console.log('⚠️ Moderate improvement. Some optimization benefit realized.');
    } else {
      console.log('❌ Minimal improvement. Optimization may not be effective.');
    }
  }
  
  console.log('\nNote: Times are with ~2,400 task database');
}

runAllTests().catch(console.error);
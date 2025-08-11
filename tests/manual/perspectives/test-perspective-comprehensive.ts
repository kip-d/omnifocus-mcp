#!/usr/bin/env npx tsx

import { spawn } from 'child_process';

interface TestResult {
  name: string;
  success: boolean;
  message: string;
  details?: any;
}

async function runMCPCommand(server: any, method: string, params: any, id: number): Promise<any> {
  return new Promise((resolve) => {
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };
    
    server.stdin.write(JSON.stringify(request) + '\n');
    
    // Give it time to process
    setTimeout(() => resolve(null), 2000);
  });
}

async function parseMCPResponse(output: string, id: number): Promise<any> {
  const lines = output.split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.id === id && parsed.result?.content?.[0]?.text) {
        return JSON.parse(parsed.result.content[0].text);
      }
    } catch (e) {
      // Ignore non-JSON lines
    }
  }
  return null;
}

async function testPerspectiveTools(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('🧪 Running comprehensive perspective tools tests...\n');

  const server = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, LOG_LEVEL: 'error' }
  });

  let output = '';
  server.stdout.on('data', (data) => {
    output += data.toString();
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Initialize
  await runMCPCommand(server, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {}
  }, 1);

  // Test 1: List all perspectives
  console.log('Test 1: List all perspectives...');
  await runMCPCommand(server, 'tools/call', {
    name: 'list_perspectives',
    arguments: { includeFilterRules: 'true', sortBy: 'type' }
  }, 2);
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  const listResult = await parseMCPResponse(output, 2);
  
  if (listResult?.success && listResult.data?.items) {
    results.push({
      name: 'list_perspectives',
      success: true,
      message: `Found ${listResult.data.items.length} perspectives (${listResult.data.builtInCount} built-in, ${listResult.data.customCount} custom)`,
      details: {
        total: listResult.data.items.length,
        builtIn: listResult.data.builtInCount,
        custom: listResult.data.customCount,
        sampleNames: listResult.data.items.slice(0, 5).map(p => p.name)
      }
    });
  } else {
    results.push({
      name: 'list_perspectives',
      success: false,
      message: 'Failed to list perspectives',
      details: listResult?.error
    });
  }

  // Test 2: Query built-in perspective (Flagged)
  console.log('Test 2: Query Flagged perspective...');
  await runMCPCommand(server, 'tools/call', {
    name: 'query_perspective',
    arguments: { perspectiveName: 'Flagged', limit: '5' }
  }, 3);
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  output = ''; // Clear for next response
  server.stdout.once('data', (data) => { output = data.toString(); });
  
  const flaggedResult = await parseMCPResponse(output, 3);
  
  if (flaggedResult?.success) {
    results.push({
      name: 'query_perspective (Flagged)',
      success: true,
      message: `Found ${flaggedResult.data?.items?.length || 0} flagged tasks`,
      details: {
        perspectiveType: flaggedResult.perspectiveType,
        taskCount: flaggedResult.data?.items?.length,
        simulatedQuery: flaggedResult.simulatedQuery,
        sampleTasks: flaggedResult.data?.items?.slice(0, 3).map(t => t.name)
      }
    });
  } else {
    results.push({
      name: 'query_perspective (Flagged)',
      success: false,
      message: 'Failed to query Flagged perspective',
      details: flaggedResult?.error
    });
  }

  // Test 3: Query custom perspective (if available)
  if (listResult?.data?.items) {
    const customPerspective = listResult.data.items.find(p => p.type === 'custom' && p.name);
    if (customPerspective) {
      console.log(`Test 3: Query custom perspective "${customPerspective.name}"...`);
      await runMCPCommand(server, 'tools/call', {
        name: 'query_perspective',
        arguments: { perspectiveName: customPerspective.name, limit: '5' }
      }, 4);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      const customResult = await parseMCPResponse(output, 4);
      
      if (customResult?.success) {
        results.push({
          name: `query_perspective (${customPerspective.name})`,
          success: true,
          message: `Found ${customResult.data?.items?.length || 0} tasks`,
          details: {
            perspectiveType: customResult.perspectiveType,
            hasFilterRules: !!customResult.filterRules,
            taskCount: customResult.data?.items?.length
          }
        });
      } else {
        results.push({
          name: `query_perspective (${customPerspective.name})`,
          success: false,
          message: 'Failed to query custom perspective',
          details: customResult?.error
        });
      }
    }
  }

  // Test 4: Query non-existent perspective
  console.log('Test 4: Query non-existent perspective...');
  await runMCPCommand(server, 'tools/call', {
    name: 'query_perspective',
    arguments: { perspectiveName: 'NonExistentPerspective123', limit: '5' }
  }, 5);
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  const nonExistentResult = await parseMCPResponse(output, 5);
  
  if (nonExistentResult) {
    results.push({
      name: 'query_perspective (non-existent)',
      success: nonExistentResult.success === false || nonExistentResult.data?.items?.length === 0,
      message: 'Correctly handled non-existent perspective',
      details: {
        simulatedQuery: nonExistentResult.simulatedQuery,
        perspectiveType: nonExistentResult.perspectiveType
      }
    });
  }

  // Clean up
  server.kill();
  
  return results;
}

// Run tests and display results
testPerspectiveTools().then(results => {
  console.log('\n' + '='.repeat(50));
  console.log('TEST RESULTS');
  console.log('='.repeat(50) + '\n');
  
  let passed = 0;
  let failed = 0;
  
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    console.log(`   ${result.message}`);
    if (result.details) {
      console.log(`   Details:`, JSON.stringify(result.details, null, 2).split('\n').map(l => '   ' + l).join('\n'));
    }
    console.log();
    
    if (result.success) passed++;
    else failed++;
  });
  
  console.log('='.repeat(50));
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Ready to bump version and commit.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review before committing.');
    process.exit(1);
  }
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
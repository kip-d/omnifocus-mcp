#!/usr/bin/env node

/**
 * Performance test for perspective query tool
 * Measures overhead of filter rule application vs direct queries
 */

import { spawn } from 'child_process';

interface TimingResult {
  operation: string;
  time_ms: number;
  tasks_found: number;
}

async function runQuery(toolName: string, args: any): Promise<TimingResult> {
  return new Promise((resolve) => {
    const proc = spawn('node', ['dist/index.js']);
    
    let output = '';
    proc.stdout.on('data', d => output += d.toString());
    
    const startTime = Date.now();
    
    // Initialize MCP
    setTimeout(() => {
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {} },
        id: 1
      }) + '\n');
    }, 100);
    
    // Run query
    setTimeout(() => {
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        },
        id: 2
      }) + '\n');
    }, 200);
    
    // Process results
    setTimeout(() => {
      proc.kill();
      const endTime = Date.now();
      
      const lines = output.split('\n');
      let taskCount = 0;
      
      for (const line of lines) {
        if (line.includes('"id":2')) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.result && parsed.result.content) {
              const content = JSON.parse(parsed.result.content[0].text);
              if (content.success && content.data) {
                taskCount = content.data.tasks ? content.data.tasks.length : 
                           content.data.items ? content.data.items.length : 0;
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
          break;
        }
      }
      
      resolve({
        operation: toolName,
        time_ms: endTime - startTime,
        tasks_found: taskCount
      });
    }, 3000);
  });
}

async function main() {
  console.log('🔬 Performance Test: Perspective Query vs Direct Query');
  console.log('======================================================\n');
  
  // Test 1: Direct flagged query using tasks tool
  console.log('Test 1: Direct flagged query (tasks tool with mode)...');
  const directResult = await runQuery('tasks', {
    mode: 'flagged',
    limit: '50',
    details: 'false'
  });
  console.log(`  Time: ${directResult.time_ms}ms`);
  console.log(`  Tasks found: ${directResult.tasks_found}`);
  
  // Test 2: Perspective query for Flagged
  console.log('\nTest 2: Perspective query for Flagged...');
  const perspectiveResult = await runQuery('query_perspective', {
    perspectiveName: 'Flagged',
    limit: '50',
    includeDetails: 'false'
  });
  console.log(`  Time: ${perspectiveResult.time_ms}ms`);
  console.log(`  Tasks found: ${perspectiveResult.tasks_found}`);
  
  // Test 3: Perspective query for Inbox
  console.log('\nTest 3: Perspective query for Inbox...');
  const inboxPerspective = await runQuery('query_perspective', {
    perspectiveName: 'Inbox',
    limit: '50',
    includeDetails: 'false'
  });
  console.log(`  Time: ${inboxPerspective.time_ms}ms`);
  console.log(`  Tasks found: ${inboxPerspective.tasks_found}`);
  
  // Test 4: Direct inbox query
  console.log('\nTest 4: Direct inbox query (tasks tool)...');
  const directInbox = await runQuery('tasks', {
    mode: 'search',
    limit: '50',
    details: 'false',
    inInbox: 'true'
  });
  console.log(`  Time: ${directInbox.time_ms}ms`);
  console.log(`  Tasks found: ${directInbox.tasks_found}`);
  
  // Calculate overhead
  console.log('\n📊 Performance Analysis:');
  console.log('========================');
  
  const flaggedOverhead = perspectiveResult.time_ms - directResult.time_ms;
  const flaggedPercent = ((perspectiveResult.time_ms / directResult.time_ms - 1) * 100).toFixed(1);
  
  console.log(`\nFlagged Perspective Overhead:`);
  console.log(`  Direct query: ${directResult.time_ms}ms`);
  console.log(`  Perspective query: ${perspectiveResult.time_ms}ms`);
  console.log(`  Overhead: ${flaggedOverhead}ms (${flaggedPercent}% slower)`);
  
  const inboxOverhead = inboxPerspective.time_ms - directInbox.time_ms;
  const inboxPercent = ((inboxPerspective.time_ms / directInbox.time_ms - 1) * 100).toFixed(1);
  
  console.log(`\nInbox Perspective Overhead:`);
  console.log(`  Direct query: ${directInbox.time_ms}ms`);
  console.log(`  Perspective query: ${inboxPerspective.time_ms}ms`);
  console.log(`  Overhead: ${inboxOverhead}ms (${inboxPercent}% slower)`);
  
  const avgOverhead = Math.round((flaggedOverhead + inboxOverhead) / 2);
  console.log(`\n✨ Average overhead: ~${avgOverhead}ms`);
  
  // Test caching
  console.log('\n🔄 Testing cache performance...');
  const cacheTest1 = await runQuery('query_perspective', {
    perspectiveName: 'Flagged',
    limit: '50',
    includeDetails: 'false'
  });
  console.log(`  First call: ${cacheTest1.time_ms}ms`);
  
  // Immediate second call (should hit cache)
  const cacheTest2Start = Date.now();
  const proc = spawn('node', ['dist/index.js']);
  let cacheOutput = '';
  proc.stdout.on('data', d => cacheOutput += d.toString());
  
  setTimeout(() => {
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {} },
      id: 1
    }) + '\n');
  }, 50);
  
  setTimeout(() => {
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'query_perspective',
        arguments: {
          perspectiveName: 'Flagged',
          limit: '50',
          includeDetails: 'false'
        }
      },
      id: 2
    }) + '\n');
  }, 100);
  
  setTimeout(() => {
    proc.kill();
    const cacheTest2Time = Date.now() - cacheTest2Start;
    console.log(`  Second call (cached): ${cacheTest2Time}ms`);
    console.log(`  Cache speedup: ${((1 - cacheTest2Time/cacheTest1.time_ms) * 100).toFixed(1)}%`);
  }, 500);
}

main().catch(console.error);
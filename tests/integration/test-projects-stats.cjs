#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

// Helper to run MCP inspector programmatically
async function testMCPCall(toolName, args) {
  const serverPath = path.join(__dirname, '..', '..', 'dist', 'index.js');
  const inspectorCmd = `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"${toolName}","arguments":${JSON.stringify(args)}}}' | npx @modelcontextprotocol/inspector ${serverPath} --once 2>/dev/null | grep -A1000 '"id":2'`;
  
  try {
    const { stdout } = await execAsync(inspectorCmd, { 
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    // Parse the JSON response
    const lines = stdout.split('\n').filter(l => l.trim());
    for (const line of lines) {
      if (line.includes('"id":2')) {
        return JSON.parse(line);
      }
    }
  } catch (error) {
    console.error('Error executing MCP call:', error.message);
    return null;
  }
}

async function runTests() {
  console.log('🧪 Testing list_projects with includeStats parameter\n');
  
  // Test 1: Without stats (default)
  console.log('📋 Test 1: list_projects WITHOUT stats (default behavior)');
  const startTime1 = Date.now();
  const response1 = await testMCPCall('list_projects', { limit: 3 });
  const time1 = Date.now() - startTime1;
  
  if (response1?.result?.content?.[0]?.text) {
    const result = JSON.parse(response1.result.content[0].text);
    console.log(`✅ Success! Query time: ${result.metadata?.query_time_ms}ms (total: ${time1}ms)`);
    if (result.data?.projects?.[0]) {
      console.log('Sample project:', {
        name: result.data.projects[0].name,
        hasStats: !!result.data.projects[0].stats
      });
    }
  } else {
    console.log('❌ Failed to get response');
  }

  console.log('\n---\n');

  // Test 2: With stats explicitly false
  console.log('📋 Test 2: list_projects with includeStats=false');
  const startTime2 = Date.now();
  const response2 = await testMCPCall('list_projects', { limit: 3, includeStats: false });
  const time2 = Date.now() - startTime2;

  if (response2?.result?.content?.[0]?.text) {
    const result = JSON.parse(response2.result.content[0].text);
    console.log(`✅ Success! Query time: ${result.metadata?.query_time_ms}ms (total: ${time2}ms)`);
    if (result.data?.projects?.[0]) {
      console.log('Sample project:', {
        name: result.data.projects[0].name,
        hasStats: !!result.data.projects[0].stats
      });
    }
  } else {
    console.log('❌ Failed to get response');
  }

  console.log('\n---\n');

  // Test 3: With stats enabled
  console.log('📊 Test 3: list_projects with includeStats=true');
  const startTime3 = Date.now();
  const response3 = await testMCPCall('list_projects', { limit: 3, includeStats: true });
  const time3 = Date.now() - startTime3;

  if (response3?.result?.content?.[0]?.text) {
    const result = JSON.parse(response3.result.content[0].text);
    console.log(`✅ Success! Query time: ${result.metadata?.query_time_ms}ms (total: ${time3}ms)`);
    if (result.data?.projects?.[0]) {
      const project = result.data.projects[0];
      console.log('Sample project with stats:', {
        name: project.name,
        stats: project.stats
      });
    }
  } else {
    console.log('❌ Failed to get response');
  }
  
  console.log('\n🎯 Summary:');
  console.log(`- Without stats: ${time2}ms`);
  console.log(`- With stats: ${time3}ms`);
  console.log(`- Performance impact: ${((time3 - time2) / time2 * 100).toFixed(1)}% increase`);
}

runTests().catch(console.error);
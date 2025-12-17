#!/usr/bin/env npx tsx

import { spawn } from 'child_process';

// Test the perspective tools via MCP protocol
async function testPerspectiveTools() {
  console.log('Testing perspective tools via MCP protocol...\n');

  const server = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, LOG_LEVEL: 'error' },
  });

  let output = '';
  server.stdout.on('data', (data) => {
    output += data.toString();
  });

  server.stderr.on('data', (data) => {
    console.error('Server error:', data.toString());
  });

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Initialize the server
  const initRequest = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
    },
    id: 1,
  };

  server.stdin.write(JSON.stringify(initRequest) + '\n');
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Test list_perspectives
  console.log('1. Testing list_perspectives...');
  const listRequest = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'list_perspectives',
      arguments: {
        includeFilterRules: 'true',
        sortBy: 'name',
      },
    },
    id: 2,
  };

  server.stdin.write(JSON.stringify(listRequest) + '\n');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Test query_perspective
  console.log('2. Testing query_perspective for "Flagged"...');
  const queryRequest = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'query_perspective',
      arguments: {
        perspectiveName: 'Flagged',
        limit: '5',
        includeDetails: 'false',
      },
    },
    id: 3,
  };

  server.stdin.write(JSON.stringify(queryRequest) + '\n');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Parse and display results
  const lines = output.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      if (parsed.id === 2) {
        console.log('\nlist_perspectives result:');
        if (parsed.result?.content?.[0]?.text) {
          const content = JSON.parse(parsed.result.content[0].text);
          if (content.success) {
            console.log(`✅ Found ${content.data.items.length} perspectives`);
            console.log(`   - Built-in: ${content.data.builtInCount || 0}`);
            console.log(`   - Custom: ${content.data.customCount || 0}`);

            // Show first few perspective names
            const names = content.data.items.slice(0, 5).map((p) => p.name);
            console.log(`   - First 5: ${names.join(', ')}`);
          } else {
            console.log('❌ Error:', content.error?.message);
          }
        }
      }

      if (parsed.id === 3) {
        console.log('\nquery_perspective result:');
        if (parsed.result?.content?.[0]?.text) {
          const content = JSON.parse(parsed.result.content[0].text);
          if (content.success) {
            console.log(`✅ Found ${content.data.items.length} tasks in "Flagged" perspective`);
            if (content.perspectiveName) {
              console.log(`   - Perspective: ${content.perspectiveName}`);
              console.log(`   - Type: ${content.perspectiveType || 'unknown'}`);
              console.log(`   - Simulated: ${content.simulatedQuery || false}`);
            }

            // Show first few task names
            if (content.data.items.length > 0) {
              const taskNames = content.data.items.slice(0, 3).map((t) => t.name);
              console.log(`   - First 3 tasks: ${taskNames.join(', ')}`);
            }
          } else {
            console.log('❌ Error:', content.error?.message);
          }
        }
      }
    } catch (e) {
      // Ignore non-JSON lines
    }
  }

  // Clean up
  server.kill();
  console.log('\n✅ Perspective tools test complete!');
}

testPerspectiveTools().catch(console.error);

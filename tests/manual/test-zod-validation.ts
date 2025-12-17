#!/usr/bin/env node
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '../../dist/index.js');

console.log('Testing Zod validation in OmniFocus MCP Server\n');

const tests = [
  {
    name: 'Valid list_tasks request',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'list_tasks',
        arguments: {
          completed: false,
          limit: 10,
        },
      },
      id: 1,
    },
  },
  {
    name: 'Invalid list_tasks - bad limit type',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'list_tasks',
        arguments: {
          completed: false,
          limit: 'ten', // Should be number
        },
      },
      id: 2,
    },
  },
  {
    name: 'Invalid list_tasks - limit too high',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'list_tasks',
        arguments: {
          limit: 2000, // Max is 1000
        },
      },
      id: 3,
    },
  },
  {
    name: 'Invalid create_task - missing required name',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'create_task',
        arguments: {
          // Missing required 'name' field
          flagged: true,
        },
      },
      id: 4,
    },
  },
  {
    name: 'Invalid date format',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'list_tasks',
        arguments: {
          dueBefore: 'tomorrow', // Should be ISO 8601
        },
      },
      id: 5,
    },
  },
];

async function runTest() {
  const proc = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, LOG_LEVEL: 'error' },
  });

  let output = '';
  proc.stdout.on('data', (data) => {
    output += data.toString();
  });

  proc.stderr.on('data', (data) => {
    console.error('STDERR:', data.toString());
  });

  // Send initialization
  const initRequest = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
    },
    id: 0,
  };

  proc.stdin.write(JSON.stringify(initRequest) + '\n');

  // Wait for initialization
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Run tests
  for (const test of tests) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log('Request:', JSON.stringify(test.request.params, null, 2));

    output = '';
    proc.stdin.write(JSON.stringify(test.request) + '\n');

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Parse last response
    const lines = output.trim().split('\n');
    const lastLine = lines[lines.length - 1];

    try {
      const response = JSON.parse(lastLine);

      if (response.error) {
        console.log('❌ Error:', response.error.message);
        if (response.error.data?.validation_errors) {
          console.log('Validation errors:', JSON.stringify(response.error.data.validation_errors, null, 2));
        }
      } else if (response.result) {
        console.log('✅ Success!');
        if (response.id === 1) {
          // Only show results for first valid test
          const content = JSON.parse(response.result.content[0].text);
          console.log(`Found ${content.items?.length || 0} tasks`);
        }
      }
    } catch (e) {
      console.log('Failed to parse response:', lastLine);
    }
  }

  proc.kill();
}

runTest().catch(console.error);

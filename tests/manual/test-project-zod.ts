#!/usr/bin/env node
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '../../dist/index.js');

console.log('Testing Zod validation for project tools\n');

const tests = [
  {
    name: 'Valid list_projects request',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'list_projects',
        arguments: {
          status: ['active'],
          limit: 5
        }
      },
      id: 1
    }
  },
  {
    name: 'Invalid project status',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'list_projects',
        arguments: {
          status: ['active', 'invalid_status']
        }
      },
      id: 2
    }
  },
  {
    name: 'Invalid create_project - missing name',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'create_project',
        arguments: {
          folder: 'Work'
        }
      },
      id: 3
    }
  },
  {
    name: 'Invalid update_project - no updates',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'update_project',
        arguments: {
          projectId: 'abc123',
          updates: {}
        }
      },
      id: 4
    }
  }
];

async function runTest() {
  const proc = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, LOG_LEVEL: 'error' }
  });

  let output = '';
  proc.stdout.on('data', (data) => {
    output += data.toString();
  });

  // Send initialization
  const initRequest = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {}
    },
    id: 0
  };
  
  proc.stdin.write(JSON.stringify(initRequest) + '\n');

  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Run tests
  for (const test of tests) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log('Request:', JSON.stringify(test.request.params, null, 2));
    
    output = '';
    proc.stdin.write(JSON.stringify(test.request) + '\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));
    
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
      }
    } catch (e) {
      console.log('Failed to parse response');
    }
  }

  proc.kill();
}

runTest().catch(console.error);
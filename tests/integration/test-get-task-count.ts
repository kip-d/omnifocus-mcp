import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '../../dist/index.js');

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

async function testGetTaskCount() {
  console.log('Testing get_task_count tool...\n');

  const proc = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
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
      clientInfo: { name: 'test-client', version: '1.0.0' },
      capabilities: {}
    },
    id: 1
  };

  proc.stdin.write(JSON.stringify(initRequest) + '\n');

  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test get_task_count
  const tests = [
    {
      name: 'Count all tasks',
      params: {}
    },
    {
      name: 'Count incomplete tasks',
      params: { completed: false }
    },
    {
      name: 'Count flagged tasks',
      params: { flagged: true }
    },
    {
      name: 'Count available tasks',
      params: { available: true }
    }
  ];

  for (const test of tests) {
    console.log(`\nTest: ${test.name}`);
    console.log('Parameters:', JSON.stringify(test.params, null, 2));

    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'get_task_count',
        arguments: test.params
      },
      id: tests.indexOf(test) + 2
    };

    output = '';
    proc.stdin.write(JSON.stringify(request) + '\n');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Parse response
    const lines = output.split('\n').filter(line => line.trim());
    const lastLine = lines[lines.length - 1];
    
    if (lastLine) {
      try {
        const response: MCPResponse = JSON.parse(lastLine);
        
        if (response.error) {
          console.log('❌ Error:', response.error.message);
        } else if (response.result?.content) {
          const content = response.result.content[0];
          if (content.type === 'text') {
            const data = JSON.parse(content.text);
            console.log('✓ Success!');
            console.log('Count:', data.count);
            console.log('Query time:', data.query_time_ms + 'ms');
            if (data.filters_applied) {
              console.log('Filters applied:', Object.entries(data.filters_applied)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => `${k}=${v}`)
                .join(', '));
            }
          }
        }
      } catch (e) {
        console.log('Failed to parse response:', e);
        console.log('Raw output:', lastLine);
      }
    }
  }

  proc.kill();
  process.exit(0);
}

testGetTaskCount().catch(console.error);
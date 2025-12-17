#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple test runner that directly calls the export tool
async function sendRequest(id, method, params) {
  const request = JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params,
  });
  return request;
}

async function testExportDirect() {
  console.log('Testing export functionality directly...\n');

  const serverPath = path.join(__dirname, '../../dist/index.js');
  const proc = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let output = '';
  let errorOutput = '';

  proc.stdout.on('data', (data) => {
    output += data.toString();
    const lines = output.split('\n').filter((line) => line.trim());
    lines.forEach((line) => {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          console.log('← Response:', JSON.stringify(response, null, 2));
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });
  });

  proc.stderr.on('data', (data) => {
    errorOutput += data.toString();
    console.error('Error output:', errorOutput);
  });

  // Initialize with proper params
  console.log('→ Sending: initialize');
  proc.stdin.write(
    (await sendRequest(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    })) + '\n',
  );

  // Wait a bit
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Test export
  console.log('→ Sending: tools/call export_tasks');
  proc.stdin.write(
    (await sendRequest(2, 'tools/call', {
      name: 'export_tasks',
      arguments: {
        format: 'json',
        filter: {
          completed: false,
          limit: 2,
        },
      },
    })) + '\n',
  );

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 5000));

  proc.kill();

  // Ensure clean exit
  console.log('\n✅ Export test completed!');
  process.exit(0);
}

testExportDirect().catch((error) => {
  console.error('❌ Export test failed:', error);
  process.exit(1);
});

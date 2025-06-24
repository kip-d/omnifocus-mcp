#!/usr/bin/env node
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface, Interface } from 'readline';

const server: ChildProcessWithoutNullStreams = spawn('node', ['dist/index.js'], { stdio: ['pipe', 'pipe', 'pipe'] });

server.stdout.on('data', (data: Buffer) => {
  const lines = data.toString().split('\n').filter((l: string) => l.trim());
  lines.forEach((line: string) => {
    try {
      const msg = JSON.parse(line);
      if (msg.id === 1) {
        console.log('✅ Initialized');
        // Test WITH search
        server.stdin.write(JSON.stringify({
          jsonrpc: '2.0', id: 2, method: 'tools/call',
          params: { name: 'list_tasks', arguments: { search: 'test search', limit: 2 } }
        }) + '\n');
      } else if (msg.id === 2) {
        const result = JSON.parse(msg.result.content[0].text);
        if (result.error) {
          console.log('❌ Basic list error:', result.message);
          console.log('Details:', result.details);
        } else {
          console.log('✅ Basic list works! Found', result.tasks?.length || 0, 'tasks');
        }
        server.kill();
        process.exit(result.error ? 1 : 0);
      }
    } catch(e) {}
  });
});

server.stderr.on('data', (data: Buffer) => {
  console.log('Server error:', data.toString());
});

// Initialize
server.stdin.write(JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '0.1.0', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
}) + '\n');

setTimeout(() => {
  console.log('Test timeout');
  server.kill();
  process.exit(1);
}, 10000);
#!/usr/bin/env node
import { spawn } from 'child_process';

const server = spawn('node', ['dist/index.js'], { stdio: ['pipe', 'pipe', 'pipe'] });

server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  lines.forEach(line => {
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

server.stderr.on('data', (data) => {
  const msg = data.toString();
  if (msg.includes('ERROR') || msg.includes("Can't convert")) {
    console.error('Server error:', msg.trim());
  }
});

// Initialize
server.stdin.write(JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
}) + '\n');

setTimeout(() => { console.log('❌ Timeout'); server.kill(); process.exit(1); }, 10000);
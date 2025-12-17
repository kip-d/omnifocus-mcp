#!/usr/bin/env node

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '..', 'dist', 'index.js');

const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Send initialize request
const initializeRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '0.1.0',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0',
    },
  },
};

// Send list prompts request
const listPromptsRequest = {
  jsonrpc: '2.0',
  id: 2,
  method: 'prompts/list',
  params: {},
};

server.stdout.on('data', (data) => {
  const lines = data
    .toString()
    .split('\n')
    .filter((line) => line.trim());
  lines.forEach((line) => {
    try {
      const response = JSON.parse(line);
      console.log('Response:', JSON.stringify(response, null, 2));

      if (response.id === 1) {
        // After initialization, list prompts
        server.stdin.write(JSON.stringify(listPromptsRequest) + '\n');
      } else if (response.id === 2) {
        // Got prompts list, exit
        process.exit(0);
      }
    } catch (e) {
      // Not JSON, might be log output
      if (line.includes('prompt')) {
        console.log('Log:', line);
      }
    }
  });
});

server.stderr.on('data', (data) => {
  const lines = data
    .toString()
    .split('\n')
    .filter((line) => line.trim());
  lines.forEach((line) => {
    if (line.includes('prompt') || line.includes('Prompt')) {
      console.error('Debug:', line);
    }
  });
});

// Send initialize
server.stdin.write(JSON.stringify(initializeRequest) + '\n');

setTimeout(() => {
  console.log('Test timed out');
  process.exit(1);
}, 5000);

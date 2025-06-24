#\!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

console.error('Starting test server...');

const server = new Server(
  {
    name: 'test-minimal',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Just connect, don't create transport
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error('Connected successfully');
}).catch(err => {
  console.error('Connection error:', err);
  process.exit(1);
});
EOF < /dev/null
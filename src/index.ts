#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import { CacheManager } from './cache/CacheManager.js';

// Create server instance
const server = new Server(
  {
    name: 'omnifocus-mcp-cached',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Start server
async function runServer() {
  // Initialize cache manager
  const cacheManager = new CacheManager();
  
  // Register all tools AFTER server creation but BEFORE connection
  await registerTools(server, cacheManager);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch((error) => {
  console.error('Server startup error:', error);
  process.exit(1);
});
#!/usr/bin/env node

// Minimal MCP server for testing Claude Desktop compatibility
// Based on official MCP examples with just 2 simple tools

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'minimal-omnifocus-test',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Simple test tools with minimal schemas
const tools = [
  {
    name: 'echo',
    description: 'Simple echo tool for testing',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to echo back',
        },
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_numbers',
    description: 'Add two numbers together',
    inputSchema: {
      type: 'object',
      properties: {
        a: {
          type: 'number',
          description: 'First number',
        },
        b: {
          type: 'number',
          description: 'Second number',
        },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    },
  },
];

// Register tools/list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Register tools/call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'echo':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              echoed_message: args.message,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      };

    case 'add_numbers':
      const sum = Number(args.a) + Number(args.b);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: sum,
              calculation: `${args.a} + ${args.b} = ${sum}`,
            }),
          },
        ],
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Handle stdin close for MCP compliance
process.stdin.on('end', () => process.exit(0));
process.stdin.on('close', () => process.exit(0));

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

#!/bin/bash

# Setup script to install OmniFocus MCP server locally in Claude Code

echo "Setting up OmniFocus MCP server for local use in Claude Code..."

# Build the project
echo "Building project..."
npm run build

# Create a simple wrapper that can be called as a tool
cat > /tmp/omnifocus-mcp-client.js << 'EOF'
#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Get the tool and arguments from command line
const [,, tool, ...args] = process.argv;

if (!tool) {
  console.error('Usage: omnifocus-mcp-client <tool> <args...>');
  process.exit(1);
}

// Parse arguments as JSON if provided
let params = {};
try {
  if (args[0]) {
    params = JSON.parse(args[0]);
  }
} catch (e) {
  console.error('Invalid JSON arguments:', e.message);
  process.exit(1);
}

const serverPath = path.join(process.cwd(), 'dist', 'index.js');
const proc = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, LOG_LEVEL: 'error' }
});

let responseBuffer = '';
let initialized = false;

proc.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  const lines = responseBuffer.split('\n');
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (line.trim()) {
      try {
        const msg = JSON.parse(line);
        if (msg.result && initialized) {
          // This is our tool response
          console.log(JSON.stringify(msg.result, null, 2));
          proc.kill();
          process.exit(0);
        }
      } catch (e) {
        // Not JSON, skip
      }
    }
  }
  responseBuffer = lines[lines.length - 1];
});

// Initialize
const init = {
  jsonrpc: '2.0',
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'claude-code-client', version: '1.0.0' }
  },
  id: 1
};

proc.stdin.write(JSON.stringify(init) + '\n');

// Wait for initialization, then send tool request
setTimeout(() => {
  initialized = true;
  const toolRequest = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: tool,
      arguments: params
    },
    id: 2
  };
  
  proc.stdin.write(JSON.stringify(toolRequest) + '\n');
}, 500);

// Timeout after 30 seconds
setTimeout(() => {
  console.error('Timeout waiting for response');
  proc.kill();
  process.exit(1);
}, 30000);
EOF

chmod +x /tmp/omnifocus-mcp-client.js

echo "✅ Setup complete! You can now use the MCP server with:"
echo "  node /tmp/omnifocus-mcp-client.js <tool> '<json-args>'"
echo ""
echo "Example:"
echo "  node /tmp/omnifocus-mcp-client.js list_tasks '{\"limit\": 5, \"completed\": false}'"
echo "  node /tmp/omnifocus-mcp-client.js create_task '{\"name\": \"Test task\", \"note\": \"Created from Claude Code\"}'"
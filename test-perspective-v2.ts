#!/usr/bin/env npx tsx

import { McpTestRunner } from './tests/utils/test-cleanup.js';

// Simulate how Claude Desktop would call the V2 perspective tool
async function testV2PerspectiveTool() {
  console.log('Testing V2 perspective tool through MCP server...\n');
  
  const perspectives = ['Inbox', 'Flagged'];
  let currentPerspective = 0;
  
  const runner = new McpTestRunner({
    timeoutMs: 15000, // Longer timeout for perspective queries
    onResponse: (response, requestId) => {
      if (requestId === 1) {
        // After initialize, list tools
        runner.sendRequest('tools/list');
      } else if (requestId === 2) {
        // After tools list, start testing perspectives
        testNextPerspective();
      } else if (requestId >= 3) {
        // Handle perspective query responses
        if (response.result) {
          const result = response.result[0];
          console.log('Success:', result.content[0].text.includes('success: true') ? '✓' : '✗');
          
          // Parse the text content to extract summary
          const text = result.content[0].text;
          const summaryMatch = text.match(/## Summary\n([\s\S]*?)(?:\n##|\n\*\*|$)/);
          if (summaryMatch) {
            console.log('Summary:', summaryMatch[1].trim());
          }
        } else if (response.error) {
          console.log('Error:', response.error.message);
        }
        
        console.log('---\n');
        
        // Move to next perspective or complete
        currentPerspective++;
        if (currentPerspective < perspectives.length) {
          testNextPerspective();
        } else {
          runner.complete();
        }
      }
    }
  });

  function testNextPerspective() {
    const perspectiveName = perspectives[currentPerspective];
    console.log(`Testing perspective: ${perspectiveName}`);
    
    runner.sendToolCall('query_perspective', {
      perspectiveName,
      limit: '5',  // Note: Claude Desktop sends strings
      includeDetails: 'false'
    });
  }

  await runner.start();
  
  // Initialize the MCP protocol
  runner.sendRequest('initialize', {
    protocolVersion: '0.1.0',
    capabilities: {},
    clientInfo: {
      name: 'perspective-test-client',
      version: '1.0.0'
    }
  });
}

testV2PerspectiveTool().catch(console.error);
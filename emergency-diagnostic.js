#!/usr/bin/env node

/**
 * Emergency diagnostic for OmniFocus MCP server issues
 * Tests core functionality and reports detailed results
 */

import { execSync } from 'child_process';

const tests = [
  {
    name: "System Version Check",
    command: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"system","arguments":{"operation":"version"}}}'
  },
  {
    name: "System Diagnostics",
    command: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"system","arguments":{"operation":"diagnostics"}}}'
  },
  {
    name: "Basic Task Query (All, limit 5)",
    command: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"tasks","arguments":{"mode":"all","limit":5,"details":false}}}'
  },
  {
    name: "Today's Tasks",
    command: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"tasks","arguments":{"mode":"today","limit":5}}}'
  },
  {
    name: "Project List (limit 5)",
    command: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"projects","arguments":{"operation":"list","limit":5}}}'
  },
  {
    name: "Tag List (active)",
    command: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"tags","arguments":{"operation":"active"}}}'
  },
  {
    name: "Productivity Stats (today)",
    command: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"productivity_stats","arguments":{"period":"today","includeProjectStats":false,"includeTagStats":false}}}'
  },
  {
    name: "Create Test Task (without null fields)",
    command: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"manage_task","arguments":{"operation":"create","name":"Emergency Diagnostic Test","tags":["test"]}}}'
  },
];

console.log('🚨 OmniFocus MCP v2.1.0 Emergency Diagnostic');
console.log('=' .repeat(50));
console.log('');

for (const test of tests) {
  console.log(`Testing: ${test.name}`);
  console.log('-'.repeat(30));
  
  try {
    const result = execSync(`echo '${test.command}' | node dist/index.js`, {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Extract JSON from the result - handle both old and new MCP formats
    const lines = result.split('\n');
    let jsonLine = null;
    let rawResponse = null;
    
    // Look for MCP JSON-RPC response
    for (const line of lines) {
      if (line.trim().startsWith('{"result"') || line.trim().startsWith('{"error"') || line.trim().startsWith('{"jsonrpc"')) {
        jsonLine = line.trim();
        break;
      }
    }
    
    // If no direct JSON found, try to find any JSON-like structure
    if (!jsonLine) {
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') && trimmed.includes('"')) {
          jsonLine = trimmed;
          break;
        }
      }
    }
    
    if (jsonLine) {
      try {
        const parsed = JSON.parse(jsonLine);
        
        // Handle MCP JSON-RPC response format
        if (parsed.result && parsed.result.content && parsed.result.content[0]) {
          let toolResponse;
          try {
            // Parse the tool response from MCP text content
            toolResponse = JSON.parse(parsed.result.content[0].text);
          } catch (e) {
            console.log('❌ TOOL RESPONSE PARSE ERROR');
            console.log(`   Parse error: ${e.message}`);
            console.log(`   Raw tool response: ${parsed.result.content[0].text.substring(0, 200)}...`);
            toolResponse = null;
          }
          
          if (toolResponse && toolResponse.success) {
            console.log('✅ SUCCESS');
            
            // Show key metrics based on test type and response structure
            if (toolResponse.data) {
              if (Array.isArray(toolResponse.data)) {
                console.log(`   Items returned: ${toolResponse.data.length}`);
              } else if (toolResponse.data.tasks) {
                console.log(`   Tasks: ${toolResponse.data.tasks.length}`);
              } else if (toolResponse.data.projects) {
                console.log(`   Projects: ${toolResponse.data.projects.length}`);
              } else if (toolResponse.data.stats) {
                const statsKeys = Object.keys(toolResponse.data.stats);
                console.log(`   Stats categories: ${statsKeys.length}`);
                // Show overview stats if available
                if (toolResponse.data.stats.overview) {
                  const overview = toolResponse.data.stats.overview;
                  console.log(`   Total tasks: ${overview.totalTasks || 0}, Completed: ${overview.completedTasks || 0}`);
                }
              } else if (toolResponse.data.name || toolResponse.data.version) {
                // System/version response
                console.log(`   ${toolResponse.data.name || 'System'} v${toolResponse.data.version || 'unknown'}`);
              } else {
                console.log(`   Data keys: ${Object.keys(toolResponse.data).join(', ')}`);
              }
            }
            
            if (toolResponse.metadata) {
              const meta = toolResponse.metadata;
              console.log(`   Query time: ${meta.query_time_ms || meta.operation_time_ms || 'N/A'}ms`);
              console.log(`   From cache: ${meta.from_cache === true ? 'YES' : 'NO'}`);
              if (meta.total_count) console.log(`   Total count: ${meta.total_count}`);
            }
          } else if (toolResponse && !toolResponse.success) {
            console.log('❌ TOOL FAILED');
            console.log(`   Error: ${toolResponse.error?.message || toolResponse.message || 'Unknown error'}`);
            console.log(`   Code: ${toolResponse.error?.code || 'N/A'}`);
          } else if (!toolResponse) {
            console.log('❌ COULD NOT PARSE TOOL RESPONSE');
          }
        } else if (parsed.error) {
          // Handle MCP-level errors
          console.log('❌ MCP ERROR');
          console.log(`   Error: ${parsed.error.message}`);
          console.log(`   Code: ${parsed.error.code}`);
        } else {
          console.log('⚠️  UNEXPECTED RESPONSE STRUCTURE');
          console.log(`   Response keys: ${Object.keys(parsed).join(', ')}`);
          console.log(`   Raw: ${JSON.stringify(parsed).substring(0, 200)}...`);
        }
      } catch (parseError) {
        console.log('❌ JSON PARSE ERROR');
        console.log(`   Parse error: ${parseError.message}`);
        console.log(`   Raw response: ${jsonLine.substring(0, 300)}...`);
      }
    } else {
      console.log('⚠️  NO JSON RESPONSE FOUND');
      console.log(`   Raw output lines: ${result.split('\n').length}`);
      console.log(`   First 200 chars: ${result.substring(0, 200)}...`);
      console.log(`   Last 200 chars: ...${result.substring(Math.max(0, result.length - 200))}`);
    }
    
  } catch (error) {
    console.log('💥 EXECUTION ERROR');
    console.log(`   Error: ${error.message}`);
    if (error.stdout) {
      console.log(`   Stdout: ${error.stdout.substring(0, 200)}...`);
    }
    if (error.stderr) {
      console.log(`   Stderr: ${error.stderr.substring(0, 200)}...`);
    }
  }
  
  console.log('');
}

console.log('Diagnostic complete. Please share these results for debugging.');
#!/usr/bin/env node
import { spawn } from 'child_process';

console.log('Testing OmniFocus search directly with JXA...\n');

// Test 1: Simple search without MCP
const testScript = `
(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    // Test parameters
    const searchTerm = "Outsized BKK";
    let foundCount = 0;
    let errorCount = 0;
    let taskCount = 0;
    
    const allTasks = doc.flattenedTasks();
    
    for (let i = 0; i < Math.min(10, allTasks.length); i++) {
      const task = allTasks[i];
      taskCount++;
      
      try {
        // Test getting name
        let name = '';
        try {
          const nameValue = task.name();
          name = nameValue ? String(nameValue) : '';
        } catch (e) {
          errorCount++;
          continue;
        }
        
        // Test getting note
        let note = '';
        try {
          const noteValue = task.note();
          note = noteValue ? String(noteValue) : '';
        } catch (e) {
          // Note might not exist
        }
        
        // Test search
        const searchText = (name + ' ' + note).toLowerCase();
        if (searchText.includes(searchTerm.toLowerCase())) {
          foundCount++;
        }
      } catch (e) {
        errorCount++;
      }
    }
    
    return JSON.stringify({
      success: true,
      tasksChecked: taskCount,
      errorsEncountered: errorCount,
      matchesFound: foundCount
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error.toString(),
      message: error.message
    });
  }
})()
`;

console.log('Running direct JXA test...');
const proc = spawn('osascript', ['-l', 'JavaScript', '-e', testScript]);

let stdout = '';
let stderr = '';

proc.stdout.on('data', (data) => {
  stdout += data.toString();
});

proc.stderr.on('data', (data) => {
  stderr += data.toString();
});

proc.on('close', (code) => {
  console.log('Exit code:', code);
  
  if (stderr) {
    console.error('Stderr:', stderr);
  }
  
  if (stdout) {
    try {
      const result = JSON.parse(stdout);
      console.log('\nDirect JXA Test Result:');
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error('Failed to parse output:', e);
      console.log('Raw output:', stdout);
    }
  }
  
  // Now test with MCP server
  console.log('\n\nTesting through MCP server...');
  testThroughMCP();
});

function testThroughMCP() {
  const server = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  server.stderr.on('data', (data) => {
    const message = data.toString();
    if (message.includes('ERROR') || message.includes('Can\'t convert')) {
      console.error(`Server log: ${message}`);
    }
  });

  let messageBuffer = '';
  server.stdout.on('data', (data) => {
    messageBuffer += data.toString();
    const lines = messageBuffer.split('\n');
    messageBuffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          
          if (response.id === 1) {
            // After initialize, test search
            server.stdin.write(JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/call',
              params: {
                name: 'list_tasks',
                arguments: {
                  search: 'Outsized BKK',
                  limit: 5
                }
              }
            }) + '\n');
          } else if (response.id === 2) {
            // Check search response
            const content = response.result?.content?.[0]?.text;
            if (content) {
              const result = JSON.parse(content);
              console.log('\nMCP Server Test Result:');
              console.log(JSON.stringify(result, null, 2));
            }
            
            server.kill();
            process.exit(0);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  });

  // Initialize
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  }) + '\n');
  
  setTimeout(() => {
    console.error('Timeout');
    server.kill();
    process.exit(1);
  }, 10000);
}
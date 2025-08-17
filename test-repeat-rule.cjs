#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('🔄 Testing Repeat Rule Support via evaluateJavascript Bridge\n');
console.log('=' .repeat(50));

async function testRepeatRule() {
  return new Promise((resolve) => {
    const proc = spawn('node', ['dist/index.js']);
    let output = '';
    let initialized = false;

    proc.stdout.on('data', d => {
      output += d.toString();
      
      // Check for initialization
      if (!initialized && output.includes('"id":1') && output.includes('"result"')) {
        initialized = true;
        console.log('✅ MCP Server initialized\n');
        
        // Send create task request with repeat rule
        const createMsg = JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: {
              name: `Daily Standup - ${new Date().toISOString().slice(0,10)}`,
              note: 'Testing repeat rule via evaluateJavascript bridge',
              flagged: false,
              sequential: false,
              dueDate: '2025-01-20 09:00',
              repeatRule: {
                unit: 'day',
                steps: 1,
                method: 'fixed'
              }
            }
          },
          id: 2
        }) + '\n';
        
        console.log('📝 Creating task with daily repeat rule:');
        console.log('   • Unit: day');
        console.log('   • Steps: 1 (every day)');
        console.log('   • Method: fixed\n');
        proc.stdin.write(createMsg);
      }
      
      // Check for task creation result
      if (output.includes('"id":2') && output.includes('"result"')) {
        setTimeout(() => {
          proc.kill();
          
          // Parse the response
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.includes('"id":2')) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.result && parsed.result.content) {
                  const content = JSON.parse(parsed.result.content[0].text);
                  
                  console.log('\n' + '=' .repeat(50));
                  if (content.success && content.data && content.data.task) {
                    console.log('✅ TASK CREATED SUCCESSFULLY!\n');
                    console.log('📋 Task Details:');
                    console.log('  • ID:', content.data.task.taskId);
                    console.log('  • Name:', content.data.task.name);
                    console.log('  • Due Date:', content.data.task.dueDate || 'Not set');
                    
                    console.log('\n🎯 NEXT STEPS:');
                    console.log('  1. Check OmniFocus to verify the task has a repeat icon');
                    console.log('  2. Complete the task to see if it generates the next occurrence');
                    console.log('  3. The repeat rule should be "Every 1 Day"\n');
                    
                    if (content.metadata) {
                      console.log('⏱️  Performance:');
                      console.log('  • Total time:', content.metadata.query_time_ms, 'ms');
                      console.log('  • Repeat rule overhead: ~50-100ms expected\n');
                    }
                  } else {
                    console.log('❌ TASK CREATION FAILED\n');
                    console.log('Error:', content.message || 'Unknown error');
                    if (content.details) {
                      console.log('Details:', JSON.stringify(content.details, null, 2));
                    }
                  }
                }
              } catch (e) {
                console.log('❌ Failed to parse response:', e.message);
              }
              break;
            }
          }
          
          resolve();
        }, 500);
      }
    });

    proc.stderr.on('data', d => {
      // Ignore debug output unless there's an error
      const msg = d.toString();
      if (msg.includes('ERROR') || msg.includes('WARN')) {
        console.error('Server error:', msg);
      }
    });

    // Initialize the connection
    setTimeout(() => {
      const initMsg = JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: { 
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {
            name: 'repeat-rule-test',
            version: '1.0.0'
          }
        },
        id: 1
      }) + '\n';
      proc.stdin.write(initMsg);
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => {
      console.log('\n⏱️ Test timeout - killing process');
      proc.kill();
      resolve();
    }, 10000);
  });
}

// Run the test
console.log('🚀 Starting repeat rule test...\n');
testRepeatRule().then(() => {
  console.log('=' .repeat(50));
  console.log('Test complete. Check OmniFocus for the created recurring task.\n');
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
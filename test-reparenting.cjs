#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('🔄 Testing Task Reparenting via evaluateJavascript Bridge\n');
console.log('=' .repeat(50));

async function testReparenting() {
  return new Promise((resolve) => {
    const proc = spawn('node', ['dist/index.js']);
    let output = '';
    let initialized = false;
    let parentTaskId = null;
    let childTaskId = null;
    let phase = 0;

    proc.stdout.on('data', d => {
      output += d.toString();
      
      // Phase 0: Initialization
      if (!initialized && output.includes('"id":1') && output.includes('"result"')) {
        initialized = true;
        console.log('✅ MCP Server initialized\n');
        phase = 1;
        
        // Phase 1: Create parent task
        const createParentMsg = JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: {
              name: `Parent Task - ${new Date().toISOString().slice(0,19)}`,
              note: 'This will be the parent task',
              flagged: false,
              sequential: true  // Make it sequential to test action groups
            }
          },
          id: 2
        }) + '\n';
        
        console.log('📝 Creating parent task (action group)...');
        proc.stdin.write(createParentMsg);
      }
      
      // Phase 1: Parent created
      if (phase === 1 && output.includes('"id":2') && output.includes('"result"')) {
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('"id":2')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.result && parsed.result.content) {
                const content = JSON.parse(parsed.result.content[0].text);
                if (content.success && content.data && content.data.task) {
                  parentTaskId = content.data.task.taskId;
                  console.log('✅ Parent task created:', parentTaskId);
                  phase = 2;
                  
                  // Phase 2: Create standalone child task
                  const createChildMsg = JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                      name: 'create_task',
                      arguments: {
                        name: `Child Task - ${new Date().toISOString().slice(0,19)}`,
                        note: 'This will be moved to the parent',
                        flagged: true
                      }
                    },
                    id: 3
                  }) + '\n';
                  
                  console.log('\n📝 Creating standalone child task...');
                  proc.stdin.write(createChildMsg);
                }
              }
            } catch (e) {
              console.log('Parse error:', e.message);
            }
            break;
          }
        }
      }
      
      // Phase 2: Child created, now reparent it
      if (phase === 2 && output.includes('"id":3') && output.includes('"result"')) {
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('"id":3')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.result && parsed.result.content) {
                const content = JSON.parse(parsed.result.content[0].text);
                if (content.success && content.data && content.data.task) {
                  childTaskId = content.data.task.taskId;
                  console.log('✅ Child task created:', childTaskId);
                  phase = 3;
                  
                  // Phase 3: Move child to parent
                  const updateMsg = JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                      name: 'update_task',
                      arguments: {
                        taskId: childTaskId,
                        parentTaskId: parentTaskId
                      }
                    },
                    id: 4
                  }) + '\n';
                  
                  console.log('\n🚀 Moving child task to parent via bridge...');
                  proc.stdin.write(updateMsg);
                }
              }
            } catch (e) {
              console.log('Parse error:', e.message);
            }
            break;
          }
        }
      }
      
      // Phase 3: Reparenting result
      if (phase === 3 && output.includes('"id":4') && output.includes('"result"')) {
        setTimeout(() => {
          proc.kill();
          
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.includes('"id":4')) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.result && parsed.result.content) {
                  const content = JSON.parse(parsed.result.content[0].text);
                  
                  console.log('\n' + '=' .repeat(50));
                  if (content.success) {
                    console.log('✅ REPARENTING SUCCESSFUL!\n');
                    console.log('📋 Results:');
                    console.log('  • Child task moved to parent');
                    console.log('  • Parent ID:', parentTaskId);
                    console.log('  • Child ID:', childTaskId);
                    console.log('\n🎯 VERIFICATION:');
                    console.log('  1. Open OmniFocus');
                    console.log('  2. Find the parent task');
                    console.log('  3. Expand it to see the child task inside');
                    console.log('  4. The child should be indented under the parent\n');
                    
                    if (content.metadata) {
                      console.log('⏱️  Performance:', content.metadata.query_time_ms, 'ms');
                    }
                  } else {
                    console.log('❌ REPARENTING FAILED\n');
                    console.log('Error:', content.message || 'Unknown error');
                    if (content.details) {
                      console.log('Details:', JSON.stringify(content.details, null, 2));
                    }
                  }
                }
              } catch (e) {
                console.log('❌ Parse error:', e.message);
              }
              break;
            }
          }
          
          resolve();
        }, 500);
      }
    });

    proc.stderr.on('data', d => {
      const msg = d.toString();
      if (msg.includes('ERROR')) {
        console.error('Server error:', msg);
      } else if (msg.includes('Successfully moved task to parent')) {
        console.log('✅ Bridge reparenting confirmed in logs');
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
            name: 'reparenting-test',
            version: '1.0.0'
          }
        },
        id: 1
      }) + '\n';
      proc.stdin.write(initMsg);
    }, 100);

    // Timeout after 15 seconds
    setTimeout(() => {
      console.log('\n⏱️ Test timeout - killing process');
      proc.kill();
      resolve();
    }, 15000);
  });
}

// Run the test
console.log('🚀 Starting reparenting test...\n');
testReparenting().then(() => {
  console.log('=' .repeat(50));
  console.log('Test complete. Check OmniFocus to verify the task hierarchy.\n');
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('🔄 Testing Repeat Rule Update via evaluateJavascript Bridge\n');
console.log('=' .repeat(50));

async function testUpdateRepeat() {
  return new Promise((resolve) => {
    const proc = spawn('node', ['dist/index.js']);
    let output = '';
    let taskId = null;
    let phase = 0;

    proc.stdout.on('data', d => {
      output += d.toString();
      
      // Phase 0: Initialization
      if (phase === 0 && output.includes('"id":1') && output.includes('"result"')) {
        console.log('✅ MCP Server initialized\n');
        phase = 1;
        
        // Create task without repeat
        const createMsg = JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: {
              name: `Test Task - ${new Date().toISOString().slice(0,19)}`,
              note: 'Will add repeat rule via update',
              flagged: true,
              dueDate: '2025-01-22 15:00'
            }
          },
          id: 2
        }) + '\n';
        
        console.log('📝 Creating task WITHOUT repeat rule...');
        proc.stdin.write(createMsg);
      }
      
      // Phase 1: Task created, now add repeat
      if (phase === 1 && output.includes('"id":2') && output.includes('"result"')) {
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('"id":2')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.result && parsed.result.content) {
                const content = JSON.parse(parsed.result.content[0].text);
                if (content.success && content.data && content.data.task) {
                  taskId = content.data.task.taskId;
                  console.log('✅ Task created:', taskId);
                  phase = 2;
                  
                  // Update with repeat rule
                  const updateMsg = JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                      name: 'update_task',
                      arguments: {
                        taskId: taskId,
                        repeatRule: {
                          unit: 'week',
                          steps: 2,
                          method: 'fixed',
                          weekdays: ['tuesday', 'thursday']
                        }
                      }
                    },
                    id: 3
                  }) + '\n';
                  
                  console.log('\n🚀 Adding repeat rule via update_task...');
                  console.log('   Pattern: Every 2 weeks on Tue/Thu');
                  proc.stdin.write(updateMsg);
                }
              }
            } catch (e) {}
            break;
          }
        }
      }
      
      // Phase 2: Check update result
      if (phase === 2 && output.includes('"id":3') && output.includes('"result"')) {
        setTimeout(() => {
          proc.kill();
          
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.includes('"id":3')) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.result && parsed.result.content) {
                  const content = JSON.parse(parsed.result.content[0].text);
                  
                  console.log('\n' + '=' .repeat(50));
                  if (content.success) {
                    console.log('✅ REPEAT RULE UPDATE SUCCESSFUL!\n');
                    console.log('📋 Task Updated:');
                    console.log('  • Task ID:', taskId);
                    console.log('  • Repeat Pattern: Every 2 weeks on Tue/Thu');
                    console.log('\n🎯 VERIFICATION:');
                    console.log('  • Check OmniFocus for repeat icon');
                    console.log('  • Should show "Every 2 weeks on Tuesday and Thursday"');
                    
                    if (content.metadata) {
                      console.log('\n⏱️  Performance:', content.metadata.query_time_ms, 'ms');
                    }
                  } else {
                    console.log('❌ UPDATE FAILED');
                    console.log('Error:', content.message || 'Unknown');
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
      if (msg.includes('Updated repeat rule for task via bridge')) {
        console.log('✅ Bridge update confirmed in logs');
      }
    });

    // Initialize
    setTimeout(() => {
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {} },
        id: 1
      }) + '\n');
    }, 100);

    // Timeout
    setTimeout(() => {
      proc.kill();
      resolve();
    }, 15000);
  });
}

// Run test
console.log('🚀 Starting repeat rule update test...\n');
testUpdateRepeat().then(() => {
  console.log('=' .repeat(50));
  console.log('Test complete.\n');
  process.exit(0);
});
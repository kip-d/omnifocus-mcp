#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('📆 Testing Monthly Repeat Rule (First Tuesday)\n');
console.log('=' .repeat(50));

async function testMonthlyRepeat() {
  return new Promise((resolve) => {
    const proc = spawn('node', ['dist/index.js']);
    let output = '';
    let initialized = false;

    proc.stdout.on('data', d => {
      output += d.toString();
      
      if (!initialized && output.includes('"id":1') && output.includes('"result"')) {
        initialized = true;
        console.log('✅ MCP Server initialized\n');
        
        // Create task that repeats on the first Tuesday of each month
        const createMsg = JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: {
              name: `Monthly Review - ${new Date().toISOString().slice(0,10)}`,
              note: 'Repeats on the first Tuesday of every month',
              flagged: true,
              sequential: false,
              dueDate: '2025-02-04 10:00', // First Tuesday of Feb 2025
              repeatRule: {
                unit: 'month',
                steps: 1,
                method: 'fixed',
                weekPosition: 1,
                weekday: 'tuesday'
              }
            }
          },
          id: 2
        }) + '\n';
        
        console.log('📝 Creating task with monthly positional repeat:');
        console.log('   • Unit: month');
        console.log('   • Steps: 1 (every month)');
        console.log('   • Position: 1st Tuesday');
        console.log('   • Method: fixed\n');
        proc.stdin.write(createMsg);
      }
      
      if (output.includes('"id":2') && output.includes('"result"')) {
        setTimeout(() => {
          proc.kill();
          
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.includes('"id":2')) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.result && parsed.result.content) {
                  const content = JSON.parse(parsed.result.content[0].text);
                  
                  console.log('\n' + '=' .repeat(50));
                  if (content.success && content.data && content.data.task) {
                    console.log('✅ TASK CREATED!\n');
                    console.log('📋 Task:', content.data.task.name);
                    console.log('   ID:', content.data.task.taskId);
                    console.log('\n🎯 Expected in OmniFocus:');
                    console.log('   • Repeat icon visible');
                    console.log('   • Rule: "The 1st Tuesday of every month"');
                    console.log('   • Next: Mar 4, Apr 1, May 6, etc.\n');
                    
                    if (content.metadata) {
                      console.log('⏱️  Performance:', content.metadata.query_time_ms, 'ms\n');
                    }
                  } else {
                    console.log('❌ Failed:', content.message || 'Unknown error');
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
        console.error('Error:', msg);
      } else if (msg.includes('Applied repetition rule')) {
        console.log('✅ Repeat rule applied via bridge');
      }
    });

    setTimeout(() => {
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {} },
        id: 1
      }) + '\n');
    }, 100);

    setTimeout(() => {
      proc.kill();
      resolve();
    }, 10000);
  });
}

testMonthlyRepeat().then(() => {
  console.log('=' .repeat(50));
  console.log('Test complete.\n');
  process.exit(0);
});
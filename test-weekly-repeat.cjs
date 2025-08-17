#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('📅 Testing Weekly Repeat Rule with Specific Days\n');
console.log('=' .repeat(50));

async function testWeeklyRepeat() {
  return new Promise((resolve) => {
    const proc = spawn('node', ['dist/index.js']);
    let output = '';
    let initialized = false;

    proc.stdout.on('data', d => {
      output += d.toString();
      
      if (!initialized && output.includes('"id":1') && output.includes('"result"')) {
        initialized = true;
        console.log('✅ MCP Server initialized\n');
        
        // Create task that repeats on Mon/Wed/Fri
        const createMsg = JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: {
              name: `Team Sync - ${new Date().toISOString().slice(0,10)}`,
              note: 'Repeats every Monday, Wednesday, and Friday',
              flagged: true,
              sequential: false,
              dueDate: '2025-01-20 14:00',
              repeatRule: {
                unit: 'week',
                steps: 1,
                method: 'fixed',
                weekdays: ['monday', 'wednesday', 'friday']
              }
            }
          },
          id: 2
        }) + '\n';
        
        console.log('📝 Creating task with weekly repeat (Mon/Wed/Fri):');
        console.log('   • Unit: week');
        console.log('   • Steps: 1 (every week)');
        console.log('   • Weekdays: Monday, Wednesday, Friday');
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
                    console.log('\n🎯 Expected Behavior in OmniFocus:');
                    console.log('   • Should show repeat icon');
                    console.log('   • Rule: "Every Monday, Wednesday, and Friday"');
                    console.log('   • Completing on Monday → next occurrence Wednesday');
                    console.log('   • Completing on Friday → next occurrence Monday\n');
                  } else {
                    console.log('❌ Failed:', content.message || 'Unknown error');
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

testWeeklyRepeat().then(() => {
  console.log('=' .repeat(50));
  console.log('Test complete.\n');
  process.exit(0);
});
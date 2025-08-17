#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('🧪 Testing v2.0.0-beta.1 Tag Assignment Feature\n');
console.log('=' .repeat(50));

async function testTagAssignment() {
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
        
        // Send create task request
        const createMsg = JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: {
              name: `Beta Tag Test - ${new Date().toISOString()}`,
              tags: ['beta-test', 'v2', 'automated'],
              flagged: true,
              note: 'Testing tag assignment in v2.0.0-beta.1'
            }
          },
          id: 2
        }) + '\n';
        
        console.log('📝 Creating task with tags:', ['beta-test', 'v2', 'automated']);
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
                    console.log('  • Flagged:', content.data.task.flagged);
                    console.log('  • Tags:', content.data.task.tags || 'None detected');
                    
                    if (content.data.task.tags && content.data.task.tags.length > 0) {
                      console.log('\n🎉 TAG ASSIGNMENT FEATURE CONFIRMED WORKING!');
                      console.log('   Tags were successfully assigned during task creation.');
                      console.log('   This is a major improvement over v1.x!\n');
                    } else {
                      console.log('\n⚠️  WARNING: Tags may not have been returned in response.');
                      console.log('   Check OmniFocus to verify if tags were applied.\n');
                    }
                    
                    if (content.metadata) {
                      console.log('⏱️  Performance Metrics:');
                      console.log('  • Query Time:', content.metadata.query_time_ms, 'ms');
                      console.log('  • With Tags Overhead: ~50-100ms expected\n');
                    }
                  } else {
                    console.log('❌ TASK CREATION FAILED\n');
                    console.log('Error:', content.message || 'Unknown error');
                    if (content.details) {
                      console.log('Details:', content.details);
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
            name: 'beta-test-client',
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
testTagAssignment().then(() => {
  console.log('=' .repeat(50));
  console.log('Test complete. Check OmniFocus for the created task.\n');
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
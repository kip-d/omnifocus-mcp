#!/usr/bin/env node

// Test creating a task with repeat rule
const { spawn } = require('child_process');

const proc = spawn('node', ['dist/index.js']);

let output = '';
let errors = '';
proc.stdout.on('data', d => output += d.toString());
proc.stderr.on('data', d => errors += d.toString());

// Initialize MCP
setTimeout(() => {
  proc.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {} },
    id: 1
  }) + '\n');
}, 100);

// Create task with repeat rule
setTimeout(() => {
  const taskData = {
    name: 'Test Weekly Standup ' + Date.now(),
    tags: ['test', 'recurring'],
    dueDate: '2025-08-20 09:00',
    flagged: 'true',
    repeatRule: {
      unit: 'week',
      steps: 1,
      method: 'fixed',
      weekdays: ['monday', 'wednesday', 'friday']
    },
    sequential: 'false'
  };
  
  console.log('Creating task with repeat rule:', JSON.stringify(taskData.repeatRule, null, 2));
  
  proc.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'create_task',
      arguments: taskData
    },
    id: 2
  }) + '\n');
}, 500);

// Process results
setTimeout(() => {
  proc.kill();
  
  // Show any debug/error output
  const errorLines = errors.split('\n').filter(l => l.includes('repeat') || l.includes('Repeat') || l.includes('rule'));
  if (errorLines.length > 0) {
    console.log('\nDebug output related to repeat rules:');
    errorLines.forEach(l => console.log(l));
  }
  
  // Parse MCP response
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.includes('"id":2')) {
      const parsed = JSON.parse(line);
      if (parsed.result) {
        const content = JSON.parse(parsed.result.content[0].text);
        
        console.log('\nResponse:');
        console.log('Success:', content.success);
        
        if (content.success && content.data) {
          console.log('Task created:', content.data.task.name);
          console.log('Task ID:', content.data.task.taskId);
          console.log('Tags applied:', content.data.task.tags);
          
          // Check if repeat rule was mentioned
          if (content.data.task.repeatRule) {
            console.log('✅ Repeat rule applied:', content.data.task.repeatRule);
          } else {
            console.log('⚠️  Repeat rule not mentioned in response');
            console.log('This might mean:');
            console.log('  1. Rule was applied but not reported');
            console.log('  2. Rule application failed silently');
            console.log('  3. Bridge communication issue');
          }
        } else {
          console.log('❌ Task creation failed:', content.error);
        }
      }
      break;
    }
  }
}, 3000);
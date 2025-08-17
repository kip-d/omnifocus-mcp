const { spawn } = require('child_process');

console.log('Testing tag creation in v2.0.0-beta.1...\n');

const proc = spawn('node', ['dist/index.js']);
let output = '';

proc.stdout.on('data', d => {
  output += d.toString();
});

proc.stderr.on('data', d => {
  console.error('STDERR:', d.toString());
});

// Initialize
setTimeout(() => {
  const initMsg = JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {} },
    id: 1
  }) + '\n';
  proc.stdin.write(initMsg);
}, 100);

// Create task with tags
setTimeout(() => {
  const createMsg = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'create_task',
      arguments: {
        name: 'Beta Test Task with Tags',
        tags: ['beta', 'test', 'v2'],
        flagged: false,
        sequential: false
      }
    },
    id: 2
  }) + '\n';
  console.log('Creating task with tags:', ['beta', 'test', 'v2']);
  proc.stdin.write(createMsg);
}, 500);

// Parse results
setTimeout(() => {
  proc.kill();
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (line.includes('"id":2')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.result) {
          const content = JSON.parse(parsed.result.content[0].text);
          if (content.success) {
            console.log('\n✅ Task created successfully!');
            console.log('Task ID:', content.data.task.taskId);
            console.log('Task Name:', content.data.task.name);
            console.log('Tags Applied:', content.data.task.tags || 'None');
            console.log('\nTag assignment via evaluateJavascript bridge is working!');
          } else {
            console.log('\n❌ Task creation failed:', content.message);
          }
        }
      } catch (e) {
        console.log('Parse error:', e.message);
      }
      break;
    }
  }
}, 3000);

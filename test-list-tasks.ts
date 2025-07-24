import { spawn } from 'child_process';

async function testListTasks() {
  console.log('Testing list_tasks functionality...\n');
  
  const server = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let responseBuffer = '';
  
  server.stdout.on('data', (data) => {
    responseBuffer += data.toString();
    
    // Process complete JSON-RPC messages
    const lines = responseBuffer.split('\n');
    responseBuffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          if (response.id === 2) {
            console.log('List tasks response:');
            if (response.result?.content?.[0]?.text) {
              const result = JSON.parse(response.result.content[0].text);
              if (result.success && result.data?.tasks) {
                console.log(`✅ Success! Found ${result.data.tasks.length} tasks`);
                console.log('\nFirst task:', JSON.stringify(result.data.tasks[0], null, 2));
              } else if (result.error) {
                console.log('❌ Error:', result.error.message);
              }
            }
            server.kill();
            process.exit(result.success ? 0 : 1);
          }
        } catch (e) {
          // Not a complete JSON message yet
        }
      }
    }
  });

  // Send initialize request
  const initRequest = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {}
    },
    id: 1
  };
  
  server.stdin.write(JSON.stringify(initRequest) + '\n');
  
  // Wait a bit then send list_tasks request
  setTimeout(() => {
    const listTasksRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'list_tasks',
        arguments: {
          completed: false,
          limit: 5
        }
      },
      id: 2
    };
    
    server.stdin.write(JSON.stringify(listTasksRequest) + '\n');
  }, 100);
  
  // Timeout after 10 seconds
  setTimeout(() => {
    console.log('❌ Test timed out');
    server.kill();
    process.exit(1);
  }, 10000);
}

testListTasks().catch(console.error);
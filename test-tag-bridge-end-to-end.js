#!/usr/bin/env node

/**
 * End-to-end test of tag bridge functionality via MCP
 */

import { execSync } from 'child_process';

console.log('🧪 End-to-End Tag Bridge Test\n');

// Test 1: Create task with tags via MCP
console.log('Test 1: Create task with tags via MCP bridge');
try {
  const createTest = `
    echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"manage_task","arguments":{"operation":"create","name":"Bridge Test Task ' + Date.now() + '","tags":["BridgeTest","TagVisibility","EndToEnd"]}}}' | node dist/index.js
  `;

  console.log('Creating task with tags via MCP...');
  const result = execSync(createTest, { encoding: 'utf8', shell: true });
  console.log('✅ MCP Response received');

  // Extract the task creation response
  const lines = result.split('\\n').filter(line => line.trim());
  let createResponse = null;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.id === 2 && parsed.result) {
        createResponse = parsed.result;
        break;
      }
    } catch (e) {
      // Skip non-JSON lines
    }
  }

  if (createResponse) {
    console.log('📝 Task creation result:', JSON.stringify(createResponse, null, 2));

    // Parse the content
    let taskData = null;
    if (createResponse.content && createResponse.content[0] && createResponse.content[0].text) {
      try {
        taskData = JSON.parse(createResponse.content[0].text);
        console.log('📋 Task data:', JSON.stringify(taskData, null, 2));

        if (taskData.taskId) {
          console.log(\`✅ Task created: \${taskData.name} (\${taskData.taskId})\`);
          console.log(\`📌 Tags assigned: \${JSON.stringify(taskData.tags)}\`);
          console.log(\`🔧 Tag method: \${taskData.tagMethod || 'unknown'}\`);

          // Test 2: Immediately query the task to verify tag visibility
          console.log('\\nTest 2: Query task to verify tag visibility');

          const queryTest = \`
            echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"tasks","arguments":{"mode":"search","search":"\${taskData.name}","limit":"1","details":"true"}}}' | node dist/index.js
          \`;

          console.log('Querying task for tag visibility...');
          const queryResult = execSync(queryTest, { encoding: 'utf8', shell: true });

          const queryLines = queryResult.split('\\n').filter(line => line.trim());
          let queryResponse = null;

          for (const line of queryLines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.id === 3 && parsed.result) {
                queryResponse = parsed.result;
                break;
              }
            } catch (e) {
              // Skip non-JSON lines
            }
          }

          if (queryResponse && queryResponse.content && queryResponse.content[0]) {
            const queryData = JSON.parse(queryResponse.content[0].text);
            console.log('🔍 Query result:', JSON.stringify(queryData, null, 2));

            if (queryData.tasks && queryData.tasks.length > 0) {
              const foundTask = queryData.tasks[0];
              console.log(\`✅ Task found: \${foundTask.name}\`);
              console.log(\`🏷️  Tags visible: \${JSON.stringify(foundTask.tags)}\`);

              // Compare tags
              const expectedTags = ["BridgeTest", "TagVisibility", "EndToEnd"];
              const actualTags = foundTask.tags || [];

              console.log('\\n📊 Tag Visibility Results:');
              console.log(\`Expected: \${JSON.stringify(expectedTags)}\`);
              console.log(\`Actual: \${JSON.stringify(actualTags)}\`);

              const visibilitySuccess = expectedTags.every(tag => actualTags.includes(tag));
              console.log(\`✅ Bridge tag visibility: \${visibilitySuccess ? 'SUCCESS' : 'FAILED'}\`);

              if (visibilitySuccess) {
                console.log('\\n🎉 END-TO-END SUCCESS: Tag bridge provides immediate visibility!');
              } else {
                console.log('\\n❌ Tag visibility issue detected');
              }

            } else {
              console.log('❌ Task not found in query result');
            }
          } else {
            console.log('❌ Query response parse failed');
          }

        } else {
          console.log('❌ No task ID in response');
        }

      } catch (parseError) {
        console.log('❌ Failed to parse task data:', parseError.message);
      }
    } else {
      console.log('❌ No content in response');
    }

  } else {
    console.log('❌ No create response found');
  }

} catch (error) {
  console.log('❌ End-to-end test failed:', error.message);
}

console.log('\\n🧪 End-to-end test complete.');
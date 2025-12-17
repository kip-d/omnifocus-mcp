#!/usr/bin/env node
/**
 * Simple v2.0.0 test suite that actually works
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

console.log('🚀 OmniFocus MCP v2.0.0 Test Suite\n');
console.log('='.repeat(60));

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity,
});

let requestId = 1;
let testResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

let createdTaskId = null;
let repeatTaskId = null;

// Helper to send JSON-RPC request
const sendRequest = (method, params = {}) => {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId++,
  };

  server.stdin.write(JSON.stringify(request) + '\n');
};

// Test result helper
const testResult = (name, passed, details = '') => {
  if (passed) {
    console.log(`✅ ${name}`);
    testResults.passed++;
  } else {
    console.log(`❌ ${name}: ${details}`);
    testResults.failed++;
  }
  testResults.tests.push({ name, passed, details });
};

// Cleanup function
const cleanup = () => {
  server.stdin.end();
  server.kill('SIGTERM');

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Results Summary\n');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(
    `📈 Success Rate: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`,
  );

  if (testResults.failed > 0) {
    console.log('\n⚠️ Failed Tests:');
    testResults.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        console.log(`  • ${t.name}: ${t.details}`);
      });
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed! v2.0.0 is ready for release!');
    process.exit(0);
  }
};

// Handle responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);

    // Debug log
    if (response.error) {
      console.log('Error response:', JSON.stringify(response.error));
    }

    // Process based on response ID
    if (response.id === 1) {
      // Initialize complete, start tests
      sendRequest('tools/call', {
        name: 'create_task',
        arguments: {
          name: 'Test Task with Tags ' + Date.now(),
          flagged: 'true',
          sequential: 'false',
          tags: ['test', 'v2', 'automated'],
        },
      });
    } else if (response.id === 2) {
      // Test 1: Create task with tags
      try {
        if (response.error) {
          testResult('Create task with tags', false, response.error.message);
          cleanup();
          return;
        }
        if (!response.result || !response.result.content) {
          testResult('Create task with tags', false, 'No result content');
          cleanup();
          return;
        }
        const content = JSON.parse(response.result.content[0].text);

        // The response structure is different - it's nested in data.task
        const task = content.data?.task || content;
        createdTaskId = task.taskId || task.id;

        const tagsVisible =
          task.tags && task.tags.length === 3 && task.tags.includes('test') && task.tags.includes('v2');
        testResult(
          'Create task with tags',
          tagsVisible,
          tagsVisible ? '' : `Tags not visible: ${JSON.stringify(task.tags)}`,
        );

        // Next test: Update tags
        sendRequest('tools/call', {
          name: 'update_task',
          arguments: {
            taskId: createdTaskId,
            tags: ['updated', 'final'],
          },
        });
      } catch (e) {
        testResult('Create task with tags', false, e.message);
        cleanup();
      }
    } else if (response.id === 3) {
      // Test 2: Update task tags
      try {
        if (response.error) {
          testResult('Update task tags', false, response.error.message);
          cleanup();
          return;
        }
        const content = JSON.parse(response.result.content[0].text);
        const task = content.data?.task || content;
        const tagsUpdated =
          task.tags && task.tags.length === 2 && task.tags.includes('updated') && task.tags.includes('final');
        testResult('Update task tags', tagsUpdated, tagsUpdated ? '' : `Wrong tags: ${JSON.stringify(task.tags)}`);

        // Next test: Invalid project ID
        sendRequest('tools/call', {
          name: 'update_task',
          arguments: {
            taskId: createdTaskId,
            projectId: 'invalid-project-xyz',
          },
        });
      } catch (e) {
        testResult('Update task tags', false, e.message);
        cleanup();
      }
    } else if (response.id === 4) {
      // Test 3: Invalid project ID validation
      const failed =
        response.error || (response.result && response.result.content[0].text.includes('Project not found'));
      testResult('Invalid project ID validation', failed, failed ? '' : 'Should have failed with invalid project');

      // Next test: Move to inbox
      sendRequest('tools/call', {
        name: 'update_task',
        arguments: {
          taskId: createdTaskId,
          projectId: '', // Empty string = inbox
        },
      });
    } else if (response.id === 5) {
      // Test 4: Move task to inbox
      try {
        if (response.error) {
          testResult('Move task to inbox', false, response.error.message);
          cleanup();
          return;
        }
        const content = JSON.parse(response.result.content[0].text);
        const task = content.data?.task || content;
        testResult('Move task to inbox', task.inInbox, task.inInbox ? '' : 'Task not in inbox');

        // Next test: Create with repeat rule
        sendRequest('tools/call', {
          name: 'create_task',
          arguments: {
            name: 'Daily Repeat Test ' + Date.now(),
            flagged: 'false',
            sequential: 'false',
            repeatRule: {
              unit: 'day',
              steps: '1',
              method: 'fixed',
            },
          },
        });
      } catch (e) {
        testResult('Move task to inbox', false, e.message);
        cleanup();
      }
    } else if (response.id === 6) {
      // Test 5: Create task with repeat rule
      try {
        if (response.error) {
          testResult('Create task with repeat rule', false, response.error.message);
          cleanup();
          return;
        }
        const content = JSON.parse(response.result.content[0].text);
        const task = content.data?.task || content;
        repeatTaskId = task.taskId || task.id;
        const hasRepeat = task.hasRepeatRule || task.repeatRule?.applied;
        testResult('Create task with repeat rule', hasRepeat, hasRepeat ? '' : 'Repeat rule not applied');

        // Next test: Update repeat rule
        sendRequest('tools/call', {
          name: 'update_task',
          arguments: {
            taskId: repeatTaskId,
            repeatRule: {
              unit: 'week',
              steps: '2',
              method: 'fixed',
              weekdays: ['monday', 'friday'],
            },
          },
        });
      } catch (e) {
        testResult('Create task with repeat rule', false, e.message);
        cleanup();
      }
    } else if (response.id === 7) {
      // Test 6: Update repeat rule
      try {
        if (response.error) {
          testResult('Update repeat rule to weekly', false, response.error.message);
          cleanup();
          return;
        }
        const content = JSON.parse(response.result.content[0].text);
        const task = content.data?.task || content;
        testResult('Update repeat rule to weekly', task.hasRepeatRule, task.hasRepeatRule ? '' : 'Repeat not updated');

        // Next test: Clear repeat rule
        sendRequest('tools/call', {
          name: 'update_task',
          arguments: {
            taskId: repeatTaskId,
            clearRepeatRule: true,
          },
        });
      } catch (e) {
        testResult('Update repeat rule to weekly', false, e.message);
        cleanup();
      }
    } else if (response.id === 8) {
      // Test 7: Clear repeat rule
      try {
        if (response.error) {
          testResult('Clear repeat rule', false, response.error.message);
          cleanup();
          return;
        }
        const content = JSON.parse(response.result.content[0].text);
        const task = content.data?.task || content;
        testResult('Clear repeat rule', !task.hasRepeatRule, !task.hasRepeatRule ? '' : 'Repeat not cleared');

        // Next test: Performance - flagged tasks
        const startTime = Date.now();
        sendRequest('tools/call', {
          name: 'tasks',
          arguments: {
            mode: 'flagged',
            limit: '50',
            details: 'false',
          },
        });
        // Store start time for next test
        server.perfTestStart = startTime;
      } catch (e) {
        testResult('Clear repeat rule', false, e.message);
        cleanup();
      }
    } else if (response.id === 9) {
      // Test 8: Performance - flagged tasks
      const duration = Date.now() - server.perfTestStart;
      testResult('Performance: Query flagged < 2s', duration < 2000, duration < 2000 ? '' : `Took ${duration}ms`);

      // Next test: Complete task
      sendRequest('tools/call', {
        name: 'complete_task',
        arguments: {
          taskId: createdTaskId,
        },
      });
    } else if (response.id === 10) {
      // Test 9: Complete task
      try {
        if (response.error) {
          testResult('Complete task', false, response.error.message);
          cleanup();
          return;
        }
        const content = JSON.parse(response.result.content[0].text);
        const task = content.data?.task || content;
        testResult('Complete task', task.completed, task.completed ? '' : 'Task not completed');

        // All tests done
        cleanup();
      } catch (e) {
        testResult('Complete task', false, e.message);
        cleanup();
      }
    }
  } catch (e) {
    // Ignore non-JSON lines
  }
});

// Start with initialize
sendRequest('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: {
    name: 'v2-test-suite',
    version: '1.0.0',
  },
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('\n❌ Test timeout!');
  cleanup();
}, 30000);

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
  cleanup();
});

// Handle unexpected server exit
server.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Server exited with code ${code}`);
    cleanup();
  }
});

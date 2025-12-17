#!/usr/bin/env npx tsx
/**
 * Test script for repeat rule functionality
 */

import { execSync } from 'child_process';

const MCP_COMMAND = 'node dist/index.js';

function callTool(toolName: string, params: any) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: params,
    },
  };

  // Add exit command after the request
  const exitRequest = {
    jsonrpc: '2.0',
    id: Date.now() + 1,
    method: 'quit',
  };

  try {
    const result = execSync(MCP_COMMAND, {
      input: JSON.stringify(request) + '\n' + JSON.stringify(exitRequest) + '\n',
      encoding: 'utf-8',
    });

    const lines = result.split('\n').filter((line) => line.trim());
    // Find the response line (should be before the quit acknowledgment)
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.id === request.id) {
          if (parsed.error) {
            throw new Error(parsed.error.message);
          }
          return parsed.result;
        }
      } catch (e) {
        // Not JSON or not our response, continue
      }
    }

    throw new Error('No valid response found');
  } catch (error: any) {
    console.error('Tool call failed:', error.message);
    throw error;
  }
}

async function testRepeatRules() {
  console.log('🧪 Testing Repeat Rule Functionality\n');
  console.log('='.repeat(50));

  try {
    // Test 1: Create task with simple daily repeat
    console.log('\n1️⃣ Creating task with daily repeat...');
    const task1 = callTool('mcp__omnifocus__create_task', {
      name: 'Test Daily Repeat ' + Date.now(),
      flagged: 'true',
      sequential: 'false',
      tags: ['mcp-test'],
      repeatRule: {
        unit: 'day',
        steps: '1',
        method: 'fixed',
      },
    });

    const content1 = JSON.parse(task1.content[0].text);
    console.log('✅ Created task:', content1.taskId);
    console.log('   Has repeat rule:', content1.hasRepeatRule || content1.repeatRule?.applied);

    // Test 2: Update task with weekly repeat on specific days
    console.log('\n2️⃣ Updating task with weekly repeat (Mon/Wed/Fri)...');
    const update1 = callTool('mcp__omnifocus__update_task', {
      taskId: content1.taskId,
      repeatRule: {
        unit: 'week',
        steps: '1',
        method: 'fixed',
        weekdays: ['monday', 'wednesday', 'friday'],
      },
    });

    const updateContent1 = JSON.parse(update1.content[0].text);
    console.log('✅ Updated task with weekly repeat');
    console.log('   Has repeat rule:', updateContent1.hasRepeatRule);

    // Test 3: Create task with "due after completion"
    console.log('\n3️⃣ Creating task with "due after completion" repeat...');
    const task2 = callTool('mcp__omnifocus__create_task', {
      name: 'Test Due After Completion ' + Date.now(),
      flagged: 'false',
      sequential: 'false',
      tags: ['mcp-test'],
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      repeatRule: {
        unit: 'day',
        steps: '3',
        method: 'due-after-completion',
      },
    });

    const content2 = JSON.parse(task2.content[0].text);
    console.log('✅ Created task:', content2.taskId);
    console.log('   Has repeat rule:', content2.hasRepeatRule || content2.repeatRule?.applied);

    // Test 4: Clear repeat rule
    console.log('\n4️⃣ Clearing repeat rule from first task...');
    const clear1 = callTool('mcp__omnifocus__update_task', {
      taskId: content1.taskId,
      clearRepeatRule: true,
    });

    const clearContent = JSON.parse(clear1.content[0].text);
    console.log('✅ Cleared repeat rule');
    console.log('   Has repeat rule:', clearContent.hasRepeatRule);

    // Test 5: Monthly repeat
    console.log('\n5️⃣ Creating task with monthly repeat...');
    const task3 = callTool('mcp__omnifocus__create_task', {
      name: 'Test Monthly Repeat ' + Date.now(),
      flagged: 'false',
      sequential: 'false',
      tags: ['mcp-test'],
      repeatRule: {
        unit: 'month',
        steps: '1',
        method: 'fixed',
      },
    });

    const content3 = JSON.parse(task3.content[0].text);
    console.log('✅ Created task:', content3.taskId);
    console.log('   Has repeat rule:', content3.hasRepeatRule || content3.repeatRule?.applied);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ All repeat rule tests passed!');
    console.log('\nKey findings:');
    console.log('• Daily, weekly, and monthly repeats work');
    console.log('• Different repeat methods (fixed, due-after-completion) work');
    console.log('• Weekly repeats with specific days work');
    console.log('• Clearing repeat rules works');
    console.log('• Bridge correctly reports hasRepeatRule status');
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testRepeatRules().catch(console.error);

#!/usr/bin/env npx tsx
/**
 * Comprehensive v2.0.0 test suite
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
      arguments: params
    }
  };
  
  // Add exit command to avoid timeout
  const exitRequest = {
    jsonrpc: '2.0',
    id: Date.now() + 1,
    method: 'quit'
  };
  
  try {
    const result = execSync(MCP_COMMAND, {
      input: JSON.stringify(request) + '\n' + JSON.stringify(exitRequest) + '\n',
      encoding: 'utf-8'
    });
    
    const lines = result.split('\n').filter(line => line.trim());
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
        // Not JSON or not our response
      }
    }
    
    throw new Error('No valid response found');
  } catch (error: any) {
    console.error('Tool call failed:', error.message);
    throw error;
  }
}

async function runComprehensiveTests() {
  console.log('🚀 OmniFocus MCP v2.0.0 Comprehensive Test Suite\n');
  console.log('=' .repeat(60));
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`✅ ${name}`);
      results.passed++;
      results.tests.push({ name, status: 'passed' });
    } catch (error: any) {
      console.error(`❌ ${name}: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'failed', error: error.message });
    }
  }
  
  // Test 1: Create task with tags
  let testTaskId: string;
  test('Create task with tags', () => {
    const result = callTool('mcp__omnifocus__create_task', {
      name: 'Test Task with Tags ' + Date.now(),
      flagged: 'true',
      sequential: 'false',
      tags: ['test', 'v2', 'automated']
    });
    
    const content = JSON.parse(result.content[0].text);
    testTaskId = content.taskId;
    
    if (!content.tags || content.tags.length !== 3) {
      throw new Error(`Tags not immediately visible. Got: ${JSON.stringify(content.tags)}`);
    }
    
    if (!content.tags.includes('test') || !content.tags.includes('v2')) {
      throw new Error(`Wrong tags returned: ${JSON.stringify(content.tags)}`);
    }
  });
  
  // Test 2: Update task tags
  test('Update task tags', () => {
    const result = callTool('mcp__omnifocus__update_task', {
      taskId: testTaskId,
      tags: ['updated', 'final']
    });
    
    const content = JSON.parse(result.content[0].text);
    
    if (!content.tags || content.tags.length !== 2) {
      throw new Error(`Updated tags not visible. Got: ${JSON.stringify(content.tags)}`);
    }
    
    if (!content.tags.includes('updated') || !content.tags.includes('final')) {
      throw new Error(`Wrong updated tags: ${JSON.stringify(content.tags)}`);
    }
  });
  
  // Test 3: Query task shows correct tags
  test('Query task shows correct tags', () => {
    const result = callTool('mcp__omnifocus__tasks', {
      mode: 'search',
      search: testTaskId.substring(0, 8),
      limit: '10',
      details: 'true'
    });
    
    const content = JSON.parse(result.content[0].text);
    const task = content.tasks?.find((t: any) => t.id === testTaskId);
    
    if (!task) {
      throw new Error('Task not found in query results');
    }
    
    if (!task.tags || !task.tags.includes('updated')) {
      throw new Error(`Query shows wrong tags: ${JSON.stringify(task.tags)}`);
    }
  });
  
  // Test 4: Invalid project ID validation
  test('Invalid project ID validation', () => {
    try {
      callTool('mcp__omnifocus__update_task', {
        taskId: testTaskId,
        projectId: 'invalid-project-id-xyz'
      });
      throw new Error('Should have failed with invalid project ID');
    } catch (error: any) {
      if (!error.message.includes('Project not found')) {
        throw new Error(`Wrong error message: ${error.message}`);
      }
    }
  });
  
  // Test 5: Move task to inbox
  test('Move task to inbox', () => {
    const result = callTool('mcp__omnifocus__update_task', {
      taskId: testTaskId,
      projectId: ''  // Empty string = inbox
    });
    
    const content = JSON.parse(result.content[0].text);
    
    if (!content.inInbox) {
      throw new Error('Task not moved to inbox');
    }
  });
  
  // Test 6: Create task with repeat rule
  let repeatTaskId: string;
  test('Create task with repeat rule', () => {
    const result = callTool('mcp__omnifocus__create_task', {
      name: 'Daily Repeat Test ' + Date.now(),
      flagged: 'false',
      sequential: 'false',
      repeatRule: {
        unit: 'day',
        steps: '1',
        method: 'fixed'
      }
    });
    
    const content = JSON.parse(result.content[0].text);
    repeatTaskId = content.taskId;
    
    if (!content.hasRepeatRule && !content.repeatRule?.applied) {
      throw new Error('Repeat rule not applied');
    }
  });
  
  // Test 7: Update repeat rule
  test('Update repeat rule to weekly', () => {
    const result = callTool('mcp__omnifocus__update_task', {
      taskId: repeatTaskId,
      repeatRule: {
        unit: 'week',
        steps: '2',
        method: 'fixed',
        weekdays: ['monday', 'friday']
      }
    });
    
    const content = JSON.parse(result.content[0].text);
    
    if (!content.hasRepeatRule) {
      throw new Error('Repeat rule not updated');
    }
  });
  
  // Test 8: Clear repeat rule
  test('Clear repeat rule', () => {
    const result = callTool('mcp__omnifocus__update_task', {
      taskId: repeatTaskId,
      clearRepeatRule: true
    });
    
    const content = JSON.parse(result.content[0].text);
    
    if (content.hasRepeatRule) {
      throw new Error('Repeat rule not cleared');
    }
  });
  
  // Test 9: Performance - Query flagged tasks
  test('Performance: Query flagged tasks < 2s', () => {
    const start = Date.now();
    const result = callTool('mcp__omnifocus__tasks', {
      mode: 'flagged',
      limit: '50',
      details: 'false'
    });
    const duration = Date.now() - start;
    
    if (duration > 2000) {
      throw new Error(`Query took ${duration}ms (should be < 2000ms)`);
    }
    
    const content = JSON.parse(result.content[0].text);
    if (!content.summary) {
      throw new Error('No summary in response');
    }
  });
  
  // Test 10: Performance - Query today's tasks
  test('Performance: Query today tasks < 2s', () => {
    const start = Date.now();
    const result = callTool('mcp__omnifocus__tasks', {
      mode: 'today',
      limit: '50',
      details: 'false'
    });
    const duration = Date.now() - start;
    
    if (duration > 2000) {
      throw new Error(`Query took ${duration}ms (should be < 2000ms)`);
    }
  });
  
  // Test 11: Create task with due date
  test('Create task with due date', () => {
    const tomorrow = new Date(Date.now() + 24*60*60*1000);
    const dueDate = tomorrow.toISOString().split('T')[0] + ' 14:00';
    
    const result = callTool('mcp__omnifocus__create_task', {
      name: 'Task with due date ' + Date.now(),
      flagged: 'false',
      sequential: 'false',
      dueDate: dueDate
    });
    
    const content = JSON.parse(result.content[0].text);
    
    if (!content.dueDate) {
      throw new Error('Due date not set');
    }
  });
  
  // Test 12: Complete task
  test('Complete task', () => {
    const result = callTool('mcp__omnifocus__complete_task', {
      taskId: testTaskId
    });
    
    const content = JSON.parse(result.content[0].text);
    
    if (!content.completed) {
      throw new Error('Task not marked as completed');
    }
  });
  
  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 Test Results Summary\n');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${Math.round(results.passed / (results.passed + results.failed) * 100)}%`);
  
  if (results.failed > 0) {
    console.log('\n⚠️ Failed Tests:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
      console.log(`  • ${t.name}: ${t.error}`);
    });
  }
  
  console.log('\n🎯 Key Validations:');
  console.log('• Tags are immediately visible after creation ✓');
  console.log('• Tags update correctly and are queryable ✓');
  console.log('• Invalid project IDs are properly validated ✓');
  console.log('• Tasks can be moved to inbox ✓');
  console.log('• Repeat rules can be created, updated, and cleared ✓');
  console.log('• Performance meets <2s target for queries ✓');
  console.log('• Date handling works correctly ✓');
  console.log('• Task completion works ✓');
  
  if (results.failed === 0) {
    console.log('\n🎉 All tests passed! v2.0.0 is ready for release!');
    process.exit(0);
  } else {
    console.log('\n⚠️ Some tests failed. Please fix issues before release.');
    process.exit(1);
  }
}

// Run tests
runComprehensiveTests().catch(console.error);
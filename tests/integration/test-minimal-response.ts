#!/usr/bin/env node
/**
 * Test script for minimal response mode
 * Verifies the response size reduction for bulk operations
 *
 * NOTE: Uses sandbox conventions (__test- prefix for tags)
 * Run `npm run test:cleanup` after to clean up test data
 */
import { spawn } from 'child_process';
import { TEST_TAG_PREFIX } from './helpers/sandbox-manager.js';

const runMCPCommand = (method: string, params: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    let response = '';
    server.stdout.on('data', (data) => {
      response += data.toString();
    });

    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
    };

    const exitRequest = {
      jsonrpc: '2.0',
      method: 'quit',
      id: 999,
    };

    server.stdin.write(JSON.stringify(request) + '\n');
    server.stdin.write(JSON.stringify(exitRequest) + '\n');

    server.on('exit', () => {
      try {
        const lines = response.split('\n').filter((l) => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 1) {
              resolve(parsed);
              return;
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
        reject(new Error('No valid response found'));
      } catch (e) {
        reject(e);
      }
    });

    setTimeout(() => {
      server.kill();
      reject(new Error('Timeout'));
    }, 15000);
  });
};

const testMinimalResponse = async () => {
  console.log('Testing minimal response mode for update_task...\n');

  try {
    // First, get a task to update
    console.log('1. Fetching available tasks...');
    const tasksResult = await runMCPCommand('tools/call', {
      name: 'tasks',
      arguments: {
        mode: 'available',
        limit: 1,
      },
    });

    const tasks = tasksResult.result?.data || [];
    if (tasks.length === 0) {
      console.log('No available tasks found to test with. Please create a task first.');
      return;
    }

    const taskId = tasks[0].id;
    console.log(`   Found task: ${tasks[0].name} (${taskId})\n`);

    // Test 2: Update with standard response
    console.log('2. Testing STANDARD response mode...');
    const standardResult = await runMCPCommand('tools/call', {
      name: 'update_task',
      arguments: {
        taskId: taskId,
        tags: [`${TEST_TAG_PREFIX}standard`],
        minimalResponse: false,
      },
    });

    const standardSize = JSON.stringify(standardResult.result).length;
    console.log(`   Response size: ${standardSize} characters`);
    console.log(`   Has full task data: ${!!standardResult.result?.data?.task}`);
    console.log(`   Has metadata: ${!!standardResult.result?.metadata}\n`);

    // Test 3: Update with minimal response
    console.log('3. Testing MINIMAL response mode...');
    const minimalResult = await runMCPCommand('tools/call', {
      name: 'update_task',
      arguments: {
        taskId: taskId,
        tags: [`${TEST_TAG_PREFIX}minimal`],
        minimalResponse: true,
      },
    });

    const minimalSize = JSON.stringify(minimalResult.result).length;
    console.log(`   Response size: ${minimalSize} characters`);
    console.log(`   Response structure:`, minimalResult.result);

    // Calculate savings
    const reduction = Math.round((1 - minimalSize / standardSize) * 100);
    console.log(`\n📊 Results:`);
    console.log(`   Standard response: ${standardSize} chars`);
    console.log(`   Minimal response:  ${minimalSize} chars`);
    console.log(`   Size reduction:    ${reduction}%`);

    if (reduction >= 90) {
      console.log(`\n✅ SUCCESS! Minimal response achieves ${reduction}% size reduction!`);
    } else if (reduction >= 70) {
      console.log(`\n⚠️  WARNING: Reduction of ${reduction}% is less than expected 95%`);
    } else {
      console.log(`\n❌ FAILED: Reduction of ${reduction}% is too low`);
    }

    // Show what 100 tasks would mean
    const bulk100Standard = standardSize * 100;
    const bulk100Minimal = minimalSize * 100;
    console.log(`\n💡 For 100 task updates:`);
    console.log(`   Standard: ~${Math.round(bulk100Standard / 1000)}KB`);
    console.log(`   Minimal:  ~${Math.round(bulk100Minimal / 1000)}KB`);
    console.log(`   Savings:  ~${Math.round((bulk100Standard - bulk100Minimal) / 1000)}KB`);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
};

testMinimalResponse().catch(console.error);

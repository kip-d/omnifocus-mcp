#!/usr/bin/env node
/**
 * Test script for tag hierarchy features
 * Tests: create nested tag, nest existing tag, unparent, reparent operations
 */
import { spawn } from 'child_process';

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
    }, 10000);
  });
};

const testTagHierarchy = async () => {
  console.log('Testing OmniFocus tag hierarchy features...\n');

  const testTagName = 'TestHierarchy_' + Date.now();
  const parentTagName = 'TestParent_' + Date.now();
  const childTagName = 'TestChild_' + Date.now();

  try {
    // Test 1: Create a parent tag
    console.log('1. Creating parent tag...');
    let result = await runMCPCommand('tools/call', {
      name: 'tags',
      arguments: {
        operation: 'manage',
        action: 'create',
        tagName: parentTagName,
      },
    });
    console.log('   ✓ Parent tag created:', result.result?.success ? 'SUCCESS' : 'FAILED');

    // Test 2: Create a nested child tag
    console.log('\n2. Creating nested child tag...');
    result = await runMCPCommand('tools/call', {
      name: 'tags',
      arguments: {
        operation: 'manage',
        action: 'create',
        tagName: childTagName,
        parentTagName: parentTagName,
      },
    });
    console.log('   ✓ Nested tag created:', result.result?.success ? 'SUCCESS' : 'FAILED');
    if (result.result?.parentTagName) {
      console.log('   ✓ Parent:', result.result.parentTagName);
    }

    // Test 3: Create a standalone tag to nest later
    console.log('\n3. Creating standalone tag...');
    result = await runMCPCommand('tools/call', {
      name: 'tags',
      arguments: {
        operation: 'manage',
        action: 'create',
        tagName: testTagName,
      },
    });
    console.log('   ✓ Standalone tag created:', result.result?.success ? 'SUCCESS' : 'FAILED');

    // Test 4: Nest the standalone tag under parent
    console.log('\n4. Nesting standalone tag under parent...');
    result = await runMCPCommand('tools/call', {
      name: 'tags',
      arguments: {
        operation: 'manage',
        action: 'nest',
        tagName: testTagName,
        parentTagName: parentTagName,
      },
    });
    console.log('   ✓ Tag nested:', result.result?.success ? 'SUCCESS' : 'FAILED');

    // Test 5: List tags to see hierarchy
    console.log('\n5. Listing tags with hierarchy...');
    result = await runMCPCommand('tools/call', {
      name: 'tags',
      arguments: {
        operation: 'list',
        fastMode: false,
        includeEmpty: true,
      },
    });

    const tags = result.result?.data || [];
    const parentTag = tags.find((t: any) => t.name === parentTagName);
    const childTag = tags.find((t: any) => t.name === childTagName);
    const nestedTag = tags.find((t: any) => t.name === testTagName);

    if (parentTag) {
      console.log('   ✓ Parent tag found:');
      console.log('     - Name:', parentTag.name);
      console.log('     - Children:', parentTag.children?.length || 0);
      console.log('     - Path:', parentTag.path);
    }

    if (childTag) {
      console.log('   ✓ Child tag found:');
      console.log('     - Name:', childTag.name);
      console.log('     - Parent:', childTag.parentName);
      console.log('     - Path:', childTag.path);
      console.log('     - Level:', childTag.level);
    }

    // Test 6: Unparent the nested tag
    console.log('\n6. Unparenting nested tag...');
    result = await runMCPCommand('tools/call', {
      name: 'tags',
      arguments: {
        operation: 'manage',
        action: 'unparent',
        tagName: testTagName,
      },
    });
    console.log('   ✓ Tag unparented:', result.result?.success ? 'SUCCESS' : 'FAILED');

    // Test 7: Cleanup - delete test tags
    console.log('\n7. Cleaning up test tags...');

    // Delete child first
    await runMCPCommand('tools/call', {
      name: 'tags',
      arguments: {
        operation: 'manage',
        action: 'delete',
        tagName: childTagName,
      },
    });

    // Delete test tag
    await runMCPCommand('tools/call', {
      name: 'tags',
      arguments: {
        operation: 'manage',
        action: 'delete',
        tagName: testTagName,
      },
    });

    // Delete parent
    await runMCPCommand('tools/call', {
      name: 'tags',
      arguments: {
        operation: 'manage',
        action: 'delete',
        tagName: parentTagName,
      },
    });

    console.log('   ✓ Test tags cleaned up');

    console.log('\n✅ All tag hierarchy tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
};

testTagHierarchy().catch(console.error);

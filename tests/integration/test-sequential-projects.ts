#!/usr/bin/env node

/**
 * Integration test for sequential/parallel project functionality
 *
 * NOTE: Uses sandbox conventions (projects in __MCP_TEST_SANDBOX__, __test- for tags)
 * Run `npm run test:cleanup` after to clean up test data
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SANDBOX_FOLDER_NAME, TEST_TAG_PREFIX } from './helpers/sandbox-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '../../dist/index.js');

interface McpResponse {
  result?: any;
  error?: any;
}

function sendRequest(proc: any, method: string, params: any = {}): Promise<McpResponse> {
  return new Promise((resolve) => {
    const id = Date.now();
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    const listener = (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            if (response.id === id) {
              proc.stdout.off('data', listener);
              resolve(response);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    };

    proc.stdout.on('data', listener);
    proc.stdin.write(JSON.stringify(request) + '\n');
  });
}

async function runTests() {
  console.log('🧪 Testing Sequential/Parallel Project Functionality\n');

  const proc = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let exitCode = 0;

  try {
    // Initialize
    await sendRequest(proc, 'initialize', {
      clientInfo: { name: 'test-client', version: '1.0.0' },
      capabilities: {},
    });

    // Test 1: Create a sequential project
    console.log('📝 Test 1: Creating sequential project...');
    const createSeqResult = await sendRequest(proc, 'tools/call', {
      name: 'create_project',
      arguments: {
        name: `Test Sequential Project ${Date.now()}`,
        note: 'This project has tasks that must be done in order',
        sequential: true,
        folder: SANDBOX_FOLDER_NAME,
        tags: [`${TEST_TAG_PREFIX}sequential`],
      },
    });

    // Parse the MCP response format
    let seqProjectId = null;
    if (createSeqResult.result?.content?.[0]?.text) {
      try {
        const data = JSON.parse(createSeqResult.result.content[0].text);
        if (data.success && data.data?.project?.project?.id) {
          console.log('✅ Sequential project created successfully');
          seqProjectId = data.data.project.project.id;
          console.log(`   Project ID: ${seqProjectId}`);
        } else {
          console.error('❌ Failed to create sequential project:', data);
          exitCode = 1;
        }
      } catch (e) {
        console.error('❌ Failed to parse response:', e);
        exitCode = 1;
      }
    } else {
      console.error('❌ Failed to create sequential project:', createSeqResult.error || createSeqResult.result);
      exitCode = 1;
    }

    // Test 2: Create a parallel project (default)
    console.log('\n📝 Test 2: Creating parallel project (default)...');
    const createParResult = await sendRequest(proc, 'tools/call', {
      name: 'create_project',
      arguments: {
        name: `Test Parallel Project ${Date.now()}`,
        note: 'This project has tasks that can be done in any order',
        // sequential not specified, should default to false
        folder: SANDBOX_FOLDER_NAME,
        tags: [`${TEST_TAG_PREFIX}sequential`],
      },
    });

    // Parse the MCP response format
    let parProjectId = null;
    if (createParResult.result?.content?.[0]?.text) {
      try {
        const data = JSON.parse(createParResult.result.content[0].text);
        if (data.success && data.data?.project?.project?.id) {
          console.log('✅ Parallel project created successfully');
          parProjectId = data.data.project.project.id;
          console.log(`   Project ID: ${parProjectId}`);
        } else {
          console.error('❌ Failed to create parallel project:', data);
          exitCode = 1;
        }
      } catch (e) {
        console.error('❌ Failed to parse response:', e);
        exitCode = 1;
      }
    } else {
      console.error('❌ Failed to create parallel project:', createParResult.error || createParResult.result);
      exitCode = 1;
    }

    // Test 3: List projects to verify sequential property
    console.log('\n📝 Test 3: Listing projects to verify sequential property...');
    const listResult = await sendRequest(proc, 'tools/call', {
      name: 'list_projects',
      arguments: {
        folder: SANDBOX_FOLDER_NAME,
        limit: 10,
      },
    });

    if (listResult.result?.content?.[0]?.text) {
      try {
        const data = JSON.parse(listResult.result.content[0].text);
        if (data.success && data.data?.items) {
          const projects = data.data.items;
          console.log(`✅ Found ${projects.length} projects in sandbox folder`);
          
          // Check if our projects have the sequential property
          for (const project of projects) {
            if (project.name.includes('Test Sequential Project')) {
              console.log(`   ✓ ${project.name}: sequential = ${project.sequential}`);
              if (project.sequential !== true) {
                console.error('   ❌ Sequential property not set correctly!');
                exitCode = 1;
              }
            } else if (project.name.includes('Test Parallel Project')) {
              console.log(`   ✓ ${project.name}: sequential = ${project.sequential}`);
              if (project.sequential !== false) {
                console.error('   ❌ Sequential property not set correctly!');
                exitCode = 1;
              }
            }
          }
        } else {
          console.error('❌ Failed to list projects:', data);
          exitCode = 1;
        }
      } catch (e) {
        console.error('❌ Failed to parse response:', e);
        exitCode = 1;
      }
    } else {
      console.error('❌ Failed to list projects:', listResult.error || listResult.result);
      exitCode = 1;
    }

    // Test 4: Update project to change sequential property
    if (parProjectId) {
      console.log('\n📝 Test 4: Updating project to change sequential property...');
      const updateResult = await sendRequest(proc, 'tools/call', {
        name: 'update_project',
        arguments: {
          projectId: parProjectId,
          updates: {
            sequential: true,
            note: 'Changed from parallel to sequential',
          },
        },
      });

      if (updateResult.result?.content?.[0]?.text) {
        try {
          const data = JSON.parse(updateResult.result.content[0].text);
          if (data.success && data.data?.project) {
            console.log('✅ Project updated successfully');
            const changes = data.data.project.changes || [];
            console.log(`   Changes: ${changes.join(', ')}`);
            
            if (!changes.some(change => change.includes('sequential'))) {
              console.error('   ❌ Sequential change not reported!');
              exitCode = 1;
            }
          } else {
            console.error('❌ Failed to update project:', data);
            exitCode = 1;
          }
        } catch (e) {
          console.error('❌ Failed to parse response:', e);
          exitCode = 1;
        }
      } else {
        console.error('❌ Failed to update project:', updateResult.error || updateResult.result);
        exitCode = 1;
      }
    }

    console.log('\n✨ Tests completed!');

  } catch (error) {
    console.error('❌ Test error:', error);
    exitCode = 1;
  } finally {
    proc.kill();
    process.exit(exitCode);
  }
}

runTests().catch(console.error);
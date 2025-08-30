#!/usr/bin/env node

/**
 * Simple test to verify sequential project functionality
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '../../dist/index.js');

function sendRequest(proc: any, method: string, params: any = {}): Promise<any> {
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

async function runTest() {
  console.log('🧪 Testing Sequential Project Feature\n');

  const proc = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  try {
    // Initialize
    await sendRequest(proc, 'initialize', {
      clientInfo: { name: 'test-client', version: '1.0.0' },
      capabilities: {},
    });

    // Create a sequential project
    console.log('1️⃣ Creating sequential project...');
    const seqResult = await sendRequest(proc, 'tools/call', {
      name: 'create_project',
      arguments: {
        name: `Sequential Test ${Date.now()}`,
        sequential: true,
        tags: ['mcp-test'],
      },
    });

    const seqData = JSON.parse(seqResult.result.content[0].text);
    const seqProjectId = seqData.data.project.project.id;
    console.log(`✅ Created project ID: ${seqProjectId}`);

    // Get project details
    console.log('\n2️⃣ Fetching project details...');
    const listResult = await sendRequest(proc, 'tools/call', {
      name: 'list_projects',
      arguments: {
        search: 'Sequential Test',
        limit: 5,
      },
    });

    const listData = JSON.parse(listResult.result.content[0].text);
    const project = listData.data.items.find((p: any) => p.id === seqProjectId);
    
    if (project) {
      console.log(`✅ Found project: ${project.name}`);
      console.log(`   Sequential: ${project.sequential} ${project.sequential === true ? '✓' : '✗'}`);
    } else {
      console.error('❌ Project not found in list!');
    }

    // Create a parallel project for comparison
    console.log('\n3️⃣ Creating parallel project (default)...');
    const parResult = await sendRequest(proc, 'tools/call', {
      name: 'create_project',
      arguments: {
        name: `Parallel Test ${Date.now()}`,
        // sequential not specified, should default to false
        tags: ['mcp-test'],
      },
    });

    const parData = JSON.parse(parResult.result.content[0].text);
    const parProjectId = parData.data.project.project.id;
    console.log(`✅ Created project ID: ${parProjectId}`);

    // List both projects
    console.log('\n4️⃣ Listing both test projects...');
    const finalList = await sendRequest(proc, 'tools/call', {
      name: 'list_projects',
      arguments: {
        search: 'Test',
        limit: 10,
      },
    });

    const finalData = JSON.parse(finalList.result.content[0].text);
    const testProjects = finalData.data.items.filter((p: any) => 
      p.name.includes('Sequential Test') || p.name.includes('Parallel Test')
    );

    console.log(`\n📊 Results (found ${testProjects.length} test projects):`);
    
    // If no test projects found, show all projects for debugging
    if (testProjects.length === 0) {
      console.log('No test projects found. All projects:');
      finalData.data.items.forEach((p: any) => {
        console.log(`  - ${p.name} (sequential: ${p.sequential})`);
      });
    } else {
      for (const proj of testProjects) {
        const type = proj.sequential ? 'Sequential' : 'Parallel';
        const icon = proj.sequential ? '🔢' : '🔀';
        console.log(`${icon} ${proj.name}: ${type}`);
      }
    }

    console.log('\n✨ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    proc.kill();
  }
}

runTest().catch(console.error);
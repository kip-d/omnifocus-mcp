#!/usr/bin/env node

/**
 * Test remaining consolidated tools with minimal side effects
 * Tests ManageFolderTool and BatchTaskOperationsTool safely
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

class RemainingToolsTestRunner {
  constructor() {
    this.server = null;
    this.rl = null;
    this.requestId = 1;
    this.results = [];
    this.currentTestStartTime = 0;
    this.testQueue = [];
    this.currentTestIndex = 0;
    this.awaitingResponse = false;
    this.createdFolderId = null;
    this.createdTaskIds = [];
  }

  async runTests() {
    console.log('🧪 Testing Remaining Consolidated Tools (Safe Mode)\n');
    
    await this.setupServer();
    await this.initialize();
    
    setTimeout(() => {
      console.error('\n⏰ Test timeout!');
      this.generateReport();
      this.cleanup();
    }, 60000);
  }

  async setupServer() {
    console.log('🔧 Starting MCP Server...');
    
    this.server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    this.rl = createInterface({
      input: this.server.stdout,
      crlfDelay: Infinity
    });

    this.rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        this.handleResponse(response);
      } catch (e) {
        // Ignore non-JSON lines
      }
    });
  }

  sendRequest(method, params = {}) {
    if (!this.server?.stdin) return;

    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++
    };
    
    console.log(`📤 ${method} (ID: ${request.id})`);
    this.currentTestStartTime = Date.now();
    this.awaitingResponse = true;
    this.server.stdin.write(JSON.stringify(request) + '\n');
  }

  handleResponse(response) {
    if (!this.awaitingResponse) return;
    
    const responseTime = Date.now() - this.currentTestStartTime;
    console.log(`📥 Response ${response.id} (${responseTime}ms)`);
    this.awaitingResponse = false;

    if (response.id === 1) {
      setTimeout(() => this.sendRequest('tools/list'), 100);
    } else if (response.id === 2) {
      setTimeout(() => this.startTests(), 100);
    } else if (response.id >= 3) {
      this.handleTestResponse(response, responseTime);
    }
  }

  async initialize() {
    this.sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: {
        name: 'remaining-tools-test',
        version: '1.0.0'
      }
    });
  }

  startTests() {
    console.log('🎯 Starting remaining tool tests...\n');

    this.testQueue = [
      // Create a test task first
      { tool: 'create_task', operation: 'create', params: { name: 'Test Task for Batch Operations', note: 'Will be deleted' } },
      
      // Test ManageFolderTool - Create folder
      { tool: 'manage_folder', operation: 'create', params: { operation: 'create', name: 'Test Folder - DELETE ME' } },
      
      // We'll add more tests dynamically based on what we create
    ];

    this.currentTestIndex = 0;
    this.runNextTest();
  }

  runNextTest() {
    if (this.currentTestIndex >= this.testQueue.length) {
      console.log('\n✅ All remaining tool tests completed!');
      this.generateReport();
      this.cleanup();
      return;
    }

    const test = this.testQueue[this.currentTestIndex];
    console.log(`\n🔍 Testing ${test.tool}.${test.operation}`);
    
    setTimeout(() => {
      this.sendRequest('tools/call', {
        name: test.tool,
        arguments: test.params
      });
    }, 500);
  }

  handleTestResponse(response, responseTime) {
    const currentTest = this.testQueue[this.currentTestIndex];
    if (!currentTest) return;

    const result = {
      tool: currentTest.tool,
      operation: currentTest.operation,
      success: false,
      responseTime,
      details: response
    };

    // Handle different response types
    if (response.result && !response.error) {
      try {
        const content = response.result.content?.[0]?.text;
        if (content) {
          const parsed = JSON.parse(content);
          if (!parsed.error && (parsed.success || parsed.data)) {
            result.success = true;
            console.log(`  ✅ ${currentTest.tool}.${currentTest.operation} - SUCCESS`);
            
            // Extract important IDs for cleanup/further testing
            if (currentTest.tool === 'create_task' && parsed.data?.task?.taskId) {
              this.createdTaskIds.push(parsed.data.task.taskId);
              console.log(`    📝 Created task ID: ${parsed.data.task.taskId}`);
              
              // Add batch operations test now that we have a task ID
              this.testQueue.push({
                tool: 'batch_task_operations',
                operation: 'delete',
                params: {
                  operation: 'delete',
                  taskIds: [parsed.data.task.taskId]
                }
              });
            } else if (currentTest.tool === 'manage_folder' && parsed.data?.folderId) {
              this.createdFolderId = parsed.data.folderId;
              console.log(`    📁 Created folder ID: ${parsed.data.folderId}`);
              
              // Add folder delete test
              this.testQueue.push({
                tool: 'manage_folder',
                operation: 'delete',
                params: {
                  operation: 'delete',
                  folderId: parsed.data.folderId,
                  force: true
                }
              });
            }
          } else {
            result.error = parsed.error?.message || 'No success indicator';
            console.log(`  ❌ ${currentTest.tool}.${currentTest.operation} - FAILED: ${result.error}`);
          }
        } else {
          result.error = 'No content in response';
          console.log(`  ❌ ${currentTest.tool}.${currentTest.operation} - FAILED: No content`);
        }
      } catch (e) {
        result.error = 'Failed to parse response';
        console.log(`  ❌ ${currentTest.tool}.${currentTest.operation} - FAILED: Parse error`);
      }
    } else if (response.error) {
      result.error = response.error?.message || 'Request error';
      console.log(`  ❌ ${currentTest.tool}.${currentTest.operation} - FAILED: ${result.error}`);
    } else {
      result.error = 'Unknown response format';
      console.log(`  ❌ ${currentTest.tool}.${currentTest.operation} - FAILED: Unknown format`);
    }

    this.results.push(result);
    this.currentTestIndex++;
    
    setTimeout(() => this.runNextTest(), 1000);
  }

  generateReport() {
    console.log('\n📊 REMAINING TOOLS TEST REPORT');
    console.log('═'.repeat(40));
    
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const avgTime = this.results.length > 0 ? 
      this.results.reduce((sum, r) => sum + r.responseTime, 0) / this.results.length : 0;

    console.log(`\n📈 RESULTS:`);
    console.log(`   Total Tests: ${this.results.length}`);
    console.log(`   Passed: ${passed} ✅`);
    console.log(`   Failed: ${failed} ❌`);
    console.log(`   Success Rate: ${this.results.length > 0 ? ((passed / this.results.length) * 100).toFixed(1) : 0}%`);
    console.log(`   Average Response Time: ${avgTime.toFixed(0)}ms`);

    console.log(`\n🔧 DETAILED RESULTS:`);
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`   ${status} ${result.tool}.${result.operation} (${result.responseTime}ms)`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });

    // Test status for each remaining tool
    const manageFolder = this.results.filter(r => r.tool === 'manage_folder');
    const batchOps = this.results.filter(r => r.tool === 'batch_task_operations');

    console.log(`\n🛠️  TOOL STATUS:`);
    console.log(`   ManageFolderTool: ${manageFolder.length > 0 ? (manageFolder.every(r => r.success) ? '✅' : '❌') : '⏭️'} (${manageFolder.length} tests)`);
    console.log(`   BatchTaskOperationsTool: ${batchOps.length > 0 ? (batchOps.every(r => r.success) ? '✅' : '❌') : '⏭️'} (${batchOps.length} tests)`);

    console.log(`\n💡 CLEANUP:`);
    if (this.createdFolderId) {
      console.log(`   📁 Test folder should be automatically deleted (ID: ${this.createdFolderId})`);
    }
    if (this.createdTaskIds.length > 0) {
      console.log(`   📝 Test tasks should be automatically deleted (IDs: ${this.createdTaskIds.join(', ')})`);
    }

    console.log(`\n✨ Test completed at ${new Date().toLocaleString()}`);
  }

  cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (this.rl) {
      this.rl.close();
    }
    
    if (this.server) {
      this.server.kill();
    }
    
    console.log('✅ Test completed!');
    process.exit(0);
  }
}

const runner = new RemainingToolsTestRunner();
runner.runTests().catch((error) => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
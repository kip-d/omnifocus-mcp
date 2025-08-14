#!/usr/bin/env npx tsx
/**
 * Quick Smoke Test for OmniFocus MCP v2.0.0-alpha.2
 * 
 * Runs 3 essential operations to validate environment readiness.
 * Should complete all tests in <10 seconds total.
 * 
 * Usage: npx tsx tests/smoke-test-v2.ts
 */

import { spawn } from 'child_process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  response?: any;
}

class SmokeTest {
  private proc: any;
  private output = '';
  private requestId = 1;
  private results: TestResult[] = [];

  async run() {
    console.log('🔍 OmniFocus MCP v2.0.0-alpha.2 Smoke Test');
    console.log('==========================================\n');

    const startTime = Date.now();

    try {
      // Start MCP server
      await this.startServer();
      
      // Initialize connection
      await this.initialize();
      
      // Run the 3 quick tests
      await this.test1_WhatsOverdue();
      await this.test2_CreateTask();
      await this.test3_ShowProjects();
      
      // Report results
      this.reportResults();
      
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n⏱️  Total time: ${totalTime}s`);
      
      if (parseFloat(totalTime) > 10) {
        console.log('⚠️  WARNING: Tests took longer than 10 seconds!');
      }
      
      // Check if all passed
      const allPassed = this.results.every(r => r.passed);
      if (allPassed) {
        console.log('\n✅ All smoke tests passed! Environment ready for full testing.');
        process.exit(0);
      } else {
        console.log('\n❌ Some tests failed. Environment not ready for testing.');
        process.exit(1);
      }
    } catch (error) {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    } finally {
      if (this.proc) {
        this.proc.kill();
      }
    }
  }

  private async startServer() {
    console.log('Starting MCP server...');
    this.proc = spawn('node', ['dist/index.js'], {
      env: { ...process.env, LOG_LEVEL: 'error' }
    });

    this.proc.stdout.on('data', (data: Buffer) => {
      this.output += data.toString();
    });

    this.proc.stderr.on('data', (data: Buffer) => {
      console.error('Server error:', data.toString());
    });

    await sleep(500); // Give server time to start
  }

  private async initialize() {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '1.0.0' }
    });
    
    if (!response.serverInfo) {
      throw new Error('Failed to initialize MCP connection');
    }
    
    console.log(`Connected to ${response.serverInfo.name} v${response.serverInfo.version}\n`);
  }

  private async test1_WhatsOverdue() {
    const testName = "Test 1: What's overdue?";
    console.log(`Running ${testName}...`);
    const start = Date.now();
    
    try {
      const response = await this.sendRequest('tools/call', {
        name: 'tasks',
        arguments: {
          mode: 'overdue',
          limit: 25,
          details: false
        }
      });
      
      const duration = (Date.now() - start) / 1000;
      const parsed = JSON.parse(response.content[0].text);
      
      // Validate response structure
      if (parsed.summary && parsed.data && parsed.metadata) {
        console.log(`  ✓ Returned ${parsed.summary.returned_count} of ${parsed.summary.total_count} overdue tasks`);
        console.log(`  ✓ Response time: ${duration.toFixed(2)}s`);
        
        if (parsed.summary.key_insights && parsed.summary.key_insights.length > 0) {
          console.log(`  ✓ Insights: ${parsed.summary.key_insights[0]}`);
        }
        
        this.results.push({ name: testName, passed: true, duration, response: parsed });
      } else {
        throw new Error('Invalid response structure');
      }
    } catch (error: any) {
      const duration = (Date.now() - start) / 1000;
      console.log(`  ✗ Failed: ${error.message}`);
      this.results.push({ name: testName, passed: false, duration, error: error.message });
    }
  }

  private async test2_CreateTask() {
    const testName = 'Test 2: Create task';
    console.log(`\nRunning ${testName}...`);
    const start = Date.now();
    
    try {
      const response = await this.sendRequest('tools/call', {
        name: 'create_task',
        arguments: {
          name: `Test v2 - ${new Date().toISOString()}`,
          flagged: false,
          sequential: false
        }
      });
      
      const duration = (Date.now() - start) / 1000;
      const parsed = JSON.parse(response.content[0].text);
      
      if (parsed.success && parsed.data && parsed.data.task && parsed.data.task.taskId) {
        console.log(`  ✓ Created task with ID: ${parsed.data.task.taskId}`);
        console.log(`  ✓ Response time: ${duration.toFixed(2)}s`);
        this.results.push({ name: testName, passed: true, duration, response: parsed });
      } else {
        throw new Error('Failed to create task');
      }
    } catch (error: any) {
      const duration = (Date.now() - start) / 1000;
      console.log(`  ✗ Failed: ${error.message}`);
      this.results.push({ name: testName, passed: false, duration, error: error.message });
    }
  }

  private async test3_ShowProjects() {
    const testName = 'Test 3: Show projects';
    console.log(`\nRunning ${testName}...`);
    const start = Date.now();
    
    try {
      const response = await this.sendRequest('tools/call', {
        name: 'projects',
        arguments: {
          operation: 'list',
          limit: 10,
          details: false
        }
      });
      
      const duration = (Date.now() - start) / 1000;
      const parsed = JSON.parse(response.content[0].text);
      
      if (parsed.summary && parsed.data && parsed.metadata) {
        console.log(`  ✓ Found ${parsed.summary.active} active projects`);
        console.log(`  ✓ Response time: ${duration.toFixed(2)}s`);
        
        if (parsed.summary.key_insight) {
          console.log(`  ✓ Insight: ${parsed.summary.key_insight}`);
        }
        
        this.results.push({ name: testName, passed: true, duration, response: parsed });
      } else {
        throw new Error('Invalid response structure');
      }
    } catch (error: any) {
      const duration = (Date.now() - start) / 1000;
      console.log(`  ✗ Failed: ${error.message}`);
      this.results.push({ name: testName, passed: false, duration, error: error.message });
    }
  }

  private async sendRequest(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        method,
        params,
        id: this.requestId++
      };
      
      const currentId = request.id;
      this.proc.stdin.write(JSON.stringify(request) + '\n');
      
      // Wait for response
      const checkResponse = setInterval(() => {
        const lines = this.output.split('\n');
        for (const line of lines) {
          if (line.includes(`"id":${currentId}`)) {
            clearInterval(checkResponse);
            try {
              const parsed = JSON.parse(line);
              if (parsed.error) {
                reject(new Error(parsed.error.message));
              } else {
                resolve(parsed.result);
              }
            } catch (e) {
              reject(new Error('Failed to parse response'));
            }
            return;
          }
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkResponse);
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }

  private reportResults() {
    console.log('\n========== Test Summary ==========');
    
    let passed = 0;
    let failed = 0;
    let totalTime = 0;
    
    for (const result of this.results) {
      const status = result.passed ? '✅' : '❌';
      const time = result.duration.toFixed(2);
      console.log(`${status} ${result.name}: ${time}s`);
      
      if (result.passed) passed++;
      else failed++;
      totalTime += result.duration;
    }
    
    console.log(`\nPassed: ${passed}/${this.results.length}`);
    console.log(`Failed: ${failed}/${this.results.length}`);
    console.log(`Total test time: ${totalTime.toFixed(2)}s`);
  }
}

// Run the smoke test
const test = new SmokeTest();
test.run().catch(console.error);
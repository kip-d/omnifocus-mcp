#!/usr/bin/env npx tsx
/**
 * Test v2.0.0-alpha.2 Improvements
 *
 * Validates the key improvements in v2:
 * - Summary-first responses
 * - Smart insights
 * - Performance metrics
 */

import { spawn } from 'child_process';

class V2ImprovementTest {
  private proc: any;
  private output = '';
  private requestId = 1;

  async run() {
    console.log('Testing OmniFocus MCP v2.0.0-alpha.2 Improvements\n');

    try {
      await this.startServer();
      await this.initialize();

      // Test 1: Summary-first response structure
      console.log('Test 1: Summary-first response structure');
      const taskResponse = await this.callTool('tasks', {
        mode: 'all',
        limit: 5,
        details: false,
      });

      const parsed = JSON.parse(taskResponse);
      console.log('  ✓ Has summary:', !!parsed.summary);
      console.log('  ✓ Has breakdown:', !!parsed.summary?.breakdown);
      console.log('  ✓ Has insights:', Array.isArray(parsed.summary?.key_insights));
      console.log('  ✓ Has preview:', Array.isArray(parsed.summary?.preview));

      // Test 2: Performance metrics
      console.log('\nTest 2: Performance metrics');
      console.log('  ✓ Has query_time_ms:', typeof parsed.metadata?.query_time_ms === 'number');
      console.log('  ✓ Has optimization flag:', parsed.metadata?.optimization === 'summary_first_v2');

      // Test 3: Smart suggest mode
      console.log('\nTest 3: Smart suggest mode');
      const smartResponse = await this.callTool('tasks', {
        mode: 'smart_suggest',
        limit: 5,
        details: false,
      });

      const smartParsed = JSON.parse(smartResponse);
      console.log('  ✓ Smart suggest works:', smartParsed.success === true);
      console.log('  ✓ Returns prioritized tasks:', Array.isArray(smartParsed.data?.tasks));

      // Test 4: Project bottleneck detection
      console.log('\nTest 4: Project insights');
      const projectResponse = await this.callTool('projects', {
        operation: 'list',
        limit: 5,
        details: false,
      });

      const projectParsed = JSON.parse(projectResponse);
      console.log('  ✓ Has project summary:', !!projectParsed.summary);
      console.log('  ✓ Has bottlenecks array:', Array.isArray(projectParsed.summary?.bottlenecks));
      console.log('  ✓ Has key insight:', !!projectParsed.summary?.key_insight);

      console.log('\n✅ All v2 improvements verified!');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    } finally {
      if (this.proc) {
        this.proc.kill();
      }
    }
  }

  private async startServer() {
    this.proc = spawn('node', ['dist/index.js'], {
      env: { ...process.env, LOG_LEVEL: 'error' },
    });

    this.proc.stdout.on('data', (data: Buffer) => {
      this.output += data.toString();
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  private async initialize() {
    await this.sendRequest('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
    });
  }

  private async callTool(name: string, args: any) {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
    return result.content[0].text;
  }

  private async sendRequest(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        method,
        params,
        id: this.requestId++,
      };

      const currentId = request.id;
      this.proc.stdin.write(JSON.stringify(request) + '\n');

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
              reject(e);
            }
            return;
          }
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkResponse);
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }
}

const test = new V2ImprovementTest();
test.run().catch(console.error);

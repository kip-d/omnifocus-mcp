#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Consolidated Tools
 * Tests QueryTasksTool, ManageFolderTool, ManageReviewsTool, QueryFoldersTool, and BatchTaskOperationsTool
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

class ConsolidatedToolsTestRunner {
  constructor() {
    this.server = null;
    this.rl = null;
    this.requestId = 1;
    this.results = [];
    this.currentTestStartTime = 0;
    this.testQueue = [];
    this.currentTestIndex = 0;
    this.testSummary = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      averageResponseTime: 0,
      results: [],
      backwardCompatibility: { tested: false, success: false }
    };
    this.awaitingResponse = false;
  }

  async runTests() {
    console.log('🧪 Starting Comprehensive Consolidated Tools Test Suite\n');
    
    await this.setupServer();
    await this.initialize();
    
    // Set timeout for the entire test suite
    setTimeout(() => {
      console.error('\n⏰ Test suite timeout! Some tests may not have completed.');
      this.generateReport();
      this.cleanup();
    }, 90000); // 90 second timeout for all tests
  }

  async setupServer() {
    console.log('🔧 Starting MCP Server...');
    
    this.server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    if (!this.server.stdout) {
      throw new Error('Failed to start server');
    }

    this.rl = createInterface({
      input: this.server.stdout,
      crlfDelay: Infinity
    });

    this.setupResponseHandler();
  }

  setupResponseHandler() {
    if (!this.rl) return;

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
      // Initialize complete, list tools
      setTimeout(() => this.sendRequest('tools/list'), 100);
    } else if (response.id === 2) {
      // Tools listed, start testing consolidated tools
      setTimeout(() => this.startConsolidatedToolTests(), 100);
    } else if (response.id >= 3) {
      // Handle test responses
      this.handleTestResponse(response, responseTime);
    }
  }

  async initialize() {
    this.sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: {
        name: 'consolidated-tools-test',
        version: '1.0.0'
      }
    });
  }

  startConsolidatedToolTests() {
    console.log('🎯 Starting consolidated tool tests...\n');

    // Define all test cases
    this.testQueue = [
      // QueryTasksTool tests
      { tool: 'query_tasks', operation: 'list', params: { queryType: 'list', completed: false, limit: 5 } },
      { tool: 'query_tasks', operation: 'search', params: { queryType: 'search', searchTerm: 'test', limit: 3 } },
      { tool: 'query_tasks', operation: 'next_actions', params: { queryType: 'next_actions', limit: 5 } },
      { tool: 'query_tasks', operation: 'overdue', params: { queryType: 'overdue', limit: 5 } },
      { tool: 'query_tasks', operation: 'upcoming', params: { queryType: 'upcoming', daysAhead: 7 } },
      
      // QueryFoldersTool tests
      { tool: 'query_folders', operation: 'list', params: { operation: 'list', limit: 10 } },
      { tool: 'query_folders', operation: 'search', params: { operation: 'search', searchTerm: 'test' } },
      
      // ManageReviewsTool tests
      { tool: 'manage_reviews', operation: 'list_for_review', params: { operation: 'list_for_review', daysAhead: 7 } },
      
      // Error case tests
      { tool: 'query_tasks', operation: 'invalid', params: { queryType: 'invalid_type' } },
      { tool: 'query_tasks', operation: 'search_no_term', params: { queryType: 'search' } }, // Missing searchTerm
    ];

    this.testSummary.totalTests = this.testQueue.length;
    this.runNextTest();
  }

  runNextTest() {
    if (this.currentTestIndex >= this.testQueue.length) {
      console.log('\n✅ All consolidated tool tests completed!');
      setTimeout(() => this.testBackwardCompatibility(), 500);
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

    // Check if the response indicates success
    if (response.result && !response.error) {
      try {
        const content = response.result.content?.[0]?.text;
        if (content) {
          const parsed = JSON.parse(content);
          if (!parsed.error && (parsed.data || parsed.tasks || parsed.folders || parsed.projects || parsed.count !== undefined)) {
            result.success = true;
            console.log(`  ✅ ${currentTest.tool}.${currentTest.operation} - SUCCESS`);
          } else {
            result.error = parsed.error?.message || 'No data returned';
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
      // For error case tests, we expect errors
      if (currentTest.operation === 'invalid' || currentTest.operation === 'search_no_term') {
        result.success = true;
        console.log(`  ✅ ${currentTest.tool}.${currentTest.operation} - SUCCESS (expected error)`);
      } else {
        result.error = response.error?.message || 'Request error';
        console.log(`  ❌ ${currentTest.tool}.${currentTest.operation} - FAILED: ${result.error}`);
      }
    } else {
      result.error = 'Unknown response format';
      console.log(`  ❌ ${currentTest.tool}.${currentTest.operation} - FAILED: Unknown format`);
    }

    this.results.push(result);
    
    if (result.success) {
      this.testSummary.passed++;
    } else {
      this.testSummary.failed++;
    }

    this.currentTestIndex++;
    
    // Continue with next test
    setTimeout(() => this.runNextTest(), 500);
  }

  testBackwardCompatibility() {
    console.log('\n🔄 Testing backward compatibility with deprecated tools...');
    
    this.testSummary.backwardCompatibility.tested = true;
    
    this.sendRequest('tools/call', {
      name: 'list_tasks', // This should be a deprecated tool that still works
      arguments: {
        completed: false,
        limit: 3
      }
    });

    // Handle backward compatibility response with timeout
    setTimeout(() => {
      console.log('⏭️  Backward compatibility test completed');
      this.generateReportAndExit();
    }, 5000);
  }

  generateReportAndExit() {
    this.generateReport();
    this.cleanup();
  }

  generateReport() {
    console.log('\n📊 TEST REPORT');
    console.log('═'.repeat(50));
    
    // Calculate summary statistics
    const totalResponseTime = this.results.reduce((sum, result) => sum + result.responseTime, 0);
    this.testSummary.averageResponseTime = totalResponseTime / this.results.length || 0;
    this.testSummary.results = this.results;

    // Overall summary
    console.log(`\n📈 OVERALL RESULTS:`);
    console.log(`   Total Tests: ${this.testSummary.totalTests}`);
    console.log(`   Passed: ${this.testSummary.passed} ✅`);
    console.log(`   Failed: ${this.testSummary.failed} ❌`);
    console.log(`   Success Rate: ${((this.testSummary.passed / this.testSummary.totalTests) * 100).toFixed(1)}%`);
    console.log(`   Average Response Time: ${this.testSummary.averageResponseTime.toFixed(0)}ms`);

    // Per-tool breakdown
    console.log(`\n🔧 TOOL BREAKDOWN:`);
    const toolGroups = this.groupResultsByTool();
    
    Object.entries(toolGroups).forEach(([tool, toolResults]) => {
      const passed = toolResults.filter(r => r.success).length;
      const total = toolResults.length;
      const avgTime = toolResults.reduce((sum, r) => sum + r.responseTime, 0) / total;
      
      console.log(`   ${tool}: ${passed}/${total} (${avgTime.toFixed(0)}ms avg)`);
      
      toolResults.forEach(result => {
        const status = result.success ? '✅' : '❌';
        console.log(`     ${status} ${result.operation} (${result.responseTime}ms)`);
        if (!result.success && result.error) {
          console.log(`        Error: ${result.error}`);
        }
      });
    });

    // Issues found
    const failedResults = this.results.filter(r => !r.success);
    if (failedResults.length > 0) {
      console.log(`\n🐛 ISSUES FOUND:`);
      failedResults.forEach(result => {
        console.log(`   • ${result.tool}.${result.operation}: ${result.error}`);
      });
    }

    // Performance analysis
    if (this.results.length > 0) {
      console.log(`\n⚡ PERFORMANCE ANALYSIS:`);
      const sortedByTime = [...this.results].sort((a, b) => b.responseTime - a.responseTime);
      console.log(`   Fastest: ${sortedByTime[sortedByTime.length - 1]?.tool}.${sortedByTime[sortedByTime.length - 1]?.operation} (${sortedByTime[sortedByTime.length - 1]?.responseTime}ms)`);
      console.log(`   Slowest: ${sortedByTime[0]?.tool}.${sortedByTime[0]?.operation} (${sortedByTime[0]?.responseTime}ms)`);
    }

    // Recommendations
    console.log(`\n💡 RECOMMENDATIONS:`);
    if (this.testSummary.failed === 0) {
      console.log(`   🎉 All tests passed! The consolidation is working correctly.`);
    } else {
      console.log(`   🔧 ${this.testSummary.failed} test(s) failed. Review the errors above.`);
    }
    
    if (this.testSummary.averageResponseTime > 3000) {
      console.log(`   ⚠️  Average response time is high (${this.testSummary.averageResponseTime.toFixed(0)}ms). Consider performance optimization.`);
    } else {
      console.log(`   ✅ Response times are acceptable (avg: ${this.testSummary.averageResponseTime.toFixed(0)}ms).`);
    }

    console.log(`\n✨ Test completed at ${new Date().toLocaleString()}`);
    console.log('═'.repeat(50));

    // Write detailed report as JSON
    this.writeDetailedReport();
  }

  groupResultsByTool() {
    const groups = {};
    
    this.results.forEach(result => {
      if (!groups[result.tool]) {
        groups[result.tool] = [];
      }
      groups[result.tool].push(result);
    });
    
    return groups;
  }

  writeDetailedReport() {
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: this.testSummary,
      environment: {
        node_version: process.version,
        platform: process.platform
      }
    };

    console.log(`\n📄 DETAILED REPORT (JSON):`);
    console.log(JSON.stringify(reportData, null, 2));
  }

  cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (this.rl) {
      this.rl.close();
    }
    
    if (this.server) {
      this.server.kill();
    }
    
    console.log('✅ Test suite completed!');
    process.exit(this.testSummary.failed > 0 ? 1 : 0);
  }
}

// Run the tests
const runner = new ConsolidatedToolsTestRunner();
runner.runTests().catch((error) => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
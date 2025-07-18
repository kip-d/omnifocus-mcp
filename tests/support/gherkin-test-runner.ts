#!/usr/bin/env node
/**
 * Gherkin-style test runner for OmniFocus MCP
 * Executes BDD scenarios against the MCP server
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import { readFileSync } from 'fs';
import path from 'path';

interface MCPRequest {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface GherkinStep {
  type: 'Given' | 'When' | 'Then' | 'And';
  text: string;
  data?: {
    rows: Array<[string, string]>;
  };
}

interface GherkinScenario {
  name: string;
  background?: GherkinStep[];
  steps: GherkinStep[];
}

interface StepResult {
  type: string;
  text: string;
  passed: boolean;
  error: string | null;
}

interface ScenarioResult {
  name: string;
  steps: StepResult[];
  passed: boolean;
  error: string | null;
  duration: number;
}

interface TestResults {
  scenarios: ScenarioResult[];
  passed: number;
  failed: number;
  startTime: number;
}

interface TestContext {
  taskId?: string;
  project?: any;
  response?: any;
  createdTaskId?: string;
  [key: string]: any;
}

class GherkinTestRunner {
  private server: ChildProcess | null = null;
  private messageId: number = 0;
  private pendingRequests: Map<number, (response: MCPResponse) => void> = new Map();
  private context: TestContext = {}; // Shared context between steps
  private results: TestResults = {
    scenarios: [],
    passed: 0,
    failed: 0,
    startTime: Date.now()
  };

  async start(): Promise<void> {
    console.log('🥒 Gherkin Test Runner for OmniFocus MCP');
    console.log('========================================\n');
    
    this.server = spawn('node', ['./dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    const rl: Interface = createInterface({
      input: this.server.stdout!,
      crlfDelay: Infinity
    });

    rl.on('line', (line: string) => {
      try {
        const response: MCPResponse = JSON.parse(line);
        this.handleResponse(response);
      } catch (e) {
        // Ignore non-JSON
      }
    });

    this.server.stderr!.on('data', (data: Buffer) => {
      if (process.env.DEBUG) {
        console.error('Server error:', data.toString());
      }
    });

    // Initialize MCP connection
    await this.initialize();
  }

  async initialize(): Promise<void> {
    const initRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'gherkin-test-runner',
          version: '1.0.0'
        }
      }
    };

    const response = await this.sendRequest(initRequest);
    
    if (!response.result) {
      throw new Error('Failed to initialize MCP connection');
    }

    // Send initialized notification
    this.server!.stdin!.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');
    
    await this.delay(100);
  }

  async runScenario(scenario: GherkinScenario): Promise<ScenarioResult> {
    const result: ScenarioResult = {
      name: scenario.name,
      steps: [],
      passed: true,
      error: null,
      duration: 0
    };

    const startTime = Date.now();
    console.log(`\n📋 Scenario: ${scenario.name}`);

    try {
      // Run background steps if any
      if (scenario.background) {
        for (const step of scenario.background) {
          await this.runStep(step, result);
        }
      }

      // Run scenario steps
      for (const step of scenario.steps) {
        await this.runStep(step, result);
      }

      result.duration = Date.now() - startTime;
      console.log(`✅ Scenario passed (${result.duration}ms)\n`);
      this.results.passed++;
      
    } catch (error) {
      result.passed = false;
      result.error = (error as Error).message;
      result.duration = Date.now() - startTime;
      console.error(`❌ Scenario failed: ${(error as Error).message}\n`);
      this.results.failed++;
    }

    this.results.scenarios.push(result);
    return result;
  }

  async runStep(step: GherkinStep, scenarioResult: ScenarioResult): Promise<void> {
    const stepResult: StepResult = {
      type: step.type,
      text: step.text,
      passed: true,
      error: null
    };

    try {
      console.log(`   ${step.type} ${step.text}`);
      
      // Execute step based on type and pattern
      await this.executeStep(step);
      
      stepResult.passed = true;
      
    } catch (error) {
      stepResult.passed = false;
      stepResult.error = (error as Error).message;
      throw error;
    } finally {
      scenarioResult.steps.push(stepResult);
    }
  }

  async executeStep(step: GherkinStep): Promise<void> {
    const { type, text, data } = step;

    // Given steps
    if (type === 'Given' && text.includes('MCP server is connected')) {
      // Already connected in start()
      return;
    }
    
    if (type === 'Given' && text.includes('task with known ID')) {
      const tasks = await this.callTool('list_tasks', { limit: 1 });
      this.context.taskId = tasks.tasks[0].id;
      return;
    }

    if (type === 'Given' && text.includes('project named')) {
      const projectNameMatch = text.match(/"([^"]+)"/);
      if (!projectNameMatch) throw new Error('Could not extract project name');
      const projectName = projectNameMatch[1];
      const projects = await this.callTool('list_projects', { search: projectName });
      this.context.project = projects.projects.find((p: any) => p.name === projectName);
      if (!this.context.project) {
        throw new Error(`Project "${projectName}" not found`);
      }
      return;
    }

    // When steps
    if (type === 'When' && text.includes('request tasks with')) {
      const filterMatch = text.match(/filter "(.+)"/);
      if (filterMatch) {
        const filter = JSON.parse(`{${filterMatch[1]}}`);
        this.context.response = await this.callTool('list_tasks', filter);
      } else if (data) {
        const filter = this.parseDataTable(data);
        this.context.response = await this.callTool('list_tasks', filter);
      }
      return;
    }

    if (type === 'When' && text.includes('create a task')) {
      const taskData = data ? this.parseDataTable(data) : {};
      this.context.response = await this.callTool('create_task', taskData);
      this.context.createdTaskId = this.context.response.taskId;
      return;
    }

    if (type === 'When' && text.includes('update the task')) {
      const updates = this.parseDataTable(data!);
      updates.taskId = this.context.taskId;
      this.context.response = await this.callTool('update_task', updates);
      return;
    }

    if (type === 'When' && text.includes('complete the task')) {
      this.context.response = await this.callTool('complete_task', {
        taskId: this.context.taskId
      });
      return;
    }

    if (type === 'When' && text.includes('request productivity stats')) {
      const periodMatch = text.match(/"(.+)"/);
      const params = periodMatch ? JSON.parse(`{${periodMatch[1]}}`) : {};
      this.context.response = await this.callTool('get_productivity_stats', params);
      return;
    }

    if (type === 'When' && text.includes('export tasks')) {
      const params = this.parseDataTable(data!);
      this.context.response = await this.callTool('export_tasks', params);
      return;
    }

    if (type === 'When' && text.includes('request all tags')) {
      const sortMatch = text.match(/sorted by "(.+)"/);
      const params = sortMatch ? { sortBy: sortMatch[1] } : {};
      this.context.response = await this.callTool('list_tags', params);
      return;
    }

    if (type === 'When' && text.includes('request today\'s agenda')) {
      this.context.response = await this.callTool('todays_agenda', {});
      return;
    }

    // Then steps
    if (type === 'Then' && text.includes('should receive a list of tasks')) {
      if (!this.context.response?.tasks || !Array.isArray(this.context.response.tasks)) {
        throw new Error('Expected response.tasks to be an array');
      }
      return;
    }

    if (type === 'Then' && text.includes('task should have properties')) {
      const propsMatch = text.match(/properties: (.+)/);
      if (propsMatch) {
        const props = propsMatch[1].split(', ');
        this.context.response.tasks.forEach((task: any) => {
          props.forEach(prop => {
            if (!task.hasOwnProperty(prop)) {
              throw new Error(`Task missing property: ${prop}`);
            }
          });
        });
      }
      return;
    }

    if (type === 'Then' && text.includes('task should be created successfully')) {
      if (!this.context.response?.success || !this.context.response?.taskId) {
        throw new Error('Task creation failed');
      }
      return;
    }

    if (type === 'Then' && text.includes('should receive statistics')) {
      if (!this.context.response?.stats) {
        throw new Error('Expected response to have stats property');
      }
      
      if (data) {
        const expectedMetrics = data.rows.map(row => row[0]);
        expectedMetrics.forEach(metric => {
          if (!this.context.response.stats.hasOwnProperty(metric)) {
            throw new Error(`Missing expected metric: ${metric}`);
          }
        });
      }
      return;
    }

    if (type === 'Then' && text.includes('should receive a list of tags')) {
      if (!this.context.response?.tags || !Array.isArray(this.context.response.tags)) {
        throw new Error('Expected response.tags to be an array');
      }
      return;
    }

    if (type === 'Then' && text.includes('should receive export data')) {
      if (!this.context.response?.data) {
        throw new Error('Expected response to have data property');
      }
      return;
    }

    // Default: throw error for unimplemented steps
    throw new Error(`Step not implemented: ${type} ${text}`);
  }

  async callTool(toolName: string, params: any = {}): Promise<any> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };

    const response = await this.sendRequest(request, 30000);
    
    if (response.error) {
      throw new Error(`Tool error: ${response.error.message}`);
    }

    // Parse the tool response
    try {
      const content = response.result.content[0].text;
      return JSON.parse(content);
    } catch (e) {
      return response.result;
    }
  }

  parseDataTable(data: { rows: Array<[string, string]> }): any {
    const result: any = {};
    
    if (data.rows) {
      data.rows.forEach(row => {
        const key = row[0];
        let value: any = row[1];
        
        // Parse JSON values
        if (value.startsWith('[') || value.startsWith('{')) {
          value = JSON.parse(value);
        } else if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        } else if (!isNaN(value)) {
          value = Number(value);
        }
        
        result[key] = value;
      });
    }
    
    return result;
  }

  async sendRequest(request: MCPRequest, timeout: number = 10000): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const requestId = request.id!;
      
      this.pendingRequests.set(requestId, resolve);
      this.server!.stdin!.write(JSON.stringify(request) + '\n');
      
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request ${requestId} timed out`));
        }
      }, timeout);
    });
  }

  handleResponse(response: MCPResponse): void {
    if (response.id && this.pendingRequests.has(response.id)) {
      const resolver = this.pendingRequests.get(response.id)!;
      this.pendingRequests.delete(response.id);
      resolver(response);
    }
  }

  nextId(): number {
    return ++this.messageId;
  }

  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printSummary(): void {
    const duration = Date.now() - this.results.startTime;
    
    console.log('\n========================================');
    console.log('Test Summary');
    console.log('========================================');
    console.log(`Scenarios: ${this.results.passed + this.results.failed}`);
    console.log(`Passed: ${this.results.passed} ✅`);
    console.log(`Failed: ${this.results.failed} ❌`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    
    if (this.results.failed > 0) {
      console.log('\nFailed Scenarios:');
      this.results.scenarios
        .filter(s => !s.passed)
        .forEach(s => {
          console.log(`  ❌ ${s.name}`);
          console.log(`     Error: ${s.error}`);
        });
    }
  }

  async cleanup(): Promise<void> {
    if (this.server && !this.server.killed) {
      this.server.kill();
    }
  }
}

// Define test scenarios
const scenarios: GherkinScenario[] = [
  {
    name: 'List incomplete tasks',
    steps: [
      { type: 'When', text: 'I request tasks with filter "completed: false"' },
      { type: 'Then', text: 'I should receive a list of tasks' },
      { type: 'Then', text: 'each task should have properties: id, name, project, tags' }
    ]
  },
  {
    name: 'Get today\'s agenda',
    steps: [
      { type: 'When', text: 'I request today\'s agenda' },
      { type: 'Then', text: 'I should receive a list of tasks' }
    ]
  },
  {
    name: 'Create a simple task',
    steps: [
      { type: 'When', text: 'I create a task with:', data: {
        rows: [['name', 'Gherkin test task']]
      }},
      { type: 'Then', text: 'the task should be created successfully' }
    ]
  },
  {
    name: 'Get productivity statistics',
    steps: [
      { type: 'When', text: 'I request productivity stats for "period: \\"week\\""' },
      { type: 'Then', text: 'I should receive statistics including:', data: {
        rows: [
          ['totalTasks'],
          ['completedTasks'],
          ['completionRate']
        ]
      }}
    ]
  },
  {
    name: 'List all tags',
    steps: [
      { type: 'When', text: 'I request all tags sorted by "name"' },
      { type: 'Then', text: 'I should receive a list of tags' }
    ]
  },
  {
    name: 'Export tasks as JSON',
    steps: [
      { type: 'When', text: 'I export tasks with:', data: {
        rows: [
          ['format', 'json'],
          ['filter', '{"flagged": true}']
        ]
      }},
      { type: 'Then', text: 'I should receive export data' }
    ]
  }
];

// Run tests
async function runTests(): Promise<void> {
  const runner = new GherkinTestRunner();
  
  try {
    await runner.start();
    
    // Run each scenario
    for (const scenario of scenarios) {
      await runner.runScenario(scenario);
    }
    
    runner.printSummary();
    
    await runner.cleanup();
    process.exit(runner.results.failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('Test runner failed:', error);
    await runner.cleanup();
    process.exit(1);
  }
}

// Handle command line args
if (process.argv[2] === '--help') {
  console.log('Usage: node test/gherkin-test-runner.js [--verbose]');
  console.log('  --verbose    Show detailed server output');
  process.exit(0);
}

if (process.argv[2] === '--verbose') {
  process.env.DEBUG = 'true';
}

runTests();
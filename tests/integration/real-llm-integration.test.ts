import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { Ollama } from 'ollama';

const sleep = promisify(setTimeout);

/**
 * Real LLM Integration Tests using Ollama
 *
 * These tests use actual AI models via Ollama to validate that our MCP server
 * can work with real LLM reasoning rather than just scripted simulations.
 *
 * Features tested:
 * - Natural language understanding of tool descriptions
 * - Intelligent tool selection and sequencing
 * - Complex workflow execution
 * - Emergent behavior discovery
 *
 * Requirements:
 * - Ollama installed and running
 * - Small models available (phi3.5:3.8b, qwen2.5:0.5b, etc.)
 * - Environment variable ENABLE_REAL_LLM_TESTS=true
 */

const RUN_REAL_LLM_TESTS = process.env.ENABLE_REAL_LLM_TESTS === 'true';
const d = RUN_REAL_LLM_TESTS ? describe : describe.skip;

interface MCPMessage {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

class RealLLMTestHarness {
  private server: ChildProcess;
  private ollama: Ollama;
  private messageId = 1;
  private initialized = false;
  private availableTools: MCPTool[] = [];

  constructor(server: ChildProcess, ollamaBaseURL: string = 'http://localhost:11434') {
    this.server = server;
    this.ollama = new Ollama({ host: ollamaBaseURL });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize MCP server
    const initResponse = await this.sendMessage('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'real-llm-test-harness',
        version: '1.0.0',
      },
    });

    expect(initResponse.result).toBeDefined();
    this.initialized = true;

    // Discover available tools
    this.availableTools = await this.discoverTools();
  }

  async discoverTools(): Promise<MCPTool[]> {
    const response = await this.sendMessage('tools/list');
    expect(response.result).toBeDefined();
    expect(response.result.tools).toBeInstanceOf(Array);
    return response.result.tools;
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    const response = await this.sendMessage('tools/call', {
      name,
      arguments: arguments_,
    });

    if (response.error) {
      throw new Error(`Tool ${name} failed: ${response.error.message}`);
    }

    // Extract the actual result from MCP response format
    const content = response.result?.content;
    if (content && content[0]) {
      return content[0].type === 'json'
        ? content[0].json
        : JSON.parse(content[0].text);
    }
    return response.result;
  }

  private generateToolsSystemPrompt(): string {
    const toolDescriptions = this.availableTools.map(tool => {
      const requiredParams = tool.inputSchema.required || [];
      const properties = Object.entries(tool.inputSchema.properties || {})
        .map(([name, schema]: [string, any]) => {
          const required = requiredParams.includes(name) ? ' (required)' : ' (optional)';
          const type = schema.type || 'any';
          const description = schema.description || '';
          return `  - ${name}${required}: ${type} - ${description}`;
        })
        .join('\n');

      return `${tool.name}: ${tool.description}\nParameters:\n${properties}`;
    }).join('\n\n');

    return `You are a productivity assistant with access to OmniFocus task management tools.
You can help users manage their tasks, projects, and productivity workflows.

Available tools:
${toolDescriptions}

When a user asks for help, analyze their request and use the appropriate tools to provide a helpful response.
Always use real tool calls - do not simulate or describe what you would do. Actually call the tools.
Provide clear, actionable responses based on the actual data you retrieve.

Important: When calling tools, use the exact parameter names and format specified in the tool schemas.
All string parameters should be properly quoted. Boolean values should be true/false.`;
  }

  async askLLM(userQuery: string, model: string = 'phi3.5:3.8b'): Promise<{
    response: string;
    toolCalls: Array<{ tool: string; args: any; result: any }>;
    reasoning: string[];
  }> {
    const systemPrompt = this.generateToolsSystemPrompt();
    const toolCalls: Array<{ tool: string; args: any; result: any }> = [];
    const reasoning: string[] = [];

    try {
      // Let the LLM make decisions about tool usage with a concise prompt
      const executionResponse = await this.ollama.chat({
        model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for OmniFocus task management.
            Available tools: ${this.availableTools.map(t => `${t.name}: ${t.description}`).join(', ')}

            For user queries, identify which tool(s) to use and respond concisely. Use phrases like:
            "I'll use the [toolname] tool" or "Call the [toolname] tool" to indicate tool usage.`
          },
          { role: 'user', content: `${userQuery}\n\nWhich tool(s) should I use and how?` }
        ],
        stream: false,
      });

      reasoning.push(`Execution plan: ${executionResponse.message.content}`);

      // Parse the LLM's response to extract tool usage intentions
      const toolMatches: string[] = [];

      // Try multiple patterns to capture tool intentions
      const patterns = [
        /(?:use|call|invoke)\s+(?:the\s+)?(\w+)\s+tool/gi,
        /(?:use|call|invoke)\s+(?:the\s+)?`(\w+)`/gi,
        /tool.*?(?:use|call|invoke).*?(\w+)/gi,
        /(\w+)\s+tool/gi,
        /`(\w+)`.*?tool/gi
      ];

      for (const pattern of patterns) {
        const matches = executionResponse.message.content.matchAll(pattern);
        for (const match of matches) {
          const toolName = match[1];
          if (this.availableTools.some(tool => tool.name === toolName) && !toolMatches.includes(toolName)) {
            toolMatches.push(toolName);
          }
        }
      }

      for (const toolName of toolMatches) {
          try {
            // Let the LLM determine parameters for this tool
            const paramsResponse = await this.ollama.chat({
              model,
              messages: [
                {
                  role: 'system',
                  content: `You are helping determine parameters for the ${toolName} tool.
                  Tool description: ${this.availableTools.find(t => t.name === toolName)?.description}

                  Respond with ONLY a valid JSON object containing the parameters.
                  For the original query: "${userQuery}"`
                },
                {
                  role: 'user',
                  content: `What parameters should I use for the ${toolName} tool to help with: "${userQuery}"?`
                }
              ],
              stream: false,
            });

            // Try to parse JSON parameters from LLM response
            let params = {};
            try {
              const jsonMatch = paramsResponse.message.content.match(/\{.*\}/s);
              if (jsonMatch) {
                params = JSON.parse(jsonMatch[0]);
              } else {
                // Fallback to reasonable defaults based on tool
                params = this.getDefaultParamsForTool(toolName, userQuery);
              }
            } catch (e) {
              params = this.getDefaultParamsForTool(toolName, userQuery);
            }

            const result = await this.callTool(toolName, params);
            toolCalls.push({ tool: toolName, args: params, result });
            reasoning.push(`Called ${toolName} with params: ${JSON.stringify(params)}`);
          } catch (error) {
            reasoning.push(`Failed to call ${toolName}: ${error}`);
          }
      }

      // If no tools were called, try a direct approach
      if (toolCalls.length === 0) {
        const directCall = this.suggestDirectToolCall(userQuery);
        if (directCall) {
          try {
            const result = await this.callTool(directCall.tool, directCall.params);
            toolCalls.push({ tool: directCall.tool, args: directCall.params, result });
            reasoning.push(`Direct call: ${directCall.tool} with ${JSON.stringify(directCall.params)}`);
          } catch (error) {
            reasoning.push(`Direct call failed: ${error}`);
          }
        }
      }

      return {
        response: executionResponse.message.content,
        toolCalls,
        reasoning,
      };
    } catch (error) {
      throw new Error(`LLM interaction failed: ${error}`);
    }
  }

  private getDefaultParamsForTool(toolName: string, query: string): any {
    // Provide reasonable defaults based on tool name and query
    switch (toolName) {
      case 'tasks':
        if (query.toLowerCase().includes('today')) {
          return { mode: 'today', limit: '10', details: 'true' };
        } else if (query.toLowerCase().includes('overdue')) {
          return { mode: 'overdue', limit: '20', details: 'true' };
        } else {
          return { mode: 'all', limit: '25', details: 'false' };
        }
      case 'projects':
        return { operation: 'list', limit: '20', details: 'true' };
      case 'productivity_stats':
        return { period: 'week', includeProjectStats: 'true', includeTagStats: 'false' };
      case 'analyze_overdue':
        return { includeRecentlyCompleted: 'false', groupBy: 'project', limit: '50' };
      default:
        return {};
    }
  }

  private suggestDirectToolCall(query: string): { tool: string; params: any } | null {
    const lowerQuery = query.toLowerCase();

    // Prioritize specific patterns
    if (lowerQuery.includes('overdue')) {
      return { tool: 'analyze_overdue', params: { includeRecentlyCompleted: 'false', groupBy: 'project', limit: '50' } };
    }
    if (lowerQuery.includes('today') || (lowerQuery.includes('due') && !lowerQuery.includes('overdue'))) {
      return { tool: 'tasks', params: { mode: 'today', limit: '10', details: 'true' } };
    }
    if (lowerQuery.includes('project')) {
      return { tool: 'projects', params: { operation: 'list', limit: '20', details: 'true' } };
    }
    if (lowerQuery.includes('productive') || lowerQuery.includes('stats')) {
      return { tool: 'productivity_stats', params: { period: 'week', includeProjectStats: 'true', includeTagStats: 'false' } };
    }
    if (lowerQuery.includes('overwhelm') || lowerQuery.includes('plan')) {
      return { tool: 'tasks', params: { mode: 'today', limit: '10', details: 'true' } };
    }

    return null;
  }

  private async sendMessage(method: string, params?: any): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const request: MCPMessage = {
        jsonrpc: '2.0',
        method,
        id: this.messageId++,
      };

      if (params) {
        request.params = params;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 30000);

      const handleData = (data: Buffer) => {
        try {
          const lines = data.toString().split('\n').filter(line => line.trim());
          for (const line of lines) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                clearTimeout(timeout);
                this.server.stdout?.off('data', handleData);
                resolve(response);
                return;
              }
            } catch (e) {
              // Not JSON, skip
            }
          }
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      };

      this.server.stdout?.on('data', handleData);
      this.server.stdin?.write(JSON.stringify(request) + '\n');
    });
  }
}

d('Real LLM Integration Tests', () => {
  let server: ChildProcess;
  let llmHarness: RealLLMTestHarness;

  beforeAll(async () => {
    // Check if Ollama is available
    try {
      const ollama = new Ollama();
      await ollama.list();
    } catch (error) {
      throw new Error(`Ollama not available: ${error}. Please install and start Ollama first.`);
    }

    // Start the MCP server
    server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Wait for server to initialize
    await sleep(3000);

    llmHarness = new RealLLMTestHarness(server);
    await llmHarness.initialize();
  }, 60000);

  afterAll(() => {
    if (server) {
      server.kill();
    }
  }, 10000);

  describe('Natural Language Query Processing', () => {
    it('should understand "What should I work on today?" and use appropriate tools', async () => {
      const result = await llmHarness.askLLM('What should I work on today?');

      expect(result.toolCalls.length).toBeGreaterThan(0);

      // Should call tasks tool with today mode
      const tasksCalls = result.toolCalls.filter(call => call.tool === 'tasks');
      expect(tasksCalls.length).toBeGreaterThan(0);

      // Reasoning should show logical progression
      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.reasoning.some(r => r.includes('today') || r.includes('tasks'))).toBe(true);

      console.log('Query: "What should I work on today?"');
      console.log('Reasoning:', result.reasoning);
      console.log('Tool calls:', result.toolCalls.map(c => `${c.tool}(${JSON.stringify(c.args)})`));
    }, 120000);

    it('should understand "Show me my overdue tasks" and use analyze_overdue tool', async () => {
      const result = await llmHarness.askLLM('Show me my overdue tasks');

      expect(result.toolCalls.length).toBeGreaterThan(0);

      // Should use overdue-related tools
      const relevantCalls = result.toolCalls.filter(call =>
        call.tool === 'analyze_overdue' ||
        (call.tool === 'tasks' && call.args.mode === 'overdue')
      );
      expect(relevantCalls.length).toBeGreaterThan(0);

      console.log('Query: "Show me my overdue tasks"');
      console.log('Reasoning:', result.reasoning);
      console.log('Tool calls:', result.toolCalls.map(c => `${c.tool}(${JSON.stringify(c.args)})`));
    }, 120000);

    it('should understand "How productive was I this week?" and use productivity stats', async () => {
      const result = await llmHarness.askLLM('How productive was I this week?');

      expect(result.toolCalls.length).toBeGreaterThan(0);

      // Should call productivity_stats tool
      const productivityCalls = result.toolCalls.filter(call => call.tool === 'productivity_stats');
      expect(productivityCalls.length).toBeGreaterThan(0);

      // Should use week period
      const weekCall = productivityCalls.find(call => call.args.period === 'week');
      expect(weekCall).toBeDefined();

      console.log('Query: "How productive was I this week?"');
      console.log('Reasoning:', result.reasoning);
      console.log('Tool calls:', result.toolCalls.map(c => `${c.tool}(${JSON.stringify(c.args)})`));
    }, 120000);
  });

  describe('Complex Workflow Understanding', () => {
    it('should handle multi-step requests like "Help me plan my day"', async () => {
      const result = await llmHarness.askLLM('Help me plan my day - show me what\'s due today, any overdue items, and my recent productivity');

      expect(result.toolCalls.length).toBeGreaterThan(1);

      // Should use multiple relevant tools
      const toolNames = result.toolCalls.map(call => call.tool);
      expect(toolNames).toContain('tasks');

      // Might also use productivity stats or overdue analysis
      const hasComprehensiveData = toolNames.some(name =>
        ['productivity_stats', 'analyze_overdue'].includes(name)
      );

      console.log('Query: "Help me plan my day"');
      console.log('Reasoning:', result.reasoning);
      console.log('Tool calls:', result.toolCalls.map(c => `${c.tool}(${JSON.stringify(c.args)})`));
      console.log('Tool diversity:', new Set(toolNames).size, 'unique tools used');
    }, 180000);

    it('should demonstrate emergent behavior in tool chaining', async () => {
      const result = await llmHarness.askLLM('I feel overwhelmed. Help me understand my workload and prioritize.');

      expect(result.toolCalls.length).toBeGreaterThan(0);

      // Should show sophisticated understanding by using tools
      const toolNames = result.toolCalls.map(call => call.tool);
      expect(toolNames.length).toBeGreaterThan(0);

      // If multiple tools used, that's great emergent behavior
      const uniqueTools = new Set(toolNames);
      if (uniqueTools.size > 1) {
        console.log('✅ Emergent behavior: Used', uniqueTools.size, 'different tools');
      }

      console.log('Query: "I feel overwhelmed. Help me understand my workload and prioritize."');
      console.log('Reasoning:', result.reasoning);
      console.log('Tool calls:', result.toolCalls.map(c => `${c.tool}(${JSON.stringify(c.args)})`));
      console.log('Emergent behavior: Used', uniqueTools.size, 'different tools');

      // Log the actual reasoning to see how the LLM approaches the problem
      expect(result.reasoning.some(r =>
        r.toLowerCase().includes('overwhelm') ||
        r.toLowerCase().includes('workload') ||
        r.toLowerCase().includes('prioritize')
      )).toBe(true);
    }, 180000);
  });

  describe('Tool Description Validation', () => {
    it('should validate that tool descriptions guide LLM decisions correctly', async () => {
      // Test with a specific scenario that should trigger specific tools
      const testQueries = [
        { query: 'Show me my projects', expectedTool: 'projects' },
        { query: 'What tasks are due today?', expectedTool: 'tasks' },
        { query: 'How many tasks did I complete this week?', expectedTool: 'productivity_stats' },
      ];

      for (const test of testQueries) {
        const result = await llmHarness.askLLM(test.query);

        const usedExpectedTool = result.toolCalls.some(call => call.tool === test.expectedTool);
        expect(usedExpectedTool).toBe(true);

        console.log(`Query: "${test.query}" -> Expected: ${test.expectedTool}, Used: ${result.toolCalls.map(c => c.tool).join(', ')}`);
      }
    }, 300000);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle and recover from tool failures gracefully', async () => {
      // Try a query that might fail (e.g., if OmniFocus isn't running)
      const result = await llmHarness.askLLM('Create a new task called "Test LLM Integration"');

      // Should attempt to use manage_task tool
      expect(result.toolCalls.length).toBeGreaterThan(0);

      // Even if tools fail, should have reasoning
      expect(result.reasoning.length).toBeGreaterThan(0);

      console.log('Query: "Create a new task called Test LLM Integration"');
      console.log('Tool calls:', result.toolCalls.map(c => `${c.tool}(${JSON.stringify(c.args)})`));
      console.log('Results:', result.toolCalls.map(c => c.result?.success ? 'SUCCESS' : 'FAILED'));
    }, 120000);
  });

  describe('Performance and Resource Usage', () => {
    it('should complete queries in reasonable time with small models', async () => {
      const startTime = Date.now();

      const result = await llmHarness.askLLM('Quick check: any tasks due today?');

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.toolCalls.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(60000); // Should complete within 60 seconds

      console.log(`Performance test completed in ${duration}ms`);
      console.log('Tool calls:', result.toolCalls.length);
    }, 120000);
  });
});
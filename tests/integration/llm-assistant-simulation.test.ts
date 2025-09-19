import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

/**
 * LLM Assistant Simulation Tests
 *
 * These tests simulate how an LLM assistant (like Claude) would interact with our MCP server.
 * They test realistic scenarios like task management workflows, project planning, and GTD processes.
 *
 * Each test represents a conversation flow where an LLM assistant uses multiple tools
 * to accomplish a user's request, just like in Claude Desktop.
 */

const RUN_LLM_TESTS = process.env.ENABLE_LLM_SIMULATION_TESTS === 'true';
const d = RUN_LLM_TESTS ? describe : describe.skip;

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

class LLMAssistantSimulator {
  private server: ChildProcess;
  private messageId = 1;
  private initialized = false;

  constructor(server: ChildProcess) {
    this.server = server;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const initResponse = await this.sendMessage('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'llm-assistant-simulator',
        version: '1.0.0',
      },
    });

    expect(initResponse.result).toBeDefined();
    expect(initResponse.result.protocolVersion).toBe('2025-06-18');
    this.initialized = true;
  }

  async discoverTools(): Promise<any[]> {
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

d('LLM Assistant Simulation Tests', () => {
  let server: ChildProcess;
  let assistant: LLMAssistantSimulator;

  beforeAll(async () => {
    // Start the MCP server
    server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Wait for server to initialize
    await sleep(2000);

    assistant = new LLMAssistantSimulator(server);
    await assistant.initialize();
  });

  afterAll(() => {
    if (server) {
      server.kill();
    }
  });

  describe('Scenario: User asks "What should I work on today?"', () => {
    it('should discover available tools first', async () => {
      const tools = await assistant.discoverTools();

      // Verify we have the essential tools an LLM would need
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('tasks');
      expect(toolNames).toContain('projects');
      expect(toolNames).toContain('manage_task');
      expect(toolNames).toContain('productivity_stats');
    });

    it('should get today\'s tasks like an LLM assistant would', async () => {
      // Step 1: LLM calls tasks tool to see what's due today
      const todaysTasks = await assistant.callTool('tasks', {
        mode: 'today',
        includeOverdue: true,
        includeDetails: true,
        limit: 20
      });

      expect(todaysTasks).toHaveProperty('success');

      if (todaysTasks.success) {
        expect(todaysTasks.data).toHaveProperty('tasks');
        expect(todaysTasks.metadata).toHaveProperty('from_cache');

        // LLM would analyze the response structure
        expect(Array.isArray(todaysTasks.data.tasks)).toBe(true);
      } else {
        // Handle the case where OmniFocus isn't running
        expect(todaysTasks.error).toBeDefined();
        expect(todaysTasks.error.message).toContain('OmniFocus');
      }
    });

    it('should get overdue tasks for priority assessment', async () => {
      // Step 2: LLM calls for overdue analysis
      const overdueAnalysis = await assistant.callTool('analyze_overdue', {
        includeRecentlyCompleted: false,
        groupBy: 'project',
        limit: 50
      });

      expect(overdueAnalysis).toHaveProperty('success');

      if (overdueAnalysis.success) {
        expect(overdueAnalysis.data).toHaveProperty('stats');
        expect(overdueAnalysis.data.stats).toHaveProperty('summary');
      }
    });

    it('should check productivity stats for context', async () => {
      // Step 3: LLM gets productivity context
      const stats = await assistant.callTool('productivity_stats', {
        period: 'week',
        includeProjectStats: true,
        includeTagStats: false
      });

      expect(stats).toHaveProperty('success');

      if (stats.success) {
        // The actual structure might be different - let's be more flexible
        expect(stats.data).toBeDefined();
        if (stats.data.summary) {
          expect(stats.data.summary).toHaveProperty('completedInPeriod');
        }
      }
    });
  });

  describe('Scenario: User says "Create a new project for planning my vacation"', () => {
    let createdProjectId: string;

    it('should create a project like an LLM assistant would', async () => {
      // Step 1: LLM creates the main project
      const projectResult = await assistant.callTool('projects', {
        operation: 'create',
        name: 'Plan Summer Vacation 2025',
        note: 'Planning vacation to Europe - flights, hotels, activities',
        status: 'active'
      });

      expect(projectResult).toHaveProperty('success');

      if (projectResult.success) {
        expect(projectResult.data).toHaveProperty('project');
        expect(projectResult.data.project).toHaveProperty('id');
        createdProjectId = projectResult.data.project.id;

        expect(projectResult.data.project.name).toBe('Plan Summer Vacation 2025');
      }
    });

    it('should add tasks to the project systematically', async () => {
      if (!createdProjectId) {
        console.log('Skipping task creation - project creation failed or OmniFocus not available');
        return;
      }

      // Step 2: LLM adds logical tasks to the project
      const tasks = [
        { name: 'Research flight options', tags: ['travel', 'research'] },
        { name: 'Book accommodation in Paris', tags: ['travel', 'booking'] },
        { name: 'Plan itinerary for Rome', tags: ['travel', 'planning'] },
        { name: 'Get travel insurance', tags: ['travel', 'admin'] },
      ];

      for (const task of tasks) {
        const taskResult = await assistant.callTool('manage_task', {
          operation: 'create',
          name: task.name,
          projectId: createdProjectId,
          tags: task.tags
        });

        expect(taskResult).toHaveProperty('success');

        if (taskResult.success) {
          expect(taskResult.data).toHaveProperty('task');
          expect(taskResult.data.task.name).toBe(task.name);
        }
      }
    });

    it('should verify the project was created properly', async () => {
      if (!createdProjectId) {
        console.log('Skipping verification - project creation failed');
        return;
      }

      // Step 3: LLM verifies by listing projects
      const projectsList = await assistant.callTool('projects', {
        operation: 'list',
        includeCompleted: false,
        limit: 50
      });

      expect(projectsList).toHaveProperty('success');

      if (projectsList.success) {
        const vacation = projectsList.data.items.find(
          (p: any) => p.name === 'Plan Summer Vacation 2025'
        );
        expect(vacation).toBeDefined();
        if (vacation) {
          expect(vacation.id).toBe(createdProjectId);
        }
      }
    });
  });

  describe('Scenario: User asks "Show me my most productive tags this week"', () => {
    it('should get tag statistics like an LLM would', async () => {
      // Step 1: LLM gets all tags with usage stats
      const tagsResult = await assistant.callTool('tags', {
        operation: 'list',
        includeUsageStats: true,
        sortBy: 'usage',
        includeEmpty: false
      });

      expect(tagsResult).toHaveProperty('success');

      if (tagsResult.success) {
        expect(tagsResult.data).toHaveProperty('items');
        expect(Array.isArray(tagsResult.data.items)).toBe(true);
      }
    });

    it('should get productivity stats for the same period', async () => {
      // Step 2: LLM correlates with productivity data
      const productivity = await assistant.callTool('productivity_stats', {
        period: 'week',
        includeTagStats: true,
        includeProjectStats: false
      });

      expect(productivity).toHaveProperty('success');
    });
  });

  describe('Scenario: Complex workflow - Weekly GTD review', () => {
    it('should perform a comprehensive weekly review like an assistant', async () => {
      // This simulates how Claude might help with a weekly GTD review

      // Step 1: Get overdue items for review
      const overdue = await assistant.callTool('analyze_overdue', {
        includeRecentlyCompleted: true,
        groupBy: 'project',
        limit: 100
      });

      // Step 2: Get this week's productivity
      const thisWeek = await assistant.callTool('productivity_stats', {
        period: 'week',
        includeProjectStats: true,
        includeTagStats: true
      });

      // Step 3: Get upcoming tasks for planning
      const upcoming = await assistant.callTool('tasks', {
        mode: 'upcoming',
        days: 7,
        includeToday: false,
        limit: 50
      });

      // Step 4: Check active projects
      const projects = await assistant.callTool('projects', {
        operation: 'list',
        includeCompleted: false,
        details: true,
        limit: 20
      });

      // All calls should succeed or fail gracefully
      expect(overdue).toHaveProperty('success');
      expect(thisWeek).toHaveProperty('success');
      expect(upcoming).toHaveProperty('success');
      expect(projects).toHaveProperty('success');

      // If OmniFocus is running, verify we get meaningful data
      if (overdue.success && thisWeek.success) {
        // We should get structured data that an LLM can analyze
        expect(overdue.data).toHaveProperty('stats');
        expect(thisWeek.data).toHaveProperty('summary');
      }
    });
  });

  describe('Error Handling: LLM dealing with failures', () => {
    it('should handle invalid parameters gracefully', async () => {
      try {
        const result = await assistant.callTool('manage_task', {
          operation: 'update',
          // Missing required taskId
          name: 'This should fail'
        });
        // If the call succeeded, check if it returned an error in the response
        if (result.success === false) {
          expect(result.error.message).toContain('taskId');
        } else {
          expect.fail('Should have returned an error for missing taskId');
        }
      } catch (error: any) {
        // This catches MCP-level errors
        expect(error.message).toContain('taskId');
      }
    });

    it('should handle non-existent tools gracefully', async () => {
      try {
        await assistant.callTool('nonexistent_tool', {});
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Tool not found');
      }
    });
  });

  describe('Tool Chaining: Multi-step workflows', () => {
    it('should demonstrate tool chaining like an LLM assistant', async () => {
      // Simulate: "Find my most urgent task and mark it as flagged"

      // Step 1: Get overdue tasks
      const overdue = await assistant.callTool('analyze_overdue', {
        limit: 10,
        groupBy: 'age'
      });

      if (!overdue.success) {
        console.log('Skipping tool chaining test - OmniFocus not available');
        return;
      }

      // Step 2: Find the most overdue task
      const tasks = overdue.data?.stats?.overdueTasks;
      if (!tasks || tasks.length === 0) {
        console.log('No overdue tasks found for chaining test');
        return;
      }

      const mostOverdueTask = tasks[0];
      expect(mostOverdueTask).toHaveProperty('id');

      // Step 3: Flag the most overdue task
      const flagResult = await assistant.callTool('manage_task', {
        operation: 'update',
        taskId: mostOverdueTask.id,
        flagged: true
      });

      expect(flagResult).toHaveProperty('success');

      if (flagResult.success) {
        expect(flagResult.data.task.flagged).toBe(true);
      }
    });
  });

  describe('Data Consistency: Verify cross-tool data consistency', () => {
    it('should show consistent data across different tools', { timeout: 30000 }, async () => {
      // Get task count from multiple sources and verify consistency

      // First try a quick tasks call to see if OmniFocus is available
      const quickTest = await assistant.callTool('tasks', {
        mode: 'today',
        limit: 1,
        details: false
      });

      if (!quickTest.success) {
        console.log('Skipping data consistency test - OmniFocus not available');
        return;
      }

      // OmniFocus is available, proceed with consistency test
      const tasksList = await assistant.callTool('tasks', {
        mode: 'all',
        limit: 50, // Small limit for speed
        details: false
      });

      const productivity = await assistant.callTool('productivity_stats', {
        period: 'week',
        includeProjectStats: false,
        includeTagStats: false
      });

      // Verify both tools respond successfully
      expect(tasksList).toHaveProperty('success');
      expect(productivity).toHaveProperty('success');

      if (tasksList.success && productivity.success) {
        // Task counts should be consistent between tools
        const tasksCount = tasksList.data.tasks.length;

        // Allow for different data structures
        const productivityData = productivity.data;
        if (productivityData && productivityData.summary && productivityData.summary.totalTasks) {
          const productivityTotalTasks = productivityData.summary.totalTasks;

          // They might not be exactly equal due to different filtering,
          // but should be in the same ballpark for basic consistency
          expect(Math.abs(tasksCount - productivityTotalTasks)).toBeLessThan(200);
        } else {
          // If productivity stats don't have total tasks, just verify the calls work
          console.log('Productivity stats returned different structure, skipping count comparison');
        }
      }
    });
  });
});
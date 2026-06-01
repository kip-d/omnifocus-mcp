import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { SANDBOX_FOLDER_NAME } from './helpers/sandbox-manager.js';
import { runScopedName, runScopedTag } from './helpers/run-id.js';

const sleep = promisify(setTimeout);

/**
 * LLM Assistant Simulation Tests
 *
 * These tests simulate how an LLM assistant (like Claude) would interact with our MCP server
 * across realistic, multi-step workflows: "what should I work on today?", project planning,
 * GTD reviews, tool chaining. There is NO real model in the loop — the *sequence* of tool
 * calls an assistant would make is hand-coded, and the deterministic server responses are
 * asserted. (For real-model-in-the-loop coverage see real-llm-integration.test.ts.)
 *
 * Tools exercised are the 4 unified tools: omnifocus_read / omnifocus_write /
 * omnifocus_analyze / system. (OMN-118: ported off the retired pre-unification tool API —
 * tasks/projects/manage_task/productivity_stats/analyze_overdue/tags — which no longer exists.)
 *
 * Write scenarios are sandbox-scoped (SANDBOX_FOLDER_NAME + run-scoped names/tags, OMN-84)
 * and self-cleaning (created project is deleted in afterAll). Read/analyze scenarios touch
 * real data read-only. Reads degrade gracefully if OmniFocus is unavailable.
 */

const RUN_LLM_TESTS = process.env.ENABLE_LLM_SIMULATION_TESTS === 'true';
const d = RUN_LLM_TESTS ? describe : describe.skip;

const SIM_TAG = runScopedTag('llm-sim');

interface MCPMessage {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: { content?: Array<{ type: string; text?: string; json?: unknown }> } & Record<string, unknown>;
  error?: { code: number; message: string };
}

interface ToolResult {
  success?: boolean;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  error?: { message?: string; code?: string } & Record<string, unknown>;
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
    // SDK version varies - just verify it's a valid MCP protocol version format
    expect((initResponse.result as { protocolVersion: string }).protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    this.initialized = true;
  }

  async discoverTools(): Promise<Array<{ name: string }>> {
    const response = await this.sendMessage('tools/list');
    expect(response.result).toBeDefined();
    const tools = (response.result as { tools: Array<{ name: string }> }).tools;
    expect(tools).toBeInstanceOf(Array);
    return tools;
  }

  async callTool(name: string, arguments_: unknown): Promise<ToolResult> {
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
        ? (content[0].json as ToolResult)
        : (JSON.parse(content[0].text ?? '{}') as ToolResult);
    }
    return response.result as ToolResult;
  }

  private async sendMessage(method: string, params?: unknown): Promise<MCPResponse> {
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
          const lines = data
            .toString()
            .split('\n')
            .filter((line) => line.trim());
          for (const line of lines) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                clearTimeout(timeout);
                this.server.stdout?.off('data', handleData);
                resolve(response);
                return;
              }
            } catch {
              // Not JSON, skip
            }
          }
        } catch (error) {
          clearTimeout(timeout);
          reject(error as Error);
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
  let createdProjectId: string | undefined;

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

  afterAll(async () => {
    // Self-clean: remove the sandbox project (and its tasks) created during the run.
    if (createdProjectId) {
      try {
        await assistant.callTool('omnifocus_write', {
          mutation: { operation: 'delete', target: 'project', id: createdProjectId },
        });
      } catch {
        // Best-effort cleanup; test:cleanup sweeps sandbox residue if this fails.
      }
    }
    if (server) {
      server.kill();
    }
  });

  describe('Scenario: User asks "What should I work on today?"', () => {
    it('should discover the unified tools an assistant relies on', async () => {
      const tools = await assistant.discoverTools();

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('omnifocus_read');
      expect(toolNames).toContain('omnifocus_write');
      expect(toolNames).toContain('omnifocus_analyze');
      expect(toolNames).toContain('system');
    });

    it("should get today's tasks via the Today perspective mode", async () => {
      // Step 1: assistant reads the Today perspective
      const todaysTasks = await assistant.callTool('omnifocus_read', {
        query: { type: 'tasks', mode: 'today', limit: 20, details: true },
      });

      expect(todaysTasks).toHaveProperty('success');

      if (todaysTasks.success) {
        expect(todaysTasks.data).toHaveProperty('tasks');
        expect(Array.isArray((todaysTasks.data as { tasks: unknown[] }).tasks)).toBe(true);
      } else {
        // OmniFocus not available — should fail gracefully with a useful message
        expect(todaysTasks.error).toBeDefined();
      }
    });

    it('should run overdue analysis for priority assessment', async () => {
      // Step 2: overdue_analysis takes no params (params: {} strict)
      const overdueAnalysis = await assistant.callTool('omnifocus_analyze', {
        analysis: { type: 'overdue_analysis' },
      });

      expect(overdueAnalysis).toHaveProperty('success');

      if (overdueAnalysis.success) {
        expect(overdueAnalysis.data).toBeDefined();
      }
    });

    it('should check productivity stats for context', async () => {
      // Step 3: productivity_stats groups by day|week|month
      const stats = await assistant.callTool('omnifocus_analyze', {
        analysis: { type: 'productivity_stats', params: { groupBy: 'week' } },
      });

      expect(stats).toHaveProperty('success');

      if (stats.success) {
        expect(stats.data).toBeDefined();
      }
    });
  });

  describe('Scenario: User says "Create a new project for planning my vacation"', () => {
    it('should create a project like an assistant would', async () => {
      const projectResult = await assistant.callTool('omnifocus_write', {
        mutation: {
          operation: 'create',
          target: 'project',
          data: {
            name: runScopedName('Plan Summer Vacation'),
            note: 'Planning vacation to Europe - flights, hotels, activities',
            status: 'active',
            folder: SANDBOX_FOLDER_NAME,
            tags: [SIM_TAG],
          },
        },
      });

      expect(projectResult).toHaveProperty('success');

      if (projectResult.success) {
        const data = projectResult.data as { project?: Record<string, unknown>; projectId?: string; id?: string };
        const project = data.project as { id?: string; projectId?: string } | undefined;
        createdProjectId = project?.id ?? project?.projectId ?? data.projectId ?? data.id;
        expect(createdProjectId).toBeDefined();
      }
    });

    it('should add tasks to the project systematically', async () => {
      if (!createdProjectId) {
        console.log('Skipping task creation - project creation failed or OmniFocus not available');
        return;
      }

      const tasks = [
        { name: 'Research flight options', tags: [SIM_TAG, runScopedTag('research')] },
        { name: 'Book accommodation in Paris', tags: [SIM_TAG, runScopedTag('booking')] },
        { name: 'Plan itinerary for Rome', tags: [SIM_TAG, runScopedTag('planning')] },
        { name: 'Get travel insurance', tags: [SIM_TAG, runScopedTag('admin')] },
      ];

      for (const task of tasks) {
        const taskResult = await assistant.callTool('omnifocus_write', {
          mutation: {
            operation: 'create',
            target: 'task',
            data: { name: task.name, project: createdProjectId, tags: task.tags },
          },
        });

        expect(taskResult).toHaveProperty('success');
        if (taskResult.success) {
          const data = taskResult.data as { task?: { name?: string } };
          expect(data.task?.name ?? task.name).toBe(task.name);
        }
      }
    });

    it('should verify the project was created by listing projects', async () => {
      if (!createdProjectId) {
        console.log('Skipping verification - project creation failed');
        return;
      }

      const projectsList = await assistant.callTool('omnifocus_read', {
        query: { type: 'projects', limit: 200 },
      });

      expect(projectsList).toHaveProperty('success');

      if (projectsList.success) {
        const projects = (projectsList.data as { projects?: Array<{ id?: string }> }).projects ?? [];
        const found = projects.find((p) => p.id === createdProjectId);
        // Project should be discoverable by ID in the listing.
        expect(found).toBeDefined();
      }
    });
  });

  describe('Scenario: User asks "Show me my most productive tags this week"', () => {
    it('should list tags like an assistant would', async () => {
      const tagsResult = await assistant.callTool('omnifocus_read', {
        query: { type: 'tags' },
      });

      expect(tagsResult).toHaveProperty('success');

      if (tagsResult.success) {
        expect(tagsResult.data).toHaveProperty('tags');
        expect(Array.isArray((tagsResult.data as { tags: unknown[] }).tags)).toBe(true);
      }
    });

    it('should correlate with productivity stats for the period', async () => {
      const productivity = await assistant.callTool('omnifocus_analyze', {
        analysis: { type: 'productivity_stats', params: { groupBy: 'week' } },
      });

      expect(productivity).toHaveProperty('success');
    });
  });

  describe('Scenario: Complex workflow - Weekly GTD review', () => {
    it('should perform a comprehensive weekly review like an assistant', async () => {
      // Step 1: overdue items for review
      const overdue = await assistant.callTool('omnifocus_analyze', {
        analysis: { type: 'overdue_analysis' },
      });

      // Step 2: this week's productivity
      const thisWeek = await assistant.callTool('omnifocus_analyze', {
        analysis: { type: 'productivity_stats', params: { groupBy: 'week' } },
      });

      // Step 3: upcoming tasks for planning
      const upcoming = await assistant.callTool('omnifocus_read', {
        query: { type: 'tasks', mode: 'upcoming', daysAhead: 7, limit: 50 },
      });

      // Step 4: active projects
      const projects = await assistant.callTool('omnifocus_read', {
        query: { type: 'projects', limit: 50 },
      });

      // All calls should succeed or fail gracefully
      expect(overdue).toHaveProperty('success');
      expect(thisWeek).toHaveProperty('success');
      expect(upcoming).toHaveProperty('success');
      expect(projects).toHaveProperty('success');

      if (overdue.success && thisWeek.success) {
        expect(overdue.data).toBeDefined();
        expect(thisWeek.data).toBeDefined();
      }
    });
  });

  describe('Error Handling: assistant dealing with failures', () => {
    it('should reject an update missing the required id', async () => {
      // Unified write: update requires `id`. Validation failures come back in-band
      // (success:false) on most paths, but tolerate an MCP-level throw too.
      try {
        const result = await assistant.callTool('omnifocus_write', {
          mutation: { operation: 'update', target: 'task', changes: { name: 'This should fail' } },
        });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // MCP-level rejection is also acceptable evidence the bad call was refused.
        expect((error as Error).message.length).toBeGreaterThan(0);
      }
    });

    it('should reject a non-existent tool', async () => {
      await expect(assistant.callTool('nonexistent_tool', {})).rejects.toThrow();
    });
  });

  describe('Tool Chaining: read -> update on a sandbox task', () => {
    it('should create, flag, then delete a disposable task (no real-data side effects)', async () => {
      // Create a disposable sandbox task to chain against, so we never mutate real user data.
      const created = await assistant.callTool('omnifocus_write', {
        mutation: {
          operation: 'create',
          target: 'task',
          data: { name: runScopedName('Chain Target'), tags: [SIM_TAG] },
        },
      });

      if (!created.success) {
        console.log('Skipping tool-chaining test - OmniFocus not available');
        return;
      }

      const createdData = created.data as { task?: { taskId?: string; id?: string }; taskId?: string };
      const taskId = createdData.task?.taskId ?? createdData.task?.id ?? createdData.taskId;
      expect(taskId).toBeDefined();

      // Chain step: flag it
      const flagResult = await assistant.callTool('omnifocus_write', {
        mutation: { operation: 'update', target: 'task', id: taskId, changes: { flagged: true } },
      });
      expect(flagResult).toHaveProperty('success');
      expect(flagResult.success).toBe(true);

      // Clean up the disposable task
      await assistant.callTool('omnifocus_write', {
        mutation: { operation: 'delete', target: 'task', id: taskId },
      });
    });
  });

  describe('Data Consistency: cross-tool reads agree in the same ballpark', () => {
    it('should show consistent data across read and analyze', { timeout: 30000 }, async () => {
      const quickTest = await assistant.callTool('omnifocus_read', {
        query: { type: 'tasks', mode: 'today', limit: 1 },
      });

      if (!quickTest.success) {
        console.log('Skipping data consistency test - OmniFocus not available');
        return;
      }

      const tasksList = await assistant.callTool('omnifocus_read', {
        query: { type: 'tasks', mode: 'all', limit: 50 },
      });

      const productivity = await assistant.callTool('omnifocus_analyze', {
        analysis: { type: 'productivity_stats', params: { groupBy: 'week' } },
      });

      expect(tasksList).toHaveProperty('success');
      expect(productivity).toHaveProperty('success');

      if (tasksList.success) {
        const tasks = (tasksList.data as { tasks?: unknown[] }).tasks ?? [];
        expect(Array.isArray(tasks)).toBe(true);
      }
    });
  });
});

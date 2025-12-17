/**
 * TEST WRITE CLIENT
 *
 * High-level helper for integration tests that wraps MCP calls
 * with sandbox enforcement and automatic tracking for cleanup.
 *
 * Usage:
 *   let client: TestWriteClient;
 *
 *   beforeAll(async () => {
 *     client = new TestWriteClient();
 *     await client.ensureSandbox();
 *   });
 *
 *   afterAll(async () => {
 *     await client.cleanup();
 *   });
 *
 *   it('should create a task', async () => {
 *     const project = await client.createTestProject('My Test');
 *     const task = await client.createTestTask('Do something', project.id);
 *     // ... assertions
 *   });
 *
 * @see docs/plans/2025-12-11-test-sandbox-design.md
 */

import { MCPTestClient, MCPTestClientOptions } from './mcp-test-client.js';
import {
  SANDBOX_FOLDER_NAME,
  TEST_TAG_PREFIX,
  TEST_INBOX_PREFIX,
  ensureSandboxFolder,
  fullCleanup,
  type CleanupReport,
} from './sandbox-manager.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectOptions {
  note?: string;
  dueDate?: string;
  deferDate?: string;
  flagged?: boolean;
  sequential?: boolean;
  tags?: string[];
}

export interface TaskOptions {
  note?: string;
  dueDate?: string;
  deferDate?: string;
  plannedDate?: string;
  flagged?: boolean;
  estimatedMinutes?: number;
  tags?: string[];
  parentTaskId?: string;
}

export interface TestProject {
  id: string;
  name: string;
}

export interface TestTask {
  id: string;
  name: string;
  projectId?: string;
}

export interface TestTag {
  name: string;
}

// =============================================================================
// TEST WRITE CLIENT
// =============================================================================

/**
 * TestWriteClient wraps MCPTestClient with sandbox-aware helpers.
 * All created items are tracked for cleanup.
 */
export class TestWriteClient {
  private mcpClient: MCPTestClient;
  private sandboxFolderId: string | null = null;
  private createdProjectIds: string[] = [];
  private createdTaskIds: string[] = [];
  private createdTagNames: string[] = [];
  private isInitialized = false;

  constructor(options: MCPTestClientOptions = {}) {
    this.mcpClient = new MCPTestClient(options);
  }

  /**
   * Initialize the client and ensure sandbox folder exists.
   * Must be called before any other operations.
   */
  async ensureSandbox(): Promise<string> {
    if (!this.isInitialized) {
      await this.mcpClient.startServer();
      this.isInitialized = true;
    }

    if (!this.sandboxFolderId) {
      this.sandboxFolderId = await ensureSandboxFolder();
    }

    return this.sandboxFolderId;
  }

  /**
   * Get the underlying MCP client for direct tool calls if needed.
   */
  getMCPClient(): MCPTestClient {
    return this.mcpClient;
  }

  /**
   * Create a project inside the sandbox folder.
   * All test tags are automatically prefixed with __test-.
   */
  async createTestProject(name: string, options: ProjectOptions = {}): Promise<TestProject> {
    if (!this.sandboxFolderId) {
      throw new Error('Sandbox not initialized. Call ensureSandbox() first.');
    }

    // Transform tags to have __test- prefix
    const tags = options.tags?.map((t) => this.ensureTestTagPrefix(t)) || [];

    const result = await this.mcpClient.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'project',
        data: {
          name,
          folder: SANDBOX_FOLDER_NAME,
          note: options.note,
          dueDate: options.dueDate,
          deferDate: options.deferDate,
          flagged: options.flagged,
          sequential: options.sequential,
          tags: tags.length > 0 ? tags : undefined,
        },
      },
    });

    if (!result.success) {
      throw new Error(`Failed to create project: ${result.error?.message || 'Unknown error'}`);
    }

    const projectId = result.data?.project?.project?.id;
    if (!projectId) {
      throw new Error('Project created but no ID returned');
    }

    this.createdProjectIds.push(projectId);

    // Track any created tags
    tags.forEach((t) => {
      if (!this.createdTagNames.includes(t)) {
        this.createdTagNames.push(t);
      }
    });

    return {
      id: projectId,
      name,
    };
  }

  /**
   * Create a task in a project (must be in sandbox).
   * All test tags are automatically prefixed with __test-.
   */
  async createTestTask(name: string, projectId: string, options: TaskOptions = {}): Promise<TestTask> {
    if (!this.sandboxFolderId) {
      throw new Error('Sandbox not initialized. Call ensureSandbox() first.');
    }

    // Verify project is in our tracked projects (created via this client)
    if (!this.createdProjectIds.includes(projectId)) {
      throw new Error(`Project ${projectId} was not created via TestWriteClient. ` + 'Use createTestProject() first.');
    }

    // Transform tags to have __test- prefix
    const tags = options.tags?.map((t) => this.ensureTestTagPrefix(t)) || [];

    const result = await this.mcpClient.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name,
          project: projectId,
          note: options.note,
          dueDate: options.dueDate,
          deferDate: options.deferDate,
          plannedDate: options.plannedDate,
          flagged: options.flagged,
          estimatedMinutes: options.estimatedMinutes,
          parentTaskId: options.parentTaskId,
          tags: tags.length > 0 ? tags : undefined,
        },
      },
    });

    if (!result.success) {
      throw new Error(`Failed to create task: ${result.error?.message || 'Unknown error'}`);
    }

    const taskId = result.data?.task?.taskId;
    if (!taskId) {
      throw new Error('Task created but no ID returned');
    }

    this.createdTaskIds.push(taskId);

    // Track any created tags
    tags.forEach((t) => {
      if (!this.createdTagNames.includes(t)) {
        this.createdTagNames.push(t);
      }
    });

    return {
      id: taskId,
      name,
      projectId,
    };
  }

  /**
   * Create an inbox task.
   * Name must start with __TEST__ prefix (enforced).
   * All test tags are automatically prefixed with __test-.
   */
  async createInboxTask(name: string, options: TaskOptions = {}): Promise<TestTask> {
    if (!this.sandboxFolderId) {
      throw new Error('Sandbox not initialized. Call ensureSandbox() first.');
    }

    // Enforce __TEST__ prefix for inbox tasks
    const taskName = name.startsWith(TEST_INBOX_PREFIX) ? name : `${TEST_INBOX_PREFIX} ${name}`;

    // Transform tags to have __test- prefix
    const tags = options.tags?.map((t) => this.ensureTestTagPrefix(t)) || [];

    const result = await this.mcpClient.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: taskName,
          project: null, // Inbox
          note: options.note,
          dueDate: options.dueDate,
          deferDate: options.deferDate,
          plannedDate: options.plannedDate,
          flagged: options.flagged,
          estimatedMinutes: options.estimatedMinutes,
          tags: tags.length > 0 ? tags : undefined,
        },
      },
    });

    if (!result.success) {
      throw new Error(`Failed to create inbox task: ${result.error?.message || 'Unknown error'}`);
    }

    const taskId = result.data?.task?.taskId;
    if (!taskId) {
      throw new Error('Task created but no ID returned');
    }

    this.createdTaskIds.push(taskId);

    // Track any created tags
    tags.forEach((t) => {
      if (!this.createdTagNames.includes(t)) {
        this.createdTagNames.push(t);
      }
    });

    return {
      id: taskId,
      name: taskName,
    };
  }

  /**
   * Create a tag with __test- prefix.
   * Prefix is added automatically if not present.
   */
  async createTestTag(name: string): Promise<TestTag> {
    const tagName = this.ensureTestTagPrefix(name);

    // Tags are created implicitly when used in task/project creation,
    // but we track them for cleanup
    if (!this.createdTagNames.includes(tagName)) {
      this.createdTagNames.push(tagName);
    }

    return { name: tagName };
  }

  /**
   * Update a task (must be tracked by this client).
   */
  async updateTask(taskId: string, changes: Partial<TaskOptions> & { name?: string }): Promise<void> {
    if (!this.createdTaskIds.includes(taskId)) {
      throw new Error(`Task ${taskId} was not created via TestWriteClient. ` + 'Cannot update tasks outside sandbox.');
    }

    // Transform tags to have __test- prefix
    const processedChanges: Record<string, unknown> = { ...changes };
    if (changes.tags) {
      processedChanges.tags = changes.tags.map((t) => this.ensureTestTagPrefix(t));
    }

    const result = await this.mcpClient.callTool('omnifocus_write', {
      mutation: {
        operation: 'update',
        target: 'task',
        id: taskId,
        changes: processedChanges,
      },
    });

    if (!result.success) {
      throw new Error(`Failed to update task: ${result.error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Complete a task (must be tracked by this client).
   */
  async completeTask(taskId: string): Promise<void> {
    if (!this.createdTaskIds.includes(taskId)) {
      throw new Error(
        `Task ${taskId} was not created via TestWriteClient. ` + 'Cannot complete tasks outside sandbox.',
      );
    }

    const result = await this.mcpClient.callTool('omnifocus_write', {
      mutation: {
        operation: 'complete',
        target: 'task',
        id: taskId,
      },
    });

    if (!result.success) {
      throw new Error(`Failed to complete task: ${result.error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Delete a task (must be tracked by this client).
   */
  async deleteTask(taskId: string): Promise<void> {
    if (!this.createdTaskIds.includes(taskId)) {
      throw new Error(`Task ${taskId} was not created via TestWriteClient. ` + 'Cannot delete tasks outside sandbox.');
    }

    const result = await this.mcpClient.callTool('omnifocus_write', {
      mutation: {
        operation: 'delete',
        target: 'task',
        id: taskId,
      },
    });

    if (!result.success) {
      throw new Error(`Failed to delete task: ${result.error?.message || 'Unknown error'}`);
    }

    // Remove from tracking
    this.createdTaskIds = this.createdTaskIds.filter((id) => id !== taskId);
  }

  /**
   * Full cleanup: delete all tracked items + sweep sandbox.
   * Call this in afterAll().
   */
  async cleanup(): Promise<CleanupReport> {
    const report = await fullCleanup();

    // Reset tracking
    this.createdProjectIds = [];
    this.createdTaskIds = [];
    this.createdTagNames = [];
    this.sandboxFolderId = null;

    // Stop the MCP server
    await this.mcpClient.stop();
    this.isInitialized = false;

    return report;
  }

  /**
   * Quick cleanup: just delete tracked items (faster, for afterEach).
   */
  async quickCleanup(): Promise<void> {
    // Delete tracked tasks via bulk_delete
    if (this.createdTaskIds.length > 0) {
      try {
        await this.mcpClient.callTool('omnifocus_write', {
          mutation: {
            operation: 'bulk_delete',
            target: 'task',
            ids: this.createdTaskIds,
          },
        });
      } catch (error) {
        // Log but don't throw - cleanup should be best-effort
        console.warn(`Quick cleanup warning (tasks): ${error}`);
      }
      this.createdTaskIds = [];
    }

    // Delete tracked projects via bulk_delete
    if (this.createdProjectIds.length > 0) {
      try {
        await this.mcpClient.callTool('omnifocus_write', {
          mutation: {
            operation: 'bulk_delete',
            target: 'project',
            ids: this.createdProjectIds,
          },
        });
      } catch (error) {
        console.warn(`Quick cleanup warning (projects): ${error}`);
      }
      this.createdProjectIds = [];
    }

    // Note: We don't delete tags in quick cleanup - they're harmless
    // and will be cleaned up in full cleanup
  }

  /**
   * Ensure a tag name has the __test- prefix.
   */
  private ensureTestTagPrefix(name: string): string {
    if (name.startsWith(TEST_TAG_PREFIX)) {
      return name;
    }
    return `${TEST_TAG_PREFIX}${name}`;
  }

  /**
   * Get tracked project IDs (for debugging/inspection).
   */
  getTrackedProjectIds(): string[] {
    return [...this.createdProjectIds];
  }

  /**
   * Get tracked task IDs (for debugging/inspection).
   */
  getTrackedTaskIds(): string[] {
    return [...this.createdTaskIds];
  }

  /**
   * Get tracked tag names (for debugging/inspection).
   */
  getTrackedTagNames(): string[] {
    return [...this.createdTagNames];
  }
}

// Re-export constants for convenience
export { SANDBOX_FOLDER_NAME, TEST_TAG_PREFIX, TEST_INBOX_PREFIX };

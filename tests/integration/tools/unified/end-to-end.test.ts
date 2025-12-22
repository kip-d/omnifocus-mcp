import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

describe('Unified Tools End-to-End Integration', () => {
  let serverProcess: ChildProcess;
  let serverReady = false;

  // Helper to send JSON-RPC request and get response
  async function sendRequest(request: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      let response = '';
      let errorOutput = '';

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout after 120s'));
      }, 120000);

      const onData = (data: Buffer) => {
        response += data.toString();
        // Try to parse complete JSON response
        const lines = response.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.jsonrpc === '2.0' && 'result' in parsed) {
                clearTimeout(timeout);
                serverProcess.stdout?.off('data', onData);
                serverProcess.stderr?.off('data', onError);
                resolve(parsed.result);
                return;
              }
              if (parsed.jsonrpc === '2.0' && 'error' in parsed) {
                clearTimeout(timeout);
                serverProcess.stdout?.off('data', onData);
                serverProcess.stderr?.off('data', onError);
                reject(new Error(`MCP error: ${JSON.stringify(parsed.error)}`));
                return;
              }
            } catch (e) {
              // Not valid JSON yet, continue collecting
            }
          }
        }
      };

      const onError = (data: Buffer) => {
        errorOutput += data.toString();
      };

      serverProcess.stdout?.on('data', onData);
      serverProcess.stderr?.on('data', onError);

      // Send request
      serverProcess.stdin?.write(requestStr);
    });
  }

  beforeAll(async () => {
    // Start MCP server
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Wait for server to be ready (send initialize)
    const initResult = await sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'test',
          version: '1.0.0',
        },
      },
    });

    expect(initResult).toBeDefined();
    serverReady = true;
  }, 30000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  describe('omnifocus_read', () => {
    it('should query inbox tasks', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'tasks',
              filters: {
                project: null, // Inbox
              },
              limit: 5,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      expect(content).toBeInstanceOf(Array);
      expect(content.length).toBeGreaterThan(0);

      // Parse the text response
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);

    it('should query tasks with filters', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'tasks',
              filters: {
                flagged: true,
              },
              limit: 10,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);

    it('should list all projects', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'projects',
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);

    it('should list all tags', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'tags',
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);

    it('should return count-only for active tasks (33x faster optimization)', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'tasks',
              filters: {
                status: 'active',
              },
              countOnly: true,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);

      // Verify success
      expect(parsed).toHaveProperty('success');
      expect(parsed.success).toBe(true);

      // Verify metadata includes count and optimization flag
      expect(parsed.metadata).toHaveProperty('total_count');
      expect(parsed.metadata).toHaveProperty('count_only', true);
      expect(parsed.metadata).toHaveProperty('optimization', 'ast_omnijs_bridge');
      expect(typeof parsed.metadata.total_count).toBe('number');

      // Verify no task data returned (just count in metadata)
      if (parsed.data?.tasks) {
        expect(parsed.data.tasks.length).toBe(0);
      }
    }, 60000);

    it('should return count-only for flagged tasks', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'tasks',
              filters: {
                flagged: true,
              },
              countOnly: true,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);

      // Verify success
      expect(parsed).toHaveProperty('success');
      expect(parsed.success).toBe(true);

      // Verify count metadata
      expect(parsed.metadata).toHaveProperty('total_count');
      expect(parsed.metadata.count_only).toBe(true);
      expect(typeof parsed.metadata.total_count).toBe('number');
    }, 120000);
  });

  describe('omnifocus_write', () => {
    let createdTaskId: string;

    it('should create a new task', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'omnifocus_write',
          arguments: {
            mutation: {
              operation: 'create',
              target: 'task',
              data: {
                name: '__TEST__ E2E Test Task - Builder API',
                note: 'Created by unified builder API end-to-end test',
                flagged: true,
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
      if (!parsed.success) {
        console.error('Create task failed:', JSON.stringify(parsed.error, null, 2));
      }
      expect(parsed.success).toBe(true);

      // Extract task ID for subsequent tests
      if (parsed.data?.task?.taskId) {
        createdTaskId = parsed.data.task.taskId;
      } else if (parsed.data?.taskId) {
        createdTaskId = parsed.data.taskId;
      }
      expect(createdTaskId).toBeDefined();
    }, 60000);

    it('should update the created task', async () => {
      if (!createdTaskId) {
        console.warn('Skipping update test - no task ID from create');
        return;
      }

      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'omnifocus_write',
          arguments: {
            mutation: {
              operation: 'update',
              target: 'task',
              id: createdTaskId,
              changes: {
                note: 'Updated by builder API',
                flagged: false,
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
      expect(parsed.success).toBe(true);
    }, 60000);

    it('should complete the task', async () => {
      if (!createdTaskId) {
        console.warn('Skipping complete test - no task ID');
        return;
      }

      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'omnifocus_write',
          arguments: {
            mutation: {
              operation: 'complete',
              target: 'task',
              id: createdTaskId,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
      expect(parsed.success).toBe(true);
    }, 60000);

    it('should delete the completed task', async () => {
      if (!createdTaskId) {
        console.warn('Skipping delete test - no task ID');
        return;
      }

      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'omnifocus_write',
          arguments: {
            mutation: {
              operation: 'delete',
              target: 'task',
              id: createdTaskId,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
      expect(parsed.success).toBe(true);
    }, 60000);
  });

  describe('omnifocus_analyze', () => {
    it('should analyze productivity stats', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'omnifocus_analyze',
          arguments: {
            analysis: {
              type: 'productivity_stats',
              params: {
                groupBy: 'week',
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);

    it('should parse meeting notes', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'omnifocus_analyze',
          arguments: {
            analysis: {
              type: 'parse_meeting_notes',
              params: {
                text: 'Follow up with Sarah tomorrow about the project. Call Bob on Friday.',
                extractTasks: true,
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);
  });

  describe('OmniFocus 4.7+ Features', () => {
    describe('Planned Dates', () => {
      it('should create task with planned date', async () => {
        const result = await sendRequest({
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: '__TEST__ Task with Planned Date',
                  plannedDate: '2025-11-15 09:00',
                  tags: ['__test-e2e', '__test-planned-dates'],
                },
              },
            },
          },
        });

        expect(result).toBeDefined();
        expect(result).toHaveProperty('content');
        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const responseText = content[0].text;
        const parsed = JSON.parse(responseText);
        expect(parsed.success).toBe(true);
        expect(parsed.data?.task?.taskId).toBeDefined();
      }, 60000);

      it('should update task with new planned date', async () => {
        // Create task
        const createResult = await sendRequest({
          jsonrpc: '2.0',
          id: 13,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: '__TEST__ Task to Update Planned Date',
                  plannedDate: '2025-11-15',
                  tags: ['__test-e2e', '__test-planned-update'],
                },
              },
            },
          },
        });

        const createContent = (createResult as { content: Array<{ type: string; text: string }> }).content;
        const createParsed = JSON.parse(createContent[0].text);
        const taskId = createParsed.data?.task?.taskId;
        expect(taskId).toBeDefined();

        // Update planned date
        const updateResult = await sendRequest({
          jsonrpc: '2.0',
          id: 14,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'update',
                target: 'task',
                id: taskId,
                changes: {
                  plannedDate: '2025-12-01 10:30',
                },
              },
            },
          },
        });

        const updateContent = (updateResult as { content: Array<{ type: string; text: string }> }).content;
        const updateParsed = JSON.parse(updateContent[0].text);
        expect(updateParsed.success).toBe(true);
      }, 60000);

      it('should clear planned date when set to null', async () => {
        // Create task with planned date
        const createResult = await sendRequest({
          jsonrpc: '2.0',
          id: 15,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: '__TEST__ Task to Clear Planned Date',
                  plannedDate: '2025-11-15',
                  tags: ['__test-e2e', '__test-clear-planned'],
                },
              },
            },
          },
        });

        const createContent = (createResult as { content: Array<{ type: string; text: string }> }).content;
        const createParsed = JSON.parse(createContent[0].text);
        const taskId = createParsed.data?.task?.taskId;

        // Clear planned date
        const updateResult = await sendRequest({
          jsonrpc: '2.0',
          id: 16,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'update',
                target: 'task',
                id: taskId,
                changes: {
                  plannedDate: null,
                },
              },
            },
          },
        });

        const updateContent = (updateResult as { content: Array<{ type: string; text: string }> }).content;
        const updateParsed = JSON.parse(updateContent[0].text);
        expect(updateParsed.success).toBe(true);
      }, 60000);
    });

    describe('Enhanced Repeats', () => {
      it('should create task with daily repeat rule', async () => {
        const result = await sendRequest({
          jsonrpc: '2.0',
          id: 17,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: '__TEST__ Daily Standup',
                  dueDate: '2025-11-17 09:00',
                  repetitionRule: {
                    frequency: 'daily',
                    interval: 1,
                  },
                  tags: ['__test-e2e', '__test-repeats'],
                },
              },
            },
          },
        });

        expect(result).toBeDefined();
        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const parsed = JSON.parse(content[0].text);
        expect(parsed.success).toBe(true);
        expect(parsed.data?.task?.taskId).toBeDefined();
      }, 60000);

      it('should create task with weekly repeat rule', async () => {
        const result = await sendRequest({
          jsonrpc: '2.0',
          id: 18,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: '__TEST__ Weekly Review',
                  dueDate: '2025-11-17',
                  repetitionRule: {
                    frequency: 'weekly',
                    interval: 1,
                    daysOfWeek: [1], // Monday
                  },
                  tags: ['__test-e2e', '__test-weekly-repeat'],
                },
              },
            },
          },
        });

        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const parsed = JSON.parse(content[0].text);
        expect(parsed.success).toBe(true);
      }, 60000);

      it('should create task with repeat rule and end date', async () => {
        const result = await sendRequest({
          jsonrpc: '2.0',
          id: 19,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: '__TEST__ Limited Repeat Task',
                  dueDate: '2025-11-17',
                  repetitionRule: {
                    frequency: 'daily',
                    interval: 2,
                    endDate: '2025-12-31',
                  },
                  tags: ['__test-e2e', '__test-limited-repeat'],
                },
              },
            },
          },
        });

        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const parsed = JSON.parse(content[0].text);
        expect(parsed.success).toBe(true);
      }, 60000);
    });

    describe('Version Detection', () => {
      it('should report version information in system tool', async () => {
        const result = await sendRequest({
          jsonrpc: '2.0',
          id: 20,
          method: 'tools/call',
          params: {
            name: 'system',
            arguments: {
              operation: 'version',
            },
          },
        });

        expect(result).toBeDefined();
        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const parsed = JSON.parse(content[0].text);
        expect(parsed.success).toBe(true);
        expect(parsed.metadata?.omnifocus_version).toBeDefined();
      }, 60000);
    });
  });
});

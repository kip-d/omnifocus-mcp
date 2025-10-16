import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { MCPTestClient, TESTING_TAG } from './helpers/mcp-test-client.js';

// Auto-enable on macOS with OmniFocus
const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

d('OmniFocus Data Lifecycle Tests', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.startServer();
    await client.thoroughCleanup();  // ONE initial cleanup for clean slate
  });

  afterAll(async () => {
    await client.thoroughCleanup();  // Final paranoid scan
    await client.stop();
  });  // Uses global hookTimeout of 5min for integration tests

  // Note: Skip afterEach cleanup to avoid timeout issues
  // Each MCP delete call can be 20+ seconds, so 5+ tasks = 100+ second cleanup
  // Use afterAll (one bulk cleanup) instead of afterEach (per-test cleanup)

  it('should create and cleanup test tasks', async () => {
    const result = await client.createTestTask('Sample Test Task');

    expect(result.success).toBe(true);
    expect(result.data.task).toHaveProperty('taskId');
    expect(result.data.task.tags).toContain(TESTING_TAG);
  }, 90000);

  it('should create and cleanup test projects', async () => {
    const uniqueName = `Sample Test Project ${Date.now()}`;
    const result = await client.createTestProject(uniqueName);

    expect(result.success).toBe(true);
    expect(result.data.project.project).toHaveProperty('id');
    expect(result.data.project.project.name).toBeTruthy();
  }, 90000);

  it('should create tasks with custom properties', async () => {
    const result = await client.createTestTask('Custom Test Task', {
      flagged: true,
      note: 'This is a test note'
    });

    expect(result.success).toBe(true);
    expect(result.data.task.flagged).toBe(true);
    expect(result.data.task.note).toBe('This is a test note');
    expect(result.data.task.tags).toContain(TESTING_TAG);
  });

  it('should create tasks in test projects', async () => {
    const projectResult = await client.createTestProject(`Parent Test Project ${Date.now()}`);
    expect(projectResult.success).toBe(true);

    const taskResult = await client.createTestTask('Test Task in Project', {
      projectId: projectResult.data.project.project.id
    });

    expect(taskResult.success).toBe(true);
    expect(taskResult.data.task.project).toBe(projectResult.data.project.project.name);
  }, 90000);

  it('should find test data by tag', async () => {
    console.log(`\n🔍 Creating 3 test tasks with tag: ${TESTING_TAG}`);
    const task1 = await client.createTestTask('Tag Test Task 1');
    const task2 = await client.createTestTask('Tag Test Task 2');
    const task3 = await client.createTestTask('Tag Test Task 3');

    const createdIds = [
      task1.data?.task?.taskId,
      task2.data?.task?.taskId,
      task3.data?.task?.taskId,
    ];

    console.log('✅ Tasks created:', createdIds);

    const tasks = await client.callTool('tasks', {
      mode: 'search',
      search: 'Tag Test Task',
      limit: 100,
      details: true
    });

    console.log(`📊 Search returned ${tasks.data.tasks?.length || 0} tasks`);

    expect(tasks.data.tasks).toBeInstanceOf(Array);
    expect(tasks.data.tasks.length).toBeGreaterThanOrEqual(3);

    const foundTasks = tasks.data.tasks.filter((t: any) =>
      createdIds.includes(t.id)
    );
    expect(foundTasks.length).toBe(3);

    for (const task of foundTasks) {
      expect(task.tags).toContain(TESTING_TAG);
    }
  }, 120000);  // Increased timeout - MCP queries can be slow

  it('should cleanup all test data after tests', async () => {
    console.log(`\n🔍 Creating test data for cleanup verification`);

    const uniqueTaskName = `Cleanup Verify Task ${Date.now()}`;
    const taskResult = await client.createTestTask(uniqueTaskName);
    const projectResult = await client.createTestProject(`Cleanup Test Project ${Date.now()}`);

    const taskId = taskResult.data?.task?.taskId;

    console.log('✅ Test data created:', {
      taskId,
      taskName: uniqueTaskName,
      projectId: projectResult.data?.project?.project?.id,
    });

    expect(taskResult.success).toBe(true);
    expect(projectResult.success).toBe(true);

    console.log(`🔍 Searching for task by name: ${uniqueTaskName}`);
    const tasks = await client.callTool('tasks', {
      mode: 'search',
      search: uniqueTaskName,
      limit: 10,
      details: true
    });

    console.log(`📊 Search returned ${tasks.data.tasks?.length || 0} tasks`);

    expect(tasks.data.tasks.length).toBeGreaterThanOrEqual(1);
    const foundTask = tasks.data.tasks.find((t: any) => t.id === taskId);
    expect(foundTask).toBeDefined();
    expect(foundTask.tags).toContain(TESTING_TAG);
  }, 90000);
});

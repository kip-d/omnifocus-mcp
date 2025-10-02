#!/usr/bin/env node
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const TEST_PROJECT_NAME = `MCP Integration ${Date.now()}`;
const PARENT_TASK_NAME = `MCP Parent ${Date.now()}`;
const CHILD_TASK_NAME = `MCP Child ${Date.now()}`;
const TEST_TAG_NAME = 'IntegrationTag';
const INVALID_TASK_ID = 'invalid-task-id-for-error-check';

let cleanupDone = false;
let requestId = 1;
let testProjectId = null;
let parentTaskId = null;
let childTaskId = null;
let todayTaskVerified = false;
let parentChildVerified = false;

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity,
});

const failAndExit = (message) => {
  console.error(`\n❌ Integration test failed: ${message}`);
  cleanup(1);
};

const cleanup = (code = 0) => {
  if (cleanupDone) return;
  cleanupDone = true;

  // Remove the unexpected exit listener since we're now handling exit ourselves
  server.removeAllListeners('exit');

  // Close stdin to signal graceful shutdown per MCP spec
  try {
    server.stdin.end();
  } catch (e) {}

  // Wait for server to exit gracefully (it will wait for pending operations)
  const gracefulExitTimeout = setTimeout(() => {
    console.log('⚠️  Server did not exit gracefully within 5s, sending SIGTERM...');
    server.kill('SIGTERM');

    // Last resort: force kill after another 2s
    setTimeout(() => {
      if (!server.killed) {
        console.log('⚠️  Server did not respond to SIGTERM, sending SIGKILL...');
        server.kill('SIGKILL');
      }
      process.exit(code);
    }, 2000);
  }, 5000);

  // If server exits naturally, clear the timeout and exit
  server.once('exit', (exitCode) => {
    clearTimeout(gracefulExitTimeout);
    if (exitCode === 0) {
      process.exit(code);
    } else {
      console.error(`⚠️  Server exited with code ${exitCode}`);
      process.exit(code || exitCode);
    }
  });
};

const parsePayload = (response) => {
  if (!response?.result?.content || response.result.content.length === 0) return null;
  const [first] = response.result.content;
  if (!first) return null;
  if (first.type === 'json') return first.json;
  if (first.type === 'text') {
    try {
      return JSON.parse(first.text);
    } catch (e) {
      return null;
    }
  }
  return null;
};

const sendRequest = (method, params = {}) => {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId++,
  };

  console.log(`→ Sending: ${method}`);
  server.stdin.write(JSON.stringify(request) + '\n');
};

const sendToolCall = (name, args = {}) => {
  sendRequest('tools/call', {
    name,
    arguments: args,
  });
};

const ensureSuccess = (payload, context) => {
  if (!payload) {
    failAndExit(`${context}: empty payload`);
    return false;
  }
  if (payload.success === false) {
    const message = payload?.error?.message || 'Unknown error';
    failAndExit(`${context}: ${message}`);
    return false;
  }
  return true;
};

const extractTaskId = (task) => {
  if (!task) return null;
  return task.taskId || task.id || null;
};

rl.on('line', (line) => {
  let response;
  try {
    response = JSON.parse(line);
  } catch (e) {
    return; // Ignore non-JSON output
  }

  console.log(`← Response for ${response.id}:`, JSON.stringify(response, null, 2));

  switch (response.id) {
    case 1: {
      // initialize -> list tools
      sendRequest('tools/list');
      break;
    }

    case 2: {
      // After tool listing, create a dedicated test project
      if (!response?.result?.tools || !Array.isArray(response.result.tools) || response.result.tools.length === 0) {
        failAndExit('tools/list returned empty payload');
        return;
      }
      sendToolCall('projects', {
        operation: 'create',
        name: TEST_PROJECT_NAME,
        note: 'Integration test project created automatically',
      });
      break;
    }

    case 3: {
      const payload = parsePayload(response);
      if (!ensureSuccess(payload, 'Project creation')) return;
      const projectContainer = payload.data?.project;
      const project = projectContainer?.project || projectContainer;
      testProjectId = project?.id || project?.projectId || null;
      if (!testProjectId) {
        failAndExit('Could not determine created project ID');
        return;
      }

      sendToolCall('manage_task', {
        operation: 'create',
        name: PARENT_TASK_NAME,
        projectId: testProjectId,
      });
      break;
    }

    case 4: {
      const payload = parsePayload(response);
      if (!ensureSuccess(payload, 'Parent task creation')) return;
      const task = payload.data?.task || payload.data;
      parentTaskId = extractTaskId(task);
      if (!parentTaskId) {
        failAndExit('Could not determine parent task ID');
        return;
      }

      sendToolCall('manage_task', {
        operation: 'create',
        name: CHILD_TASK_NAME,
        projectId: testProjectId,
        parentTaskId,
      });
      break;
    }

    case 5: {
      const payload = parsePayload(response);
      if (!ensureSuccess(payload, 'Child task creation')) return;
      const task = payload.data?.task || payload.data;
      childTaskId = extractTaskId(task);
      if (!childTaskId) {
        failAndExit('Could not determine child task ID');
        return;
      }

      // Attempt update with invalid ID to verify error propagation
      sendToolCall('manage_task', {
        operation: 'update',
        taskId: INVALID_TASK_ID,
        name: 'This should fail',
      });
      break;
    }

    case 6: {
      const payload = parsePayload(response);
      if (!payload || payload.success !== false) {
        failAndExit('Invalid task update did not return an error');
        return;
      }
      if (payload.error?.code !== 'SCRIPT_ERROR') {
        failAndExit(`Expected SCRIPT_ERROR for invalid task update, got ${payload.error?.code}`);
        return;
      }

      const today = new Date();
      const dueDate = today.toISOString().slice(0, 10);
      sendToolCall('manage_task', {
        operation: 'update',
        taskId: childTaskId,
        dueDate,
        flagged: true,
        tags: [TEST_TAG_NAME],
      });
      break;
    }

    case 7: {
      const payload = parsePayload(response);
      if (!ensureSuccess(payload, 'Child task tagging/due update')) return;

      // Query today tasks without details to verify tags surface
      sendToolCall('tasks', {
        mode: 'today',
        limit: 25,
        details: false,
      });
      break;
    }

    case 8: {
      const payload = parsePayload(response);
      if (!ensureSuccess(payload, 'Today task query')) return;
      const tasks = payload.data?.tasks || [];
      const hasTags = tasks.some(t => Array.isArray(t.tags) && t.tags.length > 0);
      if (!hasTags) {
        failAndExit('Today view returned without tag data');
        return;
      }
      todayTaskVerified = true;

      // Query project-specific tasks to inspect parent linkage and confirm our task update
      sendToolCall('tasks', {
        mode: 'all',
        project: TEST_PROJECT_NAME,
        limit: 10,
        details: true,
      });
      break;
    }

    case 9: {
      const payload = parsePayload(response);
      if (!ensureSuccess(payload, 'Project task query')) return;
      const tasks = payload.data?.tasks || [];
      const match = tasks.find(t => t.id === childTaskId || t.name === CHILD_TASK_NAME);
      if (!match) {
        failAndExit('Child task not returned in project results');
        return;
      }

      const parentEntry = tasks.find(t => t.id === parentTaskId || t.name === PARENT_TASK_NAME);
      const childCounts = parentEntry && typeof parentEntry === 'object'
        ? parentEntry.childCounts
        : undefined;
      if (!parentEntry || !childCounts || (childCounts.total ?? 0) < 1) {
        failAndExit('Parent task does not reflect child membership');
        return;
      }

      if (match.flagged !== true) {
        failAndExit('Updated child task is not flagged as expected');
        return;
      }
      parentChildVerified = true;

      // Cleanup child task first
      sendToolCall('manage_task', {
        operation: 'delete',
        taskId: childTaskId,
      });
      break;
    }

    case 10: {
      const payload = parsePayload(response);
      if (!ensureSuccess(payload, 'Child task deletion')) return;

      // Delete parent task
      sendToolCall('manage_task', {
        operation: 'delete',
        taskId: parentTaskId,
      });
      break;
    }

    case 11: {
      const payload = parsePayload(response);
      if (!ensureSuccess(payload, 'Parent task deletion')) return;

      // Delete project (cleanup)
      sendToolCall('projects', {
        operation: 'delete',
        projectId: testProjectId,
      });
      break;
    }

    case 12: {
      const payload = parsePayload(response);
      if (!ensureSuccess(payload, 'Project deletion')) return;

      if (!todayTaskVerified || !parentChildVerified) {
        failAndExit('One or more validation checks did not complete');
        return;
      }

      console.log('\n✅ Integration validations completed successfully!');
      cleanup(0);
      break;
    }

    default:
      break;
  }
});

server.on('error', (err) => {
  failAndExit(`Server process error: ${err.message}`);
});

// Handle unexpected server exits during the test
// (Normal exit after cleanup is handled in the cleanup function)
server.on('exit', (code) => {
  if (!cleanupDone) {
    failAndExit(`Server exited unexpectedly with code ${code}`);
  }
});

// Start handshake
sendRequest('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: {
    name: 'mcp-integration-test',
    version: '2.1.0',
  },
});

// Guard against hang
setTimeout(() => {
  failAndExit('Integration test timed out');
}, 30000);

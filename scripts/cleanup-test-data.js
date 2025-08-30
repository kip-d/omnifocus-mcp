#!/usr/bin/env node

/**
 * Cleanup script for MCP testing data
 * Removes all tasks and projects tagged with "MCP testing 2357"
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const TESTING_TAG = 'MCP testing 2357';

class TestDataCleanup {
  constructor() {
    this.server = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
  }

  async startServer() {
    console.log('🚀 Starting MCP server for cleanup...');
    
    this.server = spawn('node', ['./dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    const rl = createInterface({
      input: this.server.stdout,
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        this.handleResponse(response);
      } catch (e) {
        // Ignore non-JSON output
      }
    });

    // Initialize MCP connection
    const initRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'cleanup-script',
          version: '1.0.0'
        }
      }
    };

    const initResponse = await this.sendRequest(initRequest);
    
    if (!initResponse.result) {
      throw new Error('Failed to initialize MCP connection');
    }

    // Send initialized notification
    this.server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');
    
    await this.delay(100);
    console.log('✅ MCP server connected');
  }

  async callTool(toolName, params = {}) {
    const request = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };

    const response = await this.sendRequest(request);
    
    if (response.error) {
      throw new Error(`Tool error: ${response.error.message}`);
    }

    try {
      const content = response.result.content[0].text;
      return JSON.parse(content);
    } catch (e) {
      return response.result;
    }
  }

  async sendRequest(request, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const requestId = request.id;
      
      this.pendingRequests.set(requestId, resolve);
      this.server.stdin.write(JSON.stringify(request) + '\n');
      
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  handleResponse(response) {
    if (response.id && this.pendingRequests.has(response.id)) {
      const resolver = this.pendingRequests.get(response.id);
      this.pendingRequests.delete(response.id);
      resolver(response);
    }
  }

  nextId() {
    return ++this.messageId;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    console.log(`🧹 Cleaning up test data with tag: "${TESTING_TAG}"`);
    
    try {
      // Find all tasks with the testing tag
      const tasks = await this.callTool('list_tasks', {
        filter: { tags: [TESTING_TAG] }
      });
      
      console.log(`📋 Found ${tasks.tasks?.length || 0} test tasks to clean up`);
      
      // Delete each task
      for (const task of tasks.tasks || []) {
        try {
          await this.callTool('delete_task', { id: task.id });
          console.log(`  ✅ Deleted task: "${task.name}"`);
        } catch (e) {
          console.log(`  ❌ Failed to delete task "${task.name}": ${e.message}`);
        }
      }
      
      // Find all projects with the testing tag in the name
      const projects = await this.callTool('list_projects', {});
      const testProjects = projects.projects?.filter(project => 
        project.name.includes(TESTING_TAG)
      ) || [];
      
      console.log(`📁 Found ${testProjects.length} test projects to clean up`);
      
      // Delete each project
      for (const project of testProjects) {
        try {
          await this.callTool('delete_project', { id: project.id });
          console.log(`  ✅ Deleted project: "${project.name}"`);
        } catch (e) {
          console.log(`  ❌ Failed to delete project "${project.name}": ${e.message}`);
        }
      }
      
      console.log('🎉 Test data cleanup completed!');
      
    } catch (e) {
      console.error('❌ Error during cleanup:', e.message);
    }
  }

  async stop() {
    if (this.server && !this.server.killed) {
      this.server.kill();
      await this.delay(100);
    }
  }
}

async function main() {
  const cleanup = new TestDataCleanup();
  
  try {
    await cleanup.startServer();
    await cleanup.cleanup();
  } catch (e) {
    console.error('❌ Cleanup failed:', e.message);
    process.exit(1);
  } finally {
    await cleanup.stop();
  }
}

if (require.main === module) {
  main();
}

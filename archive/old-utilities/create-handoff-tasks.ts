#!/usr/bin/env node

// Create handoff tasks in OmniFocus for continuing work on another machine
import { OmniAutomation } from './dist/omnifocus/OmniAutomation.js';
import { CacheManager } from './dist/cache/CacheManager.js';
import { CreateTaskTool } from './dist/tools/tasks/CreateTaskTool.js';
import { CreateProjectTool } from './dist/tools/projects/CreateProjectTool.js';

async function createHandoffTasks() {
  const cache = new CacheManager();
  
  // First, create a project for the session handoff
  const projectTool = new CreateProjectTool(cache);
  
  try {
    console.log('Creating OmniFocus MCP Development project...');
    const projectResult = await projectTool.execute({
      name: 'OmniFocus MCP v1.9.2 Development',
      note: 'Continue development from SESSION_CONTEXT.md and TODO_NEXT_SESSION.md',
      sequential: true, // Do tasks in order
      status: 'active',
      folder: 'Work' // Adjust as needed
    });
    
    const projectId = projectResult.content?.id;
    console.log('Created project:', projectId);
    
    // Now create tasks in priority order
    const taskTool = new CreateTaskTool(cache);
    
    const tasks = [
      {
        name: 'Pull latest changes from GitHub',
        note: 'git pull on laptop to get SESSION_CONTEXT.md',
        tags: ['@Computer', '@Laptop'],
        projectId
      },
      {
        name: 'Read session context files',
        note: 'Read SESSION_CONTEXT.md and TODO_NEXT_SESSION.md in Claude Code',
        tags: ['@Computer', '@Laptop'],
        projectId
      },
      {
        name: 'Implement Project Review Settings',
        note: 'Add reviewInterval, reviewIntervalStep, nextReviewDate to create_project and update_project tools',
        tags: ['@Computer', '@HighEnergy', '@Development'],
        estimatedMinutes: 120,
        projectId
      },
      {
        name: 'Fix RepetitionRule JXA bug',
        note: 'Investigate workaround for create-project.ts:96 - RepetitionRule creation fails',
        tags: ['@Computer', '@Debugging', '@Development'],
        estimatedMinutes: 90,
        projectId
      },
      {
        name: 'Implement Task Recurrence',
        note: 'Add repetitionRule to create_task with frequency, interval, method support',
        tags: ['@Computer', '@Development'],
        estimatedMinutes: 120,
        projectId
      },
      {
        name: 'Test all changes with real OmniFocus',
        note: 'Run integration tests: npm run test:integration',
        tags: ['@Computer', '@Testing'],
        estimatedMinutes: 30,
        projectId
      },
      {
        name: 'Commit and push v1.9.2',
        note: 'Update CHANGELOG, bump version, git commit and push',
        tags: ['@Computer', '@QuickWin'],
        estimatedMinutes: 15,
        projectId
      }
    ];
    
    console.log('\nCreating development tasks...');
    for (const task of tasks) {
      const result = await taskTool.execute(task);
      console.log(`✓ Created: ${task.name}`);
    }
    
    console.log('\n✅ Successfully created project and tasks in OmniFocus!');
    console.log('You can now see these in OmniFocus on any synced device.');
    
  } catch (error) {
    console.error('Error creating tasks:', error);
  }
}

createHandoffTasks();
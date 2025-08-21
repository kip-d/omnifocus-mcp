#!/usr/bin/env node

// Quick script to create a handoff task
import { CreateTaskTool } from './dist/tools/tasks/CreateTaskTool.js';
import { CacheManager } from './dist/cache/CacheManager.js';

async function createHandoff() {
  const taskTool = new CreateTaskTool(new CacheManager());
  
  try {
    const result = await taskTool.execute({
      name: 'Continue OmniFocus MCP Development v1.9.2',
      note: `Priority tasks for next session:
1. Pull latest from GitHub (git pull)
2. Read SESSION_CONTEXT.md and TODO_NEXT_SESSION.md
3. Implement Project Review Settings (reviewInterval, nextReviewDate)
4. Fix RepetitionRule JXA bug (create-project.ts:96)
5. Test with real OmniFocus

Version: Currently on v1.9.1
Branch: main
Tests: 249 passing, 1 skipped`,
      tags: ['@Computer', '@Development', '@Laptop'],
      dueDate: '2025-08-10 17:00', // 5pm tomorrow
      flagged: true,
      estimatedMinutes: 240 // 4 hours of work
    });
    
    console.log('✅ Created handoff task in OmniFocus!');
    console.log('Task ID:', result.content?.id);
    console.log('\nThis task will sync to all your devices.');
    console.log('You\'ll see it flagged and due tomorrow.');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createHandoff().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
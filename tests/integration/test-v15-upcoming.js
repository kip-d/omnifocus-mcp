#!/usr/bin/env node

/**
 * Test v1.15.0 optimized upcoming tasks script
 */

import { execSync } from 'child_process';

console.log('Testing v1.15.0 optimized upcoming tasks script...\n');

const upcomingScript = `(() => {
  const app = Application("OmniFocus");
  const doc = app.defaultDocument();
  const days = 7;
  const includeToday = true;
  const limit = 10;
  
  try {
    const queryStartTime = Date.now();
    
    // Pre-calculate time boundaries as timestamps (faster comparisons)
    const nowTime = Date.now();
    const startTime = includeToday ? nowTime : nowTime + 86400000;
    const endTime = nowTime + days * 86400000;
    const dayMs = 86400000;
    
    // Get ALL tasks
    const allTasks = doc.flattenedTasks();
    const tasks = [];
    let processedCount = 0;
    
    // ULTRA-OPTIMIZED filtering loop
    const len = allTasks.length;
    for (let i = 0; i < len && tasks.length < limit; i++) {
      const task = allTasks[i];
      processedCount++;
      
      try {
        // Early exit - completed check
        if (task.completed()) continue;
        
        // Early exit - date check
        const dueDate = task.dueDate();
        if (!dueDate) continue;
        
        // Work with timestamps for faster comparisons
        const dueTime = dueDate.getTime ? dueDate.getTime() : new Date(dueDate).getTime();
        
        // Range check using timestamps only
        if (dueTime < startTime || dueTime > endTime) continue;
        
        // Only now gather the rest of the data
        const project = task.containingProject();
        
        tasks.push({
          id: task.id(),
          name: task.name(),
          dueDate: new Date(dueTime).toISOString(),
          flagged: task.flagged(),
          project: project ? project.name() : null,
          projectId: project ? project.id() : null,
          daysUntilDue: ((dueTime - nowTime) / dayMs) | 0,
          note: task.note() || null
        });
      } catch (e) {
        // Silently skip errored tasks
      }
    }
    
    const queryEndTime = Date.now();
    
    return JSON.stringify({
      success: true,
      tasks: tasks.length,
      processedCount: processedCount,
      queryTimeMs: queryEndTime - queryStartTime,
      version: "v1_15_0_ultra_optimized"
    });
    
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error.toString(),
      message: error.message
    });
  }
})();`;

try {
  console.log('Running optimized upcoming tasks query...');
  const startTime = Date.now();
  
  const result = execSync(`osascript -l JavaScript -e '${upcomingScript}'`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  
  const totalTime = Date.now() - startTime;
  const parsed = JSON.parse(result);
  
  if (parsed.success) {
    console.log('✅ v1.15.0 ultra-optimized script executed successfully!');
    console.log(`   Tasks found: ${parsed.tasks}`);
    console.log(`   Tasks scanned: ${parsed.processedCount}`);
    console.log(`   Query time: ${parsed.queryTimeMs}ms`);
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Version: ${parsed.version}`);
    
    if (parsed.queryTimeMs < 1000) {
      console.log('   ⚡ Performance: EXCELLENT (sub-second query)');
    } else if (parsed.queryTimeMs < 2000) {
      console.log('   ✅ Performance: GOOD (under 2 seconds)');
    } else {
      console.log('   ⚠️  Performance: NEEDS ATTENTION (over 2 seconds)');
    }
  } else {
    console.log('❌ Script execution failed:', parsed.error);
    console.log('   Message:', parsed.message);
  }
} catch (error) {
  console.log('❌ Unexpected error:', error.message);
}
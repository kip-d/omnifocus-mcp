#!/usr/bin/env node
import { spawn } from 'child_process';

console.log('🔍 Testing Performance Issue in Task Script...\n');

// Test the current complex script that hangs
const problematicScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    const filter = { limit: 5, completed: false };
    const tasks = [];
    
    const allTasks = doc.flattenedTasks();
    console.log('Found', allTasks.length, 'total tasks');
    
    const limit = Math.min(filter.limit || 100, 1000);
    let count = 0;
    const startTime = Date.now();
    
    // First loop - collect tasks
    for (let i = 0; i < allTasks.length && count < limit; i++) {
      const task = allTasks[i];
      
      // Skip if task doesn't match filters
      if (filter.completed !== undefined && task.completed() !== filter.completed) continue;
      
      // Build task object
      const taskObj = {
        id: task.id(),
        name: task.name(),
        completed: task.completed(),
        flagged: task.flagged()
      };
      
      tasks.push(taskObj);
      count++;
    }
    
    console.log('First loop finished in', Date.now() - startTime, 'ms');
    
    // PROBLEM: Second loop to count total matching - this is likely hanging!
    let totalAvailable = 0;
    const countStartTime = Date.now();
    
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      
      // Apply same filters as main loop
      if (filter.completed !== undefined && task.completed() !== filter.completed) continue;
      
      totalAvailable++;
    }
    
    console.log('Second counting loop finished in', Date.now() - countStartTime, 'ms');
    
    return JSON.stringify({
      success: true,
      tasks: tasks,
      metadata: {
        returned: tasks.length,
        totalMatching: totalAvailable,
        totalTasks: allTasks.length,
        processingTime: Date.now() - startTime
      }
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString(),
      stack: error.stack
    });
  }
})()`;

console.log('📤 Testing the problematic double-loop script...');
const proc = spawn('osascript', ['-l', 'JavaScript'], {
  timeout: 45000, // 45 second timeout
});

let stdout = '';
let stderr = '';

proc.stdout.on('data', (data) => {
  stdout += data.toString();
});

proc.stderr.on('data', (data) => {
  stderr += data.toString();
});

proc.on('error', (error) => {
  console.error('❌ Script execution error:', error);
});

proc.on('close', (code) => {
  console.log(`🏁 Script finished with code: ${code}`);
  
  if (code !== 0) {
    console.error('❌ Script failed');
    console.error('STDERR:', stderr);
  } else {
    if (stderr) {
      console.warn('⚠️ STDERR:', stderr);
    }
    
    try {
      const result = JSON.parse(stdout.trim());
      console.log('✅ Result:', JSON.stringify(result, null, 2));
      
      if (result.error) {
        console.error('❌ Script execution failed:', result.message);
      } else {
        console.log('✅ Script execution successful!');
        console.log(`⏱️ Total processing time: ${result.metadata.processingTime}ms`);
      }
    } catch (parseError) {
      console.error('❌ Failed to parse JSON output:', stdout);
      console.error('Parse error:', parseError);
    }
  }
  
  process.exit(0);
});

// Write script to stdin
proc.stdin.write(problematicScript);
proc.stdin.end();

// Kill if it takes too long
setTimeout(() => {
  console.error('\n⏰ 45s timeout reached - this confirms the performance issue!');
  proc.kill('SIGTERM');
  process.exit(1);
}, 45000);
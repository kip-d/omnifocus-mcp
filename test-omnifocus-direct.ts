#!/usr/bin/env node
import { spawn } from 'child_process';

console.log('🔍 Testing OmniFocus Script Execution Directly...\n');

// Test simple OmniFocus connection first
const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    if (!app.running()) {
      return JSON.stringify({
        error: true,
        message: 'OmniFocus is not running'
      });
    }
    
    const doc = app.defaultDocument;
    return JSON.stringify({
      success: true,
      message: 'Successfully connected to OmniFocus',
      appVersion: app.version(),
      documentName: doc.name()
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString(),
      stack: error.stack
    });
  }
})()`;

console.log('📤 Testing basic OmniFocus connection...');
const proc = spawn('osascript', ['-l', 'JavaScript'], {
  timeout: 10000,
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
    process.exit(1);
  }
  
  if (stderr) {
    console.warn('⚠️ STDERR:', stderr);
  }
  
  try {
    const result = JSON.parse(stdout.trim());
    console.log('✅ Result:', JSON.stringify(result, null, 2));
    
    if (result.error) {
      console.error('❌ OmniFocus connection failed:', result.message);
    } else {
      console.log('✅ OmniFocus connection successful!');
      testTaskListing();
    }
  } catch (parseError) {
    console.error('❌ Failed to parse JSON output:', stdout);
    console.error('Parse error:', parseError);
  }
});

// Write script to stdin
proc.stdin.write(testScript);
proc.stdin.end();

function testTaskListing() {
  console.log('\n📤 Testing task listing (with very small limit)...');
  
  const taskScript = `(() => {
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument;
      
      // Get just the first 3 tasks to test quickly
      const allTasks = doc.flattenedTasks();
      const tasks = [];
      
      for (let i = 0; i < Math.min(allTasks.length, 3); i++) {
        const task = allTasks[i];
        try {
          tasks.push({
            id: task.id.primaryKey,
            name: task.name(),
            completed: task.completed(),
            flagged: task.flagged()
          });
        } catch (taskError) {
          // Skip problematic tasks
          continue;
        }
      }
      
      return JSON.stringify({
        success: true,
        taskCount: tasks.length,
        totalTasks: allTasks.length,
        tasks: tasks
      });
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error.toString(),
        stack: error.stack
      });
    }
  })()`;
  
  const taskProc = spawn('osascript', ['-l', 'JavaScript'], {
    timeout: 30000,
  });
  
  let taskStdout = '';
  let taskStderr = '';
  
  taskProc.stdout.on('data', (data) => {
    taskStdout += data.toString();
  });
  
  taskProc.stderr.on('data', (data) => {
    taskStderr += data.toString();
  });
  
  taskProc.on('error', (error) => {
    console.error('❌ Task script execution error:', error);
  });
  
  taskProc.on('close', (code) => {
    console.log(`🏁 Task script finished with code: ${code}`);
    
    if (code !== 0) {
      console.error('❌ Task script failed');
      console.error('STDERR:', taskStderr);
      process.exit(1);
    }
    
    if (taskStderr) {
      console.warn('⚠️ Task STDERR:', taskStderr);
    }
    
    try {
      const result = JSON.parse(taskStdout.trim());
      console.log('✅ Task Result:', JSON.stringify(result, null, 2));
      
      if (result.error) {
        console.error('❌ Task listing failed:', result.message);
      } else {
        console.log('✅ Task listing successful!');
        console.log(`📊 Found ${result.totalTasks} total tasks, showing first ${result.taskCount}`);
      }
    } catch (parseError) {
      console.error('❌ Failed to parse task JSON output:', taskStdout);
      console.error('Parse error:', parseError);
    }
    
    process.exit(0);
  });
  
  taskProc.stdin.write(taskScript);
  taskProc.stdin.end();
}
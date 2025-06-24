#!/usr/bin/env node
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

// Test to find the exact line causing the error
const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    const filter = {"search": "test", "limit": 2};
    
    try {
      const allTasks = doc.flattenedTasks();
      
      if (allTasks.length > 0) {
        const task = allTasks[0];
        
        // Test each property access individually
        const tests = [];
        
        try {
          task.completed();
          tests.push("completed() works");
        } catch (e) {
          tests.push("completed() error: " + e.toString());
        }
        
        try {
          task.flagged();
          tests.push("flagged() works");
        } catch (e) {
          tests.push("flagged() error: " + e.toString());
        }
        
        try {
          task.dropped();
          tests.push("dropped() works");
        } catch (e) {
          tests.push("dropped() error: " + e.toString());
        }
        
        try {
          const available = app.perspectiveNames();
          tests.push("perspectives work: " + available.length);
        } catch (e) {
          tests.push("perspectives error: " + e.toString());
        }
        
        return {
          success: true,
          tests: tests,
          taskCount: allTasks.length
        };
      } else {
        return {
          success: false,
          error: "No tasks found"
        };
      }
    } catch (e) {
      return {
        success: false,
        error: "Failed to get tasks: " + e.toString(),
        stack: e.stack
      };
    }
  } catch (e) {
    return {
      success: false,
      error: "Failed to access OmniFocus: " + e.toString()
    };
  }
})();`;

const args = [
  '-l', 'JavaScript',
  '-e', testScript
];

const proc: ChildProcessWithoutNullStreams = spawn('osascript', args);

let stdout = '';
let stderr = '';

proc.stdout.on('data', (data: Buffer) => {
  stdout += data.toString();
});

proc.stderr.on('data', (data: Buffer) => {
  stderr += data.toString();
});

proc.on('close', (code: number | null) => {
  console.log('Exit code:', code);
  
  if (stderr) {
    console.log('\nStderr output:');
    console.log(stderr);
  }
  
  if (stdout) {
    console.log('\nStdout output:');
    console.log(stdout);
    
    try {
      const result = JSON.parse(stdout);
      console.log('\nParsed result:');
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.log('Could not parse output as JSON');
    }
  }
  
  process.exit(code || 0);
});
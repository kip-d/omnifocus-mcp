#!/usr/bin/env node
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

console.log('Testing OmniFocus search directly with JXA...\n');

// Test 1: Simple search without MCP
const testScript = `
(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    // Test parameters
    const searchTerm = "Outsized BKK";
    let foundCount = 0;
    let errorCount = 0;
    let taskCount = 0;
    
    const allTasks = doc.flattenedTasks();
    
    for (let i = 0; i < Math.min(10, allTasks.length); i++) {
      const task = allTasks[i];
      taskCount++;
      
      try {
        // Test getting name
        let name = '';
        try {
          const nameValue = task.name();
          name = nameValue ? String(nameValue) : '';
        } catch (e) {
          name = '';
        }
        
        // Test getting note
        let note = '';
        try {
          const noteValue = task.note();
          note = noteValue ? String(noteValue) : '';
        } catch (e) {
          note = '';
        }
        
        // Check if matches search
        if (name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            note.toLowerCase().includes(searchTerm.toLowerCase())) {
          foundCount++;
          console.log(\`Found match in task #\${i}: "\${name}"\`);
        }
      } catch (e) {
        errorCount++;
        console.log(\`Error with task #\${i}: \${e.toString()}\`);
      }
    }
    
    return {
      success: true,
      taskCount: taskCount,
      foundCount: foundCount,
      errorCount: errorCount,
      searchTerm: searchTerm
    };
    
  } catch (e) {
    return {
      success: false,
      error: e.toString()
    };
  }
})();
`;

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
      console.log('\nParsed result:', result);
    } catch (e) {
      console.log('Could not parse output as JSON');
    }
  }
  
  process.exit(code || 0);
});
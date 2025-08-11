#!/usr/bin/env node

import { spawn } from 'child_process';

const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const projects = doc.flattenedProjects();
    
    if (!projects || projects.length === 0) {
      return JSON.stringify({
        error: true,
        message: "No projects found"
      });
    }
    
    // Get first few projects and check their status
    const results = [];
    const limit = Math.min(5, projects.length);
    
    for (let i = 0; i < limit; i++) {
      const project = projects[i];
      let statusValue;
      let statusType;
      
      try {
        const status = project.status();
        statusValue = status;
        statusType = typeof status;
        
        // Try to get string representation
        let statusString;
        try {
          statusString = status.toString();
        } catch (e) {
          statusString = "toString failed";
        }
        
        // Check if it's an object with properties
        let statusName;
        try {
          if (status && typeof status === 'object' && status.name) {
            statusName = status.name;
          }
        } catch (e) {}
        
        results.push({
          projectName: project.name(),
          statusValue: statusValue,
          statusType: statusType,
          statusString: statusString,
          statusName: statusName,
          // Check string values
          equalsActive: statusString === "active",
          equalsOnHold: statusString === "onHold", 
          equalsDone: statusString === "done",
          equalsDropped: statusString === "dropped",
          // Also check with space
          equalsActiveStatus: statusString === "active status",
          equalsOnHoldStatus: statusString === "on hold status"
        });
      } catch (e) {
        results.push({
          projectName: project.name(),
          error: e.toString()
        });
      }
    }
    
    return JSON.stringify({
      results: results
    }, null, 2);
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString()
    });
  }
})();`;

console.log('Testing project status values...\n');

const proc = spawn('osascript', ['-l', 'JavaScript'], {
  timeout: 10000
});

let stdout = '';
let stderr = '';

proc.stdout.on('data', (data) => {
  stdout += data.toString();
});

proc.stderr.on('data', (data) => {
  stderr += data.toString();
});

proc.on('close', (code) => {
  console.log('Exit code:', code);
  if (stderr) console.log('Stderr:', stderr);
  if (stdout) {
    console.log('Result:', stdout);
  }
});

proc.stdin.write(testScript);
proc.stdin.end();
#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Patterns that indicate unsafe method calls
const unsafePatterns = [
  // Direct method calls without safeGet
  /(?<!safeGet\(\(\) => )task\.(?:completed|flagged|name|note|dueDate|deferDate|id)\(\)/g,
  /(?<!safeGet\(\(\) => )project\.(?:name|id|status|completed|flagged)\(\)/g,
  /(?<!safeGet\(\(\) => )tag\.(?:name|id)\(\)/g,
  
  // Direct property access that might fail
  /task\.(?:completed|flagged|dropped)\s*===\s*true/g,
  /project\.(?:completed|flagged|dropped)\s*===\s*true/g,
  
  // Array access without null checks
  /tasks\[\d+\]\.(?:completed|flagged|name)\(\)/g,
  /projects\[\d+\]\.(?:name|status)\(\)/g,
];

// Safe patterns that we should be using instead
const safePatterns = {
  'task.completed()': 'safeGet(() => task.completed(), false)',
  'task.flagged()': 'safeGet(() => task.flagged(), false)', 
  'task.name()': 'safeGet(() => task.name(), "Unnamed Task")',
  'task.id()': 'safeGet(() => task.id(), "unknown")',
  'project.name()': 'safeGet(() => project.name(), "Unknown Project")',
  'project.id()': 'safeGet(() => project.id(), "unknown")'
};

function findUnsafePatterns(content, filePath) {
  const issues = [];
  const lines = content.split('\n');
  
  // Check each unsafe pattern
  unsafePatterns.forEach(pattern => {
    let match;
    const regex = new RegExp(pattern);
    
    while ((match = regex.exec(content)) !== null) {
      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const line = lines[lineNumber - 1];
      
      // Skip if it's in a comment
      if (line.trim().startsWith('//')) continue;
      
      // Skip if it's already wrapped in safeGet or try-catch
      const linesBefore = lines.slice(Math.max(0, lineNumber - 3), lineNumber);
      const linesAfter = lines.slice(lineNumber, lineNumber + 3);
      const context = [...linesBefore, ...linesAfter].join('\n');
      
      if (context.includes('safeGet') || context.includes('try {')) continue;
      
      issues.push({
        file: filePath,
        line: lineNumber,
        match: match[0],
        code: line.trim(),
        suggestion: safePatterns[match[0]] || 'Use safeGet() wrapper'
      });
    }
  });
  
  return issues;
}

function scanDirectory(dir) {
  const allIssues = [];
  
  function walk(currentDir) {
    const files = fs.readdirSync(currentDir);
    
    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        walk(filePath);
      } else if (file.endsWith('.ts') && file.includes('script')) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Only check script exports
        if (content.includes('export const') && content.includes('_SCRIPT')) {
          const relativePath = path.relative(path.join(__dirname, '..'), filePath);
          const issues = findUnsafePatterns(content, relativePath);
          allIssues.push(...issues);
        }
      }
    }
  }
  
  walk(dir);
  return allIssues;
}

console.log('🔍 Script Safety Validator\n');
console.log('Scanning for unsafe method calls in OmniFocus scripts...\n');

const scriptsDir = path.join(__dirname, '../src/omnifocus/scripts');
const issues = scanDirectory(scriptsDir);

if (issues.length === 0) {
  console.log('✅ No unsafe patterns found!');
} else {
  console.log(`❌ Found ${issues.length} potential safety issues:\n`);
  
  // Group by file
  const byFile = {};
  issues.forEach(issue => {
    if (!byFile[issue.file]) byFile[issue.file] = [];
    byFile[issue.file].push(issue);
  });
  
  for (const [file, fileIssues] of Object.entries(byFile)) {
    console.log(`\n📄 ${file}:`);
    fileIssues.forEach(issue => {
      console.log(`  Line ${issue.line}: ${issue.match}`);
      console.log(`    Code: ${issue.code}`);
      console.log(`    Fix:  ${issue.suggestion}`);
    });
  }
  
  console.log('\n📊 Summary:');
  console.log(`  Files affected: ${Object.keys(byFile).length}`);
  console.log(`  Total issues: ${issues.length}`);
  console.log('\nThese unsafe patterns can cause script execution failures.');
  console.log('Replace them with safe alternatives using safeGet() or try-catch blocks.');
}
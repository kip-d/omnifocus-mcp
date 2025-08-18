#!/usr/bin/env node

// Direct test of perspective query via osascript
const { execSync } = require('child_process');

const script = `
const app = Application('OmniFocus');
const doc = app.defaultDocument();

// Test built-in perspective detection
const builtInNames = ["Inbox", "Projects", "Tags", "Forecast", "Flagged", "Nearby", "Review"];
if (builtInNames.includes("Flagged")) {
  "Found Flagged as built-in perspective";
} else {
  "Flagged not found in built-in list";
}
`;

try {
  console.log('Testing perspective detection...\n');
  const result = execSync(`osascript -l JavaScript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: 'utf8' });
  console.log('Result:', result.trim());
} catch (error) {
  console.error('Error:', error.message);
  if (error.stdout) {
    console.log('Output:', error.stdout.toString());
  }
  if (error.stderr) {
    console.log('Stderr:', error.stderr.toString());
  }
}
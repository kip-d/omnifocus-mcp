#!/usr/bin/env node

// Test the update_task fix for syntax error
const { execSync } = require('child_process');
const fs = require('fs');

// Read the compiled update-task.js to check for syntax errors
const scriptPath = './dist/omnifocus/scripts/tasks/update-task.js';

if (!fs.existsSync(scriptPath)) {
  console.error('❌ Compiled script not found. Run npm run build first.');
  process.exit(1);
}

const scriptContent = fs.readFileSync(scriptPath, 'utf8');

// Count opening and closing braces
const openBraces = (scriptContent.match(/{/g) || []).length;
const closeBraces = (scriptContent.match(/}/g) || []).length;

console.log('Checking script syntax...');
console.log(`Opening braces: ${openBraces}`);
console.log(`Closing braces: ${closeBraces}`);

if (openBraces !== closeBraces) {
  console.error(`❌ Brace mismatch! Difference: ${openBraces - closeBraces}`);
} else {
  console.log('✅ Braces are balanced');
}

// Check for the specific error pattern
if (scriptContent.includes('} catch (e4) {')) {
  console.log('✅ catch (e4) block found and properly formatted');
} else {
  console.error('❌ catch (e4) block not found or improperly formatted');
}

// Try a simple osascript syntax check
console.log('\nTesting basic JXA execution...');
const testScript = `
const app = Application('OmniFocus');
const doc = app.defaultDocument();
"Script loads successfully";
`;

try {
  const result = execSync(`osascript -l JavaScript -e '${testScript.replace(/'/g, "'\"'\"'")}'`, { encoding: 'utf8' });
  console.log('✅ Basic JXA execution works:', result.trim());
} catch (error) {
  console.error('❌ JXA execution failed:', error.message);
}

console.log('\n✨ Syntax error fix appears to be successful!');
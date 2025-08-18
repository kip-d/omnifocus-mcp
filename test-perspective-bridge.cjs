#!/usr/bin/env node

// Test evaluateJavascript bridge for perspective access
const { execSync } = require('child_process');

const script = `
const app = Application('OmniFocus');

// Test accessing Perspective.Custom via evaluateJavascript
const perspectiveScript = [
  '(() => {',
  '  try {',
  '    // Check if Perspective.Custom exists',
  '    if (typeof Perspective !== "undefined" && Perspective.Custom) {',
  '      const customPerspective = Perspective.Custom.byName("Flagged");',
  '      if (customPerspective) {',
  '        return "Found custom perspective: " + customPerspective.name;',
  '      } else {',
  '        return "Flagged is not a custom perspective (expected)";',
  '      }',
  '    } else {',
  '      return "Perspective.Custom not available";',
  '    }',
  '  } catch (e) {',
  '    return "Error: " + e.toString();',
  '  }',
  '})()'
].join('');

const result = app.evaluateJavascript(perspectiveScript);
result;
`;

try {
  console.log('Testing Perspective.Custom access via evaluateJavascript...\n');
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
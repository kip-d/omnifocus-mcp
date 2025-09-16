#!/usr/bin/env node

/**
 * OmniJS Bridge Limit Test - Fixed Version
 *
 * Tests evaluateJavascript() limits with proper script generation
 */

import { spawn } from 'child_process';

console.log('🌉 OmniJS Bridge Limit Test (Fixed)\n');

/**
 * Generate valid OmniJS script without variable redeclaration
 */
function generateOmniJSScript(targetSize, pattern) {
  let baseScript = '';
  let paddingGenerator = '';

  switch (pattern) {
    case 'simple':
      baseScript = 'const result = {test: true, size: ' + targetSize + '}; ';
      paddingGenerator = (i) => `const temp${i} = Date.now(); `;
      break;

    case 'omnifocus':
      baseScript = `
const result = {omnifocus: true, size: ${targetSize}};
try {
  const taskCount = flattenedTasks().length;
  result.taskCount = taskCount;
} catch (e) {
  result.error = e.message;
}
`;
      paddingGenerator = (i) => `const tempOF${i} = Math.random(); `;
      break;
  }

  const closingScript = 'JSON.stringify(result);';
  const currentSize = baseScript.length + closingScript.length;
  const paddingNeeded = Math.max(0, targetSize - currentSize);

  // Generate padding with unique variable names
  let padding = '';
  let i = 0;
  while (padding.length < paddingNeeded) {
    const line = paddingGenerator(i);
    if (padding.length + line.length <= paddingNeeded) {
      padding += line;
    } else {
      // Add final padding to reach exact size
      const remaining = paddingNeeded - padding.length;
      padding += `// Padding: ${'x'.repeat(Math.max(0, remaining - 12))}\n`;
      break;
    }
    i++;
  }

  return baseScript + padding + closingScript;
}

/**
 * Test OmniJS bridge with specific script
 */
function testOmniJSBridge(omniJSScript) {
  return new Promise((resolve) => {
    const wrapperScript = `
(() => {
  const app = Application('OmniFocus');

  try {
    const result = app.evaluateJavascript(\`${omniJSScript.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);
    return JSON.stringify({success: true, bridgeResult: result});
  } catch (error) {
    return JSON.stringify({success: false, error: error.message});
  }
})();
`;

    let result = '';
    let errorOutput = '';

    const osascript = spawn('osascript', ['-l', 'JavaScript'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const timeout = setTimeout(() => {
      osascript.kill();
      resolve({
        success: false,
        error: 'Timeout',
        stderr: null
      });
    }, 10000);

    osascript.stdout.on('data', (data) => {
      result += data.toString();
    });

    osascript.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    osascript.on('close', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        try {
          const parsed = JSON.parse(result.trim());
          resolve({
            success: parsed.success,
            result: parsed.bridgeResult,
            error: parsed.success ? null : parsed.error,
            stderr: null
          });
        } catch (parseError) {
          resolve({
            success: false,
            error: `Parse error: ${parseError.message}`,
            stderr: errorOutput
          });
        }
      } else {
        resolve({
          success: false,
          error: `Exit code ${code}`,
          stderr: errorOutput
        });
      }
    });

    osascript.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        error: error.message,
        stderr: errorOutput
      });
    });

    osascript.stdin.write(wrapperScript);
    osascript.stdin.end();
  });
}

/**
 * Binary search for OmniJS bridge limit
 */
async function findOmniJSBridgeLimit(pattern) {
  let minSize = 1024;
  let maxSize = 256 * 1024; // Start with 256KB
  let lastSuccess = 0;

  console.log(`🔍 Testing ${pattern} pattern in OmniJS bridge`);
  console.log(`   Range: ${minSize.toLocaleString()} - ${maxSize.toLocaleString()} characters`);

  while (maxSize - minSize > 1024) { // 1KB tolerance
    const testSize = Math.floor((minSize + maxSize) / 2);
    const omniJSScript = generateOmniJSScript(testSize, pattern);

    process.stdout.write(`   Testing ${testSize.toLocaleString()} chars... `);

    const result = await testOmniJSBridge(omniJSScript);

    if (result.success) {
      console.log('✅ SUCCESS');
      lastSuccess = testSize;
      minSize = testSize;
    } else {
      console.log(`❌ FAILED: ${result.error}`);
      maxSize = testSize;
    }
  }

  return {
    pattern,
    limit: lastSuccess,
    range: maxSize - lastSuccess
  };
}

/**
 * Run OmniJS bridge tests
 */
async function runOmniJSTests() {
  const patterns = ['simple', 'omnifocus'];
  const results = [];

  for (const pattern of patterns) {
    try {
      const result = await findOmniJSBridgeLimit(pattern);
      results.push(result);

      console.log(`   📊 Result: ${result.limit.toLocaleString()} characters (±${result.range.toLocaleString()})\n`);

    } catch (error) {
      console.log(`   💥 Test failed: ${error.message}\n`);
      results.push({
        pattern,
        error: error.message,
        limit: 0
      });
    }
  }

  // Summary
  console.log('📊 OmniJS Bridge Results Summary\n');
  console.log('Pattern'.padEnd(15) + 'Limit (chars)'.padEnd(15) + 'Status');
  console.log('─'.repeat(40));

  results.forEach(result => {
    const status = result.error ? 'FAILED' : 'SUCCESS';
    const limit = result.error ? 'N/A' : result.limit.toLocaleString();

    console.log(
      result.pattern.padEnd(15) +
      limit.padEnd(15) +
      status
    );
  });

  const successfulResults = results.filter(r => !r.error);
  if (successfulResults.length > 0) {
    const avgLimit = Math.round(successfulResults.reduce((sum, r) => sum + r.limit, 0) / successfulResults.length);
    console.log(`\n🎯 Average OmniJS bridge limit: ${avgLimit.toLocaleString()} characters`);
  }

  return results;
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runOmniJSTests().catch(console.error);
}
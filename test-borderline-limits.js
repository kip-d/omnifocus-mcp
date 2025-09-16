#!/usr/bin/env node

/**
 * Test Borderline Script Limits
 *
 * Tests scripts right around the discovered limits to find exact failure points:
 * - JXA Direct: ~523,266 chars
 * - OmniJS Bridge: ~261,124 chars
 */

import { spawn } from 'child_process';

console.log('🎯 Testing Borderline Script Limits\n');

/**
 * Generate simple test script of exact size
 */
function generateBorderlineScript(targetSize, type = 'jxa') {
  let baseScript = '';

  if (type === 'jxa') {
    baseScript = `
(() => {
  const app = Application('OmniFocus');
  const result = {test: true, size: ${targetSize}, type: 'jxa'};
`;
  } else if (type === 'omnijs') {
    baseScript = `
(() => {
  const app = Application('OmniFocus');
  try {
    const bridgeResult = app.evaluateJavascript(\`
      const result = {test: true, size: ${targetSize}, type: 'omnijs'};
      const padding = [];
      `;
  }

  const closingScript = type === 'jxa'
    ? '\n  return JSON.stringify(result);\n})();'
    : '\n      JSON.stringify(result);\n    \`);\n    return bridgeResult;\n  } catch(e) {\n    return JSON.stringify({error: e.message});\n  }\n})();';

  const currentSize = baseScript.length + closingScript.length;
  const paddingNeeded = Math.max(0, targetSize - currentSize);

  // Generate simple padding
  let padding = '';
  const paddingLine = '  // Border test padding line\n';

  while (padding.length < paddingNeeded) {
    if (padding.length + paddingLine.length <= paddingNeeded) {
      padding += paddingLine;
    } else {
      // Fill exactly to target size
      const remaining = paddingNeeded - padding.length;
      padding += '  // ' + 'x'.repeat(Math.max(0, remaining - 5)) + '\n';
      break;
    }
  }

  return baseScript + padding + closingScript;
}

/**
 * Test single script execution
 */
function testSingleScript(script, description) {
  return new Promise((resolve) => {
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
        description
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
        resolve({
          success: true,
          result: result.trim(),
          description
        });
      } else {
        resolve({
          success: false,
          error: `Exit code ${code}`,
          stderr: errorOutput,
          description
        });
      }
    });

    osascript.stdin.write(script);
    osascript.stdin.end();
  });
}

/**
 * Test around JXA limit
 */
async function testJXABoundary() {
  console.log('🔍 Testing JXA Boundary (around 523,266 chars)');

  const testSizes = [
    523260, // 6 chars below
    523263, // 3 chars below
    523266, // At limit
    523269, // 3 chars above
    523272  // 6 chars above
  ];

  for (const size of testSizes) {
    const script = generateBorderlineScript(size, 'jxa');
    const actualSize = script.length;

    process.stdout.write(`   Testing ${size} chars (actual: ${actualSize})... `);

    const result = await testSingleScript(script, `JXA ${size} chars`);

    if (result.success) {
      console.log('✅ SUCCESS');
    } else {
      console.log(`❌ FAILED: ${result.error}`);
      if (result.stderr && result.stderr.length < 100) {
        console.log(`      stderr: ${result.stderr.trim()}`);
      }
    }
  }
}

/**
 * Test around OmniJS bridge limit
 */
async function testOmniJSBoundary() {
  console.log('\n🌉 Testing OmniJS Bridge Boundary (around 261,124 chars)');

  const testSizes = [
    261118, // 6 chars below
    261121, // 3 chars below
    261124, // At limit
    261127, // 3 chars above
    261130  // 6 chars above
  ];

  for (const size of testSizes) {
    // Generate OmniJS script to be executed via bridge
    let omniJSScript = `const result = {test: true, size: ${size}, type: 'omnijs'}; `;

    // Generate unique variable names to avoid redeclaration
    let i = 0;
    while (omniJSScript.length < size - 50) { // Leave room for closing
      const line = `const temp${i} = Date.now(); `;
      if (omniJSScript.length + line.length <= size - 50) {
        omniJSScript += line;
        i++;
      } else {
        break;
      }
    }

    omniJSScript += 'JSON.stringify(result);';

    // Ensure exact size
    if (omniJSScript.length > size) {
      omniJSScript = omniJSScript.substring(0, size);
    }

    // Wrapper script that calls the bridge
    const wrapperScript = `
(() => {
  const app = Application('OmniFocus');
  try {
    const bridgeResult = app.evaluateJavascript(\`${omniJSScript.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);
    return JSON.stringify({success: true, bridgeResult});
  } catch (e) {
    return JSON.stringify({success: false, error: e.message});
  }
})();
    `;

    process.stdout.write(`   Testing ${size} chars OmniJS... `);

    const result = await testSingleScript(wrapperScript, `OmniJS ${size} chars`);

    if (result.success) {
      try {
        const parsed = JSON.parse(result.result);
        if (parsed.success) {
          console.log('✅ SUCCESS');
        } else {
          console.log(`❌ BRIDGE FAILED: ${parsed.error}`);
        }
      } catch (parseError) {
        console.log(`❌ PARSE FAILED: ${parseError.message}`);
      }
    } else {
      console.log(`❌ WRAPPER FAILED: ${result.error}`);
    }
  }
}

/**
 * Test our largest current scripts
 */
async function testCurrentLargestScripts() {
  console.log('\n📄 Testing Our Current Largest Scripts');

  // Test sizes based on our measurement results
  const testCases = [
    { size: 31681, name: 'helpers.ts equivalent' },
    { size: 29957, name: 'workflow-analysis.ts equivalent' },
    { size: 26347, name: 'list-tasks.ts equivalent' },
    { size: 19456, name: 'old 19KB assumption' }
  ];

  for (const testCase of testCases) {
    process.stdout.write(`   Testing ${testCase.name} (${testCase.size} chars)... `);

    const script = generateBorderlineScript(testCase.size, 'jxa');
    const result = await testSingleScript(script, testCase.name);

    const status = result.success ? '✅ SUCCESS' : `❌ FAILED: ${result.error}`;
    console.log(status);
  }
}

/**
 * Main test runner
 */
async function runBorderlineTests() {
  await testJXABoundary();
  await testOmniJSBoundary();
  await testCurrentLargestScripts();

  console.log('\n📊 Borderline Testing Complete');
  console.log('─'.repeat(50));
  console.log('These tests confirm the exact failure boundaries');
  console.log('and validate that our current scripts are well within limits.');
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runBorderlineTests().catch(console.error);
}
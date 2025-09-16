#!/usr/bin/env node

/**
 * Script Size Limit Tester - Fixed Version
 *
 * Uses proper Node.js piping to avoid shell ARG_MAX limits
 * Tests the actual limits we encounter in our MCP implementation
 */

import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

console.log('🧪 Script Size Limit Tester (Fixed) - Empirical Testing\n');

// Test configuration
const TEST_CONFIG = {
  startSize: 1024,        // 1KB starting point
  maxSize: 512 * 1024,    // 512KB maximum test size (more reasonable)
  tolerance: 1024,        // Stop when range is within 1KB
  timeout: 15000,         // 15 second timeout per test
  testPatterns: ['pure-js', 'jxa-api', 'mixed-content'],
  executionMethods: ['node-stdin', 'file']
};

/**
 * Generate test script content - simplified to avoid shell issues
 */
function generateTestScript(targetSize, pattern) {
  let baseScript = '';

  switch (pattern) {
    case 'pure-js':
      baseScript = `
(() => {
  const result = {test: true, size: ${targetSize}};
  const data = [];
`;
      break;

    case 'jxa-api':
      baseScript = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const result = {connected: true, size: ${targetSize}};
`;
      break;

    case 'mixed-content':
      baseScript = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();

  function safeGet(getter, defaultValue = null) {
    try { return getter(); } catch { return defaultValue; }
  }

  const result = {mixed: true, size: ${targetSize}};
`;
      break;
  }

  const closingScript = `
  return JSON.stringify(result);
})();
`;

  // Calculate padding needed
  const currentSize = baseScript.length + closingScript.length;
  const paddingNeeded = Math.max(0, targetSize - currentSize);

  // Generate simple, safe padding
  let padding = '';
  const paddingLine = '  // Padding line for size testing\\n';

  while (padding.length < paddingNeeded) {
    padding += paddingLine;
  }

  // Trim to exact size
  if (padding.length > paddingNeeded) {
    padding = padding.substring(0, paddingNeeded);
  }

  return baseScript + padding + closingScript;
}

/**
 * Test script execution using Node.js spawn (like our actual implementation)
 */
function testScriptExecution(script, method) {
  return new Promise((resolve) => {
    let result = '';
    let errorOutput = '';

    try {
      let osascript;

      if (method === 'node-stdin') {
        // This is how our actual MCP server executes scripts
        osascript = spawn('osascript', ['-l', 'JavaScript'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } else if (method === 'file') {
        // Write to temp file and execute
        const tempFile = join('/tmp', `test-script-${Date.now()}.js`);
        writeFileSync(tempFile, script);
        osascript = spawn('osascript', ['-l', 'JavaScript', tempFile], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Clean up file after process starts
        setTimeout(() => {
          try { unlinkSync(tempFile); } catch {}
        }, 1000);
      }

      const timeout = setTimeout(() => {
        osascript.kill();
        resolve({
          success: false,
          result: null,
          error: 'Timeout',
          stderr: null
        });
      }, TEST_CONFIG.timeout);

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
            error: null,
            stderr: null
          });
        } else {
          resolve({
            success: false,
            result: null,
            error: `Exit code ${code}`,
            stderr: errorOutput
          });
        }
      });

      osascript.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          result: null,
          error: error.message,
          stderr: errorOutput
        });
      });

      // Write script to stdin for node-stdin method
      if (method === 'node-stdin') {
        osascript.stdin.write(script);
        osascript.stdin.end();
      }

    } catch (error) {
      resolve({
        success: false,
        result: null,
        error: error.message,
        stderr: null
      });
    }
  });
}

/**
 * Binary search to find exact limit
 */
async function binarySearchLimit(pattern, method) {
  let minSize = TEST_CONFIG.startSize;
  let maxSize = TEST_CONFIG.maxSize;
  let lastSuccess = 0;
  let lastFailure = maxSize;

  console.log(`🔍 Testing ${pattern} pattern with ${method} method`);
  console.log(`   Range: ${minSize.toLocaleString()} - ${maxSize.toLocaleString()} characters`);

  while (maxSize - minSize > TEST_CONFIG.tolerance) {
    const testSize = Math.floor((minSize + maxSize) / 2);
    const script = generateTestScript(testSize, pattern);

    process.stdout.write(`   Testing ${testSize.toLocaleString()} chars... `);

    const result = await testScriptExecution(script, method);

    if (result.success) {
      console.log('✅ SUCCESS');
      lastSuccess = testSize;
      minSize = testSize;
    } else {
      console.log(`❌ FAILED: ${result.error}`);
      if (result.stderr && result.stderr.length < 200) {
        console.log(`      stderr: ${result.stderr.trim()}`);
      }
      lastFailure = testSize;
      maxSize = testSize;
    }
  }

  return {
    pattern,
    method,
    lastSuccess,
    lastFailure,
    limit: lastSuccess,
    range: lastFailure - lastSuccess
  };
}

/**
 * Test OmniJS bridge limits specifically
 */
async function testOmniJSBridgeLimits() {
  console.log('\\n🌉 Testing OmniJS evaluateJavascript() Bridge Limits');

  const bridgeTestWrapper = (omniJSScript) => `
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

  // Test OmniJS script patterns
  const omniJSPatterns = [
    {
      name: 'simple-omnijs',
      generator: (size) => {
        let script = 'const result = {test: true}; ';
        const padding = 'const temp = Date.now(); ';
        while (script.length < size - 50) { // Leave room for closing
          script += padding;
        }
        script += 'JSON.stringify(result);';
        return script;
      }
    },
    {
      name: 'omnifocus-omnijs',
      generator: (size) => {
        let script = `
const task = Task.byIdentifier("test");
const tags = flattenedTags.byName("test");
const result = {omnifocus: true};
`;
        const padding = 'const tempOF = flattenedTags().length; ';
        while (script.length < size - 50) { // Leave room for closing
          script += padding;
        }
        script += 'JSON.stringify(result);';
        return script;
      }
    }
  ];

  const bridgeResults = [];

  for (const pattern of omniJSPatterns) {
    let minSize = 1024;
    let maxSize = 256 * 1024; // Start with 256KB for OmniJS
    let lastSuccess = 0;

    console.log(`\\n   Testing ${pattern.name} pattern in OmniJS bridge`);

    while (maxSize - minSize > TEST_CONFIG.tolerance) {
      const testSize = Math.floor((minSize + maxSize) / 2);
      const omniJSScript = pattern.generator(testSize);
      const wrapperScript = bridgeTestWrapper(omniJSScript);

      process.stdout.write(`   Testing ${testSize.toLocaleString()} chars... `);

      const result = await testScriptExecution(wrapperScript, 'node-stdin');

      if (result.success) {
        try {
          const parsed = JSON.parse(result.result);
          if (parsed.success) {
            console.log('✅ SUCCESS');
            lastSuccess = testSize;
            minSize = testSize;
          } else {
            console.log(`❌ BRIDGE FAILED: ${parsed.error}`);
            maxSize = testSize;
          }
        } catch (parseError) {
          console.log(`❌ PARSE FAILED: ${parseError.message}`);
          maxSize = testSize;
        }
      } else {
        console.log(`❌ WRAPPER FAILED: ${result.error}`);
        maxSize = testSize;
      }
    }

    bridgeResults.push({
      pattern: pattern.name,
      method: 'omnijs-bridge',
      limit: lastSuccess,
      range: maxSize - lastSuccess
    });
  }

  return bridgeResults;
}

/**
 * Main testing function
 */
async function runLimitTests() {
  const results = [];

  // Test JXA direct execution limits
  console.log('🎯 Phase 1: JXA Direct Execution Limits\\n');

  for (const pattern of TEST_CONFIG.testPatterns) {
    for (const method of TEST_CONFIG.executionMethods) {
      try {
        const result = await binarySearchLimit(pattern, method);
        results.push(result);

        console.log(`   📊 Result: ${result.limit.toLocaleString()} characters (±${result.range.toLocaleString()})`);
        console.log('');

      } catch (error) {
        console.log(`   💥 Test failed: ${error.message}\\n`);
        results.push({
          pattern,
          method,
          error: error.message,
          limit: 0
        });
      }
    }
  }

  // Test OmniJS bridge limits
  console.log('\\n🎯 Phase 2: OmniJS Bridge Limits');

  try {
    const bridgeResults = await testOmniJSBridgeLimits();
    results.push(...bridgeResults);
  } catch (error) {
    console.log(`💥 Bridge testing failed: ${error.message}`);
  }

  // Display summary
  console.log('\\n📊 SUMMARY OF FINDINGS\\n');
  console.log('Pattern'.padEnd(20) + 'Method'.padEnd(15) + 'Limit (chars)'.padEnd(15) + 'Status');
  console.log('─'.repeat(65));

  results.forEach(result => {
    const status = result.error ? 'FAILED' : 'SUCCESS';
    const limit = result.error ? 'N/A' : result.limit.toLocaleString();

    console.log(
      result.pattern.padEnd(20) +
      result.method.padEnd(15) +
      limit.padEnd(15) +
      status
    );
  });

  // Calculate key insights
  const jxaStdinResults = results.filter(r => r.method === 'node-stdin' && !r.error);
  const bridgeResults = results.filter(r => r.method === 'omnijs-bridge' && !r.error);

  if (jxaStdinResults.length > 0) {
    const avgJXA = Math.round(jxaStdinResults.reduce((sum, r) => sum + r.limit, 0) / jxaStdinResults.length);
    console.log(`\\n🎯 Average JXA stdin limit: ${avgJXA.toLocaleString()} characters`);
  }

  if (bridgeResults.length > 0) {
    const avgBridge = Math.round(bridgeResults.reduce((sum, r) => sum + r.limit, 0) / bridgeResults.length);
    console.log(`🌉 Average OmniJS bridge limit: ${avgBridge.toLocaleString()} characters`);
  }

  // Save detailed results
  const detailedResults = {
    timestamp: new Date().toISOString(),
    testConfig: TEST_CONFIG,
    results: results,
    insights: {
      jxaStdinResults,
      bridgeResults,
      avgJXALimit: jxaStdinResults.length > 0 ? Math.round(jxaStdinResults.reduce((sum, r) => sum + r.limit, 0) / jxaStdinResults.length) : null,
      avgBridgeLimit: bridgeResults.length > 0 ? Math.round(bridgeResults.reduce((sum, r) => sum + r.limit, 0) / bridgeResults.length) : null
    }
  };

  writeFileSync('script-size-test-results.json', JSON.stringify(detailedResults, null, 2));

  console.log('\\n💾 Detailed results saved to script-size-test-results.json');
  console.log('🎯 Testing complete!');

  return detailedResults;
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runLimitTests().catch(console.error);
}
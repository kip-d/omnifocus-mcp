#!/usr/bin/env node

/**
 * Script Size Limit Tester - Empirical Testing Tool
 *
 * Uses binary search to find exact script size limits for:
 * - JXA direct execution (stdin piping)
 * - OmniJS evaluateJavascript() bridge
 * - Different execution methods
 *
 * This replaces our assumptions with hard data.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

console.log('🧪 Script Size Limit Tester - Empirical Testing\n');

// Test configuration
const TEST_CONFIG = {
  startSize: 1024,        // 1KB starting point
  maxSize: 1024 * 1024,   // 1MB maximum test size
  tolerance: 100,         // Stop when range is within 100 characters
  timeout: 30000,         // 30 second timeout per test
  testPatterns: ['pure-js', 'jxa-api', 'mixed-content', 'omnifocus-real'],
  executionMethods: ['stdin', 'file', 'command-line']
};

/**
 * Generate test script content of specified size and pattern
 */
function generateTestScript(targetSize, pattern) {
  let baseScript = '';

  switch (pattern) {
    case 'pure-js':
      baseScript = `
        (() => {
          const result = {test: true, timestamp: Date.now()};
          const data = [];

          // Fill with pure JavaScript operations
      `;
      break;

    case 'jxa-api':
      baseScript = `
        (() => {
          const app = Application('OmniFocus');
          const doc = app.defaultDocument();
          const result = {connected: true};

          // Fill with JXA API calls
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

          // Fill with mixed JXA and utility functions
      `;
      break;

    case 'omnifocus-real':
      baseScript = `
        (() => {
          const app = Application('OmniFocus');
          const doc = app.defaultDocument();

          function safeGet(getter, defaultValue = null) {
            try { return getter(); } catch { return defaultValue; }
          }

          function safeGetTags(task) {
            try {
              const tags = task.tags();
              if (!tags) return [];
              const tagNames = [];
              for (let i = 0; i < tags.length; i++) {
                const tagName = safeGet(() => tags[i].name());
                if (tagName) tagNames.push(tagName);
              }
              return tagNames;
            } catch { return []; }
          }

          // Real OmniFocus operations
      `;
      break;
  }

  // Calculate how much padding we need
  const closingScript = `
          return JSON.stringify(result);
        })();
      `;

  const currentSize = baseScript.length + closingScript.length;
  const paddingNeeded = Math.max(0, targetSize - currentSize);

  // Generate padding with realistic content
  let padding = '';
  const paddingPatterns = [
    '  // Processing step {i}: validate and transform data\n',
    '  for (let j = 0; j < 10; j++) { data.push({id: j, value: Math.random()}); }\n',
    '  const tempVar{i} = safeGet(() => someOperation{i}(), null);\n',
    '  if (tempVar{i}) { result.step{i} = tempVar{i}; }\n'
  ];

  let i = 0;
  while (padding.length < paddingNeeded) {
    const patternIndex = i % paddingPatterns.length;
    const line = paddingPatterns[patternIndex].replace(/\{i\}/g, i);
    padding += line;
    i++;
  }

  // Trim to exact size if we went over
  if (padding.length > paddingNeeded) {
    padding = padding.substring(0, paddingNeeded);
  }

  return baseScript + padding + closingScript;
}

/**
 * Test script execution via different methods
 */
async function testScriptExecution(script, method) {
  try {
    let result;
    const tempFile = join('/tmp', `test-script-${Date.now()}.js`);

    switch (method) {
      case 'stdin':
        // Our current method - pipe through stdin
        result = execSync(`echo '${script.replace(/'/g, "'\\''")}' | osascript -l JavaScript`, {
          encoding: 'utf8',
          timeout: TEST_CONFIG.timeout
        });
        break;

      case 'file':
        // Write to file and execute
        writeFileSync(tempFile, script);
        result = execSync(`osascript -l JavaScript "${tempFile}"`, {
          encoding: 'utf8',
          timeout: TEST_CONFIG.timeout
        });
        unlinkSync(tempFile);
        break;

      case 'command-line':
        // Pass as command line argument (will hit ARG_MAX)
        result = execSync(`osascript -l JavaScript -e '${script.replace(/'/g, "'\\''")}}'`, {
          encoding: 'utf8',
          timeout: TEST_CONFIG.timeout
        });
        break;
    }

    return { success: true, result: result.trim(), error: null };

  } catch (error) {
    return {
      success: false,
      result: null,
      error: error.message,
      stderr: error.stderr ? error.stderr.toString() : null
    };
  }
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
  console.log(`   Range: ${minSize} - ${maxSize} characters`);

  while (maxSize - minSize > TEST_CONFIG.tolerance) {
    const testSize = Math.floor((minSize + maxSize) / 2);
    const script = generateTestScript(testSize, pattern);

    console.log(`   Testing ${testSize} chars... `, '');

    const result = await testScriptExecution(script, method);

    if (result.success) {
      console.log('✅ SUCCESS');
      lastSuccess = testSize;
      minSize = testSize;
    } else {
      console.log(`❌ FAILED: ${result.error}`);
      if (result.stderr) {
        console.log(`      stderr: ${result.stderr.substring(0, 100)}...`);
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
  console.log('\n🌉 Testing OmniJS evaluateJavascript() Bridge Limits');

  const bridgeTestWrapper = (omniJSScript) => `
    (() => {
      const app = Application('OmniFocus');

      try {
        const result = app.evaluateJavascript(\`${omniJSScript.replace(/`/g, '\\`')}\`);
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
        while (script.length < size) {
          script += padding;
        }
        script += 'JSON.stringify(result);';
        return script.substring(0, size);
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
        const padding = 'const tempOF = flattenedTasks().length; ';
        while (script.length < size) {
          script += padding;
        }
        script += 'JSON.stringify(result);';
        return script.substring(0, size);
      }
    }
  ];

  const bridgeResults = [];

  for (const pattern of omniJSPatterns) {
    let minSize = 1024;
    let maxSize = 512 * 1024; // Start with 512KB for OmniJS
    let lastSuccess = 0;

    console.log(`\n   Testing ${pattern.name} pattern in OmniJS bridge`);

    while (maxSize - minSize > TEST_CONFIG.tolerance) {
      const testSize = Math.floor((minSize + maxSize) / 2);
      const omniJSScript = pattern.generator(testSize);
      const wrapperScript = bridgeTestWrapper(omniJSScript);

      console.log(`   Testing ${testSize} chars... `, '');

      const result = await testScriptExecution(wrapperScript, 'stdin');

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
  console.log('🎯 Phase 1: JXA Direct Execution Limits\n');

  for (const pattern of TEST_CONFIG.testPatterns) {
    for (const method of TEST_CONFIG.executionMethods) {
      try {
        const result = await binarySearchLimit(pattern, method);
        results.push(result);

        console.log(`   📊 Result: ${result.limit} characters (±${result.range})`);
        console.log('');

      } catch (error) {
        console.log(`   💥 Test failed: ${error.message}\n`);
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
  console.log('\n🎯 Phase 2: OmniJS Bridge Limits');

  try {
    const bridgeResults = await testOmniJSBridgeLimits();
    results.push(...bridgeResults);
  } catch (error) {
    console.log(`💥 Bridge testing failed: ${error.message}`);
  }

  // Display summary
  console.log('\n📊 SUMMARY OF FINDINGS\n');
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

  // Save detailed results
  const detailedResults = {
    timestamp: new Date().toISOString(),
    testConfig: TEST_CONFIG,
    results: results,
    summary: {
      jxaStdinLimits: results.filter(r => r.method === 'stdin' && !r.error),
      jxaFileLimits: results.filter(r => r.method === 'file' && !r.error),
      omniJSBridgeLimits: results.filter(r => r.method === 'omnijs-bridge' && !r.error),
      avgJXALimit: null,
      avgOmniJSLimit: null
    }
  };

  // Calculate averages
  const jxaLimits = detailedResults.summary.jxaStdinLimits.map(r => r.limit);
  const omniJSLimits = detailedResults.summary.omniJSBridgeLimits.map(r => r.limit);

  if (jxaLimits.length > 0) {
    detailedResults.summary.avgJXALimit = Math.round(jxaLimits.reduce((a, b) => a + b, 0) / jxaLimits.length);
  }

  if (omniJSLimits.length > 0) {
    detailedResults.summary.avgOmniJSLimit = Math.round(omniJSLimits.reduce((a, b) => a + b, 0) / omniJSLimits.length);
  }

  writeFileSync('script-size-test-results.json', JSON.stringify(detailedResults, null, 2));

  console.log('\n💾 Detailed results saved to script-size-test-results.json');
  console.log('🎯 Testing complete!');

  return detailedResults;
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runLimitTests().catch(console.error);
}
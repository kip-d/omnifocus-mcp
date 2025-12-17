#!/usr/bin/env node

/**
 * Measure Actual Script Sizes in Our Codebase
 *
 * This will help us understand why we thought we had 19KB limits
 * when empirical testing shows 500KB+ is possible
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

console.log('📏 Measuring Actual Script Sizes in Codebase\n');

/**
 * Import and measure helper functions
 */
async function measureHelperSizes() {
  console.log('🔧 Helper Function Sizes:');

  const helpersPath = 'src/omnifocus/scripts/shared/helpers.ts';
  const helpersContent = readFileSync(helpersPath, 'utf8');

  // Extract different helper functions by parsing the exports
  const helperFunctions = [
    'getCoreHelpers',
    'getMinimalHelpers',
    'getBasicHelpers',
    'getAllHelpers',
    'getValidationHelpers',
    'getSerializationHelpers',
    'getRecurrenceHelpers',
  ];

  const helperSizes = {};

  for (const funcName of helperFunctions) {
    try {
      // Import the module dynamically
      const module = await import('./src/omnifocus/scripts/shared/helpers.js');

      if (module[funcName]) {
        const helperContent = module[funcName]();
        helperSizes[funcName] = helperContent.length;
        console.log(`   ${funcName.padEnd(25)}: ${helperContent.length.toLocaleString()} chars`);
      }
    } catch (error) {
      console.log(`   ${funcName.padEnd(25)}: ERROR - ${error.message}`);
    }
  }

  return helperSizes;
}

/**
 * Measure actual script templates
 */
function measureScriptTemplates() {
  console.log('\n📄 Script Template Sizes (before helper expansion):');

  const scriptFiles = [
    'src/omnifocus/scripts/tasks/create-task.ts',
    'src/omnifocus/scripts/tasks/update-task.ts',
    'src/omnifocus/scripts/tasks/list-tasks.ts',
    'src/omnifocus/scripts/projects/create-project.ts',
    'src/omnifocus/scripts/projects/update-project.ts',
    'src/omnifocus/scripts/analytics/workflow-analysis.ts',
  ];

  const templateSizes = {};

  scriptFiles.forEach((filePath) => {
    try {
      const content = readFileSync(filePath, 'utf8');

      // Extract the script template (content between backticks)
      const templateMatch = content.match(/export const \w+_SCRIPT = `([\s\S]*?)`;/);
      if (templateMatch) {
        const template = templateMatch[1];
        templateSizes[filePath] = template.length;

        const fileName = filePath.split('/').pop();
        console.log(`   ${fileName.padEnd(30)}: ${template.length.toLocaleString()} chars`);
      }
    } catch (error) {
      console.log(`   ${filePath}: ERROR - ${error.message}`);
    }
  });

  return templateSizes;
}

/**
 * Simulate expanded script sizes
 */
async function simulateExpandedSizes(templateSizes, helperSizes) {
  console.log('\n🧮 Simulated Expanded Script Sizes:');

  // Common helper combinations used in our scripts
  const expansionScenarios = {
    'create-task.ts': 'getMinimalHelpers',
    'update-task.ts': 'getAllHelpers',
    'list-tasks.ts': 'getBasicHelpers',
    'create-project.ts': 'getRecurrenceHelpers',
    'update-project.ts': 'getValidationHelpers',
    'workflow-analysis.ts': 'getAllHelpers',
  };

  Object.entries(expansionScenarios).forEach(([script, helperFunc]) => {
    const scriptKey = Object.keys(templateSizes).find((key) => key.includes(script));
    if (scriptKey && templateSizes[scriptKey] && helperSizes[helperFunc]) {
      const templateSize = templateSizes[scriptKey];
      const helperSize = helperSizes[helperFunc];
      const expandedSize = templateSize + helperSize;

      console.log(
        `   ${script.padEnd(25)}: ${templateSize.toLocaleString()} + ${helperSize.toLocaleString()} = ${expandedSize.toLocaleString()} chars`,
      );

      // Check against our empirical limits
      const jxaStatus = expandedSize < 523266 ? '✅' : '❌';
      const omniJSStatus = expandedSize < 261124 ? '✅' : '❌';
      console.log(`      JXA limit: ${jxaStatus}  OmniJS limit: ${omniJSStatus}`);
    }
  });
}

/**
 * Find our largest scripts
 */
function findLargestScripts() {
  console.log('\n🔍 Finding Our Largest Current Scripts:');

  const scriptDirs = [
    'src/omnifocus/scripts/tasks',
    'src/omnifocus/scripts/projects',
    'src/omnifocus/scripts/analytics',
    'src/omnifocus/scripts/shared',
  ];

  const allScripts = [];

  scriptDirs.forEach((dir) => {
    try {
      const files = readdirSync(dir);
      files.forEach((file) => {
        if (file.endsWith('.ts')) {
          const filePath = join(dir, file);
          const content = readFileSync(filePath, 'utf8');
          allScripts.push({
            file: filePath,
            size: content.length,
            name: file,
          });
        }
      });
    } catch (error) {
      // Directory might not exist
    }
  });

  // Sort by size, largest first
  allScripts.sort((a, b) => b.size - a.size);

  console.log('   Top 10 Largest Scripts:');
  allScripts.slice(0, 10).forEach((script, index) => {
    console.log(
      `   ${(index + 1).toString().padStart(2)}. ${script.name.padEnd(35)}: ${script.size.toLocaleString()} chars`,
    );
  });

  return allScripts;
}

/**
 * Investigate the "19KB limit" assumption
 */
function investigateAssumptions() {
  console.log('\n🔍 Investigating "19KB Limit" Assumption:');

  // Common sizes that might have led to the assumption
  const referenceSizes = {
    '19KB': 19456,
    '19000 chars': 19000,
    '20KB': 20480,
    'ARG_MAX portion': 65536, // 1/4 of 256KB ARG_MAX
  };

  Object.entries(referenceSizes).forEach(([name, size]) => {
    console.log(`   ${name.padEnd(20)}: ${size.toLocaleString()} chars`);
    console.log(`      vs JXA actual: ${((size / 523266) * 100).toFixed(1)}% of real limit`);
    console.log(`      vs OmniJS actual: ${((size / 261124) * 100).toFixed(1)}% of real limit`);
  });
}

/**
 * Main analysis function
 */
async function analyzeScriptSizes() {
  const helperSizes = await measureHelperSizes();
  const templateSizes = measureScriptTemplates();

  await simulateExpandedSizes(templateSizes, helperSizes);

  const allScripts = findLargestScripts();

  investigateAssumptions();

  // Summary
  console.log('\n📊 ANALYSIS SUMMARY:');
  console.log('─'.repeat(60));
  console.log(`Empirical JXA Limit:     ${(523266).toLocaleString()} chars (~511KB)`);
  console.log(`Empirical OmniJS Limit:  ${(261124).toLocaleString()} chars (~255KB)`);
  console.log(`Assumed "Limit":         ${(19000).toLocaleString()} chars (~19KB)`);
  console.log('');
  console.log(`Assumption was:          ${((19000 / 523266) * 100).toFixed(1)}% of actual JXA limit`);
  console.log(`                         ${((19000 / 261124) * 100).toFixed(1)}% of actual OmniJS limit`);

  // Find scripts that exceed the old assumption but are still valid
  const exceedsAssumption = allScripts.filter((script) => script.size > 19000);

  if (exceedsAssumption.length > 0) {
    console.log('\n🎯 Scripts that exceed "19KB assumption" but should work:');
    exceedsAssumption.forEach((script) => {
      const jxaStatus = script.size < 523266 ? '✅ JXA OK' : '❌ JXA TOO BIG';
      const omniJSStatus = script.size < 261124 ? '✅ OmniJS OK' : '❌ OmniJS TOO BIG';
      console.log(`   ${script.name.padEnd(35)}: ${script.size.toLocaleString()} chars - ${jxaStatus} ${omniJSStatus}`);
    });
  }

  return {
    helperSizes,
    templateSizes,
    allScripts,
    empiricalLimits: {
      jxa: 523266,
      omniJS: 261124,
    },
    assumedLimit: 19000,
  };
}

// Run the analysis
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeScriptSizes().catch(console.error);
}

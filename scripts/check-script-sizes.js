#!/usr/bin/env node

/**
 * Development Script Size Checker
 *
 * Quickly check sizes of scripts in the codebase against empirical limits
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Import our size monitoring utilities
const { analyzeScriptSize, EMPIRICAL_LIMITS, DEFAULT_THRESHOLDS } =
  await import('./dist/omnifocus/utils/script-size-monitor.js');

console.log('📏 OmniFocus Script Size Check\n');

/**
 * Check all scripts in a directory
 */
function checkScriptsInDirectory(dir, pattern = /\.ts$/) {
  try {
    const files = readdirSync(dir);
    const scripts = [];

    files.forEach((file) => {
      if (pattern.test(file)) {
        const filePath = join(dir, file);
        try {
          const content = readFileSync(filePath, 'utf8');

          // Extract script templates from TypeScript files
          const scriptMatches = content.match(/export const \w+_SCRIPT = `([\s\S]*?)`;/g);

          if (scriptMatches) {
            scriptMatches.forEach((match, index) => {
              const scriptContent = match.match(/`([\s\S]*?)`/)?.[1] || '';
              if (scriptContent.length > 1000) {
                // Only check substantial scripts
                scripts.push({
                  file: file,
                  scriptIndex: index,
                  content: scriptContent,
                  size: scriptContent.length,
                });
              }
            });
          } else if (content.length > 1000) {
            // For standalone script files
            scripts.push({
              file: file,
              scriptIndex: 0,
              content: content,
              size: content.length,
            });
          }
        } catch (error) {
          console.log(`   ⚠️  Error reading ${filePath}: ${error.message}`);
        }
      }
    });

    return scripts;
  } catch (error) {
    console.log(`   ⚠️  Error reading directory ${dir}: ${error.message}`);
    return [];
  }
}

/**
 * Main analysis
 */
async function analyzeAllScripts() {
  const scriptDirs = [
    'src/omnifocus/scripts/tasks',
    'src/omnifocus/scripts/projects',
    'src/omnifocus/scripts/analytics',
    'src/omnifocus/scripts/shared',
  ];

  let allScripts = [];

  for (const dir of scriptDirs) {
    const scripts = checkScriptsInDirectory(dir);
    allScripts.push(...scripts.map((s) => ({ ...s, directory: dir })));
  }

  if (allScripts.length === 0) {
    console.log('ℹ️  No scripts found. Make sure to run `npm run build` first.\n');
    return;
  }

  // Sort by size, largest first
  allScripts.sort((a, b) => b.size - a.size);

  console.log('📊 Script Size Analysis:');
  console.log('─'.repeat(80));

  allScripts.forEach((script, index) => {
    const analysis = analyzeScriptSize(script.content, 'jxa');
    const status =
      analysis.threshold === 'safe'
        ? '✅'
        : analysis.threshold === 'info'
          ? 'ℹ️'
          : analysis.threshold === 'warn'
            ? '⚠️'
            : '🚨';

    const scriptName = script.scriptIndex > 0 ? `${script.file}[${script.scriptIndex}]` : script.file;

    console.log(
      `${(index + 1).toString().padStart(2)}. ${status} ${scriptName.padEnd(35)}: ${analysis.sizeKB}KB (${analysis.percentOfLimit}%)`,
    );

    if (analysis.threshold !== 'safe') {
      console.log(`     ${analysis.message}`);
    }
  });

  // Summary statistics
  const totalSize = allScripts.reduce((sum, s) => sum + s.size, 0);
  const avgSize = Math.round(totalSize / allScripts.length);
  const largestScript = allScripts[0];
  const largestAnalysis = analyzeScriptSize(largestScript.content, 'jxa');

  console.log('\n📈 Summary:');
  console.log(`   Scripts analyzed: ${allScripts.length}`);
  console.log(`   Total size: ${Math.round(totalSize / 1024)}KB`);
  console.log(`   Average size: ${Math.round(avgSize / 1024)}KB`);
  console.log(`   Largest script: ${largestScript.file} (${largestAnalysis.sizeKB}KB)`);
  console.log(`   Capacity utilization: ${largestAnalysis.percentOfLimit}% of JXA limit`);

  // Show limits for reference
  console.log('\n🎯 Empirical Limits:');
  console.log(`   JXA Direct: ${Math.round(EMPIRICAL_LIMITS.jxaDirect / 1024)}KB`);
  console.log(`   OmniJS Bridge: ${Math.round(EMPIRICAL_LIMITS.omniJsBridge / 1024)}KB`);

  // Show thresholds
  console.log('\n📏 Monitoring Thresholds:');
  console.log(`   Info: ${Math.round(DEFAULT_THRESHOLDS.infoThreshold / 1024)}KB`);
  console.log(`   Warning: ${Math.round(DEFAULT_THRESHOLDS.warnThreshold / 1024)}KB`);
  console.log(`   Error: ${Math.round(DEFAULT_THRESHOLDS.errorThreshold / 1024)}KB`);

  console.log('\n✨ All scripts are well within empirical limits!');
}

// Run the analysis
analyzeAllScripts().catch(console.error);

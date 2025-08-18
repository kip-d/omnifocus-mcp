#!/usr/bin/env node

/**
 * Analyze tool failure logs to identify patterns and improvement opportunities
 * Usage: npm run analyze-failures [--days=7] [--tool=create_task]
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface FailureLog {
  timestamp: string;
  tool: string;
  errorType: 'VALIDATION_ERROR' | 'EXECUTION_ERROR';
  errorMessage: string;
  validationErrors?: any[];
  inputArgs: any;
  schemaDescription: string;
}

interface FailureStats {
  tool: string;
  totalFailures: number;
  validationErrors: number;
  executionErrors: number;
  commonErrors: Map<string, number>;
  commonFields: Map<string, number>;
  examples: FailureLog[];
}

function analyzeFailures(days: number = 7, specificTool?: string): void {
  const logsDir = join(homedir(), '.omnifocus-mcp', 'tool-failures');
  
  if (!existsSync(logsDir)) {
    console.log('No failure logs found. Logs will be created at:', logsDir);
    return;
  }

  // Get log files from the last N days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const logFiles = readdirSync(logsDir)
    .filter(file => file.startsWith('failures-') && file.endsWith('.jsonl'))
    .filter(file => {
      const dateStr = file.replace('failures-', '').replace('.jsonl', '');
      const fileDate = new Date(dateStr);
      return fileDate >= cutoffDate;
    })
    .sort();

  if (logFiles.length === 0) {
    console.log(`No failure logs found in the last ${days} days`);
    return;
  }

  // Parse all failures
  const failures: FailureLog[] = [];
  for (const file of logFiles) {
    const filePath = join(logsDir, file);
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    
    for (const line of lines) {
      if (line) {
        try {
          const entry = JSON.parse(line);
          if (!specificTool || entry.tool === specificTool) {
            failures.push(entry);
          }
        } catch (e) {
          console.error('Failed to parse log line:', line);
        }
      }
    }
  }

  if (failures.length === 0) {
    console.log(specificTool 
      ? `No failures found for tool: ${specificTool}`
      : 'No failures found in logs');
    return;
  }

  // Analyze failures by tool
  const statsByTool = new Map<string, FailureStats>();
  
  for (const failure of failures) {
    let stats = statsByTool.get(failure.tool);
    if (!stats) {
      stats = {
        tool: failure.tool,
        totalFailures: 0,
        validationErrors: 0,
        executionErrors: 0,
        commonErrors: new Map(),
        commonFields: new Map(),
        examples: [],
      };
      statsByTool.set(failure.tool, stats);
    }
    
    stats.totalFailures++;
    
    if (failure.errorType === 'VALIDATION_ERROR') {
      stats.validationErrors++;
      
      // Extract field names from validation errors
      if (failure.validationErrors) {
        for (const error of failure.validationErrors) {
          const field = error.path?.join('.') || 'unknown';
          stats.commonFields.set(field, (stats.commonFields.get(field) || 0) + 1);
        }
      }
    } else {
      stats.executionErrors++;
    }
    
    // Track common error messages (simplified)
    const simpleError = failure.errorMessage
      .replace(/[0-9a-f]{8,}/gi, 'ID') // Replace IDs with placeholder
      .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE') // Replace dates
      .substring(0, 100); // Truncate for grouping
    
    stats.commonErrors.set(simpleError, (stats.commonErrors.get(simpleError) || 0) + 1);
    
    // Keep a few examples
    if (stats.examples.length < 3) {
      stats.examples.push(failure);
    }
  }

  // Print analysis
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  TOOL FAILURE ANALYSIS - Last ${days} days`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  
  // Sort tools by failure count
  const sortedTools = Array.from(statsByTool.values())
    .sort((a, b) => b.totalFailures - a.totalFailures);
  
  for (const stats of sortedTools) {
    console.log(`📊 ${stats.tool}`);
    console.log(`   Total Failures: ${stats.totalFailures}`);
    console.log(`   Validation Errors: ${stats.validationErrors} (${Math.round(stats.validationErrors / stats.totalFailures * 100)}%)`);
    console.log(`   Execution Errors: ${stats.executionErrors} (${Math.round(stats.executionErrors / stats.totalFailures * 100)}%)`);
    
    if (stats.validationErrors > 0 && stats.commonFields.size > 0) {
      console.log('\n   Most Problematic Fields:');
      const topFields = Array.from(stats.commonFields.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      for (const [field, count] of topFields) {
        console.log(`   - ${field}: ${count} failures`);
      }
    }
    
    if (stats.commonErrors.size > 0) {
      console.log('\n   Common Error Patterns:');
      const topErrors = Array.from(stats.commonErrors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      for (const [error, count] of topErrors) {
        console.log(`   - "${error.substring(0, 60)}...": ${count} times`);
      }
    }
    
    if (stats.examples.length > 0) {
      console.log('\n   Example Failure:');
      const example = stats.examples[0];
      console.log(`   Input: ${JSON.stringify(example.inputArgs).substring(0, 200)}`);
      console.log(`   Error: ${example.errorMessage.substring(0, 150)}`);
    }
    
    console.log('\n───────────────────────────────────────────────────────────────');
  }
  
  // Summary statistics
  console.log('\n📈 SUMMARY');
  console.log(`   Total Tools with Failures: ${statsByTool.size}`);
  console.log(`   Total Failures: ${failures.length}`);
  
  const validationTotal = sortedTools.reduce((sum, s) => sum + s.validationErrors, 0);
  const executionTotal = sortedTools.reduce((sum, s) => sum + s.executionErrors, 0);
  
  console.log(`   Validation Errors: ${validationTotal} (${Math.round(validationTotal / failures.length * 100)}%)`);
  console.log(`   Execution Errors: ${executionTotal} (${Math.round(executionTotal / failures.length * 100)}%)`);
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS');
  
  for (const stats of sortedTools.slice(0, 3)) {
    if (stats.validationErrors > stats.executionErrors) {
      const topField = Array.from(stats.commonFields.entries())
        .sort((a, b) => b[1] - a[1])[0];
      
      if (topField) {
        console.log(`   • ${stats.tool}: Improve description for field "${topField[0]}" (${topField[1]} failures)`);
      }
    } else {
      console.log(`   • ${stats.tool}: Focus on execution error handling`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
}

// Parse command line arguments
const args = process.argv.slice(2);
let days = 7;
let tool: string | undefined;

for (const arg of args) {
  if (arg.startsWith('--days=')) {
    days = parseInt(arg.replace('--days=', ''));
  } else if (arg.startsWith('--tool=')) {
    tool = arg.replace('--tool=', '');
  }
}

analyzeFailures(days, tool);
#!/usr/bin/env node

/**
 * Interactive single tool tester for debugging MCP server issues
 * Provides detailed output and error analysis for individual tool calls
 */

import { execSync } from 'child_process';

// Get command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node test-single-tool.js <tool-name> [arguments-json]');
  console.log('');
  console.log('Examples:');
  console.log('  node test-single-tool.js system \'{"operation":"version"}\'');
  console.log('  node test-single-tool.js tasks \'{"mode":"today","limit":5}\'');
  console.log('  node test-single-tool.js manage_task \'{"operation":"create","name":"Test Task"}\'');
  console.log('');
  console.log('Available tools:');
  console.log('  system, tasks, projects, folders, tags, perspectives');
  console.log('  manage_task, productivity_stats, overdue_analysis, task_velocity, pattern_analysis');
  console.log('  export_tasks, export_projects, bulk_export, review_helper, search');
  process.exit(1);
}

const toolName = args[0];
const toolArgs = args[1] ? JSON.parse(args[1]) : {};

console.log(`🔧 Testing Tool: ${toolName}`);
console.log('=' .repeat(50));
console.log(`Arguments: ${JSON.stringify(toolArgs, null, 2)}`);
console.log('');

const command = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: toolName,
    arguments: toolArgs
  }
};

console.log('📨 Request:');
console.log(JSON.stringify(command, null, 2));
console.log('');

console.log('⏱️  Executing...');
const startTime = Date.now();

try {
  // Execute command and capture stdout (JSON response) and stderr (logs) separately
  const stdout = execSync(`echo '${JSON.stringify(command)}' | node dist/index.js 2>/dev/null`, {
    encoding: 'utf8',
    timeout: 30000 // 30 second timeout
  });
  
  const stderr = execSync(`echo '${JSON.stringify(command)}' | node dist/index.js 2>&1 >/dev/null`, {
    encoding: 'utf8',
    timeout: 30000 // 30 second timeout
  });
  
  const executionTime = Date.now() - startTime;
  console.log(`✅ Completed in ${executionTime}ms`);
  console.log('');
  
  console.log('📤 Stdout (JSON Response):');
  console.log('-'.repeat(30));
  console.log(stdout || '(empty)');
  console.log('-'.repeat(30));
  console.log('');
  
  console.log('📥 Stderr (Logs):'); 
  console.log('-'.repeat(30));
  console.log(stderr || '(empty)');
  console.log('-'.repeat(30));
  console.log('');
  
  // Parse the MCP response from stdout
  if (stdout && stdout.trim()) {
    const jsonLine = stdout.trim();
    console.log('📋 Parsed MCP Response:');
    try {
      const parsed = JSON.parse(jsonLine);
      console.log(JSON.stringify(parsed, null, 2));
      console.log('');
      
      // Parse tool response if available
      if (parsed.result && parsed.result.content && parsed.result.content[0]) {
        console.log('🔍 Tool Response:');
        try {
          const toolResponse = JSON.parse(parsed.result.content[0].text);
          console.log(JSON.stringify(toolResponse, null, 2));
          
          // Analysis
          console.log('');
          console.log('📊 Analysis:');
          if (toolResponse.success) {
            console.log('✅ Status: SUCCESS');
            
            if (toolResponse.data) {
              if (Array.isArray(toolResponse.data)) {
                console.log(`📝 Data: Array with ${toolResponse.data.length} items`);
              } else if (typeof toolResponse.data === 'object') {
                console.log(`📝 Data: Object with keys: ${Object.keys(toolResponse.data).join(', ')}`);
              }
            }
            
            if (toolResponse.metadata) {
              const meta = toolResponse.metadata;
              console.log(`⏱️  Query time: ${meta.query_time_ms || meta.operation_time_ms || 'N/A'}ms`);
              console.log(`💾 From cache: ${meta.from_cache === true ? 'YES' : 'NO'}`);
              if (meta.total_count !== undefined) console.log(`🔢 Total count: ${meta.total_count}`);
            }
          } else {
            console.log('❌ Status: FAILED');
            console.log(`🚫 Error: ${toolResponse.error?.message || toolResponse.message || 'Unknown error'}`);
            console.log(`📍 Code: ${toolResponse.error?.code || 'N/A'}`);
          }
          
        } catch (e) {
          console.log('❌ Could not parse tool response as JSON:');
          console.log(`Error: ${e.message}`);
          console.log(`Raw: ${parsed.result.content[0].text.substring(0, 500)}...`);
        }
      } else if (parsed.error) {
        console.log('❌ MCP Error:');
        console.log(`Message: ${parsed.error.message}`);
        console.log(`Code: ${parsed.error.code}`);
      }
      
    } catch (e) {
      console.log('❌ Could not parse MCP response as JSON:');
      console.log(`Error: ${e.message}`);
      console.log(`Raw: ${jsonLine.substring(0, 500)}...`);
    }
  } else {
    console.log('⚠️  No stdout response - tool may have failed silently');
  }
  
} catch (error) {
  const executionTime = Date.now() - startTime;
  console.log(`💥 Execution failed after ${executionTime}ms`);
  console.log(`Error: ${error.message}`);
  
  if (error.stdout) {
    console.log('');
    console.log('📤 Stdout:');
    console.log(error.stdout);
  }
  
  if (error.stderr) {
    console.log('');
    console.log('📥 Stderr:');
    console.log(error.stderr);
  }
}
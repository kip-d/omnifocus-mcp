#!/usr/bin/env node

/**
 * Comprehensive MCP tool test suite
 * Tests all available tools systematically and provides detailed status report
 */

import { execSync } from 'child_process';

// Get all available tools first
console.log('🔍 Discovering available tools...');
let availableTools = [];
try {
  const toolListResult = execSync('echo \'{"jsonrpc":"2.0","id":1,"method":"tools/list"}\' | node dist/index.js', {
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  const lines = toolListResult.split('\n');
  let jsonLine = null;
  for (const line of lines) {
    if (line.trim().startsWith('{"result"')) {
      jsonLine = line.trim();
      break;
    }
  }
  
  if (jsonLine) {
    const parsed = JSON.parse(jsonLine);
    availableTools = parsed.result.tools.map(tool => tool.name);
  }
} catch (error) {
  console.log('❌ Could not discover tools, using default list');
  availableTools = [
    'system', 'tasks', 'manage_task', 'projects', 'folders', 'tags',
    'perspectives', 'manage_reviews', 'productivity_stats', 'task_velocity',
    'analyze_overdue', 'workflow_analysis', 'pattern_analysis', 
    'export_tasks', 'export_projects', 'bulk_export', 'search'
  ];
}

console.log(`Found ${availableTools.length} tools: ${availableTools.join(', ')}`);
console.log('');

// Define test scenarios for each tool
const testScenarios = [
  // System tools (should always work)
  { 
    tool: 'system', 
    args: { operation: 'version' },
    description: 'System version check',
    category: 'system',
    shouldWork: true
  },
  { 
    tool: 'system', 
    args: { operation: 'diagnostics' },
    description: 'System diagnostics',
    category: 'system',
    shouldWork: true
  },
  
  // Task tools (require OmniFocus data)
  { 
    tool: 'tasks', 
    args: { mode: 'all', limit: 1 },
    description: 'Basic task query (1 task)',
    category: 'tasks',
    shouldWork: true
  },
  { 
    tool: 'tasks', 
    args: { mode: 'today', limit: 5 },
    description: 'Today\'s tasks',
    category: 'tasks',
    shouldWork: true
  },
  { 
    tool: 'tasks', 
    args: { mode: 'flagged' },
    description: 'Flagged tasks',
    category: 'tasks',
    shouldWork: true
  },
  
  // Task management
  { 
    tool: 'manage_task', 
    args: { operation: 'create', name: 'Test Task from Comprehensive Suite', tags: ['test'] },
    description: 'Create test task',
    category: 'task_management',
    shouldWork: true
  },
  
  // Project tools
  { 
    tool: 'projects', 
    args: { operation: 'list', limit: 5 },
    description: 'Project list (5 items)',
    category: 'projects',
    shouldWork: true
  },
  
  // Other data tools
  { 
    tool: 'tags', 
    args: { operation: 'active' },
    description: 'Active tags list',
    category: 'organization',
    shouldWork: true
  },
  { 
    tool: 'folders', 
    args: { operation: 'list' },
    description: 'Folder list',
    category: 'organization',
    shouldWork: true
  },
  
  // Analytics tools (slower, might fail if no data)
  { 
    tool: 'productivity_stats', 
    args: { period: 'today', includeProjectStats: false, includeTagStats: false },
    description: 'Basic productivity stats',
    category: 'analytics',
    shouldWork: false // Might return 0 data legitimately
  },
  { 
    tool: 'analyze_overdue', 
    args: { includeAnalysis: false },
    description: 'Overdue analysis',
    category: 'analytics',
    shouldWork: false // Might return 0 data legitimately
  },
  
  // Export tools
  { 
    tool: 'export_tasks', 
    args: { format: 'json', mode: 'all', limit: 1 },
    description: 'Export 1 task as JSON',
    category: 'export',
    shouldWork: true
  }
];

// Filter scenarios to only include available tools
const availableScenarios = testScenarios.filter(scenario => 
  availableTools.includes(scenario.tool)
);

console.log(`Running ${availableScenarios.length} test scenarios...`);
console.log('=' .repeat(60));
console.log('');

const results = {
  passed: 0,
  failed: 0,
  noOutput: 0,
  errors: 0,
  details: []
};

for (const scenario of availableScenarios) {
  const command = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: scenario.tool,
      arguments: scenario.args
    }
  };
  
  console.log(`🧪 ${scenario.description}`);
  console.log(`   Tool: ${scenario.tool}, Category: ${scenario.category}`);
  
  const startTime = Date.now();
  let result = {
    scenario: scenario.description,
    tool: scenario.tool,
    category: scenario.category,
    status: 'unknown',
    executionTime: 0,
    error: null,
    hasOutput: false,
    hasValidResponse: false,
    cacheStatus: null,
    dataReturned: false
  };
  
  try {
    const output = execSync(`echo '${JSON.stringify(command)}' | node dist/index.js`, {
      encoding: 'utf8',
      timeout: 15000, // 15 second timeout per test
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    result.executionTime = Date.now() - startTime;
    result.hasOutput = output.length > 0;
    
    if (!result.hasOutput) {
      result.status = 'no_output';
      results.noOutput++;
      console.log(`   ⚠️  NO OUTPUT (${result.executionTime}ms)`);
    } else {
      // Try to parse the response
      const lines = output.split('\n');
      let jsonLine = null;
      for (const line of lines) {
        if (line.trim().startsWith('{"result"') || line.trim().startsWith('{"error"')) {
          jsonLine = line.trim();
          break;
        }
      }
      
      if (jsonLine) {
        try {
          const parsed = JSON.parse(jsonLine);
          result.hasValidResponse = true;
          
          if (parsed.result && parsed.result.content && parsed.result.content[0]) {
            const toolResponse = JSON.parse(parsed.result.content[0].text);
            
            if (toolResponse.success) {
              result.status = 'success';
              result.dataReturned = !!toolResponse.data;
              result.cacheStatus = toolResponse.metadata?.from_cache;
              results.passed++;
              
              let dataInfo = '';
              if (toolResponse.data) {
                if (Array.isArray(toolResponse.data)) {
                  dataInfo = ` (${toolResponse.data.length} items)`;
                } else if (toolResponse.data.stats && toolResponse.data.stats.overview) {
                  const overview = toolResponse.data.stats.overview;
                  dataInfo = ` (${overview.totalTasks || 0} tasks, ${overview.completedTasks || 0} completed)`;
                }
              }
              
              console.log(`   ✅ SUCCESS (${result.executionTime}ms)${dataInfo}`);
              if (result.cacheStatus !== null) {
                console.log(`      Cache: ${result.cacheStatus ? 'HIT' : 'MISS'}`);
              }
            } else {
              result.status = 'tool_error';
              result.error = toolResponse.error?.message || toolResponse.message || 'Unknown tool error';
              results.failed++;
              console.log(`   ❌ TOOL ERROR (${result.executionTime}ms)`);
              console.log(`      ${result.error}`);
            }
          } else if (parsed.error) {
            result.status = 'mcp_error';
            result.error = parsed.error.message;
            results.errors++;
            console.log(`   ❌ MCP ERROR (${result.executionTime}ms)`);
            console.log(`      ${result.error}`);
          }
        } catch (parseError) {
          result.status = 'parse_error';
          result.error = parseError.message;
          results.errors++;
          console.log(`   ❌ PARSE ERROR (${result.executionTime}ms)`);
          console.log(`      ${parseError.message}`);
        }
      } else {
        result.status = 'invalid_output';
        results.errors++;
        console.log(`   ❌ INVALID OUTPUT (${result.executionTime}ms)`);
        console.log(`      No JSON found in ${output.length} chars`);
      }
    }
    
  } catch (execError) {
    result.executionTime = Date.now() - startTime;
    result.status = 'execution_error';
    result.error = execError.message;
    results.errors++;
    console.log(`   💥 EXECUTION ERROR (${result.executionTime}ms)`);
    console.log(`      ${execError.message}`);
  }
  
  results.details.push(result);
  console.log('');
}

// Summary report
console.log('📊 COMPREHENSIVE TEST RESULTS');
console.log('=' .repeat(60));
console.log(`Total tests: ${availableScenarios.length}`);
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`⚠️  No output: ${results.noOutput}`);
console.log(`💥 Errors: ${results.errors}`);
console.log('');

// Category breakdown
const categoryStats = {};
results.details.forEach(result => {
  if (!categoryStats[result.category]) {
    categoryStats[result.category] = { passed: 0, failed: 0, noOutput: 0, errors: 0 };
  }
  
  if (result.status === 'success') categoryStats[result.category].passed++;
  else if (result.status === 'tool_error') categoryStats[result.category].failed++;
  else if (result.status === 'no_output') categoryStats[result.category].noOutput++;
  else categoryStats[result.category].errors++;
});

console.log('📈 BY CATEGORY:');
Object.entries(categoryStats).forEach(([category, stats]) => {
  const total = stats.passed + stats.failed + stats.noOutput + stats.errors;
  console.log(`${category}: ${stats.passed}/${total} passed (${Math.round(stats.passed/total*100)}%)`);
});
console.log('');

// Problem areas
const problemTools = results.details.filter(r => r.status !== 'success');
if (problemTools.length > 0) {
  console.log('⚠️  PROBLEM AREAS:');
  problemTools.forEach(problem => {
    console.log(`- ${problem.tool}: ${problem.status}${problem.error ? ' (' + problem.error + ')' : ''}`);
  });
  console.log('');
}

// Caching analysis
const cacheResults = results.details.filter(r => r.cacheStatus !== null);
if (cacheResults.length > 0) {
  const cacheHits = cacheResults.filter(r => r.cacheStatus === true).length;
  console.log(`💾 CACHING: ${cacheHits}/${cacheResults.length} hits (${Math.round(cacheHits/cacheResults.length*100)}%)`);
  if (cacheHits === 0) {
    console.log('   ⚠️  No cache hits found - caching may not be working properly');
  }
  console.log('');
}

console.log('Test suite complete. Use test-single-tool.js for detailed debugging of specific tools.');

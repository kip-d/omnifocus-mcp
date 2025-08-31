#!/usr/bin/env node

/**
 * Simple Token Usage Analysis for OmniFocus Database
 * Analyzes estimated token usage under different compression approaches
 * Uses actual database sizes: 1,158 tasks and 124 projects
 */

console.log('🔍 Token Usage Analysis for OmniFocus Database\n');

// Actual database sizes from user
const ACTUAL_TASK_COUNT = 1158;
const ACTUAL_PROJECT_COUNT = 124;
const ACTUAL_TAG_COUNT = 50;

console.log('📊 Database Overview:');
console.log(`  📋 Tasks: ${ACTUAL_TASK_COUNT.toLocaleString()}`);
console.log(`  📁 Projects: ${ACTUAL_PROJECT_COUNT.toLocaleString()}`);
console.log(`  🏷️  Tags: ${ACTUAL_TAG_COUNT.toLocaleString()}`);
console.log(`  💾 Total Items: ${(ACTUAL_TASK_COUNT + ACTUAL_PROJECT_COUNT + ACTUAL_TAG_COUNT).toLocaleString()}\n`);

// Sample data structures for analysis
const sampleTask = {
  id: "abc123def456",
  name: "Sample task name that represents typical length",
  note: "This is a sample note that shows typical note length in OmniFocus tasks",
  flagged: true,
  dueDate: "2025-01-15T10:00:00.000Z",
  deferDate: "2025-01-10T09:00:00.000Z",
  estimatedMinutes: 120,
  tags: ["work", "urgent", "project-a"],
  project: "Sample Project Name",
  projectId: "proj123def456",
  inInbox: false,
  completed: false,
  taskStatus: "Next",
  blocked: false,
  next: true,
  available: true,
  recurringStatus: {
    isRecurring: false,
    type: "non-recurring",
    source: "core"
  }
};

const sampleProject = {
  id: "proj123def456",
  name: "Sample Project Name That Shows Typical Length",
  note: "This is a sample project note that demonstrates typical project note length",
  status: "active",
  folder: "Work Projects",
  dueDate: "2025-02-15T17:00:00.000Z",
  flagged: true,
  sequential: false,
  nextReviewDate: "2025-01-30T04:00:00.000Z",
  reviewInterval: {
    unit: "week",
    steps: 2
  },
  completedByChildren: false,
  singleton: false
};

const sampleTag = {
  id: "tag123def456",
  name: "Sample Tag Name",
  taskCount: 15
};

// Token estimation function (1 token ≈ 4 characters for English text)
function estimateTokens(text) {
  return Math.round(text.length / 4);
}

// Approach 1: Raw Export (current format)
function estimateRawExport() {
  const sampleData = {
    tasks: [sampleTask],
    projects: [sampleProject],
    tags: [sampleTag]
  };

  const sampleJson = JSON.stringify(sampleData, null, 2);
  const sampleTokens = estimateTokens(sampleJson);
  
  // Estimate total based on actual database sizes
  const estimatedTotal = Math.round(sampleTokens * ACTUAL_TASK_COUNT * 1.2); // Add 20% for overhead
  
  return {
    sampleTokens,
    estimatedTotal,
    contextUsage: Math.round((estimatedTotal / 200000) * 100)
  };
}

// Approach 2: Smart Summarization
function estimateSmartSummary() {
  const summary = {
    system_summary: {
      total_tasks: ACTUAL_TASK_COUNT,
      active_projects: Math.round(ACTUAL_PROJECT_COUNT * 0.8), // Assume 80% active
      overdue_count: Math.round(ACTUAL_TASK_COUNT * 0.05), // Assume 5% overdue
      flagged_count: Math.round(ACTUAL_TASK_COUNT * 0.15), // Assume 15% flagged
      completion_rate: "68%"
    },
    priority_analysis: {
      high_priority: ["Project A", "Project B", "Project C"],
      blocked_tasks: ["Task X", "Task Y", "Task Z"],
      next_actions: ["Task 1", "Task 2", "Task 3"]
    },
    project_status: {
      active: Math.round(ACTUAL_PROJECT_COUNT * 0.8),
      on_hold: Math.round(ACTUAL_PROJECT_COUNT * 0.15),
      completed: Math.round(ACTUAL_PROJECT_COUNT * 0.05)
    }
  };

  const sampleJson = JSON.stringify(summary, null, 2);
  const sampleTokens = estimateTokens(sampleJson);
  
  // Smart summary scales minimally with size
  const estimatedTotal = Math.round(sampleTokens * 1.5);
  
  return {
    sampleTokens,
    estimatedTotal,
    contextUsage: Math.round((estimatedTotal / 200000) * 100)
  };
}

// Approach 3: Hierarchical Compression
function estimateHierarchical() {
  const hierarchical = {
    projects: [{
      id: sampleProject.id,
      name: sampleProject.name,
      status: sampleProject.status,
      tasks: [{
        id: sampleTask.id,
        name: sampleTask.name,
        status: sampleTask.completed ? 'completed' : 'active',
        due: sampleTask.dueDate,
        flagged: sampleTask.flagged
      }]
    }],
    tags: [{
      name: sampleTag.name,
      count: sampleTag.taskCount
    }]
  };

  const sampleJson = JSON.stringify(hierarchical, null, 2);
  const sampleTokens = estimateTokens(sampleJson);
  
  // Hierarchical scales moderately with project count
  const estimatedTotal = Math.round(sampleTokens * ACTUAL_PROJECT_COUNT * 1.3);
  
  return {
    sampleTokens,
    estimatedTotal,
    contextUsage: Math.round((estimatedTotal / 200000) * 100)
  };
}

// Approach 4: Query-Based Export
function estimateQueryBased() {
  const queryResults = {
    query: "overdue_and_blocked_analysis",
    data: {
      overdue: [{
        id: sampleTask.id,
        name: sampleTask.name,
        days_overdue: 3
      }],
      blocked: [{
        id: sampleTask.id,
        name: sampleTask.name,
        project: sampleTask.project
      }],
      next_actions: [{
        id: sampleTask.id,
        name: sampleTask.name,
        project: sampleTask.project
      }]
    },
    summary: {
      total_overdue: Math.round(ACTUAL_TASK_COUNT * 0.05),
      total_blocked: Math.round(ACTUAL_TASK_COUNT * 0.03),
      total_next: Math.round(ACTUAL_TASK_COUNT * 0.12)
    }
  };

  const sampleJson = JSON.stringify(queryResults, null, 2);
  const sampleTokens = estimateTokens(sampleJson);
  
  // Query-based is very efficient
  const estimatedTotal = Math.round(sampleTokens * 2);
  
  return {
    sampleTokens,
    estimatedTotal,
    contextUsage: Math.round((estimatedTotal / 200000) * 100)
  };
}

// Run the analysis
console.log('🔢 Token Usage Analysis:\n');

// Approach 1: Raw Export
const rawExport = estimateRawExport();
console.log('📄 Approach 1: Raw Export (Current Format)');
console.log(`   Sample tokens: ${rawExport.sampleTokens.toLocaleString()}`);
console.log(`   Estimated total: ${rawExport.estimatedTotal.toLocaleString()} tokens`);
console.log(`   Context usage: ${rawExport.contextUsage}% of 200k context`);

// Approach 2: Smart Summarization
const smartSummary = estimateSmartSummary();
console.log('\n🧠 Approach 2: Smart Summarization');
console.log(`   Sample tokens: ${smartSummary.sampleTokens.toLocaleString()}`);
console.log(`   Estimated total: ${smartSummary.estimatedTotal.toLocaleString()} tokens`);
console.log(`   Context usage: ${smartSummary.contextUsage}% of 200k context`);

// Approach 3: Hierarchical Compression
const hierarchical = estimateHierarchical();
console.log('\n🏗️  Approach 3: Hierarchical Compression');
console.log(`   Sample tokens: ${hierarchical.sampleTokens.toLocaleString()}`);
console.log(`   Estimated total: ${hierarchical.estimatedTotal.toLocaleString()} tokens`);
console.log(`   Context usage: ${hierarchical.contextUsage}% of 200k context`);

// Approach 4: Query-Based Export
const queryBased = estimateQueryBased();
console.log('\n🔍 Approach 4: Query-Based Export');
console.log(`   Sample tokens: ${queryBased.sampleTokens.toLocaleString()}`);
console.log(`   Estimated total: ${queryBased.estimatedTotal.toLocaleString()} tokens`);
console.log(`   Context usage: ${queryBased.contextUsage}% of 200k context`);

// Recommendations
console.log('\n💡 Recommendations:\n');

if (rawExport.contextUsage > 100) {
  console.log('❌ Raw export exceeds context window - not suitable for LLM analysis');
} else if (rawExport.contextUsage > 80) {
  console.log('⚠️  Raw export uses most of context window - limited room for analysis');
} else {
  console.log('✅ Raw export fits in context window - good for detailed analysis');
}

if (smartSummary.contextUsage < 20) {
  console.log('✅ Smart summary very efficient - excellent for system-wide insights');
} else if (smartSummary.contextUsage < 50) {
  console.log('✅ Smart summary efficient - good for comprehensive analysis');
} else {
  console.log('⚠️  Smart summary uses significant context - consider query-based approach');
}

if (hierarchical.contextUsage < 40) {
  console.log('✅ Hierarchical compression good - preserves relationships efficiently');
} else {
  console.log('⚠️  Hierarchical compression uses significant context');
}

if (queryBased.contextUsage < 10) {
  console.log('✅ Query-based very efficient - excellent for focused analysis');
} else {
  console.log('✅ Query-based efficient - good for specific insights');
}

console.log('\n🎯 Best approach for LLM analysis:');
if (queryBased.contextUsage < 20) {
  console.log('   Query-based export - most efficient, focused insights');
} else if (smartSummary.contextUsage < 30) {
  console.log('   Smart summary - comprehensive overview, efficient');
} else if (hierarchical.contextUsage < 50) {
  console.log('   Hierarchical compression - preserves relationships');
} else {
  console.log('   Raw export - full fidelity, but uses most context');
}

// Additional insights
console.log('\n📈 Scaling Analysis:');
console.log(`   • Raw export scales linearly with task count: ~${Math.round(rawExport.estimatedTotal / ACTUAL_TASK_COUNT)} tokens per task`);
console.log(`   • Smart summary scales minimally: ~${Math.round(smartSummary.estimatedTotal / ACTUAL_TASK_COUNT)} tokens per task`);
console.log(`   • Hierarchical scales with project count: ~${Math.round(hierarchical.estimatedTotal / ACTUAL_PROJECT_COUNT)} tokens per project`);
console.log(`   • Query-based is constant: ~${queryBased.estimatedTotal} tokens regardless of database size`);

console.log('\n🚀 Implementation Priority:');
console.log('   1. Query-based export - immediate value, minimal tokens');
console.log('   2. Smart summary - comprehensive insights, efficient scaling');
console.log('   3. Hierarchical compression - relationship preservation');
console.log('   4. Raw export - full fidelity, but token-intensive');

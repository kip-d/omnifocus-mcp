#!/usr/bin/env node
/**
 * Test Zod type coercion for MCP string parameters
 * MCP sends all parameters as strings, so we need to coerce them to proper types
 */

import { 
  ListTasksSchema,
  TodaysAgendaSchema,
  CreateTaskSchema,
  ListProjectsSchema,
  ListTagsSchema
} from '../../src/tools/schemas/index.js';

console.log('Testing Zod type coercion for MCP string parameters...\n');

// Test cases simulating MCP string inputs
const testCases = [
  {
    name: 'ListTasks with string numbers and booleans',
    schema: ListTasksSchema,
    input: {
      limit: "50",           // MCP sends as string
      offset: "10",          // MCP sends as string
      completed: "true",     // MCP sends as string
      flagged: "false",      // MCP sends as string
      includeCompleted: "1"  // MCP might send as "1" for true
    },
    expected: {
      limit: 50,
      offset: 10,
      completed: true,
      flagged: false,
      includeCompleted: true
    }
  },
  {
    name: 'TodaysAgenda with string values',
    schema: TodaysAgendaSchema,
    input: {
      includeFlagged: "true",
      includeOverdue: "false",
      includeAvailable: "1",
      includeDetails: "0",
      limit: "100"
    },
    expected: {
      includeFlagged: true,
      includeOverdue: false,
      includeAvailable: true,
      includeDetails: false,
      limit: 100
    }
  },
  {
    name: 'CreateTask with string boolean',
    schema: CreateTaskSchema,
    input: {
      name: "Test task",
      flagged: "true",
      estimatedMinutes: "30"
    },
    expected: {
      name: "Test task",
      flagged: true,
      estimatedMinutes: 30
    }
  },
  {
    name: 'ListProjects with string values',
    schema: ListProjectsSchema,
    input: {
      flagged: "true",
      includeTaskCounts: "false",
      includeStats: "1",
      limit: "25"
    },
    expected: {
      flagged: true,
      includeTaskCounts: false,
      includeStats: true,
      limit: 25,
      sortBy: 'name',  // default
      sortOrder: 'asc' // default
    }
  },
  {
    name: 'ListTags with edge cases',
    schema: ListTagsSchema,
    input: {
      includeEmpty: "yes",      // Non-standard true value
      includeUsageStats: "no",  // Non-standard false value
      includeTaskCounts: ""     // Empty string
    },
    expected: {
      includeEmpty: true,       // "yes" coerces to true
      includeUsageStats: false, // "no" coerces to false (might be true actually)
      includeTaskCounts: false, // Empty string coerces to false
      sortBy: 'name'           // default
    }
  }
];

let passed = 0;
let failed = 0;

testCases.forEach(test => {
  try {
    const result = test.schema.parse(test.input);
    
    // Check if key values match expected
    let success = true;
    const mismatches: string[] = [];
    
    Object.entries(test.expected).forEach(([key, expectedValue]) => {
      if (result[key] !== expectedValue) {
        success = false;
        mismatches.push(`${key}: expected ${expectedValue}, got ${result[key]}`);
      }
    });
    
    if (success) {
      console.log(`✅ ${test.name}`);
      console.log(`   Input: ${JSON.stringify(test.input)}`);
      console.log(`   Parsed: ${JSON.stringify(result)}`);
      passed++;
    } else {
      console.log(`❌ ${test.name}`);
      console.log(`   Mismatches: ${mismatches.join(', ')}`);
      console.log(`   Full result: ${JSON.stringify(result)}`);
      failed++;
    }
  } catch (error: any) {
    console.log(`❌ ${test.name} - Failed to parse`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Input: ${JSON.stringify(test.input)}`);
    failed++;
  }
  console.log();
});

// Test default values with empty input
console.log('Testing default values with empty input...');
const emptyListTasks = ListTasksSchema.parse({});
console.log('ListTasks defaults:', {
  limit: emptyListTasks.limit,
  offset: emptyListTasks.offset
});

const emptyTodaysAgenda = TodaysAgendaSchema.parse({});
console.log('TodaysAgenda defaults:', {
  includeFlagged: emptyTodaysAgenda.includeFlagged,
  includeOverdue: emptyTodaysAgenda.includeOverdue,
  includeAvailable: emptyTodaysAgenda.includeAvailable,
  includeDetails: emptyTodaysAgenda.includeDetails,
  limit: emptyTodaysAgenda.limit
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
console.log('\n✅ Type coercion test complete!');
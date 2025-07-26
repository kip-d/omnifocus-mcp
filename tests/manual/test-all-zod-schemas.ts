#!/usr/bin/env node
/**
 * Test all Zod schemas after migration
 * This script tests various invalid inputs against our Zod schemas
 * to ensure they provide proper validation errors.
 */

import { 
  ListTasksSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  ListProjectsSchema,
  CreateProjectSchema,
  ListTagsSchema,
  ManageTagsSchema,
  ProductivityStatsSchema,
  ExportTasksSchema
} from '../../src/tools/schemas/index.js';
import { z } from 'zod';

const testCases = [
  {
    name: 'ListTasks - Invalid limit type',
    schema: ListTasksSchema,
    input: { limit: "not a number" },
    expectedError: /Expected number.*received string/
  },
  {
    name: 'ListTasks - Limit too high',
    schema: ListTasksSchema,
    input: { limit: 1500 },
    expectedError: /Number must be less than or equal to 1000/
  },
  {
    name: 'CreateTask - Missing name',
    schema: CreateTaskSchema,
    input: { note: "A task without a name" },
    expectedError: /Required/
  },
  {
    name: 'CreateTask - Invalid due date',
    schema: CreateTaskSchema,
    input: { name: "Test task", dueDate: "not-a-date" },
    expectedError: /Invalid ISO 8601 date format/
  },
  {
    name: 'UpdateTask - Missing taskId',
    schema: UpdateTaskSchema,
    input: { name: "Updated name" },
    expectedError: /Required/
  },
  {
    name: 'ListProjects - Invalid status',
    schema: ListProjectsSchema,
    input: { status: ["invalid-status"] },
    expectedError: /Invalid enum value/
  },
  {
    name: 'CreateProject - Empty name',
    schema: CreateProjectSchema,
    input: { name: "" },
    expectedError: /String must contain at least 1 character/
  },
  {
    name: 'ManageTags - Rename without newName',
    schema: ManageTagsSchema,
    input: { action: "rename", tagName: "old-tag" },
    expectedError: /newName is required for rename action/
  },
  {
    name: 'ProductivityStats - Invalid period',
    schema: ProductivityStatsSchema,
    input: { period: "century" },
    expectedError: /Invalid enum value/
  },
  {
    name: 'ExportTasks - Invalid format',
    schema: ExportTasksSchema,
    input: { format: "xml" },
    expectedError: /Invalid enum value/
  }
];

console.log('Testing Zod schema validation...\n');

let passed = 0;
let failed = 0;

testCases.forEach(test => {
  try {
    // This should throw a ZodError
    test.schema.parse(test.input);
    
    console.log(`❌ ${test.name}`);
    console.log(`   Expected validation error but none was thrown`);
    console.log(`   Input: ${JSON.stringify(test.input)}`);
    failed++;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors[0].message;
      if (test.expectedError.test(errorMessage)) {
        console.log(`✅ ${test.name}`);
        console.log(`   Error: ${errorMessage}`);
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        console.log(`   Expected: ${test.expectedError}`);
        console.log(`   Got: ${errorMessage}`);
        failed++;
      }
    } else {
      console.log(`❌ ${test.name}`);
      console.log(`   Unexpected error type: ${error}`);
      failed++;
    }
  }
  console.log();
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);

// Test default values
console.log('\nTesting default values...');
const listTasksDefaults = ListTasksSchema.parse({});
console.log('ListTasks defaults:', {
  limit: listTasksDefaults.limit,
  offset: listTasksDefaults.offset,
  skipAnalysis: listTasksDefaults.skipAnalysis
});

const productivityDefaults = ProductivityStatsSchema.parse({});
console.log('ProductivityStats defaults:', {
  period: productivityDefaults.period,
  groupBy: productivityDefaults.groupBy,
  includeCompleted: productivityDefaults.includeCompleted
});

console.log('\n✅ Zod migration test complete!');
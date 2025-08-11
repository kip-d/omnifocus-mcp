#!/usr/bin/env node

import { UpdateProjectTool } from '../dist/tools/projects/UpdateProjectTool.js';
import { CacheManager } from '../dist/cache/CacheManager.js';

console.log('Testing UpdateProjectTool schema...\n');

const cache = new CacheManager();
const tool = new UpdateProjectTool(cache);

console.log('Tool name:', tool.name);
console.log('Description:', tool.description);
console.log('\nInput Schema:', JSON.stringify(tool.inputSchema, null, 2));

// Test a sample input
const testInput = {
  projectId: "test123",
  updates: {
    name: "Updated Project Name",
    note: "Updated note"
  }
};

console.log('\nTesting with sample input:', JSON.stringify(testInput, null, 2));

try {
  // Test schema validation
  const validated = tool.schema.parse(testInput);
  console.log('\nValidation successful!');
  console.log('Validated data:', JSON.stringify(validated, null, 2));
} catch (error) {
  console.error('\nValidation failed:', error.message);
}
#!/usr/bin/env node

import { ManageTagsTool } from '../dist/tools/tags/ManageTagsTool.js';
import { CacheManager } from '../dist/cache/CacheManager.js';
import { z } from 'zod';

// Test the schema directly
console.log('Testing ManageTagsTool schema...\n');

const cache = new CacheManager();
const tool = new ManageTagsTool(cache);

console.log('Tool name:', tool.name);
console.log('Description:', tool.description);
console.log('\nInput Schema:', JSON.stringify(tool.inputSchema, null, 2));

// Test if the schema is a ZodEffects
console.log('\nSchema type:', tool.schema.constructor.name);
console.log('Is ZodEffects?', tool.schema instanceof z.ZodEffects);

// Try to access the inner schema if it's a refinement
if (tool.schema._def && tool.schema._def.schema) {
  console.log('\nInner schema found!');
  console.log('Inner schema type:', tool.schema._def.schema.constructor.name);
}
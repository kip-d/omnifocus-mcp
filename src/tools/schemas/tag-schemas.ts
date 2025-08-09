import { z } from 'zod';
import { TagNameSchema } from './shared-schemas.js';
import { coerceBoolean } from './coercion-helpers.js';

/**
 * Tag-related schema definitions
 */

// Tag entity schema
export const TagSchema = z.object({
  name: TagNameSchema,
  taskCount: z.number().optional(),
  availableTaskCount: z.number().optional(),
});

// List tags parameters
export const ListTagsSchema = z.object({
  sortBy: z.enum(['name', 'usage', 'tasks'])
    .default('name')
    .describe('How to sort the tags'),

  includeEmpty: coerceBoolean()
    .default(true)
    .describe('Include tags with no tasks'),

  includeUsageStats: coerceBoolean()
    .default(false)
    .describe('Calculate task usage statistics for each tag (slower on large databases)'),

  includeTaskCounts: coerceBoolean()
    .default(false)  // Daily-first: skip counts for faster tag listing
    .describe('Include task count information for each tag (default: false for daily use, enable for tag management)'),

  fastMode: coerceBoolean()
    .default(true)  // Daily-first: skip hierarchy processing for speed
    .describe('Fast mode: Skip parent/child relationships for better performance (default: true for daily use)'),

  namesOnly: coerceBoolean()
    .default(false)  // Keep false as we still need IDs for tag operations
    .describe('Ultra-fast mode: Return only tag names without IDs or hierarchy'),
});

// Manage tags parameters
export const ManageTagsSchema = z.object({
  action: z.enum(['create', 'rename', 'delete', 'merge'])
    .describe('The action to perform'),

  tagName: TagNameSchema
    .describe('The tag name to create or operate on'),

  newName: TagNameSchema
    .optional()
    .describe('New name for rename operation'),

  targetTag: TagNameSchema
    .optional()
    .describe('Target tag for merge operation'),
})
.refine(
  data => data.action !== 'rename' || data.newName !== undefined,
  {
    message: 'newName is required for rename action',
    path: ['newName'],
  },
)
.refine(
  data => data.action !== 'merge' || data.targetTag !== undefined,
  {
    message: 'targetTag is required for merge action',
    path: ['targetTag'],
  },
);

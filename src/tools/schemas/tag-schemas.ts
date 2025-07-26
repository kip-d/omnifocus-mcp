import { z } from 'zod';
import { TagNameSchema } from './shared-schemas.js';

/**
 * Tag-related schema definitions
 */

// Tag entity schema
export const TagSchema = z.object({
  name: TagNameSchema,
  taskCount: z.number().optional(),
  availableTaskCount: z.number().optional()
});

// List tags parameters
export const ListTagsSchema = z.object({
  includeTaskCounts: z.boolean()
    .default(true)
    .describe('Include task count information for each tag')
});

// Manage tags parameters
export const ManageTagsSchema = z.object({
  operation: z.enum(['create', 'rename', 'delete'])
    .describe('Tag operation to perform'),
  
  tagName: TagNameSchema
    .describe('Tag name to operate on'),
  
  newName: TagNameSchema
    .optional()
    .describe('New name for rename operation')
})
.refine(
  data => data.operation !== 'rename' || data.newName !== undefined,
  {
    message: 'newName is required for rename operation',
    path: ['newName']
  }
);
import { z } from 'zod';
import { 
  IdSchema, 
  SearchTextSchema 
} from './shared-schemas.js';
import { coerceBoolean, coerceNumber } from './coercion-helpers.js';

/**
 * Folder-related schema definitions
 */

// Folder status schema
export const FolderStatusSchema = z.enum(['active', 'dropped'])
  .describe('Folder status: active or dropped');

// Folder entity schema
export const FolderSchema = z.object({
  id: IdSchema,
  name: z.string(),
  status: FolderStatusSchema,
  parent: z.string().optional(), // Parent folder name
  parentId: IdSchema.optional(), // Parent folder ID
  children: z.array(z.string()).optional(), // Child folder names
  projects: z.array(z.string()).optional(), // Project names in this folder
  depth: z.number().optional(), // Hierarchy depth (0 = root)
  path: z.string().optional(), // Full hierarchy path
  primaryKey: z.string().optional()
});

// List folders parameters
export const ListFoldersSchema = z.object({
  status: z.array(FolderStatusSchema)
    .optional()
    .describe('Filter by folder status'),
  
  search: SearchTextSchema
    .optional()
    .describe('Search in folder names'),
  
  includeHierarchy: coerceBoolean()
    .default(true)
    .describe('Include parent/child hierarchy information'),
  
  includeProjects: coerceBoolean()
    .default(false)
    .describe('Include project names contained in each folder'),
  
  sortBy: z.enum(['name', 'modificationDate', 'status', 'depth'])
    .optional()
    .default('name')
    .describe('Sort field'),
  
  sortOrder: z.enum(['asc', 'desc'])
    .optional()
    .default('asc')
    .describe('Sort order'),
  
  limit: coerceNumber()
    .int()
    .positive()
    .max(500)
    .default(100)
    .describe('Maximum number of folders to return')
});

// Create folder parameters
export const CreateFolderSchema = z.object({
  name: z.string()
    .min(1)
    .describe('Folder name (required)'),
  
  parent: z.string()
    .optional()
    .describe('Parent folder name (creates at root if not specified)'),
  
  position: z.enum(['beginning', 'ending', 'before', 'after'])
    .optional()
    .default('ending')
    .describe('Position within parent folder'),
  
  relativeToFolder: z.string()
    .optional()
    .describe('Folder name for relative positioning (required for before/after)'),
  
  status: FolderStatusSchema
    .default('active')
    .describe('Initial folder status')
});

// Update folder parameters
export const UpdateFolderSchema = z.object({
  folderId: IdSchema
    .describe('ID of the folder to update'),
  
  updates: z.object({
    name: z.string()
      .min(1)
      .optional()
      .describe('New folder name'),
    
    status: FolderStatusSchema
      .optional()
      .describe('New folder status')
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one update field must be provided'
  })
});

// Move folder parameters
export const MoveFolderSchema = z.object({
  folderId: IdSchema
    .describe('ID of the folder to move'),
  
  newParent: z.string()
    .optional()
    .describe('New parent folder name (move to root if not specified)'),
  
  position: z.enum(['beginning', 'ending', 'before', 'after'])
    .optional()
    .default('ending')
    .describe('Position within new parent'),
  
  relativeToFolder: z.string()
    .optional()
    .describe('Folder name for relative positioning (required for before/after)')
});

// Delete folder parameters
export const DeleteFolderSchema = z.object({
  folderId: IdSchema
    .describe('ID of the folder to delete'),
  
  moveContentsTo: z.string()
    .optional()
    .describe('Folder name to move contents to (moves to root if not specified)'),
  
  force: coerceBoolean()
    .default(false)
    .describe('Force deletion even if folder contains projects (moves projects to specified folder or root)')
});
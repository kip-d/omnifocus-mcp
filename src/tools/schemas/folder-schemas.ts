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

// ========================================
// CONSOLIDATED TOOL SCHEMAS
// ========================================

// ManageFolderTool operation schemas (discriminated unions)

// Create operation
export const CreateFolderOperationSchema = z.object({
  operation: z.literal('create'),
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

// Update operation
export const UpdateFolderOperationSchema = z.object({
  operation: z.literal('update'),
  folderId: IdSchema
    .describe('ID of the folder to update'),
  name: z.string()
    .min(1)
    .optional()
    .describe('New folder name'),
  status: FolderStatusSchema
    .optional()
    .describe('New folder status')
});

// Delete operation
export const DeleteFolderOperationSchema = z.object({
  operation: z.literal('delete'),
  folderId: IdSchema
    .describe('ID of the folder to delete'),
  moveContentsTo: z.string()
    .optional()
    .describe('Folder name to move contents to (moves to root if not specified)'),
  force: coerceBoolean()
    .default(false)
    .describe('Force deletion even if folder contains projects')
});

// Move operation
export const MoveFolderOperationSchema = z.object({
  operation: z.literal('move'),
  folderId: IdSchema
    .describe('ID of the folder to move'),
  parentId: z.string()
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

// Set status operation
export const SetFolderStatusOperationSchema = z.object({
  operation: z.literal('set_status'),
  folderId: IdSchema
    .describe('ID of the folder to update'),
  status: FolderStatusSchema
    .describe('New folder status')
});

// Duplicate operation
export const DuplicateFolderOperationSchema = z.object({
  operation: z.literal('duplicate'),
  folderId: IdSchema
    .describe('ID of the folder to duplicate'),
  newName: z.string()
    .min(1)
    .describe('Name for the duplicated folder')
});

// ManageFolderTool main schema (discriminated union)
export const ManageFolderSchema = z.discriminatedUnion('operation', [
  CreateFolderOperationSchema,
  UpdateFolderOperationSchema,
  DeleteFolderOperationSchema,
  MoveFolderOperationSchema,
  SetFolderStatusOperationSchema,
  DuplicateFolderOperationSchema
]);

// QueryFoldersTool operation schemas (discriminated unions)

// List operation
export const ListFoldersOperationSchema = z.object({
  operation: z.literal('list'),
  status: z.array(FolderStatusSchema)
    .optional()
    .describe('Filter by folder status'),
  includeDetails: coerceBoolean()
    .default(true)
    .describe('Include detailed folder information'),
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

// Get operation
export const GetFolderOperationSchema = z.object({
  operation: z.literal('get'),
  folderId: IdSchema
    .describe('ID of the folder to retrieve'),
  includeDetails: coerceBoolean()
    .default(true)
    .describe('Include detailed folder information including projects')
});

// Search operation
export const SearchFoldersOperationSchema = z.object({
  operation: z.literal('search'),
  searchTerm: z.string()
    .min(1)
    .describe('Search term to find folders by name'),
  includeDetails: coerceBoolean()
    .default(true)
    .describe('Include detailed folder information'),
  limit: coerceNumber()
    .int()
    .positive()
    .max(500)
    .default(100)
    .describe('Maximum number of folders to return')
});

// Get projects operation
export const GetFolderProjectsOperationSchema = z.object({
  operation: z.literal('get_projects'),
  folderId: IdSchema
    .describe('ID of the folder to get projects from')
});

// QueryFoldersTool main schema (discriminated union)
export const QueryFoldersSchema = z.discriminatedUnion('operation', [
  ListFoldersOperationSchema,
  GetFolderOperationSchema,
  SearchFoldersOperationSchema,
  GetFolderProjectsOperationSchema
]);
import { z } from 'zod';
import { 
  DateTimeSchema, 
  OptionalDateTimeSchema, 
  IdSchema, 
  ProjectStatusSchema,
  SearchTextSchema 
} from './shared-schemas.js';

/**
 * Project-related schema definitions
 */

// Project entity schema
export const ProjectSchema = z.object({
  id: IdSchema,
  name: z.string(),
  note: z.string().optional(),
  status: ProjectStatusSchema,
  flagged: z.boolean(),
  dueDate: OptionalDateTimeSchema,
  deferDate: OptionalDateTimeSchema,
  completionDate: OptionalDateTimeSchema,
  folder: z.string().optional(),
  taskCount: z.number().optional(),
  availableTaskCount: z.number().optional(),
  remainingTaskCount: z.number().optional(),
  primaryKey: z.string().optional()
});

// List projects parameters
export const ListProjectsSchema = z.object({
  status: z.array(ProjectStatusSchema)
    .optional()
    .describe('Filter by project status'),
  
  flagged: z.boolean()
    .optional()
    .describe('Filter by flagged status'),
  
  folder: z.string()
    .optional()
    .describe('Filter by folder name'),
  
  search: SearchTextSchema
    .optional()
    .describe('Search in project names and notes'),
  
  includeTaskCounts: z.boolean()
    .default(true)
    .describe('Include task count information'),
  
  includeStats: z.boolean()
    .default(false)
    .describe('Calculate detailed task statistics for each project (slower on large databases)'),
  
  sortBy: z.enum(['name', 'dueDate', 'modificationDate', 'status'])
    .optional()
    .default('name')
    .describe('Sort field'),
  
  sortOrder: z.enum(['asc', 'desc'])
    .optional()
    .default('asc')
    .describe('Sort order'),
  
  limit: z.number()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe('Maximum number of projects to return')
});

// Create project parameters
export const CreateProjectSchema = z.object({
  name: z.string()
    .min(1)
    .describe('Project name (required)'),
  
  note: z.string()
    .optional()
    .describe('Project note/description'),
  
  folder: z.string()
    .optional()
    .describe('Folder to create project in (will be created if needed)'),
  
  status: ProjectStatusSchema
    .default('active')
    .describe('Initial project status'),
  
  flagged: z.boolean()
    .default(false)
    .describe('Whether the project is flagged'),
  
  dueDate: DateTimeSchema
    .optional()
    .describe('Due date for the project'),
  
  deferDate: DateTimeSchema
    .optional()
    .describe('Defer date for the project')
});

// Update project parameters
export const UpdateProjectSchema = z.object({
  projectId: IdSchema
    .describe('ID of the project to update'),
  
  updates: z.object({
    name: z.string()
      .min(1)
      .optional()
      .describe('New project name'),
    
    note: z.string()
      .optional()
      .describe('New project note'),
    
    status: ProjectStatusSchema
      .optional()
      .describe('New project status'),
    
    flagged: z.boolean()
      .optional()
      .describe('New flagged status'),
    
    folder: z.string()
      .optional()
      .describe('Move to different folder'),
    
    dueDate: z.union([DateTimeSchema, z.null()])
      .optional()
      .describe('New due date (or null to clear)'),
    
    deferDate: z.union([DateTimeSchema, z.null()])
      .optional()
      .describe('New defer date (or null to clear)')
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one update field must be provided'
  })
});

// Complete project parameters
export const CompleteProjectSchema = z.object({
  projectId: IdSchema
    .describe('ID of the project to complete'),
  
  completionDate: DateTimeSchema
    .optional()
    .describe('Completion date (defaults to now)'),
  
  completeAllTasks: z.boolean()
    .default(false)
    .describe('Complete all incomplete tasks in the project')
});

// Delete project parameters
export const DeleteProjectSchema = z.object({
  projectId: IdSchema
    .describe('ID of the project to delete'),
  
  deleteTasks: z.boolean()
    .default(false)
    .describe('Delete all tasks in the project (otherwise they move to Inbox)')
});
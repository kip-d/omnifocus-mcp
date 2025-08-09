import { z } from 'zod';
import {
  DateTimeSchema,
  OptionalDateTimeSchema,
  IdSchema,
  ProjectStatusSchema,
  SearchTextSchema,
} from './shared-schemas.js';
import { RepeatRuleSchema, ExistingRepeatRuleSchema } from './repeat-schemas.js';
import { coerceBoolean, coerceNumber } from './coercion-helpers.js';

/**
 * Project-related schema definitions
 */

// Review interval schema
export const ReviewIntervalSchema = z.object({
  unit: z.enum(['day', 'week', 'month', 'year']).describe('Time unit for review interval'),
  steps: z.number().int().positive().describe('Number of units between reviews'),
  fixed: z.boolean().optional().default(false).describe('Whether to use fixed scheduling (true) or floating (false)')
}).describe('Review interval configuration');

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
  primaryKey: z.string().optional(),
  // Review-related fields
  lastReviewDate: OptionalDateTimeSchema,
  nextReviewDate: OptionalDateTimeSchema,
  reviewInterval: ReviewIntervalSchema.optional(),
  // Advanced project properties
  completedByChildren: z.boolean().optional(),
  singleton: z.boolean().optional(),
  // Repeat/recurrence support
  repetitionRule: ExistingRepeatRuleSchema.optional()
});

// List projects parameters
export const ListProjectsSchema = z.object({
  status: z.array(ProjectStatusSchema)
    .optional()
    .describe('Filter by project status'),

  flagged: coerceBoolean()
    .optional()
    .describe('Filter by flagged status'),

  folder: z.string()
    .optional()
    .describe('Filter by folder name'),

  search: SearchTextSchema
    .optional()
    .describe('Search in project names and notes'),

  includeTaskCounts: coerceBoolean()
    .default(true)
    .describe('Include task count information'),

  includeStats: coerceBoolean()
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

  limit: coerceNumber()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe('Maximum number of projects to return'),

  performanceMode: z.enum(['normal', 'lite'])
    .optional()
    .default('normal')
    .describe('Performance mode: "lite" skips expensive operations like task counts and next task lookups for faster queries on large databases'),
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

  flagged: coerceBoolean()
    .default(false)
    .describe('Whether the project is flagged'),

  dueDate: DateTimeSchema
    .optional()
    .describe('Due date for the project'),

  deferDate: DateTimeSchema
    .optional()
    .describe('Defer date for the project'),

  sequential: coerceBoolean()
    .default(false)
    .describe('Whether tasks must be completed in order (sequential) or can be done in any order (parallel)'),
  
  // Review-related fields
  nextReviewDate: DateTimeSchema
    .optional()
    .describe('Date when this project should next be reviewed'),
  
  reviewInterval: ReviewIntervalSchema
    .optional()
    .describe('How often this project should be reviewed'),
  
  // Advanced project properties
  completedByChildren: coerceBoolean()
    .optional()
    .describe('Whether project auto-completes when all tasks are done'),
  
  singleton: coerceBoolean()
    .optional()
    .describe('Whether this is a single action list (true) vs sequential/parallel (false)'),
  
  repeatRule: RepeatRuleSchema
    .optional()
    .describe('Repeat/recurrence rule for the project. Supports complex patterns including weekly days and monthly positions.')
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

    flagged: coerceBoolean()
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
      .describe('New defer date (or null to clear)'),

    sequential: coerceBoolean()
      .optional()
      .describe('Whether tasks must be completed in order (sequential) or can be done in any order (parallel)'),
    
    // Review-related fields
    lastReviewDate: z.union([DateTimeSchema, z.null()])
      .optional()
      .describe('Date when project was last reviewed (or null to clear)'),
    
    nextReviewDate: z.union([DateTimeSchema, z.null()])
      .optional()
      .describe('Date when project should next be reviewed (or null to clear)'),
    
    reviewInterval: z.union([ReviewIntervalSchema, z.null()])
      .optional()
      .describe('How often this project should be reviewed (or null to clear)'),
    
    // Advanced project properties
    completedByChildren: coerceBoolean()
      .optional()
      .describe('Whether project auto-completes when all tasks are done'),
    
    singleton: coerceBoolean()
      .optional()
      .describe('Whether this is a single action list (true) vs sequential/parallel (false)'),
    
    repeatRule: RepeatRuleSchema
      .optional()
      .describe('New repeat/recurrence rule for the project. Replaces existing repeat rule.'),
    
    clearRepeatRule: coerceBoolean()
      .optional()
      .describe('Set to true to remove the existing repeat rule')
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one update field must be provided',
  }),
});

// Complete project parameters
export const CompleteProjectSchema = z.object({
  projectId: IdSchema
    .describe('ID of the project to complete'),

  completionDate: DateTimeSchema
    .optional()
    .describe('Completion date (defaults to now)'),

  completeAllTasks: coerceBoolean()
    .default(false)
    .describe('Complete all incomplete tasks in the project'),
});

// Delete project parameters
export const DeleteProjectSchema = z.object({
  projectId: IdSchema
    .describe('ID of the project to delete'),

  deleteTasks: coerceBoolean()
    .default(false)
    .describe('Delete all tasks in the project (otherwise they move to Inbox)'),
});

// Projects for review parameters
export const ProjectsForReviewSchema = z.object({
  overdue: coerceBoolean()
    .default(false)
    .describe('Show only projects overdue for review'),
  
  daysAhead: coerceNumber()
    .int()
    .min(0)
    .max(365)
    .default(7)
    .describe('Include projects due for review within this many days'),
  
  status: z.array(ProjectStatusSchema)
    .optional()
    .describe('Filter by project status (defaults to Active only)'),
  
  folder: z.string()
    .optional()
    .describe('Filter by folder name'),
  
  limit: coerceNumber()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe('Maximum number of projects to return')
});

// Mark project reviewed parameters
export const MarkProjectReviewedSchema = z.object({
  projectId: IdSchema
    .describe('ID of the project to mark as reviewed'),
  
  reviewDate: DateTimeSchema
    .optional()
    .describe('Date of the review (defaults to now)'),
  
  updateNextReviewDate: coerceBoolean()
    .default(true)
    .describe('Whether to automatically calculate the next review date based on the review interval')
});

// Set review schedule parameters
export const SetReviewScheduleSchema = z.object({
  projectIds: z.array(IdSchema)
    .min(1)
    .describe('IDs of projects to update review schedules for'),
  
  reviewInterval: ReviewIntervalSchema
    .describe('Review interval to apply to all projects'),
  
  nextReviewDate: DateTimeSchema
    .optional()
    .describe('Next review date to set (if not provided, calculated from review interval)')
});

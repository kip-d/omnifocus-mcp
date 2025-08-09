import { z } from 'zod';
import {
  DateTimeSchema,
  LocalDateTimeSchema,
  OptionalDateTimeSchema,
  IdSchema,
  TagNameSchema,
  PaginationSchema,
  SearchTextSchema,
  PerformanceOptionsSchema,
} from './shared-schemas.js';
import { RepeatRuleSchema, ExistingRepeatRuleSchema } from './repeat-schemas.js';
import { coerceBoolean, coerceNumber } from './coercion-helpers.js';

/**
 * Task-related schema definitions
 */

// Task entity schema
export const TaskSchema = z.object({
  id: IdSchema,
  name: z.string(),
  note: z.string().optional(),
  completed: z.boolean(),
  flagged: z.boolean(),
  projectId: z.string().optional(),
  tags: z.array(TagNameSchema),
  dueDate: OptionalDateTimeSchema,
  deferDate: OptionalDateTimeSchema,
  completionDate: OptionalDateTimeSchema,
  estimatedMinutes: z.number().min(0).optional(),
  inInbox: z.boolean().optional(),
  available: z.boolean().optional(),
  remainingCount: z.number().optional(),
  repetitionMethod: z.string().optional(),
  repetitionRule: ExistingRepeatRuleSchema.optional(),
  primaryKey: z.string().optional(),
  
  // Advanced status properties
  taskStatus: z.string().optional(),
  blocked: z.boolean().optional(),
  next: z.boolean().optional()
});

// List tasks parameters - with coercion for MCP string inputs
export const ListTasksSchema = z.object({
  completed: coerceBoolean()
    .optional()
    .describe('Filter by completion status'),

  flagged: coerceBoolean()
    .optional()
    .describe('Filter by flagged status'),

  projectId: z.string()
    .optional()
    .describe('Filter by project ID'),

  tags: z.array(TagNameSchema)
    .optional()
    .describe('Filter by tag names (tasks must have ALL specified tags)'),

  dueBefore: DateTimeSchema
    .optional()
    .describe('Filter tasks due before this date'),

  dueAfter: DateTimeSchema
    .optional()
    .describe('Filter tasks due after this date'),

  deferBefore: DateTimeSchema
    .optional()
    .describe('Filter tasks deferred before this date'),

  deferAfter: DateTimeSchema
    .optional()
    .describe('Filter tasks deferred after this date'),

  available: coerceBoolean()
    .optional()
    .describe('Filter by availability (considering defer dates)'),

  inInbox: coerceBoolean()
    .optional()
    .describe('Filter for inbox tasks only'),

  search: SearchTextSchema
    .optional()
    .describe('Search in task names and notes'),

  includeCompleted: coerceBoolean()
    .optional()
    .describe('Include completed tasks in results'),
  
  // Advanced status filters
  taskStatus: z.enum(['Available', 'Blocked', 'Completed', 'Dropped', 'DueSoon', 'Next', 'Overdue'])
    .optional()
    .describe('Filter by specific task status'),
  
  blocked: coerceBoolean()
    .optional()
    .describe('Filter for blocked tasks (waiting on other incomplete tasks)'),
  
  next: coerceBoolean()
    .optional()
    .describe('Filter for next actions (available tasks not blocked by others)'),
  
  sortBy: z.enum(['dueDate', 'deferDate', 'name', 'project', 'flagged'])
    .optional()
    .describe('Sort results by field'),

  sortOrder: z.enum(['asc', 'desc'])
    .optional()
    .default('asc')
    .describe('Sort order'),
})
.merge(PaginationSchema)
.merge(PerformanceOptionsSchema);

// Get task count parameters (same as list but without pagination)
export const GetTaskCountSchema = ListTasksSchema.omit({
  limit: true,
  offset: true,
  sortBy: true,
  sortOrder: true,
});

// Today's agenda parameters - with coercion for MCP string inputs
export const TodaysAgendaSchema = z.object({
  includeFlagged: coerceBoolean()
    .default(true)
    .describe('Include flagged tasks regardless of due date'),

  includeOverdue: coerceBoolean()
    .default(true)
    .describe('Include overdue tasks'),

  includeAvailable: coerceBoolean()
    .default(true)
    .describe('Only include available tasks (not blocked/deferred)'),

  includeDetails: coerceBoolean()
    .default(false)
    .describe('Include task details (note, project, tags). Defaults to false for better performance'),

  limit: coerceNumber()
    .int()
    .positive()
    .max(200)
    .default(50)
    .describe('Maximum number of tasks to return'),
});

// Create task parameters
export const CreateTaskSchema = z.object({
  name: z.string()
    .min(1)
    .describe('Task name (required)'),

  note: z.string()
    .optional()
    .describe('Task note/description'),

  projectId: IdSchema
    .optional()
    .describe('Project ID to assign the task to'),

  parentTaskId: IdSchema
    .optional()
    .describe('Parent task ID to create this task as a subtask/child'),

  flagged: coerceBoolean()
    .default(false)
    .describe('Whether the task is flagged'),

  dueDate: LocalDateTimeSchema
    .optional()
    .describe('Due date in your local time (e.g., 2024-01-15 or 2024-01-15 14:30)'),

  deferDate: LocalDateTimeSchema
    .optional()
    .describe('Defer date in your local time (e.g., 2024-01-15 or 2024-01-15 09:00)'),

  estimatedMinutes: coerceNumber()
    .int()
    .positive()
    .optional()
    .describe('Estimated duration in minutes'),

  tags: z.array(TagNameSchema)
    .optional()
    .describe('Tags to assign (note: requires separate update call due to JXA limitations)'),

  sequential: coerceBoolean()
    .default(false)
    .describe('Whether subtasks must be completed in order (sequential) or can be done in any order (parallel). Only applies if task has subtasks.'),
  
  repeatRule: RepeatRuleSchema
    .optional()
    .describe('Repeat/recurrence rule for the task. Supports complex patterns including weekly days and monthly positions.')
});

// Update task parameters
export const UpdateTaskSchema = z.object({
  taskId: IdSchema
    .describe('ID of the task to update'),

  name: z.string()
    .min(1)
    .optional()
    .describe('New task name'),

  note: z.string()
    .optional()
    .describe('New task note'),

  projectId: z.union([IdSchema, z.null()])
    .describe('New project ID from list_projects (or null to move to inbox)')
    .optional(),

  parentTaskId: z.union([IdSchema, z.null()])
    .describe('Parent task ID to make this a subtask (or null to make it a top-level task)')
    .optional(),

  flagged: coerceBoolean()
    .optional()
    .describe('New flagged status'),

  dueDate: LocalDateTimeSchema
    .optional()
    .describe('New due date in your local time'),

  clearDueDate: coerceBoolean()
    .optional()
    .describe('Set to true to clear the existing due date'),

  deferDate: LocalDateTimeSchema
    .optional()
    .describe('New defer date in your local time'),

  clearDeferDate: coerceBoolean()
    .optional()
    .describe('Set to true to clear the existing defer date'),

  estimatedMinutes: coerceNumber().int().positive()
    .optional()
    .describe('New estimated duration in minutes'),

  clearEstimatedMinutes: coerceBoolean()
    .optional()
    .describe('Set to true to clear the existing time estimate'),

  tags: z.array(TagNameSchema)
    .optional()
    .describe('New tags (replaces all existing tags)'),

  sequential: coerceBoolean()
    .optional()
    .describe('Whether subtasks must be completed in order (sequential) or can be done in any order (parallel). Only applies if task has subtasks.'),
  
  repeatRule: RepeatRuleSchema
    .optional()
    .describe('New repeat/recurrence rule for the task. Replaces existing repeat rule.'),
  
  clearRepeatRule: coerceBoolean()
    .optional()
    .describe('Set to true to remove the existing repeat rule')
});

// Complete task parameters
export const CompleteTaskSchema = z.object({
  taskId: IdSchema
    .describe('ID of the task to complete'),

  completionDate: LocalDateTimeSchema
    .optional()
    .describe('Completion date in your local time (defaults to now)'),
});

// Delete task parameters
export const DeleteTaskSchema = z.object({
  taskId: IdSchema
    .describe('ID of the task to delete'),
});

// Batch operations removed - OmniFocus JXA API doesn't support bulk operations
// Individual operations (create_task, update_task, complete_task, delete_task) work perfectly
// and should be used for all workflows. If OmniFocus updates their API in the future,
// batch operations may be re-implemented for performance optimization.

// Date range query schemas - flexible query tool
export const DateRangeQueryToolSchema = z.object({
  queryType: z.enum(['date_range', 'overdue', 'upcoming'])
    .default('date_range')
    .describe('Type of date query to perform'),

  // For date_range queries
  startDate: DateTimeSchema
    .optional()
    .describe('Start date (ISO format). Required for date_range query when endDate is not provided.'),

  endDate: DateTimeSchema
    .optional()
    .describe('End date (ISO format). Required for date_range query when startDate is not provided.'),

  dateField: z.enum(['dueDate', 'deferDate', 'completionDate'])
    .default('dueDate')
    .describe('Which date field to query on (for date_range query)'),

  includeNullDates: coerceBoolean()
    .default(false)
    .describe('Include tasks without the specified date field (for date_range query)'),

  // For upcoming queries
  days: coerceNumber()
    .int()
    .positive()
    .max(365)
    .default(7)
    .describe('Number of days to look ahead (for upcoming query)'),

  includeToday: coerceBoolean()
    .default(true)
    .describe('Include today in upcoming tasks (for upcoming query)'),

  // For overdue queries
  includeCompleted: coerceBoolean()
    .default(false)
    .describe('Include completed tasks (for overdue query)'),

  // Common parameters
  limit: coerceNumber()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe('Maximum number of tasks to return'),
});

// Simpler overdue tasks schema
export const OverdueTasksToolSchema = z.object({
  includeCompleted: coerceBoolean()
    .default(false)
    .describe('Include completed overdue tasks'),

  limit: coerceNumber()
    .int()
    .positive()
    .max(1000)
    .default(50)
    .describe('Maximum number of tasks to return'),
});

// Simpler upcoming tasks schema
export const UpcomingTasksToolSchema = z.object({
  days: coerceNumber()
    .int()
    .positive()
    .max(365)
    .default(7)
    .describe('Number of days to look ahead'),

  includeToday: coerceBoolean()
    .default(true)
    .describe('Include tasks due today'),

  limit: coerceNumber()
    .int()
    .positive()
    .max(1000)
    .default(50)
    .describe('Maximum number of tasks to return'),
});

// Keep original schemas for potential future use
export const DateRangeQuerySchema = z.object({
  dateField: z.enum(['dueDate', 'deferDate', 'completionDate'])
    .describe('Which date field to query'),

  operator: z.enum(['equals', 'before', 'after', 'between', 'isNull', 'isNotNull'])
    .describe('Comparison operator'),

  date: DateTimeSchema
    .optional()
    .describe('Date for comparison (required for most operators)'),

  endDate: DateTimeSchema
    .optional()
    .describe('End date for between operator'),

  includeNullDates: coerceBoolean()
    .default(false)
    .describe('Include tasks with null dates in results'),
})
.merge(ListTasksSchema.pick({
  completed: true,
  projectId: true,
  tags: true,
  limit: true,
  offset: true,
}));

export const OverdueTasksSchema = z.object({
  asOf: DateTimeSchema
    .optional()
    .describe('Reference date for overdue calculation (defaults to now)'),

  includeToday: coerceBoolean()
    .default(false)
    .describe('Include tasks due today as overdue'),
})
.merge(ListTasksSchema.pick({
  projectId: true,
  tags: true,
  limit: true,
  offset: true,
}));

export const UpcomingTasksSchema = z.object({
  days: coerceNumber()
    .int()
    .positive()
    .max(365)
    .default(7)
    .describe('Number of days to look ahead'),

  includeOverdue: coerceBoolean()
    .default(false)
    .describe('Include overdue tasks'),
})
.merge(ListTasksSchema.pick({
  projectId: true,
  tags: true,
  limit: true,
  offset: true,
}));

// Consolidated Query Tasks Schema - consolidates 8 task query tools into one
export const QueryTasksToolSchema = z.object({
  queryType: z.enum([
    'list',          // General list with filters (replaces list_tasks)
    'search',        // Search in task names/notes (new functionality)
    'next_actions',  // Available next actions (replaces next_actions)
    'blocked',       // Tasks blocked by other tasks (replaces blocked_tasks) 
    'available',     // All available/workable tasks (replaces available_tasks)
    'overdue',       // Past due tasks (replaces get_overdue_tasks)
    'upcoming'       // Due in next N days (replaces get_upcoming_tasks)
  ])
    .describe('Type of task query to perform'),
  
  // For search query type
  searchTerm: SearchTextSchema
    .optional()
    .describe('Search term for names and notes (search query type)'),
  
  // Core filtering (applies to most query types)
  completed: coerceBoolean()
    .optional()
    .describe('Filter by completion status'),
    
  flagged: coerceBoolean()
    .optional()
    .describe('Filter by flagged status'),
    
  projectId: z.string()
    .optional()
    .describe('Filter by project ID'),
    
  tags: z.array(TagNameSchema)
    .optional()
    .describe('Filter by tag names (tasks must have ALL specified tags)'),
  
  // Date filtering (mainly for list, search query types)
  dueBefore: DateTimeSchema
    .optional()
    .describe('Filter tasks due before this date'),
    
  dueAfter: DateTimeSchema
    .optional()
    .describe('Filter tasks due after this date'),
    
  deferBefore: DateTimeSchema
    .optional()
    .describe('Filter tasks deferred before this date'),
    
  deferAfter: DateTimeSchema
    .optional()
    .describe('Filter tasks deferred after this date'),
  
  // Specialized parameters for specific query types
  
  // For upcoming query type
  daysAhead: coerceNumber()
    .int()
    .positive()
    .max(365)
    .default(7)
    .describe('Number of days to look ahead (upcoming query type)'),
    
  includeToday: coerceBoolean()
    .default(true)
    .describe('Include tasks due today (upcoming query type)'),
  
  // For overdue query type
  includeCompleted: coerceBoolean()
    .default(false)
    .describe('Include completed overdue tasks (overdue query type)'),
  
  // For blocked query type
  showBlockingTasks: coerceBoolean()
    .default(true)
    .describe('Include information about blocking tasks (blocked query type)'),
    
  // For available query type
  includeFlagged: coerceBoolean()
    .default(true)
    .describe('Include flagged tasks (available query type)'),
  
  // Common parameters
  available: coerceBoolean()
    .optional()
    .describe('Filter by availability (considering defer dates)'),
    
  inInbox: coerceBoolean()
    .optional()
    .describe('Filter for inbox tasks only'),
    
  includeDetails: coerceBoolean()
    .default(true)
    .describe('Include task details like notes, project info, and tags'),
    
  sortBy: z.enum(['dueDate', 'deferDate', 'name', 'project', 'flagged'])
    .optional()
    .describe('Sort results by field'),
    
  sortOrder: z.enum(['asc', 'desc'])
    .optional()
    .default('asc')
    .describe('Sort order'),
    
  limit: coerceNumber()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe('Maximum number of tasks to return'),
    
  // Performance options
  skipAnalysis: coerceBoolean()
    .default(false)
    .describe('Skip recurring task analysis for 30% faster queries')
});

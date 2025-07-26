import { z } from 'zod';
import { 
  DateTimeSchema, 
  OptionalDateTimeSchema, 
  IdSchema, 
  TagNameSchema,
  PaginationSchema,
  SearchTextSchema,
  PerformanceOptionsSchema
} from './shared-schemas.js';

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
  primaryKey: z.string().optional()
});

// List tasks parameters
export const ListTasksSchema = z.object({
  completed: z.boolean()
    .optional()
    .describe('Filter by completion status'),
  
  flagged: z.boolean()
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
  
  available: z.boolean()
    .optional()
    .describe('Filter by availability (considering defer dates)'),
  
  inInbox: z.boolean()
    .optional()
    .describe('Filter for inbox tasks only'),
  
  search: SearchTextSchema
    .optional()
    .describe('Search in task names and notes'),
  
  includeCompleted: z.boolean()
    .optional()
    .describe('Include completed tasks in results'),
  
  sortBy: z.enum(['dueDate', 'deferDate', 'name', 'project', 'flagged'])
    .optional()
    .describe('Sort results by field'),
  
  sortOrder: z.enum(['asc', 'desc'])
    .optional()
    .default('asc')
    .describe('Sort order')
})
.merge(PaginationSchema)
.merge(PerformanceOptionsSchema);

// Get task count parameters (same as list but without pagination)
export const GetTaskCountSchema = ListTasksSchema.omit({ 
  limit: true, 
  offset: true,
  sortBy: true,
  sortOrder: true
});

// Today's agenda parameters
export const TodaysAgendaSchema = z.object({
  includeFlagged: z.boolean()
    .default(true)
    .describe('Include flagged tasks regardless of due date'),
  
  includeOverdue: z.boolean()
    .default(true)
    .describe('Include overdue tasks'),
  
  includeAvailable: z.boolean()
    .default(true)
    .describe('Only include available tasks (not blocked/deferred)'),
  
  includeDetails: z.boolean()
    .default(false)
    .describe('Include task details (note, project, tags). Defaults to false for better performance'),
  
  limit: z.number()
    .int()
    .positive()
    .max(200)
    .default(50)
    .describe('Maximum number of tasks to return')
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
  
  flagged: z.boolean()
    .default(false)
    .describe('Whether the task is flagged'),
  
  dueDate: DateTimeSchema
    .optional()
    .describe('Due date for the task'),
  
  deferDate: DateTimeSchema
    .optional()
    .describe('Defer date for the task'),
  
  estimatedMinutes: z.number()
    .int()
    .positive()
    .optional()
    .describe('Estimated duration in minutes'),
  
  tags: z.array(TagNameSchema)
    .optional()
    .describe('Tags to assign (note: requires separate update call due to JXA limitations)')
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
    .optional()
    .describe('New project ID (or null to move to inbox)'),
  
  flagged: z.boolean()
    .optional()
    .describe('New flagged status'),
  
  dueDate: DateTimeSchema
    .optional()
    .describe('New due date'),
  
  clearDueDate: z.boolean()
    .optional()
    .describe('Set to true to clear the existing due date'),
  
  deferDate: DateTimeSchema
    .optional()
    .describe('New defer date'),
  
  clearDeferDate: z.boolean()
    .optional()
    .describe('Set to true to clear the existing defer date'),
  
  estimatedMinutes: z.number().int().positive()
    .optional()
    .describe('New estimated duration in minutes'),
  
  clearEstimatedMinutes: z.boolean()
    .optional()
    .describe('Set to true to clear the existing time estimate'),
  
  tags: z.array(TagNameSchema)
    .optional()
    .describe('New tags (replaces all existing tags)')
});

// Complete task parameters
export const CompleteTaskSchema = z.object({
  taskId: IdSchema
    .describe('ID of the task to complete'),
  
  completionDate: DateTimeSchema
    .optional()
    .describe('Completion date (defaults to now)')
});

// Delete task parameters
export const DeleteTaskSchema = z.object({
  taskId: IdSchema
    .describe('ID of the task to delete')
});

// Batch operations schemas
export const BatchTaskIdsSchema = z.object({
  taskIds: z.array(IdSchema)
    .min(1)
    .max(100)
    .describe('List of task IDs to process')
});

// Schema for batch updating multiple tasks with different updates each
export const BatchUpdateTasksSchema = z.object({
  updates: z.array(z.object({
    taskId: IdSchema.describe('ID of the task to update'),
    updates: z.object({
      name: z.string().optional().describe('New task name'),
      note: z.string().optional().describe('New task note'),
      flagged: z.boolean().optional().describe('Flag status'),
      dueDate: z.string().optional().describe('ISO date string or null to clear'),
      deferDate: z.string().optional().describe('ISO date string or null to clear'),
      estimatedMinutes: z.number().optional().describe('Estimated duration'),
      projectId: z.string().optional().describe('Project ID or empty string for inbox')
    }).describe('Properties to update')
  }))
  .min(1)
  .max(100)
  .describe('Array of task updates')
});

// Schema for batch completing tasks
export const BatchCompleteTasksSchema = z.object({
  taskIds: z.array(IdSchema)
    .min(1)
    .max(100)
    .describe('Array of task IDs to complete'),
  
  completionDate: DateTimeSchema
    .optional()
    .describe('Optional ISO date string for completion date (defaults to now)')
});

// Schema for batch deleting tasks  
export const BatchDeleteTasksSchema = z.object({
  taskIds: z.array(IdSchema)
    .min(1)
    .max(100)
    .describe('Array of task IDs to delete')
});

// Schema for mixed batch operations
export const BatchMixedOperationsSchema = z.object({
  operations: z.array(z.object({
    action: z.enum(['update', 'complete', 'delete']).describe('Action to perform'),
    taskId: IdSchema.describe('ID of the task'),
    data: z.object({
      completionDate: z.string().optional().describe('For complete action'),
      name: z.string().optional().describe('For update action'),
      note: z.string().optional().describe('For update action'),
      flagged: z.boolean().optional().describe('For update action'),
      dueDate: z.string().optional().describe('For update action'),
      deferDate: z.string().optional().describe('For update action')
    }).optional().describe('Data for the action (required for update, optional for complete)')
  }))
  .min(1)
  .max(100)
  .describe('Array of operations to perform')
});

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
    
  includeNullDates: z.boolean()
    .default(false)
    .describe('Include tasks without the specified date field (for date_range query)'),
    
  // For upcoming queries
  days: z.number()
    .int()
    .positive()
    .max(365)
    .default(7)
    .describe('Number of days to look ahead (for upcoming query)'),
    
  includeToday: z.boolean()
    .default(true)
    .describe('Include today in upcoming tasks (for upcoming query)'),
    
  // For overdue queries
  includeCompleted: z.boolean()
    .default(false)
    .describe('Include completed tasks (for overdue query)'),
    
  // Common parameters
  limit: z.number()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe('Maximum number of tasks to return')
});

// Simpler overdue tasks schema
export const OverdueTasksToolSchema = z.object({
  includeCompleted: z.boolean()
    .default(false)
    .describe('Include completed overdue tasks'),
    
  limit: z.number()
    .int()
    .positive()
    .max(1000)
    .default(50)
    .describe('Maximum number of tasks to return')
});

// Simpler upcoming tasks schema
export const UpcomingTasksToolSchema = z.object({
  days: z.number()
    .int()
    .positive()
    .max(365)
    .default(7)
    .describe('Number of days to look ahead'),
    
  includeToday: z.boolean()
    .default(true)
    .describe('Include tasks due today'),
    
  limit: z.number()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe('Maximum number of tasks to return')
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
  
  includeNullDates: z.boolean()
    .default(false)
    .describe('Include tasks with null dates in results')
})
.merge(ListTasksSchema.pick({ 
  completed: true, 
  projectId: true, 
  tags: true,
  limit: true,
  offset: true
}));

export const OverdueTasksSchema = z.object({
  asOf: DateTimeSchema
    .optional()
    .describe('Reference date for overdue calculation (defaults to now)'),
  
  includeToday: z.boolean()
    .default(false)
    .describe('Include tasks due today as overdue')
})
.merge(ListTasksSchema.pick({ 
  projectId: true, 
  tags: true,
  limit: true,
  offset: true
}));

export const UpcomingTasksSchema = z.object({
  days: z.number()
    .int()
    .positive()
    .max(365)
    .default(7)
    .describe('Number of days to look ahead'),
  
  includeOverdue: z.boolean()
    .default(false)
    .describe('Include overdue tasks')
})
.merge(ListTasksSchema.pick({ 
  projectId: true, 
  tags: true,
  limit: true,
  offset: true
}));
import { BaseTool } from '../base.js';
import { TaskUpdate } from '../../omnifocus/types.js';
import { UPDATE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks.js';

export class UpdateTaskTool extends BaseTool {
  name = 'update_task';
  description = 'Update an existing task in OmniFocus (can move between projects using projectId)';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'ID of the task to update',
      },
      name: {
        type: 'string',
        description: 'New task name',
      },
      note: {
        type: 'string',
        description: 'New task note',
      },
      flagged: {
        type: 'boolean',
        description: 'New flagged status',
      },
      dueDate: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'New due date (null to clear)',
      },
      deferDate: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'New defer date (null to clear)',
      },
      estimatedMinutes: {
        type: ['number', 'null'],
        description: 'New estimated time (null to clear)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'New tags (replaces all existing tags)',
      },
      projectId: {
        description: 'Move task to different project - use full alphanumeric projectId from list_projects tool (e.g., "az5Ieo4ip7K", not just "547"). Use empty string "" to move task to inbox.',
      },
    },
    required: ['taskId'],
  };

  async execute(args: { taskId: string } & TaskUpdate): Promise<any> {
    try {
      const { taskId, ...updates } = args;
      
      // Validate required parameters
      if (!taskId || typeof taskId !== 'string') {
        return {
          error: true,
          message: 'Task ID is required and must be a string'
        };
      }
      
      // Sanitize and validate updates object
      const safeUpdates = this.sanitizeUpdates(updates);
      
      // If no valid updates, return early
      if (Object.keys(safeUpdates).length === 0) {
        return {
          success: true,
          task: { id: taskId, updated: false, message: 'No valid updates provided' }
        };
      }
      
      // Use the full script for comprehensive update support
      const script = this.omniAutomation.buildScript(UPDATE_TASK_SCRIPT, { 
        taskId,
        updates: safeUpdates,
      });
      
      const result = await this.omniAutomation.execute(script);
      
      // Handle script execution errors
      if (result.error) {
        this.logger.error(`Update task script error: ${result.message}`);
        return {
          error: true,
          message: result.message || 'Failed to update task'
        };
      }
      
      // Parse the JSON result
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse update task result: ${result}`);
        return {
          error: true,
          message: 'Failed to parse task update response'
        };
      }
      
      // Check if the parsed result indicates an error
      if (parsedResult.error) {
        return {
          error: true,
          message: parsedResult.message || 'Update failed'
        };
      }
      
      // Invalidate cache after successful update
      this.cache.invalidate('tasks');
      
      this.logger.info(`Updated task: ${taskId}`);
      
      return {
        success: true,
        task: parsedResult,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
  
  private sanitizeUpdates(updates: TaskUpdate): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    // Handle string fields
    if (typeof updates.name === 'string') {
      sanitized.name = updates.name;
    }
    if (typeof updates.note === 'string') {
      sanitized.note = updates.note;
    }
    
    // Handle boolean fields
    if (typeof updates.flagged === 'boolean') {
      sanitized.flagged = updates.flagged;
    }
    
    // Handle date fields (allow null to clear, validate but keep as strings like create_task)
    if (updates.dueDate !== undefined) {
      if (updates.dueDate === null) {
        sanitized.dueDate = null; // Explicitly clear the date
      } else if (typeof updates.dueDate === 'string') {
        try {
          // Validate the date string but keep it as string (like create_task does)
          const parsedDate = new Date(updates.dueDate);
          // Validate the date is not invalid
          if (isNaN(parsedDate.getTime())) {
            throw new Error('Invalid date');
          }
          sanitized.dueDate = updates.dueDate; // Keep as string for JXA script
        } catch (error) {
          // Skip invalid date strings
          this.logger.warn(`Invalid dueDate format: ${updates.dueDate}`);
        }
      } else if (updates.dueDate instanceof Date) {
        sanitized.dueDate = updates.dueDate.toISOString(); // Convert Date object to ISO string
      }
    }
    if (updates.deferDate !== undefined) {
      if (updates.deferDate === null) {
        sanitized.deferDate = null; // Explicitly clear the date
      } else if (typeof updates.deferDate === 'string') {
        try {
          // Validate the date string but keep it as string (like create_task does)
          const parsedDate = new Date(updates.deferDate);
          // Validate the date is not invalid
          if (isNaN(parsedDate.getTime())) {
            throw new Error('Invalid date');
          }
          sanitized.deferDate = updates.deferDate; // Keep as string for JXA script
        } catch (error) {
          // Skip invalid date strings
          this.logger.warn(`Invalid deferDate format: ${updates.deferDate}`);
        }
      } else if (updates.deferDate instanceof Date) {
        sanitized.deferDate = updates.deferDate.toISOString(); // Convert Date object to ISO string
      }
    }
    
    // Handle numeric fields (allow null to clear)
    if (updates.estimatedMinutes !== undefined) {
      sanitized.estimatedMinutes = updates.estimatedMinutes;
    }
    
    // Handle project ID (allow null/empty string)
    if (updates.projectId !== undefined) {
      sanitized.projectId = updates.projectId;
    }
    
    // Handle tags array
    if (Array.isArray(updates.tags)) {
      sanitized.tags = updates.tags.filter(tag => typeof tag === 'string');
    }
    
    return sanitized;
  }
}
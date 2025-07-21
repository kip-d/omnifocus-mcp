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
        type: 'string',
        format: 'date-time',
        description: 'New due date (use empty string "" to clear existing date)',
      },
      deferDate: {
        type: 'string',
        format: 'date-time',
        description: 'New defer date (use empty string "" to clear existing date)',
      },
      estimatedMinutes: {
        type: 'number',
        description: 'New estimated time (use 0 to clear existing estimate)',
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
      
      // Debug logging: Log all received parameters
      this.logger.info('UpdateTaskTool received parameters:', {
        taskId,
        updates: {
          ...updates,
          // Explicitly log the types and values of date fields
          dueDate: updates.dueDate !== undefined ? {
            value: updates.dueDate,
            type: typeof updates.dueDate,
            isNull: updates.dueDate === null,
            isUndefined: updates.dueDate === undefined
          } : 'not provided',
          deferDate: updates.deferDate !== undefined ? {
            value: updates.deferDate,
            type: typeof updates.deferDate,
            isNull: updates.deferDate === null,
            isUndefined: updates.deferDate === undefined
          } : 'not provided'
        }
      });
      
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
      
      // Log what we're sending to the script
      this.logger.info('Sending to JXA script:', {
        taskId,
        safeUpdates,
        safeUpdatesKeys: Object.keys(safeUpdates)
      });
      
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
    
    this.logger.info('Sanitizing updates:', { 
      rawUpdates: updates,
      keys: Object.keys(updates)
    });
    
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
    
    // Handle date fields (use empty string to clear, validate but keep as strings like create_task)
    if (updates.dueDate !== undefined) {
      this.logger.info('Processing dueDate:', {
        value: updates.dueDate,
        type: typeof updates.dueDate,
        isEmptyString: updates.dueDate === '',
        isString: typeof updates.dueDate === 'string'
      });
      
      if (updates.dueDate === '') {
        this.logger.info('Setting dueDate to null (clearing date)');
        sanitized.dueDate = null; // Explicitly clear the date
      } else if (typeof updates.dueDate === 'string') {
        try {
          // Validate the date string but keep it as string (like create_task does)
          const parsedDate = new Date(updates.dueDate);
          // Validate the date is not invalid
          if (isNaN(parsedDate.getTime())) {
            throw new Error('Invalid date');
          }
          this.logger.info('Date string validated successfully:', {
            original: updates.dueDate,
            parsed: parsedDate.toISOString()
          });
          sanitized.dueDate = updates.dueDate; // Keep as string for JXA script
        } catch (error) {
          // Skip invalid date strings
          this.logger.warn(`Invalid dueDate format: ${updates.dueDate}`, error);
        }
      } else {
        this.logger.warn('Unexpected dueDate type:', {
          value: updates.dueDate,
          type: typeof updates.dueDate
        });
      }
    }
    if (updates.deferDate !== undefined) {
      if (updates.deferDate === '') {
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
      } else {
        this.logger.warn('Unexpected deferDate type:', {
          value: updates.deferDate,
          type: typeof updates.deferDate
        });
      }
    }
    
    // Handle numeric fields (use 0 to clear)
    if (updates.estimatedMinutes !== undefined) {
      if (updates.estimatedMinutes === 0) {
        sanitized.estimatedMinutes = null; // Clear the estimate
      } else {
        sanitized.estimatedMinutes = updates.estimatedMinutes;
      }
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
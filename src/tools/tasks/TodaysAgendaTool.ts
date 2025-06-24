import { BaseTool } from '../base.js';
import { TODAYS_AGENDA_SCRIPT } from '../../omnifocus/scripts/tasks.js';

export class TodaysAgendaTool extends BaseTool {
  name = 'todays_agenda';
  description = 'Get today\'s agenda - all tasks due today, overdue, or flagged';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      includeFlagged: {
        type: 'boolean',
        description: 'Include flagged tasks regardless of due date',
        default: true,
      },
      includeOverdue: {
        type: 'boolean', 
        description: 'Include overdue tasks',
        default: true,
      },
      includeAvailable: {
        type: 'boolean',
        description: 'Only include available tasks (not blocked/deferred)',
        default: true,
      },
    },
  };

  async execute(args: { includeFlagged?: boolean; includeOverdue?: boolean; includeAvailable?: boolean }): Promise<any> {
    try {
      const { 
        includeFlagged = true, 
        includeOverdue = true, 
        includeAvailable = true 
      } = args;
      
      // Create cache key
      const cacheKey = `agenda_${includeFlagged}_${includeOverdue}_${includeAvailable}`;
      
      // Check cache
      const cached = this.cache.get<any>('tasks', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached agenda');
        return {
          ...cached,
          from_cache: true,
        };
      }
      
      // Execute script
      const script = this.omniAutomation.buildScript(TODAYS_AGENDA_SCRIPT, { 
        options: { includeFlagged, includeOverdue, includeAvailable }
      });
      const result = await this.omniAutomation.execute<any>(script);
      
      if (result.error) {
        return result;
      }
      
      // Parse dates in tasks
      const parsedTasks = result.tasks.map((task: any) => ({
        ...task,
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        deferDate: task.deferDate ? new Date(task.deferDate) : undefined,
        completionDate: task.completionDate ? new Date(task.completionDate) : undefined,
      }));
      
      const finalResult = {
        date: new Date().toISOString().split('T')[0],
        tasks: parsedTasks,
        summary: result.summary,
        from_cache: false,
      };
      
      // Cache for shorter time (5 minutes for agenda)
      this.cache.set('tasks', cacheKey, finalResult);
      
      return finalResult;
    } catch (error) {
      return this.handleError(error);
    }
  }
}
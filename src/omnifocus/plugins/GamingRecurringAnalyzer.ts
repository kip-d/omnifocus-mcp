import { RecurringTaskAnalyzer, TaskContext, RepetitionRule, RecurringStatus } from './types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('gaming-analyzer');

/**
 * Specialized analyzer for gaming-related recurring tasks
 * Handles mobile game patterns like energy collection, resource harvesting, etc.
 */
export class GamingRecurringAnalyzer implements RecurringTaskAnalyzer {
  readonly name = 'gaming-recurring-analyzer';
  readonly priority = 100; // High priority for specialized analysis

  // Gaming-specific patterns
  private readonly GAMING_TASK_PATTERNS = [
    'energy available',
    'mines should be harvested',
    'hourly',
    'every hour'
  ];

  private readonly GAMING_PROJECT_PATTERNS = [
    'troops',
    'blitz',
    'titans',
    'game'
  ];

  canAnalyze(task: TaskContext): boolean {
    const taskName = task.name().toLowerCase();
    const project = task.containingProject();
    const projectName = project ? project.name().toLowerCase() : '';

    // Check if task name contains gaming patterns
    const hasGamingTaskPattern = this.GAMING_TASK_PATTERNS.some(pattern => 
      taskName.includes(pattern)
    );

    // Check if project name contains gaming patterns
    const hasGamingProjectPattern = this.GAMING_PROJECT_PATTERNS.some(pattern => 
      projectName.includes(pattern)
    );

    const isGamingTask = hasGamingTaskPattern || hasGamingProjectPattern;
    
    if (isGamingTask) {
      logger.debug(`Gaming task detected: "${task.name()}" in project "${projectName}"`);
    }

    return isGamingTask;
  }

  analyze(task: TaskContext, existingRule?: RepetitionRule): RecurringStatus | null {
    logger.debug(`Analyzing gaming task: "${task.name()}"`);

    // Start with default gaming result
    const result: RecurringStatus = {
      isRecurring: true,
      type: 'new-instance',
      frequency: '',
      scheduleDeviation: false,
      nextExpectedDate: null,
      confidence: 0.8, // High confidence for gaming patterns
      source: this.name
    };

    // Try to infer repetition rule if not provided
    let ruleData = existingRule || this.inferGamingRule(task);

    if (ruleData?.unit && ruleData?.steps) {
      result.frequency = this.formatGamingFrequency(ruleData);
      
      // Gaming-specific timing analysis
      this.analyzeGamingTiming(task, ruleData, result);
    } else {
      // Fallback: try to detect patterns from task properties
      ruleData = this.detectGamingPatterns(task);
      if (ruleData) {
        result.frequency = this.formatGamingFrequency(ruleData);
        result.confidence = 0.6; // Lower confidence for inferred patterns
      } else {
        result.frequency = 'Gaming task (unknown interval)';
        result.confidence = 0.4;
      }
    }

    return result;
  }

  /**
   * Infer gaming-specific repetition rules from task properties
   */
  private inferGamingRule(task: TaskContext): RepetitionRule | null {
    const taskName = task.name().toLowerCase();
    
    // Gaming hourly patterns
    if (this.GAMING_TASK_PATTERNS.some(pattern => taskName.includes(pattern))) {
      return {
        unit: 'hours',
        steps: 1,
        _inferenceSource: 'gaming_task_pattern'
      };
    }

    // Analyze defer/due date patterns for gaming cycles
    try {
      const dueDate = task.dueDate();
      const deferDate = task.deferDate();
      
      if (dueDate && deferDate) {
        const hoursDiff = Math.abs(dueDate.getTime() - deferDate.getTime()) / (1000 * 60 * 60);
        
        // Gaming task patterns (2-12 hour intervals)
        if (hoursDiff >= 2 && hoursDiff <= 12 && hoursDiff % 1 === 0) {
          return {
            unit: 'hours',
            steps: Math.round(hoursDiff),
            _inferenceSource: 'gaming_date_pattern'
          };
        }
      }

      // Check for gaming reset time patterns
      const project = task.containingProject();
      const projectName = project ? project.name().toLowerCase() : '';
      
      if (this.GAMING_PROJECT_PATTERNS.some(pattern => projectName.includes(pattern))) {
        if (dueDate) {
          const dueHour = dueDate.getHours();
          
          // Common gaming reset times suggest specific intervals
          if ([0, 6, 12, 18].includes(dueHour)) {
            return {
              unit: 'hours',
              steps: 6, // 6-hour gaming cycle
              _inferenceSource: 'gaming_reset_time_6h'
            };
          } else if ([8, 16].includes(dueHour)) {
            return {
              unit: 'hours',
              steps: 8, // 8-hour gaming cycle
              _inferenceSource: 'gaming_reset_time_8h'
            };
          } else {
            return {
              unit: 'hours',
              steps: 4, // Default 4-hour gaming cycle
              _inferenceSource: 'gaming_default'
            };
          }
        }
      }
    } catch (error) {
      logger.debug('Failed to analyze gaming date patterns:', error);
    }

    return null;
  }

  /**
   * Detect additional gaming patterns from task context
   */
  private detectGamingPatterns(_task: TaskContext): RepetitionRule | null {
    // Additional pattern detection could go here
    // For now, return null to fall back to basic analysis
    return null;
  }

  /**
   * Analyze gaming-specific timing patterns
   */
  private analyzeGamingTiming(task: TaskContext, rule: RepetitionRule, result: RecurringStatus): void {
    try {
      const now = new Date();
      const added = task.added();
      const dueDate = task.dueDate();
      
      if (added && rule.unit && rule.steps) {
        const daysSinceAdded = Math.floor((now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24));
        
        // Calculate expected interval in days
        let intervalDays = rule.steps;
        switch(rule.unit) {
          case 'hours': intervalDays = rule.steps / 24; break;
          case 'weeks': intervalDays *= 7; break;
          case 'months': intervalDays *= 30; break;
          case 'years': intervalDays *= 365; break;
        }
        
        // Gaming tasks are typically created very close to their due time
        if (daysSinceAdded <= 1) {
          result.type = 'new-instance';
        } else if (daysSinceAdded > intervalDays * 1.5) {
          result.type = 'rescheduled';
          result.scheduleDeviation = true;
        }
        
        // Calculate next expected date for gaming cycles
        if (dueDate) {
          const nextDue = new Date(dueDate);
          
          if (rule.unit === 'hours') {
            nextDue.setHours(nextDue.getHours() + rule.steps);
          } else if (rule.unit === 'days') {
            nextDue.setDate(nextDue.getDate() + rule.steps);
          }
          
          result.nextExpectedDate = nextDue.toISOString();
        }
      }
    } catch (error) {
      logger.debug('Failed to analyze gaming timing:', error);
    }
  }

  /**
   * Format frequency description for gaming tasks
   */
  private formatGamingFrequency(rule: RepetitionRule): string {
    if (!rule.unit || !rule.steps) return 'Gaming task';
    
    switch(rule.unit) {
      case 'hours':
        if (rule.steps === 1) return 'Hourly (Gaming)';
        else if (rule.steps <= 12) return `Every ${rule.steps} hours (Gaming)`;
        else return `Every ${rule.steps} hours`;
      case 'days':
        if (rule.steps === 1) return 'Daily (Gaming)';
        else return `Every ${rule.steps} days (Gaming)`;
      default:
        return `Every ${rule.steps} ${rule.unit} (Gaming)`;
    }
  }
}
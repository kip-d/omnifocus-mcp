import { RecurringTaskAnalyzer, TaskContext, RepetitionRule, RecurringStatus } from './types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('core-analyzer');

/**
 * Core analyzer for standard recurring task patterns
 * Handles common business/personal recurring tasks
 */
export class CoreRecurringAnalyzer implements RecurringTaskAnalyzer {
  readonly name = 'core-recurring-analyzer';
  readonly priority = 50; // Medium priority - runs after specialized analyzers

  // Standard recurring task patterns
  private readonly STANDARD_PATTERNS = {
    daily: ['daily', 'every day'],
    weekly: ['weekly', 'every week', 'helpdesk tickets', 'review recent activity'],
    monthly: ['monthly', 'of each month'],
    yearly: ['yearly', 'annually', 'domain renewal', '.com', '.org']
  };

  canAnalyze(_task: TaskContext): boolean {
    // This analyzer can handle any task - it's the fallback
    return true;
  }

  analyze(task: TaskContext, existingRule?: RepetitionRule): RecurringStatus | null {
    logger.debug(`Analyzing task with core analyzer: "${task.name()}"`);

    // If we don't have an existing rule, try to infer one
    const ruleData = existingRule || this.inferStandardRule(task);
    
    if (!ruleData) {
      return {
        isRecurring: false,
        type: 'non-recurring',
        confidence: 1.0,
        source: this.name
      };
    }

    const result: RecurringStatus = {
      isRecurring: true,
      type: 'new-instance',
      frequency: this.formatFrequency(ruleData),
      scheduleDeviation: false,
      nextExpectedDate: null,
      confidence: 0.9,
      source: this.name
    };

    // Analyze timing patterns
    this.analyzeTimingPatterns(task, ruleData, result);

    return result;
  }

  /**
   * Infer standard repetition rules from task properties
   */
  private inferStandardRule(task: TaskContext): RepetitionRule | null {
    const taskName = task.name().toLowerCase();
    
    // Check for standard patterns in task name
    for (const [interval, patterns] of Object.entries(this.STANDARD_PATTERNS)) {
      for (const pattern of patterns) {
        if (taskName.includes(pattern)) {
          return this.createRuleFromInterval(interval, 'task_name_pattern');
        }
      }
    }

    // Try to analyze defer/due date patterns for multi-year cycles
    try {
      const dueDate = task.dueDate();
      const deferDate = task.deferDate();
      
      if (dueDate && deferDate) {
        const daysDiff = Math.abs(dueDate.getTime() - deferDate.getTime()) / (1000 * 60 * 60 * 24);
        
        // Multi-year domain patterns (2-3 years common)
        if (daysDiff >= 700 && daysDiff <= 1100) {
          return {
            unit: 'years',
            steps: Math.round(daysDiff / 365),
            _inferenceSource: 'date_pattern_domain'
          };
        }
        // Monthly patterns (28-32 days)
        else if (daysDiff >= 28 && daysDiff <= 32) {
          return {
            unit: 'months',
            steps: 1,
            _inferenceSource: 'date_pattern_monthly'
          };
        }
        // Weekly patterns (6-8 days)
        else if (daysDiff >= 6 && daysDiff <= 8) {
          return {
            unit: 'weeks',
            steps: 1,
            _inferenceSource: 'date_pattern_weekly'
          };
        }
      }
    } catch (error) {
      logger.debug('Failed to analyze date patterns:', error);
    }

    return null;
  }

  /**
   * Create a repetition rule from interval name
   */
  private createRuleFromInterval(interval: string, source: string): RepetitionRule {
    switch (interval) {
      case 'daily':
        return { unit: 'days', steps: 1, _inferenceSource: source };
      case 'weekly':
        return { unit: 'weeks', steps: 1, _inferenceSource: source };
      case 'monthly':
        return { unit: 'months', steps: 1, _inferenceSource: source };
      case 'yearly':
        return { unit: 'years', steps: 1, _inferenceSource: source };
      default:
        return { unit: 'days', steps: 1, _inferenceSource: source };
    }
  }

  /**
   * Analyze timing patterns for standard recurring tasks
   */
  private analyzeTimingPatterns(task: TaskContext, rule: RepetitionRule, result: RecurringStatus): void {
    try {
      const now = new Date();
      const added = task.added();
      const dueDate = task.dueDate();
      const completionDate = task.completionDate();
      
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
        
        // If task was added very recently (within 1 day), likely new instance
        if (daysSinceAdded <= 1) {
          result.type = 'new-instance';
        }
        // If task has been around longer than expected interval, might be rescheduled
        else if (daysSinceAdded > intervalDays * 1.5) {
          result.type = 'rescheduled';
          result.scheduleDeviation = true;
        }
        // Check if dates align with repetition pattern
        else if (dueDate) {
          const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          // If due date is way off from expected pattern, likely rescheduled
          if (Math.abs(daysUntilDue) > intervalDays) {
            result.type = 'rescheduled';
            result.scheduleDeviation = true;
          }
          
          // Calculate next expected date based on pattern
          const nextDue = new Date(dueDate);
          switch(rule.unit) {
            case 'hours':
              nextDue.setHours(nextDue.getHours() + rule.steps);
              break;
            case 'days':
              nextDue.setDate(nextDue.getDate() + rule.steps);
              break;
            case 'weeks':
              nextDue.setDate(nextDue.getDate() + (rule.steps * 7));
              break;
            case 'months':
              nextDue.setMonth(nextDue.getMonth() + rule.steps);
              break;
            case 'years':
              nextDue.setFullYear(nextDue.getFullYear() + rule.steps);
              break;
          }
          result.nextExpectedDate = nextDue.toISOString();
        }
        
        // For completion-based repetition, check against completion date
        if (rule.scheduleType === 'fromCompletion' && completionDate) {
          const daysSinceCompletion = Math.floor((now.getTime() - completionDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSinceCompletion < intervalDays * 0.8) {
            result.type = 'new-instance';
          }
        }
      }
    } catch (error) {
      logger.debug('Failed to analyze timing patterns:', error);
    }
  }

  /**
   * Format frequency description
   */
  private formatFrequency(rule: RepetitionRule): string {
    if (!rule.unit || !rule.steps) return 'Custom';
    
    switch(rule.unit) {
      case 'hours':
        if (rule.steps === 1) return 'Hourly';
        else if (rule.steps === 2) return 'Every 2 hours';
        else if (rule.steps === 4) return 'Every 4 hours';
        else if (rule.steps === 6) return 'Every 6 hours';
        else if (rule.steps === 8) return 'Every 8 hours';
        else if (rule.steps === 12) return 'Every 12 hours';
        else return `Every ${rule.steps} hours`;
      case 'days':
        if (rule.steps === 1) return 'Daily';
        else if (rule.steps === 7) return 'Weekly';
        else if (rule.steps === 14) return 'Biweekly';
        else return `Every ${rule.steps} days`;
      case 'weeks':
        if (rule.steps === 1) return 'Weekly';
        else if (rule.steps === 4) return 'Every 4 weeks';
        else return `Every ${rule.steps} weeks`;
      case 'months':
        if (rule.steps === 1) return 'Monthly';
        else if (rule.steps === 3) return 'Quarterly';
        else if (rule.steps === 6) return 'Every 6 months';
        else return `Every ${rule.steps} months`;
      case 'years':
        if (rule.steps === 1) return 'Yearly';
        else if (rule.steps === 2) return 'Every 2 years';
        else if (rule.steps === 3) return 'Every 3 years';
        else return `Every ${rule.steps} years`;
      default:
        return 'Custom';
    }
  }
}
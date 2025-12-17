import { RecurringTaskAnalyzer, PluginRegistry, TaskContext, RepetitionRule, RecurringStatus } from './types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('plugin-registry');

export class RecurringTaskPluginRegistry implements PluginRegistry {
  private analyzers: RecurringTaskAnalyzer[] = [];

  /**
   * Register a new recurring task analyzer plugin
   */
  register(analyzer: RecurringTaskAnalyzer): void {
    logger.debug(`Registering recurring task analyzer: ${analyzer.name} (priority: ${analyzer.priority})`);

    // Check for duplicate names
    if (this.analyzers.some((a) => a.name === analyzer.name)) {
      logger.warn(`Analyzer with name "${analyzer.name}" already registered, skipping`);
      return;
    }

    this.analyzers.push(analyzer);

    // Sort by priority (highest first)
    this.analyzers.sort((a, b) => b.priority - a.priority);

    logger.info(`Registered analyzer "${analyzer.name}", total analyzers: ${this.analyzers.length}`);
  }

  /**
   * Get all registered analyzers (sorted by priority)
   */
  getAnalyzers(): RecurringTaskAnalyzer[] {
    return [...this.analyzers]; // Return copy to prevent modification
  }

  /**
   * Analyze a task using all applicable analyzers
   * Returns the result from the highest-priority analyzer that can handle the task
   */
  analyzeTask(task: TaskContext, existingRule?: RepetitionRule): RecurringStatus {
    logger.debug(`Analyzing task "${task.name()}" with ${this.analyzers.length} analyzers`);

    // Default fallback result
    const defaultResult: RecurringStatus = {
      isRecurring: false,
      type: 'non-recurring',
      confidence: 1.0,
      source: 'default',
    };

    // If we have an existing rule, start with a basic recurring result
    if (existingRule?.unit && existingRule?.steps) {
      defaultResult.isRecurring = true;
      defaultResult.type = 'new-instance';
      defaultResult.frequency = this.formatFrequency(existingRule);
      defaultResult.source = 'core';
    }

    // Try each analyzer in priority order
    for (const analyzer of this.analyzers) {
      try {
        if (analyzer.canAnalyze(task)) {
          logger.debug(`Trying analyzer: ${analyzer.name}`);

          const result = analyzer.analyze(task, existingRule);
          if (result) {
            logger.debug(`Analyzer "${analyzer.name}" provided result: ${result.type}`);

            // Add source information
            result.source = analyzer.name;

            return result;
          }
        }
      } catch (error) {
        logger.error(`Error in analyzer "${analyzer.name}":`, error);
        // Continue with next analyzer
      }
    }

    logger.debug(`No analyzer handled task "${task.name()}", using default result`);
    return defaultResult;
  }

  /**
   * Helper to format frequency from repetition rule
   */
  private formatFrequency(rule: RepetitionRule): string {
    if (!rule.unit || !rule.steps) return 'Custom';

    switch (rule.unit) {
      case 'hours':
        if (rule.steps === 1) return 'Hourly';
        else return `Every ${rule.steps} hours`;
      case 'days':
        if (rule.steps === 1) return 'Daily';
        else if (rule.steps === 7) return 'Weekly';
        else return `Every ${rule.steps} days`;
      case 'weeks':
        if (rule.steps === 1) return 'Weekly';
        else return `Every ${rule.steps} weeks`;
      case 'months':
        if (rule.steps === 1) return 'Monthly';
        else if (rule.steps === 3) return 'Quarterly';
        else return `Every ${rule.steps} months`;
      case 'years':
        if (rule.steps === 1) return 'Yearly';
        else return `Every ${rule.steps} years`;
      default:
        return 'Custom';
    }
  }
}

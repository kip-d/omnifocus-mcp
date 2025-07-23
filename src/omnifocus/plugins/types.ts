/**
 * Plugin system for recurring task analysis
 */

// Core types for recurring task analysis
export interface RecurringStatus {
  isRecurring: boolean;
  type: 'non-recurring' | 'new-instance' | 'rescheduled';
  frequency?: string;
  scheduleDeviation?: boolean;
  nextExpectedDate?: string | null;
  confidence?: number; // 0-1, how confident the analyzer is about this result
  source?: string; // Which analyzer provided this result
}

export interface RepetitionRule {
  unit?: 'hours' | 'days' | 'weeks' | 'months' | 'years';
  steps?: number;
  scheduleType?: string;
  _inferenceSource?: string;
}

// Simplified task interface for plugin use
export interface TaskContext {
  id(): string;
  name(): string;
  added(): Date | null;
  dueDate(): Date | null;
  deferDate(): Date | null;
  completionDate(): Date | null;
  completed(): boolean;
  dropped(): boolean;
  repetitionRule(): any;
  containingProject(): { name(): string; id(): string } | null;
  tags(): Array<{ name(): string; id(): string }>;
  note(): string | null;
}

// Plugin interface
export interface RecurringTaskAnalyzer {
  /**
   * Unique identifier for this analyzer
   */
  readonly name: string;

  /**
   * Priority for this analyzer (higher = runs first)
   * Use this to control order of analysis
   */
  readonly priority: number;

  /**
   * Determine if this analyzer can handle the given task
   * @param task The task to analyze
   * @returns true if this analyzer should process the task
   */
  canAnalyze(task: TaskContext): boolean;

  /**
   * Analyze the task for recurring patterns
   * @param task The task to analyze
   * @param existingRule Any existing repetition rule detected
   * @returns RecurringStatus or null if no pattern detected
   */
  analyze(task: TaskContext, existingRule?: RepetitionRule): RecurringStatus | null;
}

// Plugin registry interface
export interface PluginRegistry {
  register(analyzer: RecurringTaskAnalyzer): void;
  getAnalyzers(): RecurringTaskAnalyzer[];
  analyzeTask(task: TaskContext, existingRule?: RepetitionRule): RecurringStatus;
}

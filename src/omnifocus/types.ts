/**
 * OmniFocus MCP Bridge Type Definitions
 *
 * These types represent the JSON-serializable format used by the MCP bridge.
 * For the official OmniFocus API types, see: ./api/OmniFocus.d.ts
 * For type conversion utilities, see: ./api/type-adapters.ts
 *
 * IMPORTANT LEARNINGS FROM API EXPLORATION (July 2025):
 *
 * 1. REPETITION RULES: OmniFocus JXA provides task.repetitionRule objects,
 *    but their properties (unit, steps, method, etc.) are NOT accessible
 *    through standard property access. This is a significant API limitation
 *    that requires intelligent inference to work around.
 *
 * 2. SMART INFERENCE: We use task name pattern matching, project context,
 *    and other heuristics to extract meaningful recurring task information
 *    when the API fails to provide it directly.
 *
 * 3. LLM-FRIENDLY OUTPUT: Our types prioritize providing actionable information
 *    to AI assistants rather than raw API data, since the raw data is often
 *    inaccessible or incomplete.
 */

import { RepetitionRule } from './jxa-types.js';
export { RepetitionRule };

/**
 * OmniFocus Task representation
 *
 * Recurring Task Behavior:
 * - repetitionRule: Contains extracted/inferred repetition configuration
 * - recurringStatus: Provides LLM-friendly analysis of recurring behavior
 * - Both fields work together to give complete recurring task intelligence
 *
 * Note: OmniFocus JXA API limitations mean repetitionRule data is primarily
 * derived through intelligent inference rather than direct property access.
 */
export interface OmniFocusTask {
  id: string;
  name: string;
  note?: string;
  project?: string;
  projectId?: string;
  dueDate?: Date;
  deferDate?: Date;
  completionDate?: Date;
  flagged: boolean;
  tags: string[];
  estimatedMinutes?: number;
  completed: boolean;
  dropped?: boolean;
  effectivelyCompleted?: boolean;
  blocked?: boolean;
  sequential?: boolean;
  inInbox: boolean;

  // Advanced status properties
  taskStatus?: string; // 'Available', 'Blocked', 'Completed', 'Dropped', 'DueSoon', 'Next', 'Overdue'
  next?: boolean; // True if this is a next action
  available?: boolean; // True if available to work on now

  // Recurring task information
  repetitionRule?: RepetitionRule; // Raw repetition configuration (extracted/inferred)
  recurringStatus?: RecurringTaskStatus; // LLM-friendly recurring analysis

  // Metadata
  added?: Date; // When task was first created (helps with recurring analysis)
}

export interface OmniFocusProject {
  id: string;
  name: string;
  note?: string;
  status: 'active' | 'onHold' | 'dropped' | 'completed';
  deferDate?: Date;
  dueDate?: Date;
  completionDate?: Date;
  flagged: boolean;
  sequential: boolean;
  containsSingletonActions: boolean;
  lastReviewDate?: Date;
  nextReviewDate?: Date;
  reviewInterval?: number; // in days (keep original type)
  reviewIntervalDetails?: { // Add as separate property
    unit: string;
    steps: number;
  };
  folder?: string;
  numberOfTasks: number;
  numberOfAvailableTasks: number;
  numberOfCompletedTasks: number;
  // Enhanced properties
  nextTask?: {
    id: string;
    name: string;
    flagged: boolean;
    dueDate?: Date;
  };
  completedByChildren?: boolean;
  taskCounts?: {
    total: number;
    available: number;
    completed: number;
  };
}

export interface OmniFocusTag {
  id: string;
  name: string;
  note?: string;
  allowsNextAction: boolean;
  parent?: string;
  children: string[];
}

// RepetitionRule is imported from './jxa-types.js'
// It provides a union type that properly handles different repetition frequencies

/**
 * Recurring task analysis results
 *
 * This interface represents the intelligent analysis we perform on tasks
 * to determine their recurring status and provide LLM-friendly information.
 */
export interface RecurringTaskStatus {
  isRecurring: boolean;
  type: 'non-recurring' | 'new-instance' | 'rescheduled' | 'manual-override' | 'analysis-skipped';

  // Human-readable frequency description
  frequency?: string; // "Daily", "Weekly", "Monthly", "Every 2 weeks", "Quarterly", etc.

  // Predicted information
  nextExpectedDate?: Date | string; // When the next occurrence should happen
  scheduleDeviation?: boolean; // True if dates don't match expected pattern

  // Analysis metadata
  _detectionMethod?: 'api' | 'inference' | 'pattern' | 'context';
  _confidence?: 'high' | 'medium' | 'low'; // How confident we are in the analysis
}

/**
 * Known limitations and behaviors of the OmniFocus JXA API
 *
 * This documents what we've learned about OmniFocus automation challenges
 * to help future developers understand the constraints.
 */
export interface OmniFocusAPILimitations {
  repetitionRules: {
    // RepetitionRule objects exist but properties are inaccessible
    objectExists: true;
    propertiesAccessible: false;
    requiresInference: true;

    // Known property access patterns that fail
    failedPatterns: string[]; // ['repetitionRule.unit', 'repetitionRule.steps', etc.]

    // Alternative approaches that work
    workingApproaches: string[]; // ['task.repetitionRule() !== null', 'name inference']
  };

  // Other API quirks discovered during development
  taskCreation: {
    temporaryIDs: boolean; // New tasks initially get temporary IDs
    realIDsRequireRetrieval: boolean; // Must search for task after creation
  };

  projectIDHandling: {
    claudeDesktopBug: boolean; // Claude Desktop extracts numbers from alphanumeric IDs
    requiresFullAlphanumericIDs: boolean;
  };
}

/**
 * Pattern matching rules for inferring recurring task frequencies
 *
 * These patterns are used when the OmniFocus API doesn't provide
 * direct access to repetition rule properties.
 */
export interface RecurringPatternRules {
  // Exact keyword matches
  exact: Record<string, { unit: string; steps: number }>;

  // Regex patterns for extracting custom intervals
  patterns: Array<{
    regex: RegExp;
    unit: string;
    stepsExtractor: (match: RegExpMatchArray) => number;
  }>;

  // Context-based inference rules
  contextRules: Array<{
    projectPattern?: RegExp;
    taskPattern?: RegExp;
    inferredFrequency: { unit: string; steps: number };
  }>;
}

export interface TaskFilter {
  completed?: boolean;
  flagged?: boolean;
  projectId?: string;
  tags?: string[];
  dueBefore?: Date;
  dueAfter?: Date;
  deferBefore?: Date;
  deferAfter?: Date;
  search?: string;
  inInbox?: boolean;
  available?: boolean;
  
  // Advanced status filters
  taskStatus?: 'Available' | 'Blocked' | 'Completed' | 'Dropped' | 'DueSoon' | 'Next' | 'Overdue';
  blocked?: boolean;
  next?: boolean;
}

export interface ProjectFilter {
  status?: ('active' | 'onHold' | 'dropped' | 'completed')[];
  flagged?: boolean;
  folder?: string;
  reviewBefore?: Date;
  search?: string;
}

export interface TaskUpdate {
  name?: string;
  note?: string;
  flagged?: boolean;
  dueDate?: string; // ISO date string
  clearDueDate?: boolean; // true to clear existing due date
  deferDate?: string; // ISO date string
  clearDeferDate?: boolean; // true to clear existing defer date
  estimatedMinutes?: number;
  clearEstimatedMinutes?: boolean; // true to clear existing estimate
  tags?: string[];
  projectId?: string; // empty string to move to inbox
}

export interface ProjectUpdate {
  name?: string;
  note?: string;
  status?: 'active' | 'onHold' | 'dropped' | 'completed';
  flagged?: boolean;
  dueDate?: string; // ISO date string
  clearDueDate?: boolean; // true to clear existing due date
  deferDate?: string; // ISO date string
  clearDeferDate?: boolean; // true to clear existing defer date
  sequential?: boolean;
  reviewInterval?: number;
  folder?: string; // folder name, empty string to move to root
}

export interface ProductivityStats {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  tasksCompleted: number;
  tasksCreated: number;
  tasksOverdue: number;
  averageCompletionTime?: number; // in minutes
  completionRate: number; // percentage
  topTags: Array<{ tag: string; count: number }>;
  topProjects: Array<{ project: string; count: number }>;
  estimateAccuracy?: number; // percentage
}

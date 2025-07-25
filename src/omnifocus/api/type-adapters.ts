/**
 * Type adapter layer for OmniFocus API
 * 
 * This module provides type-safe adapters between the official OmniFocus API types
 * and our internal MCP representation types. It handles the conversion and validation
 * of data structures while maintaining type safety.
 */

import type {
  OmniFocusTask,
  OmniFocusProject,
  OmniFocusTag,
  RecurringTaskStatus,
  RepetitionRule,
} from '../types.js';

// Import types from the official API (these would be from OmniFocus.d.ts in a real implementation)
// For now, we'll define minimal interfaces that match what we use

interface OFTask {
  id(): string;
  name(): string;
  note(): string | null;
  completed(): boolean;
  flagged(): boolean;
  dueDate(): Date | null;
  deferDate(): Date | null;
  completionDate(): Date | null;
  estimatedMinutes(): number | null;
  tags(): Array<OFTag>;
  containingProject(): OFProject | null;
  repetitionRule(): OFRepetitionRule | null;
  added(): Date | null;
  inInbox(): boolean;
  effectivelyCompleted(): boolean;
  blocked(): boolean;
  sequential(): boolean;
}

interface OFProject {
  id(): string;
  name(): string;
  note(): string | null;
  status(): string;
  flagged(): boolean;
  dueDate(): Date | null;
  deferDate(): Date | null;
  completionDate(): Date | null;
  flattenedTasks(): Array<OFTask>;
  parentFolder(): OFFolder | null;
  sequential(): boolean;
  containsSingletonActions(): boolean;
  lastReviewDate(): Date | null;
  reviewInterval(): number | null;
}

interface OFTag {
  id(): string;
  name(): string;
  note(): string | null;
  allowsNextAction(): boolean;
  parent(): OFTag | null;
  children(): Array<OFTag>;
}

interface OFFolder {
  name(): string;
}

interface OFRepetitionRule {
  // Properties are not accessible in JXA, but we include the interface for completeness
  unit?: string;
  steps?: number;
  method?: string;
}

/**
 * Type guard to check if a value is a valid OmniFocus task
 */
export function isOFTask(value: unknown): value is OFTask {
  if (!value || typeof value !== 'object') return false;
  const task = value as any;
  return (
    typeof task.id === 'function' &&
    typeof task.name === 'function' &&
    typeof task.completed === 'function'
  );
}

/**
 * Type guard to check if a value is a valid OmniFocus project
 */
export function isOFProject(value: unknown): value is OFProject {
  if (!value || typeof value !== 'object') return false;
  const project = value as any;
  return (
    typeof project.id === 'function' &&
    typeof project.name === 'function' &&
    typeof project.status === 'function'
  );
}

/**
 * Type guard to check if a value is a valid OmniFocus tag
 */
export function isOFTag(value: unknown): value is OFTag {
  if (!value || typeof value !== 'object') return false;
  const tag = value as any;
  return (
    typeof tag.id === 'function' &&
    typeof tag.name === 'function'
  );
}

/**
 * Safe getter that handles JXA exceptions
 */
function safeGet<T>(getter: () => T, defaultValue: T | null = null): T | null {
  try {
    const result = getter();
    return result !== null && result !== undefined ? result : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Convert OmniFocus Task to our internal representation
 */
export function adaptTask(ofTask: OFTask, skipAnalysis = false): OmniFocusTask {
  if (!isOFTask(ofTask)) {
    throw new Error('Invalid OmniFocus task object');
  }

  const task: OmniFocusTask = {
    id: safeGet(() => ofTask.id()) || 'unknown',
    name: safeGet(() => ofTask.name()) || 'Unnamed Task',
    completed: safeGet(() => ofTask.completed()) || false,
    flagged: safeGet(() => ofTask.flagged()) || false,
    inInbox: safeGet(() => ofTask.inInbox()) || false,
    tags: [],
  };

  // Optional properties
  const note = safeGet(() => ofTask.note());
  if (note) task.note = note;

  const dueDate = safeGet(() => ofTask.dueDate());
  if (dueDate) task.dueDate = dueDate;

  const deferDate = safeGet(() => ofTask.deferDate());
  if (deferDate) task.deferDate = deferDate;

  const completionDate = safeGet(() => ofTask.completionDate());
  if (completionDate) task.completionDate = completionDate;

  const estimatedMinutes = safeGet(() => ofTask.estimatedMinutes());
  if (estimatedMinutes !== null) task.estimatedMinutes = estimatedMinutes;

  const added = safeGet(() => ofTask.added());
  if (added) task.added = added;

  // Handle project
  const project = safeGet(() => ofTask.containingProject());
  if (project) {
    task.project = safeGet(() => project.name()) ?? undefined;
    task.projectId = safeGet(() => project.id()) ?? undefined;
  }

  // Handle tags
  const tags = safeGet(() => ofTask.tags());
  if (tags && Array.isArray(tags)) {
    task.tags = tags
      .map(tag => safeGet(() => tag.name()))
      .filter((name): name is string => name !== null);
  }

  // Additional properties
  task.effectivelyCompleted = safeGet(() => ofTask.effectivelyCompleted()) || false;
  task.blocked = safeGet(() => ofTask.blocked()) || false;
  task.sequential = safeGet(() => ofTask.sequential()) || false;

  // Recurring task analysis
  if (!skipAnalysis) {
    const repetitionRule = safeGet(() => ofTask.repetitionRule());
    if (repetitionRule) {
      task.repetitionRule = adaptRepetitionRule(repetitionRule);
      task.recurringStatus = analyzeRecurringStatus(ofTask, task.repetitionRule);
    } else {
      task.recurringStatus = {
        isRecurring: false,
        type: 'non-recurring',
      };
    }
  } else {
    task.recurringStatus = {
      isRecurring: false,
      type: 'analysis-skipped',
    };
  }

  return task;
}

/**
 * Convert OmniFocus Project to our internal representation
 */
export function adaptProject(ofProject: OFProject, includeStats = false): OmniFocusProject {
  if (!isOFProject(ofProject)) {
    throw new Error('Invalid OmniFocus project object');
  }

  const project: OmniFocusProject = {
    id: safeGet(() => ofProject.id()) || 'unknown',
    name: safeGet(() => ofProject.name()) || 'Unnamed Project',
    status: (safeGet(() => ofProject.status()) || 'active') as OmniFocusProject['status'],
    flagged: safeGet(() => ofProject.flagged()) || false,
    sequential: safeGet(() => ofProject.sequential()) || false,
    containsSingletonActions: safeGet(() => ofProject.containsSingletonActions()) || false,
    numberOfTasks: 0,
    numberOfAvailableTasks: 0,
    numberOfCompletedTasks: 0,
  };

  // Optional properties
  const note = safeGet(() => ofProject.note());
  if (note) project.note = note;

  const dueDate = safeGet(() => ofProject.dueDate());
  if (dueDate) project.dueDate = dueDate;

  const deferDate = safeGet(() => ofProject.deferDate());
  if (deferDate) project.deferDate = deferDate;

  const completionDate = safeGet(() => ofProject.completionDate());
  if (completionDate) project.completionDate = completionDate;

  const lastReviewDate = safeGet(() => ofProject.lastReviewDate());
  if (lastReviewDate) project.lastReviewDate = lastReviewDate;

  const reviewInterval = safeGet(() => ofProject.reviewInterval());
  if (reviewInterval !== null) project.reviewInterval = reviewInterval;

  const folder = safeGet(() => ofProject.parentFolder());
  if (folder) {
    project.folder = safeGet(() => folder.name()) ?? undefined;
  }

  // Task counts
  const tasks = safeGet(() => ofProject.flattenedTasks());
  if (tasks && Array.isArray(tasks)) {
    project.numberOfTasks = tasks.length;
    
    // Count completed and available tasks if stats are requested
    if (includeStats) {
      let completed = 0;
      let available = 0;
      
      for (const task of tasks) {
        if (safeGet(() => task.completed())) {
          completed++;
        } else if (!safeGet(() => task.blocked()) && !safeGet(() => task.effectivelyCompleted())) {
          available++;
        }
      }
      
      project.numberOfCompletedTasks = completed;
      project.numberOfAvailableTasks = available;
    }
  }

  return project;
}

/**
 * Convert OmniFocus Tag to our internal representation
 */
export function adaptTag(ofTag: OFTag): OmniFocusTag {
  if (!isOFTag(ofTag)) {
    throw new Error('Invalid OmniFocus tag object');
  }

  const tag: OmniFocusTag = {
    id: safeGet(() => ofTag.id()) || 'unknown',
    name: safeGet(() => ofTag.name()) || 'Unnamed Tag',
    allowsNextAction: safeGet(() => ofTag.allowsNextAction()) || false,
    children: [],
  };

  // Optional properties
  const note = safeGet(() => ofTag.note());
  if (note) tag.note = note;

  const parent = safeGet(() => ofTag.parent());
  if (parent) {
    tag.parent = safeGet(() => parent.name()) ?? undefined;
  }

  // Get child tag names
  const children = safeGet(() => ofTag.children());
  if (children && Array.isArray(children)) {
    tag.children = children
      .map(child => safeGet(() => child.name()))
      .filter((name): name is string => name !== null);
  }

  return tag;
}

/**
 * Adapt repetition rule (limited due to JXA API constraints)
 */
function adaptRepetitionRule(ofRule: OFRepetitionRule | null): RepetitionRule | undefined {
  if (!ofRule) return undefined;
  
  // Due to JXA limitations, we can't access properties directly
  // This is a placeholder that would be enhanced with inference logic
  return {
    unit: 'unknown',
    steps: 1,
  };
}

/**
 * Analyze recurring status (placeholder - would include full analysis logic)
 */
function analyzeRecurringStatus(_task: OFTask, rule?: RepetitionRule): RecurringTaskStatus {
  if (!rule) {
    return {
      isRecurring: false,
      type: 'non-recurring',
    };
  }

  // This would include the full recurring task analysis logic
  return {
    isRecurring: true,
    type: 'new-instance',
    frequency: 'Unknown',
    _detectionMethod: 'api',
    _confidence: 'low',
  };
}

/**
 * Batch adapt tasks with proper type safety
 */
export function adaptTasks(ofTasks: Array<OFTask>, skipAnalysis = false): Array<OmniFocusTask> {
  return ofTasks
    .filter(isOFTask)
    .map(task => adaptTask(task, skipAnalysis));
}

/**
 * Batch adapt projects with proper type safety
 */
export function adaptProjects(ofProjects: Array<OFProject>, includeStats = false): Array<OmniFocusProject> {
  return ofProjects
    .filter(isOFProject)
    .map(project => adaptProject(project, includeStats));
}

/**
 * Batch adapt tags with proper type safety
 */
export function adaptTags(ofTags: Array<OFTag>): Array<OmniFocusTag> {
  return ofTags
    .filter(isOFTag)
    .map(tag => adaptTag(tag));
}
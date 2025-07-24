/**
 * Type Adapters for OmniFocus API
 * 
 * This module provides type adapters to convert between the official OmniFocus API types
 * and our MCP response types. The official API uses object-based types with methods,
 * while our MCP interface uses plain JSON-serializable objects.
 */

import type { OmniFocusTask, OmniFocusProject, OmniFocusTag } from '../types.js';

/**
 * Adapts an OmniFocus Task object to our MCP response format
 * 
 * @param task - The OmniFocus Task object from the API
 * @param options - Additional options for the conversion
 * @returns A JSON-serializable task object
 */
export function adaptTask(task: any, options?: { includeProject?: boolean }): Partial<OmniFocusTask> {
  const adapted: Partial<OmniFocusTask> = {
    id: task.id?.primaryKey || 'unknown',
    name: task.name || 'Unnamed Task',
    completed: task.completed === true,
    flagged: task.flagged === true,
    inInbox: task.inInbox === true,
    dropped: task.dropped === false,
    effectivelyCompleted: task.effectivelyCompleted === true,
    blocked: task.blocked === true,
    sequential: task.sequential === true,
  };

  // Optional fields
  if (task.note) adapted.note = task.note;
  if (task.dueDate) adapted.dueDate = task.dueDate;
  if (task.deferDate) adapted.deferDate = task.deferDate;
  if (task.completionDate) adapted.completionDate = task.completionDate;
  if (task.estimatedMinutes !== null && task.estimatedMinutes !== undefined) {
    adapted.estimatedMinutes = task.estimatedMinutes;
  }
  if (task.added) adapted.added = task.added;

  // Tags - convert Tag objects to string names
  if (task.tags && Array.isArray(task.tags)) {
    adapted.tags = task.tags.map((tag: any) => tag.name || 'Unnamed Tag');
  } else {
    adapted.tags = [];
  }

  // Project information
  if (options?.includeProject && task.containingProject) {
    adapted.project = task.containingProject.name || undefined;
    adapted.projectId = task.containingProject.id?.primaryKey || undefined;
  }

  // Repetition rule (if available)
  if (task.repetitionRule) {
    adapted.repetitionRule = adaptRepetitionRule(task.repetitionRule);
  }

  return adapted;
}

/**
 * Adapts an OmniFocus Project object to our MCP response format
 * 
 * @param project - The OmniFocus Project object from the API
 * @returns A JSON-serializable project object
 */
export function adaptProject(project: any): Partial<OmniFocusProject> {
  const adapted: Partial<OmniFocusProject> = {
    id: project.id?.primaryKey || 'unknown',
    name: project.name || 'Unnamed Project',
    flagged: project.flagged === true,
    sequential: project.sequential === true,
    containsSingletonActions: project.containsSingletonActions === true,
  };

  // Status mapping
  if (project.status) {
    const statusMap: Record<string, OmniFocusProject['status']> = {
      'active': 'active',
      'done': 'completed',
      'dropped': 'dropped',
      'onHold': 'onHold'
    };
    adapted.status = statusMap[project.status] || 'active';
  } else {
    adapted.status = 'active';
  }

  // Optional fields
  if (project.note) adapted.note = project.note;
  if (project.dueDate) adapted.dueDate = project.dueDate;
  if (project.deferDate) adapted.deferDate = project.deferDate;
  if (project.completionDate) adapted.completionDate = project.completionDate;
  if (project.lastReviewDate) adapted.lastReviewDate = project.lastReviewDate;
  
  // Review interval - convert ReviewInterval object to days
  if (project.reviewInterval && typeof project.reviewInterval === 'object') {
    // Assuming reviewInterval has properties like unit and steps
    const days = convertIntervalToDays(project.reviewInterval);
    if (days) adapted.reviewInterval = days;
  }

  // Folder name
  if (project.parentFolder) {
    adapted.folder = project.parentFolder.name || undefined;
  }

  // Task counts
  if (typeof project.numberOfTasks === 'number') adapted.numberOfTasks = project.numberOfTasks;
  if (typeof project.numberOfAvailableTasks === 'number') adapted.numberOfAvailableTasks = project.numberOfAvailableTasks;
  if (typeof project.numberOfCompletedTasks === 'number') adapted.numberOfCompletedTasks = project.numberOfCompletedTasks;

  return adapted;
}

/**
 * Adapts an OmniFocus Tag object to our MCP response format
 * 
 * @param tag - The OmniFocus Tag object from the API
 * @returns A JSON-serializable tag object
 */
export function adaptTag(tag: any): Partial<OmniFocusTag> {
  const adapted: Partial<OmniFocusTag> = {
    id: tag.id?.primaryKey || 'unknown',
    name: tag.name || 'Unnamed Tag',
    allowsNextAction: tag.allowsNextAction === true,
  };

  // Optional fields
  if (tag.note) adapted.note = tag.note;
  
  // Parent tag name
  if (tag.parent) {
    adapted.parent = tag.parent.name || undefined;
  }

  // Children tag names
  if (tag.children && Array.isArray(tag.children)) {
    adapted.children = tag.children.map((child: any) => child.name || 'Unnamed Tag');
  } else {
    adapted.children = [];
  }

  return adapted;
}

/**
 * Adapts a RepetitionRule object from the API
 */
function adaptRepetitionRule(rule: any): any {
  if (!rule) return undefined;

  const adapted: any = {};

  // Copy official API properties if they exist
  if (rule.method) adapted.method = rule.method;
  if (rule.ruleString) adapted.ruleString = rule.ruleString;
  if (rule.anchorDateKey) adapted.anchorDateKey = rule.anchorDateKey;
  if (rule.catchUpAutomatically !== undefined) adapted.catchUpAutomatically = rule.catchUpAutomatically;
  if (rule.scheduleType) adapted.scheduleType = rule.scheduleType;

  return adapted;
}

/**
 * Converts a ReviewInterval object to days
 */
function convertIntervalToDays(interval: any): number | undefined {
  if (!interval) return undefined;

  // Handle different interval representations
  if (typeof interval === 'number') return interval;
  
  if (interval.unit && interval.steps) {
    const unitToDays: Record<string, number> = {
      'days': 1,
      'weeks': 7,
      'months': 30,
      'years': 365
    };
    const daysPerUnit = unitToDays[interval.unit] || 1;
    return interval.steps * daysPerUnit;
  }

  return undefined;
}

/**
 * Type guards for checking API object types
 */
export const TypeGuards = {
  isTask(obj: any): boolean {
    return obj && typeof obj.id === 'object' && obj.id.primaryKey && 'completed' in obj;
  },

  isProject(obj: any): boolean {
    return obj && typeof obj.id === 'object' && obj.id.primaryKey && 'status' in obj && 'containsSingletonActions' in obj;
  },

  isTag(obj: any): boolean {
    return obj && typeof obj.id === 'object' && obj.id.primaryKey && 'allowsNextAction' in obj;
  }
};
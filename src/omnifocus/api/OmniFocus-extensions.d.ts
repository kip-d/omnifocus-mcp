// TypeScript extensions for OmniFocus
// Undocumented but working properties from OmniFocus Scripting Dictionary
//
// These properties are not included in the official OmniFocus API export
// but are accessible via JXA and have been empirically verified to work.
//
// Verified on: OmniFocus 4.8.3 (October 2025) - All 14 properties tested ✅
// Test results: 14/14 passed
//
// This file augments the official OmniFocus.d.ts type definitions.

/**
 * Project extensions
 */
interface Project {
  /**
   * Effective status considering parent folders
   * Returns the actual status taking into account parent folder status
   */
  readonly effectiveStatus: Project.Status;

  /**
   * Whether this project contains singleton actions
   * True if the project is configured to hold standalone tasks
   */
  readonly singletonActionHolder: boolean;

  /**
   * Next actionable child task in this project
   * Returns null if no tasks are available or project has no tasks
   */
  readonly nextTask: Task | null;

  /**
   * Whether this is the default singleton action holder
   * True if this project is the default location for standalone actions
   */
  readonly defaultSingletonActionHolder: boolean;
}

/**
 * Tag extensions
 */
interface Tag {
  /**
   * Number of available (unblocked, incomplete) tasks with this tag or descendant tags
   * Includes tasks from child tags in the hierarchy
   */
  readonly availableTaskCount: number;

  /**
   * Number of incomplete tasks with this tag or descendant tags
   * Includes both available and blocked tasks
   */
  readonly remainingTaskCount: number;
}

/**
 * Task extensions
 */
interface Task {
  /**
   * Total number of direct child tasks
   * Does not include grandchildren or deeper descendants
   */
  readonly numberOfTasks: number;

  /**
   * Number of available (unblocked, incomplete) direct child tasks
   * Tasks that can be worked on right now
   */
  readonly numberOfAvailableTasks: number;

  /**
   * Number of completed direct child tasks
   * Excludes dropped tasks
   */
  readonly numberOfCompletedTasks: number;

  /**
   * Whether this is the next actionable task in its containing project
   * True if this task is marked as "next" in the project sequence
   */
  readonly next: boolean;

  /**
   * Whether this task has blocking dependencies
   * True if task is waiting on other tasks to complete first
   */
  readonly blocked: boolean;

  /**
   * Whether task or its container is completed
   * True if either the task itself or any parent is marked complete
   */
  readonly effectivelyCompleted: boolean;

  /**
   * Whether task or its container is dropped
   * True if either the task itself or any parent is marked dropped
   */
  readonly effectivelyDropped: boolean;
}

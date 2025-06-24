/**
 * Utility functions for safely accessing OmniFocus object properties
 * that may throw "Can't convert types" errors through the JXA bridge
 */

const DEBUG_ID_ERRORS = process.env.DEBUG_OMNIFOCUS_IDS === 'true';

/**
 * Safely get the ID from an OmniFocus object
 * @param obj The OmniFocus object (task, project, etc.)
 * @param context Optional context for debugging
 * @returns The ID string or null if not accessible
 */
export function safeGetId(obj: any, context?: string): string | null {
  try {
    // Note: Based on the codebase analysis, primaryKey is sometimes a property
    // and sometimes a function. We need to handle both cases.
    const id = obj?.id?.primaryKey?.() || obj?.id?.primaryKey;
    return id || null;
  } catch (e) {
    if (DEBUG_ID_ERRORS) {
      console.error(`Failed to get ID${context ? ` for ${context}` : ''}: ${e}`);
    }
    return null;
  }
}

/**
 * Safely get a property value using a getter function
 * @param obj The object to access
 * @param getter Function that accesses the property
 * @param defaultValue Value to return if access fails
 * @returns The property value or defaultValue
 */
export function safeGetProperty<T>(
  _obj: any, 
  getter: () => T, 
  defaultValue: T | null = null
): T | null {
  try {
    const value = getter();
    return value ?? defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Check if a task has an accessible ID
 * Useful for filtering out problematic tasks before processing
 */
export function canAccessTaskId(task: any): boolean {
  try {
    const id = task.id.primaryKey?.() || task.id.primaryKey;
    return id !== null && id !== undefined && id !== '';
  } catch (e) {
    // Log pattern information for debugging
    if (DEBUG_ID_ERRORS) {
      try {
        const taskInfo = {
          hasRepetition: safeGetProperty(task, () => task.repetitionRule() !== null, false),
          isDeferred: safeGetProperty(task, () => {
            const deferDate = task.deferDate();
            return deferDate && deferDate > new Date();
          }, false),
          isCompleted: safeGetProperty(task, () => task.completed(), false),
          isDropped: safeGetProperty(task, () => task.dropped(), false)
        };
        console.log('Task without accessible ID:', taskInfo);
      } catch (e2) {
        console.log('Task without accessible ID: unable to determine type');
      }
    }
    return false;
  }
}

/**
 * Build a safe task object from an OmniFocus task
 * @param task The OmniFocus task object
 * @returns A safe task object or null if core properties aren't accessible
 */
export function buildTaskObject(task: any): any | null {
  try {
    // First check if we can access the ID - if not, skip the task entirely
    const id = safeGetId(task, 'task');
    if (!id) {
      return null;
    }
    
    // Core properties - if these fail, we skip the task
    const name = task.name();
    const completed = task.completed();
    const flagged = task.flagged();
    const inInbox = task.inInbox();
    
    // Build the task object with optional properties
    return {
      id,
      name,
      completed,
      flagged,
      inInbox,
      // Optional properties with inline fallbacks
      note: safeGetProperty(task, () => task.note(), ''),
      project: safeGetProperty(task, () => {
        const project = task.containingProject();
        return project ? project.name() : null;
      }),
      projectId: safeGetProperty(task, () => {
        const project = task.containingProject();
        return project ? safeGetId(project, 'project') : null;
      }),
      dueDate: safeGetProperty(task, () => {
        const date = task.dueDate();
        return date ? date.toISOString() : null;
      }),
      deferDate: safeGetProperty(task, () => {
        const date = task.deferDate();
        return date ? date.toISOString() : null;
      }),
      completionDate: safeGetProperty(task, () => {
        const date = task.completionDate();
        return date ? date.toISOString() : null;
      }),
      estimatedMinutes: safeGetProperty(task, () => task.estimatedMinutes()),
      tags: safeGetProperty(task, () => {
        const tags = task.tags();
        return tags ? tags.map((t: any) => t.name()) : [];
      }, [])
    };
  } catch (e) {
    // If we can't even get the basic properties, skip this task
    if (DEBUG_ID_ERRORS) {
      console.error('Failed to build task object:', e);
    }
    return null;
  }
}

/**
 * Build a safe project object from an OmniFocus project
 * @param project The OmniFocus project object
 * @returns A safe project object or null if core properties aren't accessible
 */
export function buildProjectObject(project: any): any | null {
  try {
    // First check if we can access the ID
    const id = safeGetId(project, 'project');
    if (!id) {
      return null;
    }
    
    // Core properties
    const name = project.name();
    const status = project.status();
    
    // Build the project object with optional properties
    return {
      id,
      name,
      status,
      // Optional properties
      note: safeGetProperty(project, () => project.note(), ''),
      flagged: safeGetProperty(project, () => project.flagged(), false),
      numberOfTasks: safeGetProperty(project, () => project.numberOfTasks(), 0),
      numberOfAvailableTasks: safeGetProperty(project, () => project.numberOfAvailableTasks(), 0),
      dueDate: safeGetProperty(project, () => {
        const date = project.dueDate();
        return date ? date.toISOString() : null;
      }),
      deferDate: safeGetProperty(project, () => {
        const date = project.deferDate();
        return date ? date.toISOString() : null;
      }),
      completionDate: safeGetProperty(project, () => {
        const date = project.completionDate();
        return date ? date.toISOString() : null;
      }),
      folder: safeGetProperty(project, () => {
        const folder = project.folder();
        return folder ? folder.name() : null;
      }),
      reviewDate: safeGetProperty(project, () => {
        const date = project.nextReviewDate();
        return date ? date.toISOString() : null;
      })
    };
  } catch (e) {
    if (DEBUG_ID_ERRORS) {
      console.error('Failed to build project object:', e);
    }
    return null;
  }
}
/**
 * MUTATION SCRIPT BUILDER
 *
 * Generates JXA scripts for OmniFocus mutations (create, update, complete, delete, batch).
 * This is the script generation layer for the mutation contracts.
 *
 * Architecture:
 * - TaskMutation → validate → buildScript → JXA script string
 *
 * TEST SANDBOX GUARD:
 * When NODE_ENV === 'test', all mutations are validated to ensure they only
 * affect data within the test sandbox (__MCP_TEST_SANDBOX__ folder).
 *
 * @see ../mutations.ts for contract types
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 * @see docs/plans/2025-12-11-test-sandbox-design.md
 */

import type {
  TaskCreateData,
  ProjectCreateData,
  TaskUpdateData,
  ProjectUpdateData,
  MutationTarget,
} from '../mutations.js';

// =============================================================================
// TEST SANDBOX GUARD
// =============================================================================

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SANDBOX_FOLDER_NAME = '__MCP_TEST_SANDBOX__';
const TEST_TAG_PREFIX = '__test-';
const TEST_INBOX_PREFIX = '__TEST__';

// Cache the sandbox folder ID to avoid repeated lookups
let cachedSandboxFolderId: string | null = null;

/**
 * Check if we're running in integration test mode with sandbox enforcement.
 *
 * The guard is ONLY active when:
 * - NODE_ENV === 'test' AND
 * - SANDBOX_GUARD_ENABLED === 'true' (set by integration test setup)
 *
 * This allows unit tests to run without sandbox restrictions while
 * integration tests that actually write to OmniFocus are protected.
 */
function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.SANDBOX_GUARD_ENABLED === 'true';
}

/**
 * Execute a JXA script and return the result (for guard validation)
 */
async function executeGuardJXA<T>(script: string): Promise<T> {
  const wrappedScript = `
    (() => {
      const app = Application('OmniFocus');
      app.includeStandardAdditions = true;
      const doc = app.defaultDocument();
      ${script}
    })()
  `;

  const { stdout } = await execAsync(`osascript -l JavaScript -e '${wrappedScript.replace(/'/g, "'\"'\"'")}'`);
  return JSON.parse(stdout.trim()) as T;
}

/**
 * Get the sandbox folder ID (cached)
 */
async function getSandboxFolderId(): Promise<string | null> {
  if (cachedSandboxFolderId !== null) {
    return cachedSandboxFolderId;
  }

  const script = `
    const folders = doc.flattenedFolders();
    for (let i = 0; i < folders.length; i++) {
      try {
        if (folders[i].name() === '${SANDBOX_FOLDER_NAME}') {
          return JSON.stringify({ folderId: folders[i].id() });
        }
      } catch (e) {}
    }
    return JSON.stringify({ folderId: null });
  `;

  try {
    const result = await executeGuardJXA<{ folderId: string | null }>(script);
    cachedSandboxFolderId = result.folderId;
    return cachedSandboxFolderId;
  } catch {
    return null;
  }
}

// Cache validated project IDs to avoid repeated sandbox checks
const validatedProjectIds = new Set<string>();

/**
 * Check if a project is inside the sandbox folder
 * Uses O(1) Project.byIdentifier via OmniJS bridge instead of O(n) iteration
 */
async function isProjectInSandbox(projectId: string): Promise<boolean> {
  // Fast path: already validated this project
  if (validatedProjectIds.has(projectId)) {
    return true;
  }

  const sandboxId = await getSandboxFolderId();
  if (!sandboxId) return false;

  // Use OmniJS bridge for O(1) lookup instead of O(n) iteration
  const script = `
    const bridgeScript = \`
      (() => {
        const projectId = '${projectId}';
        const sandboxId = '${sandboxId}';

        // O(1) lookup using Project.byIdentifier
        const project = Project.byIdentifier(projectId);
        if (!project) {
          return JSON.stringify({ inSandbox: false, error: 'not_found' });
        }

        // Check if project's folder matches sandbox folder
        const folder = project.parentFolder;
        if (folder && folder.id.primaryKey === sandboxId) {
          return JSON.stringify({ inSandbox: true });
        }

        return JSON.stringify({ inSandbox: false });
      })()
    \`;

    return app.evaluateJavascript(bridgeScript);
  `;

  try {
    const result = await executeGuardJXA<{ inSandbox: boolean }>(script);
    if (result.inSandbox) {
      validatedProjectIds.add(projectId);
    }
    return result.inSandbox;
  } catch {
    return false;
  }
}

// Cache validated task IDs to avoid repeated sandbox checks
const validatedTaskIds = new Set<string>();

/**
 * Check if a task is inside the sandbox (via project) or has __TEST__ prefix
 * Uses O(1) Task.byIdentifier via OmniJS bridge instead of O(n) iteration
 */
async function isTaskInSandbox(taskId: string): Promise<boolean> {
  // Fast path: already validated this task
  if (validatedTaskIds.has(taskId)) {
    return true;
  }

  const sandboxId = await getSandboxFolderId();

  // Use OmniJS bridge for O(1) lookup instead of O(n) iteration
  const script = `
    const bridgeScript = \`
      (() => {
        const taskId = '${taskId}';
        const sandboxId = '${sandboxId || ''}';
        const testPrefix = '${TEST_INBOX_PREFIX}';

        // O(1) lookup using Task.byIdentifier
        const task = Task.byIdentifier(taskId);
        if (!task) {
          return JSON.stringify({ inSandbox: false, error: 'not_found' });
        }

        // Check if name starts with __TEST__ prefix
        if (task.name && task.name.startsWith(testPrefix)) {
          return JSON.stringify({ inSandbox: true });
        }

        // Check if task's project is in sandbox folder
        const project = task.containingProject;
        if (project) {
          const folder = project.parentFolder;
          if (folder && folder.id.primaryKey === sandboxId) {
            return JSON.stringify({ inSandbox: true });
          }
        }

        return JSON.stringify({ inSandbox: false });
      })()
    \`;

    return app.evaluateJavascript(bridgeScript);
  `;

  try {
    const result = await executeGuardJXA<{ inSandbox: boolean }>(script);
    if (result.inSandbox) {
      validatedTaskIds.add(taskId);
    }
    return result.inSandbox;
  } catch {
    return false;
  }
}

/**
 * Validate that a project creation is inside the sandbox
 */
function validateProjectCreate(data: ProjectCreateData): void {
  if (!isTestMode()) return;

  if (data.folder !== SANDBOX_FOLDER_NAME) {
    throw new Error(
      'TEST GUARD: Projects must be created inside sandbox folder. ' +
        `Got folder: "${data.folder || '(none)'}". ` +
        `Use folder: "${SANDBOX_FOLDER_NAME}"`,
    );
  }

  // Validate tags
  if (data.tags && data.tags.length > 0) {
    const invalidTags = data.tags.filter((t) => !t.startsWith(TEST_TAG_PREFIX));
    if (invalidTags.length > 0) {
      throw new Error(`TEST GUARD: Tags must start with "${TEST_TAG_PREFIX}". ` + `Invalid: ${invalidTags.join(', ')}`);
    }
  }
}

/**
 * Validate that a task creation is in sandbox or has __TEST__ prefix for inbox
 */
async function validateTaskCreate(data: TaskCreateData): Promise<void> {
  if (!isTestMode()) return;

  // If creating in inbox (no project), name must start with __TEST__
  if (!data.project) {
    if (!data.name.startsWith(TEST_INBOX_PREFIX)) {
      throw new Error(
        `TEST GUARD: Inbox tasks must have name starting with "${TEST_INBOX_PREFIX}". ` + `Got: "${data.name}"`,
      );
    }
    return; // Inbox task with correct prefix is allowed
  }

  // If creating in a project, verify the project is in the sandbox
  const inSandbox = await isProjectInSandbox(data.project);
  if (!inSandbox) {
    throw new Error(
      `TEST GUARD: Project "${data.project}" is not inside sandbox folder. ` +
        `Tasks can only be created in projects within "${SANDBOX_FOLDER_NAME}".`,
    );
  }

  // Validate tags
  if (data.tags && data.tags.length > 0) {
    const invalidTags = data.tags.filter((t) => !t.startsWith(TEST_TAG_PREFIX));
    if (invalidTags.length > 0) {
      throw new Error(`TEST GUARD: Tags must start with "${TEST_TAG_PREFIX}". ` + `Invalid: ${invalidTags.join(', ')}`);
    }
  }
}

/**
 * Validate that tag changes only use __test- prefixed tags
 */
function validateTagChanges(changes: TaskUpdateData | ProjectUpdateData): void {
  if (!isTestMode()) return;

  const allTags: string[] = [];

  if ('tags' in changes && changes.tags) {
    allTags.push(...changes.tags);
  }
  if ('addTags' in changes && changes.addTags) {
    allTags.push(...changes.addTags);
  }

  const invalidTags = allTags.filter((t) => !t.startsWith(TEST_TAG_PREFIX));
  if (invalidTags.length > 0) {
    throw new Error(`TEST GUARD: Tags must start with "${TEST_TAG_PREFIX}". ` + `Invalid: ${invalidTags.join(', ')}`);
  }
}

/**
 * Validate that a task update/delete is on a task inside the sandbox
 */
async function validateTaskInSandbox(taskId: string, operation: string): Promise<void> {
  if (!isTestMode()) return;

  const inSandbox = await isTaskInSandbox(taskId);
  if (!inSandbox) {
    throw new Error(
      `TEST GUARD: Cannot ${operation} task "${taskId}" outside sandbox. ` +
        `Task must be in a project inside "${SANDBOX_FOLDER_NAME}" or have name starting with "${TEST_INBOX_PREFIX}".`,
    );
  }
}

/**
 * Validate that a project update/delete is on a project inside the sandbox
 */
async function validateProjectInSandbox(projectId: string, operation: string): Promise<void> {
  if (!isTestMode()) return;

  const inSandbox = await isProjectInSandbox(projectId);
  if (!inSandbox) {
    throw new Error(
      `TEST GUARD: Cannot ${operation} project "${projectId}" outside sandbox. ` +
        `Project must be inside "${SANDBOX_FOLDER_NAME}" folder.`,
    );
  }
}

/**
 * Clear all sandbox caches (for testing)
 */
export function clearSandboxCache(): void {
  cachedSandboxFolderId = null;
  validatedTaskIds.clear();
  validatedProjectIds.clear();
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result from a mutation script builder
 */
export interface GeneratedMutationScript {
  script: string;
  operation: string;
  target: MutationTarget;
  description?: string;
}

/**
 * Options for batch operations
 */
export interface BatchOptions {
  createSequentially?: boolean;
  atomicOperation?: boolean;
  returnMapping?: boolean;
  stopOnError?: boolean;
}

/**
 * Batch operation definition
 */
export interface BatchOperation {
  operation: 'create' | 'update';
  target: MutationTarget;
  data?: TaskCreateData | ProjectCreateData;
  id?: string;
  changes?: TaskUpdateData | ProjectUpdateData;
  tempId?: string;
  parentTempId?: string;
}

// =============================================================================
// SCRIPT BUILDERS
// =============================================================================

/**
 * Build a JXA script for creating a task
 */
export async function buildCreateTaskScript(data: TaskCreateData): Promise<GeneratedMutationScript> {
  // Test sandbox guard
  await validateTaskCreate(data);

  const taskData = buildTaskDataObject(data);

  const script = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const taskData = ${JSON.stringify(taskData)};

  try {
    // Determine target container
    let targetContainer = doc.inboxTasks;
    let parentTask = null;

    if (taskData.parentTaskId) {
      const allTasks = doc.flattenedTasks();
      for (let i = 0; i < allTasks.length; i++) {
        try {
          if (allTasks[i].id() === taskData.parentTaskId) {
            parentTask = allTasks[i];
            break;
          }
        } catch (e) {}
      }
      if (!parentTask) {
        return JSON.stringify({
          error: true,
          message: "Parent task not found: " + taskData.parentTaskId
        });
      }
      targetContainer = parentTask.tasks;
    } else if (taskData.projectId) {
      const projects = doc.flattenedProjects();
      let targetProject = null;
      for (let i = 0; i < projects.length; i++) {
        try {
          if (projects[i].id() === taskData.projectId || projects[i].name() === taskData.projectId) {
            targetProject = projects[i];
            break;
          }
        } catch (e) {}
      }
      if (targetProject) {
        targetContainer = targetProject.tasks;
      }
    }

    // Create task
    const task = app.Task({
      name: taskData.name,
      note: taskData.note || '',
      flagged: taskData.flagged || false
    });

    targetContainer.push(task);

    // Set dates
    if (taskData.dueDate) {
      try { task.dueDate = new Date(taskData.dueDate); } catch (e) {}
    }
    if (taskData.deferDate) {
      try { task.deferDate = new Date(taskData.deferDate); } catch (e) {}
    }
    if (taskData.plannedDate) {
      try { task.plannedDate = new Date(taskData.plannedDate); } catch (e) {}
    }

    // Set estimated minutes
    if (taskData.estimatedMinutes) {
      task.estimatedMinutes = taskData.estimatedMinutes;
    }

    const taskId = task.id();

    // Set tags via bridge
    let appliedTags = [];
    if (taskData.tags && taskData.tags.length > 0) {
      try {
        const tagScript = \`
          (() => {
            const task = document.windows[0].selection.tasks[0] ||
              flattenedTasks.find(t => t.id.primaryKey === '\${taskId}');
            if (!task) return JSON.stringify({success: false, error: 'Task not found'});

            const tagNames = \${JSON.stringify(taskData.tags)};
            const appliedTags = [];

            for (const tagName of tagNames) {
              let tag = flattenedTags.find(t => t.name === tagName);
              if (!tag) {
                tag = new Tag(tagName);
              }
              task.addTag(tag);
              appliedTags.push(tagName);
            }

            return JSON.stringify({success: true, tags: appliedTags});
          })()
        \`;
        const result = JSON.parse(app.evaluateJavascript(tagScript));
        if (result.success) appliedTags = result.tags;
      } catch (e) {}
    }

    // Apply repeat rule if provided
    if (taskData.repeatRule) {
      try {
        const ruleScript = \`
          (() => {
            const task = flattenedTasks.find(t => t.id.primaryKey === '\${taskId}');
            if (!task) return JSON.stringify({success: false, error: 'Task not found'});

            const rule = \${JSON.stringify(taskData.repeatRule)};

            // Map frequency to ICS RRULE FREQ value
            const freqMap = {
              minutely: 'MINUTELY', hourly: 'HOURLY', daily: 'DAILY',
              weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY'
            };
            const freq = freqMap[rule.frequency];
            if (!freq) return JSON.stringify({success: false, error: 'Invalid frequency: ' + rule.frequency});

            // Build ICS RRULE string with all supported parameters
            let rrule = 'FREQ=' + freq;

            // INTERVAL - every Nth occurrence
            if (rule.interval && rule.interval > 1) {
              rrule += ';INTERVAL=' + rule.interval;
            }

            // BYDAY - days of week (e.g., MO,WE,FR or 2MO,-1FR)
            if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
              const byDay = rule.daysOfWeek.map(d => {
                if (d.position) return d.position + d.day;
                return d.day;
              }).join(',');
              rrule += ';BYDAY=' + byDay;
            }

            // BYMONTHDAY - days of month (e.g., 1,15,-1)
            if (rule.daysOfMonth && rule.daysOfMonth.length > 0) {
              rrule += ';BYMONTHDAY=' + rule.daysOfMonth.join(',');
            }

            // COUNT - number of occurrences
            if (rule.count && rule.count > 0) {
              rrule += ';COUNT=' + rule.count;
            }

            // UNTIL - end date (YYYYMMDD or YYYYMMDDTHHMMSSZ)
            if (rule.endDate) {
              // Convert YYYY-MM-DD to YYYYMMDD format
              const until = rule.endDate.replace(/-/g, '');
              rrule += ';UNTIL=' + until;
            }

            // WKST - week start day
            if (rule.weekStart) {
              rrule += ';WKST=' + rule.weekStart;
            }

            // BYSETPOS - filter to specific positions
            if (rule.setPositions && rule.setPositions.length > 0) {
              rrule += ';BYSETPOS=' + rule.setPositions.join(',');
            }

            // Use constructor (fromString does not exist)
            task.repetitionRule = new Task.RepetitionRule(
              rrule,
              null,
              Task.RepetitionScheduleType.Regularly,
              Task.AnchorDateKey.DueDate,
              true
            );
            return JSON.stringify({success: true, rrule: rrule});
          })()
        \`;
        app.evaluateJavascript(ruleScript);
      } catch (e) {}
    }

    return JSON.stringify({
      taskId: taskId,
      name: task.name(),
      note: task.note() || '',
      flagged: task.flagged(),
      dueDate: task.dueDate() ? task.dueDate().toISOString() : null,
      deferDate: task.deferDate() ? task.deferDate().toISOString() : null,
      plannedDate: task.plannedDate() ? task.plannedDate().toISOString() : null,
      estimatedMinutes: task.estimatedMinutes() || null,
      tags: appliedTags,
      project: task.containingProject() ? task.containingProject().name() : null,
      inInbox: task.inInbox(),
      created: true
    });

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'create_task'
    });
  }
})();
`;

  return {
    script: script.trim(),
    operation: 'create',
    target: 'task',
    description: `Create task: ${data.name}`,
  };
}

/**
 * Build a JXA script for creating a project
 */
export function buildCreateProjectScript(data: ProjectCreateData): GeneratedMutationScript {
  // Test sandbox guard
  validateProjectCreate(data);

  const projectData = buildProjectDataObject(data);

  const script = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const projectData = ${JSON.stringify(projectData)};

  try {
    // Find folder if specified
    let targetFolder = null;
    if (projectData.folder) {
      const folders = doc.flattenedFolders();
      for (let i = 0; i < folders.length; i++) {
        try {
          if (folders[i].name() === projectData.folder || folders[i].id() === projectData.folder) {
            targetFolder = folders[i];
            break;
          }
        } catch (e) {}
      }
    }

    // Create project
    const project = app.Project({
      name: projectData.name,
      note: projectData.note || '',
      flagged: projectData.flagged || false,
      sequential: projectData.sequential || false
    });

    // Add to folder or root
    if (targetFolder) {
      targetFolder.projects.push(project);
    } else {
      doc.projects.push(project);
    }

    // Set dates
    if (projectData.dueDate) {
      try { project.dueDate = new Date(projectData.dueDate); } catch (e) {}
    }
    if (projectData.deferDate) {
      try { project.deferDate = new Date(projectData.deferDate); } catch (e) {}
    }

    // Set status
    if (projectData.status) {
      const statusMap = {
        'active': 'active status',
        'on_hold': 'on hold status',
        'completed': 'done status',
        'dropped': 'dropped status'
      };
      try { project.status = statusMap[projectData.status] || 'active status'; } catch (e) {}
    }

    // Set review interval
    if (projectData.reviewInterval) {
      try { project.reviewInterval = projectData.reviewInterval * 24 * 60 * 60; } catch (e) {}
    }

    const projectId = project.id();

    // Set tags via bridge
    let appliedTags = [];
    if (projectData.tags && projectData.tags.length > 0) {
      try {
        const tagScript = \`
          (() => {
            const proj = flattenedProjects.find(p => p.id.primaryKey === '\${projectId}');
            if (!proj) return JSON.stringify({success: false});

            const tagNames = \${JSON.stringify(projectData.tags)};
            const appliedTags = [];

            for (const tagName of tagNames) {
              let tag = flattenedTags.find(t => t.name === tagName);
              if (!tag) tag = new Tag(tagName);
              proj.addTag(tag);
              appliedTags.push(tagName);
            }

            return JSON.stringify({success: true, tags: appliedTags});
          })()
        \`;
        const result = JSON.parse(app.evaluateJavascript(tagScript));
        if (result.success) appliedTags = result.tags;
      } catch (e) {}
    }

    return JSON.stringify({
      projectId: projectId,
      name: project.name(),
      note: project.note() || '',
      flagged: project.flagged(),
      sequential: project.sequential(),
      dueDate: project.dueDate() ? project.dueDate().toISOString() : null,
      deferDate: project.deferDate() ? project.deferDate().toISOString() : null,
      folder: targetFolder ? targetFolder.name() : null,
      tags: appliedTags,
      created: true
    });

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'create_project'
    });
  }
})();
`;

  return {
    script: script.trim(),
    operation: 'create',
    target: 'project',
    description: `Create project: ${data.name}`,
  };
}

/**
 * Build a JXA script for updating a task
 */
export async function buildUpdateTaskScript(taskId: string, changes: TaskUpdateData): Promise<GeneratedMutationScript> {
  // Test sandbox guard - validate task is in sandbox and tag changes
  await validateTaskInSandbox(taskId, 'update');
  validateTagChanges(changes);

  const changesData = buildUpdateChangesObject(changes);

  // Use pure OmniJS bridge for O(1) task lookup and all property changes
  // This replaces the slow O(n) JXA linear scan that caused 60+ second timeouts
  const script = `
(() => {
  const app = Application('OmniFocus');
  const taskId = ${JSON.stringify(taskId)};
  const changes = ${JSON.stringify(changesData)};

  try {
    // Use OmniJS bridge for O(1) task lookup and all property changes
    const updateScript = \`
      (() => {
        const taskId = '\${taskId}';
        const changes = \${JSON.stringify(changes)};

        // O(1) lookup using Task.byIdentifier
        const task = Task.byIdentifier(taskId);
        if (!task) {
          return JSON.stringify({
            error: true,
            message: "Task not found: " + taskId
          });
        }

        // Apply simple property changes
        if (changes.name !== undefined) task.name = changes.name;
        if (changes.note !== undefined) task.note = changes.note;
        if (changes.flagged !== undefined) task.flagged = changes.flagged;

        // Handle dates
        if (changes.dueDate !== undefined) {
          task.dueDate = changes.dueDate ? new Date(changes.dueDate) : null;
        }
        if (changes.clearDueDate) task.dueDate = null;

        if (changes.deferDate !== undefined) {
          task.deferDate = changes.deferDate ? new Date(changes.deferDate) : null;
        }
        if (changes.clearDeferDate) task.deferDate = null;

        if (changes.plannedDate !== undefined) {
          task.plannedDate = changes.plannedDate ? new Date(changes.plannedDate) : null;
        }
        if (changes.clearPlannedDate) task.plannedDate = null;

        if (changes.clearEstimatedMinutes) {
          task.estimatedMinutes = null;
        } else if (changes.estimatedMinutes !== undefined) {
          task.estimatedMinutes = changes.estimatedMinutes;
        }

        // Handle project change / move to inbox
        if (changes.project !== undefined) {
          if (changes.project === null) {
            try {
              moveTasks([task], inbox.beginning);
            } catch (e) {
              return JSON.stringify({
                error: true,
                message: 'Failed to move task to inbox: ' + String(e)
              });
            }
          } else {
            // Try by ID first, then by name
            let project = Project.byIdentifier(changes.project);
            if (!project) {
              project = flattenedProjects.find(p => p.name === changes.project);
            }
            if (!project) {
              return JSON.stringify({
                error: true,
                message: 'Project not found: ' + changes.project
              });
            }
            try {
              moveTasks([task], project.beginning);
            } catch (e) {
              return JSON.stringify({
                error: true,
                message: 'Failed to move task to project: ' + String(e)
              });
            }
          }
        }

        // Handle tags
        if (changes.tags || changes.addTags || changes.removeTags) {
          if (changes.tags) {
            // Replace all tags
            task.clearTags();
            for (const tagName of changes.tags) {
              let tag = flattenedTags.find(t => t.name === tagName);
              if (!tag) tag = new Tag(tagName);
              task.addTag(tag);
            }
          }

          if (changes.addTags) {
            for (const tagName of changes.addTags) {
              let tag = flattenedTags.find(t => t.name === tagName);
              if (!tag) tag = new Tag(tagName);
              task.addTag(tag);
            }
          }

          if (changes.removeTags) {
            for (const tagName of changes.removeTags) {
              const tag = flattenedTags.find(t => t.name === tagName);
              if (tag) task.removeTag(tag);
            }
          }
        }

        // Handle repetition rule
        if (changes.repetitionRule) {
          const rule = changes.repetitionRule;

          // Map frequency to ICS RRULE FREQ value
          const freqMap = {
            minutely: 'MINUTELY', hourly: 'HOURLY', daily: 'DAILY',
            weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY'
          };
          const freq = freqMap[rule.frequency];
          if (!freq) {
            return JSON.stringify({
              error: true,
              message: 'Invalid frequency: ' + rule.frequency
            });
          }

          // Build ICS RRULE string with all supported parameters
          let rrule = 'FREQ=' + freq;

          // INTERVAL - every Nth occurrence
          if (rule.interval && rule.interval > 1) {
            rrule += ';INTERVAL=' + rule.interval;
          }

          // BYDAY - days of week (e.g., MO,WE,FR or 2MO,-1FR)
          if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
            const byDay = rule.daysOfWeek.map(d => {
              if (d.position) return d.position + d.day;
              return d.day;
            }).join(',');
            rrule += ';BYDAY=' + byDay;
          }

          // BYMONTHDAY - days of month (e.g., 1,15,-1)
          if (rule.daysOfMonth && rule.daysOfMonth.length > 0) {
            rrule += ';BYMONTHDAY=' + rule.daysOfMonth.join(',');
          }

          // COUNT - number of occurrences
          if (rule.count && rule.count > 0) {
            rrule += ';COUNT=' + rule.count;
          }

          // UNTIL - end date (YYYYMMDD or YYYYMMDDTHHMMSSZ)
          if (rule.endDate) {
            // Convert YYYY-MM-DD to YYYYMMDD format
            const until = rule.endDate.replace(/-/g, '');
            rrule += ';UNTIL=' + until;
          }

          // WKST - week start day
          if (rule.weekStart) {
            rrule += ';WKST=' + rule.weekStart;
          }

          // BYSETPOS - filter to specific positions
          if (rule.setPositions && rule.setPositions.length > 0) {
            rrule += ';BYSETPOS=' + rule.setPositions.join(',');
          }

          // Use constructor (fromString does not exist)
          task.repetitionRule = new Task.RepetitionRule(
            rrule,
            null,
            Task.RepetitionScheduleType.Regularly,
            Task.AnchorDateKey.DueDate,
            true
          );
        }

        return JSON.stringify({
          taskId: taskId,
          name: task.name,
          flagged: task.flagged,
          updated: true
        });
      })()
    \`;

    return app.evaluateJavascript(updateScript);

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'update_task'
    });
  }
})();
`;

  return {
    script: script.trim(),
    operation: 'update',
    target: 'task',
    description: `Update task: ${taskId}`,
  };
}

/**
 * Build a JXA script for updating a project
 */
export async function buildUpdateProjectScript(
  projectId: string,
  changes: ProjectUpdateData,
): Promise<GeneratedMutationScript> {
  // Test sandbox guard - validate project is in sandbox and tag changes
  await validateProjectInSandbox(projectId, 'update');
  validateTagChanges(changes);

  const changesData = buildUpdateChangesObject(changes);

  const script = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const projectId = ${JSON.stringify(projectId)};
  const changes = ${JSON.stringify(changesData)};

  try {
    // Find project
    const projects = doc.flattenedProjects();
    let project = null;
    for (let i = 0; i < projects.length; i++) {
      try {
        if (projects[i].id() === projectId) {
          project = projects[i];
          break;
        }
      } catch (e) {}
    }

    if (!project) {
      return JSON.stringify({
        error: true,
        message: "Project not found: " + projectId
      });
    }

    // Apply changes
    if (changes.name !== undefined) project.name = changes.name;
    if (changes.note !== undefined) project.note = changes.note;
    if (changes.flagged !== undefined) project.flagged = changes.flagged;
    if (changes.sequential !== undefined) project.sequential = changes.sequential;

    // Handle dates
    if (changes.dueDate !== undefined) {
      project.dueDate = changes.dueDate ? new Date(changes.dueDate) : null;
    }
    if (changes.clearDueDate) project.dueDate = null;

    if (changes.deferDate !== undefined) {
      project.deferDate = changes.deferDate ? new Date(changes.deferDate) : null;
    }
    if (changes.clearDeferDate) project.deferDate = null;

    // Handle status
    if (changes.status) {
      const statusMap = {
        'active': 'active status',
        'on_hold': 'on hold status',
        'completed': 'done status',
        'dropped': 'dropped status'
      };
      project.status = statusMap[changes.status] || 'active status';
    }

    // Handle folder change via OmniJS bridge (JXA push doesn't persist)
    if (changes.folder !== undefined) {
      const moveScript = changes.folder === null
        ? \`(() => {
            const project = Project.byIdentifier('\${projectId}');
            if (!project) return JSON.stringify({ success: false, error: 'project_not_found' });
            try {
              moveSections([project], library.beginning);
              return JSON.stringify({ success: true, moved: 'root' });
            } catch (e) {
              return JSON.stringify({ success: false, error: String(e) });
            }
          })()\`
        : \`(() => {
            const project = Project.byIdentifier('\${projectId}');
            if (!project) return JSON.stringify({ success: false, error: 'project_not_found' });
            const targetId = '\${changes.folder}';
            // Try by ID first, then by name
            let folder = Folder.byIdentifier(targetId);
            if (!folder) {
              folder = flattenedFolders.find(f => f.name === targetId);
            }
            if (!folder) return JSON.stringify({ success: false, error: 'folder_not_found: ' + targetId });
            try {
              moveSections([project], folder.beginning);
              return JSON.stringify({ success: true, moved: 'folder', folderId: folder.id.primaryKey });
            } catch (e) {
              return JSON.stringify({ success: false, error: String(e) });
            }
          })()\`;
      try {
        const moveResult = JSON.parse(app.evaluateJavascript(moveScript));
        if (!moveResult.success) {
          return JSON.stringify({
            error: true,
            message: 'Failed to move project: ' + (moveResult.error || 'unknown error')
          });
        }
      } catch (e) {
        return JSON.stringify({
          error: true,
          message: 'Failed to move project via bridge: ' + String(e)
        });
      }
    }

    return JSON.stringify({
      projectId: projectId,
      name: project.name(),
      flagged: project.flagged(),
      status: changes.status || 'active',
      updated: true
    });

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'update_project'
    });
  }
})();
`;

  return {
    script: script.trim(),
    operation: 'update',
    target: 'project',
    description: `Update project: ${projectId}`,
  };
}

/**
 * Build a JXA script for completing a task or project
 */
export async function buildCompleteScript(
  target: MutationTarget,
  id: string,
  completionDate?: string,
): Promise<GeneratedMutationScript> {
  // Test sandbox guard
  if (target === 'task') {
    await validateTaskInSandbox(id, 'complete');
  } else {
    await validateProjectInSandbox(id, 'complete');
  }

  const isTask = target === 'task';
  const collection = isTask ? 'flattenedTasks' : 'flattenedProjects';
  const idField = isTask ? 'taskId' : 'projectId';

  // Build the markComplete call argument
  const markCompleteArg = completionDate ? `new Date('${completionDate}')` : '';
  const flattenedCollection = isTask ? 'flattenedTasks' : 'flattenedProjects';

  const script = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const targetId = ${JSON.stringify(id)};
  const completionDateStr = ${completionDate ? JSON.stringify(completionDate) : 'null'};

  try {
    // Find item
    const items = doc.${collection}();
    let item = null;
    for (let i = 0; i < items.length; i++) {
      try {
        if (items[i].id() === targetId) {
          item = items[i];
          break;
        }
      } catch (e) {}
    }

    if (!item) {
      return JSON.stringify({
        error: true,
        message: "${target} not found: " + targetId
      });
    }

    // Mark complete via bridge for reliable completion
    const completeScript = '(' +
      '() => {' +
        'const item = ${flattenedCollection}.find(i => i.id.primaryKey === "' + targetId + '");' +
        'if (!item) return JSON.stringify({success: false, error: "Not found"});' +
        'item.markComplete(${markCompleteArg});' +
        'return JSON.stringify({' +
          'success: true,' +
          '${idField}: item.id.primaryKey,' +
          'name: item.name,' +
          'completionDate: item.completionDate ? item.completionDate.toISOString() : null' +
        '});' +
      '}' +
    ')()';

    const result = JSON.parse(app.evaluateJavascript(completeScript));

    return JSON.stringify({
      ${idField}: targetId,
      name: item.name(),
      completed: true,
      completionDate: result.completionDate || null
    });

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'complete_${target}'
    });
  }
})();
`;

  return {
    script: script.trim(),
    operation: 'complete',
    target,
    description: `Complete ${target}: ${id}`,
  };
}

/**
 * Build a JXA script for deleting a task or project
 */
export async function buildDeleteScript(target: MutationTarget, id: string): Promise<GeneratedMutationScript> {
  // Test sandbox guard
  if (target === 'task') {
    await validateTaskInSandbox(id, 'delete');
  } else {
    await validateProjectInSandbox(id, 'delete');
  }

  const isTask = target === 'task';
  const flattenedCollection = isTask ? 'flattenedTasks' : 'flattenedProjects';
  const idField = isTask ? 'taskId' : 'projectId';

  const script = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const targetId = ${JSON.stringify(id)};

  try {
    // Find and delete via bridge
    const deleteScript = '(' +
      '() => {' +
        'const item = ${flattenedCollection}.find(i => i.id.primaryKey === "' + targetId + '");' +
        'if (!item) return JSON.stringify({success: false, error: "Not found"});' +
        'const name = item.name;' +
        'item.remove();' +
        'return JSON.stringify({' +
          'success: true,' +
          '${idField}: "' + targetId + '",' +
          'name: name,' +
          'deleted: true' +
        '});' +
      '}' +
    ')()';

    const result = JSON.parse(app.evaluateJavascript(deleteScript));

    if (!result.success) {
      return JSON.stringify({
        error: true,
        message: result.error || "${target} not found: " + targetId
      });
    }

    return JSON.stringify(result);

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'delete_${target}'
    });
  }
})();
`;

  return {
    script: script.trim(),
    operation: 'delete',
    target,
    description: `Delete ${target}: ${id}`,
  };
}

/**
 * Build a JXA script for batch operations
 */
export function buildBatchScript(
  target: MutationTarget,
  operations: BatchOperation[],
  options: BatchOptions = {},
): GeneratedMutationScript {
  const { createSequentially = false, returnMapping = false } = options;

  const script = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const operations = ${JSON.stringify(operations)};
  const sequential = ${createSequentially};
  const returnMapping = ${returnMapping};

  try {
    const results = [];
    const tempIdMapping = {};
    const errors = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];

      try {
        if (op.operation === 'create') {
          // Handle create
          let targetContainer = doc.inboxTasks;

          // Check for parent by tempId
          if (op.parentTempId && tempIdMapping[op.parentTempId]) {
            const parentId = tempIdMapping[op.parentTempId];
            const allTasks = doc.flattenedTasks();
            for (let j = 0; j < allTasks.length; j++) {
              if (allTasks[j].id() === parentId) {
                targetContainer = allTasks[j].tasks;
                break;
              }
            }
          } else if (op.data.projectId) {
            const projects = doc.flattenedProjects();
            for (let j = 0; j < projects.length; j++) {
              try {
                if (projects[j].id() === op.data.projectId || projects[j].name() === op.data.projectId) {
                  targetContainer = projects[j].tasks;
                  break;
                }
              } catch (e) {}
            }
          }

          const task = app.Task({
            name: op.data.name,
            note: op.data.note || '',
            flagged: op.data.flagged || false
          });

          targetContainer.push(task);
          const taskId = task.id();

          // Store tempId mapping
          if (op.tempId) {
            tempIdMapping[op.tempId] = taskId;
          }

          results.push({
            success: true,
            operation: 'create',
            tempId: op.tempId || null,
            taskId: taskId,
            name: task.name()
          });

        } else if (op.operation === 'update') {
          // Handle update
          const allTasks = doc.flattenedTasks();
          let task = null;
          for (let j = 0; j < allTasks.length; j++) {
            try {
              if (allTasks[j].id() === op.id) {
                task = allTasks[j];
                break;
              }
            } catch (e) {}
          }

          if (!task) {
            errors.push({ index: i, error: 'Task not found: ' + op.id });
            continue;
          }

          if (op.changes.name !== undefined) task.name = op.changes.name;
          if (op.changes.flagged !== undefined) task.flagged = op.changes.flagged;
          if (op.changes.note !== undefined) task.note = op.changes.note;

          results.push({
            success: true,
            operation: 'update',
            taskId: op.id,
            name: task.name()
          });
        }
      } catch (opError) {
        errors.push({ index: i, error: opError.message || String(opError) });
      }
    }

    return JSON.stringify({
      success: errors.length === 0,
      results: results,
      errors: errors,
      tempIdMapping: returnMapping ? tempIdMapping : undefined,
      totalOperations: operations.length,
      successCount: results.length,
      errorCount: errors.length
    });

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'batch_${target}'
    });
  }
})();
`;

  return {
    script: script.trim(),
    operation: 'batch',
    target,
    description: `Batch ${operations.length} ${target} operations`,
  };
}

/**
 * Build a JXA script for bulk deletion
 */
export async function buildBulkDeleteScript(target: MutationTarget, ids: string[]): Promise<GeneratedMutationScript> {
  // Test sandbox guard - validate all items are in sandbox
  if (isTestMode()) {
    const validationPromises = ids.map((id) =>
      target === 'task' ? validateTaskInSandbox(id, 'bulk delete') : validateProjectInSandbox(id, 'bulk delete'),
    );
    await Promise.all(validationPromises);
  }

  const isTask = target === 'task';
  const flattenedCollection = isTask ? 'flattenedTasks' : 'flattenedProjects';
  const idsJson = JSON.stringify(ids);

  const script = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const targetIds = ${JSON.stringify(ids)};

  try {
    let deletedCount = 0;
    const deleted = [];
    const errors = [];

    // Delete via bridge for reliable removal
    const deleteScript = '(' +
      '() => {' +
        'const ids = ${idsJson};' +
        'const results = { deleted: [], errors: [] };' +
        'ids.forEach(id => {' +
          'const item = ${flattenedCollection}.find(i => i.id.primaryKey === id);' +
          'if (item) {' +
            'const name = item.name;' +
            'item.remove();' +
            'results.deleted.push({ id: id, name: name });' +
          '} else {' +
            'results.errors.push({ id: id, error: "Not found" });' +
          '}' +
        '});' +
        'return JSON.stringify(results);' +
      '}' +
    ')()';


    const result = JSON.parse(app.evaluateJavascript(deleteScript));

    return JSON.stringify({
      success: result.errors.length === 0,
      deletedCount: result.deleted.length,
      deleted: result.deleted,
      errors: result.errors,
      totalRequested: targetIds.length
    });

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'bulk_delete_${target}'
    });
  }
})();
`;

  return {
    script: script.trim(),
    operation: 'bulk_delete',
    target,
    description: `Bulk delete ${ids.length} ${target}(s)`,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build task data object for script embedding
 */
function buildTaskDataObject(data: TaskCreateData): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    name: data.name,
  };

  if (data.note !== undefined) obj.note = data.note;
  if (data.project !== undefined) obj.projectId = data.project;
  if (data.parentTaskId !== undefined) obj.parentTaskId = data.parentTaskId;
  if (data.tags !== undefined) obj.tags = data.tags;
  if (data.dueDate !== undefined) obj.dueDate = data.dueDate;
  if (data.deferDate !== undefined) obj.deferDate = data.deferDate;
  if (data.plannedDate !== undefined) obj.plannedDate = data.plannedDate;
  if (data.flagged !== undefined) obj.flagged = data.flagged;
  if (data.estimatedMinutes !== undefined) obj.estimatedMinutes = data.estimatedMinutes;
  if (data.repetitionRule !== undefined) obj.repeatRule = data.repetitionRule;

  return obj;
}

/**
 * Build project data object for script embedding
 */
function buildProjectDataObject(data: ProjectCreateData): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    name: data.name,
  };

  if (data.note !== undefined) obj.note = data.note;
  if (data.folder !== undefined) obj.folder = data.folder;
  if (data.tags !== undefined) obj.tags = data.tags;
  if (data.dueDate !== undefined) obj.dueDate = data.dueDate;
  if (data.deferDate !== undefined) obj.deferDate = data.deferDate;
  if (data.flagged !== undefined) obj.flagged = data.flagged;
  if (data.sequential !== undefined) obj.sequential = data.sequential;
  if (data.status !== undefined) obj.status = data.status;
  if (data.reviewInterval !== undefined) obj.reviewInterval = data.reviewInterval;

  return obj;
}

/**
 * Build update changes object for script embedding
 */
function buildUpdateChangesObject(changes: TaskUpdateData | ProjectUpdateData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};

  // Copy all defined properties
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined) {
      obj[key] = value;
    }
  }

  return obj;
}

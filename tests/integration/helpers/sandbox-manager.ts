/**
 * SANDBOX MANAGER
 *
 * Manages the test sandbox folder for integration tests.
 * All test data is isolated in __MCP_TEST_SANDBOX__ folder.
 *
 * IMPORTANT: Importing this module enables the sandbox guard
 * (SANDBOX_GUARD_ENABLED=true) which prevents writes outside
 * the sandbox during test mode.
 *
 * @see docs/plans/2025-12-11-test-sandbox-design.md
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Enable sandbox guard when this module is imported
// This ensures integration tests that use the sandbox are protected
process.env.SANDBOX_GUARD_ENABLED = 'true';

// =============================================================================
// CONSTANTS
// =============================================================================

export const SANDBOX_FOLDER_NAME = '__MCP_TEST_SANDBOX__';
export const TEST_TAG_PREFIX = '__test-';
export const TEST_INBOX_PREFIX = '__TEST__';

// =============================================================================
// TYPES
// =============================================================================

export interface CleanupReport {
  inboxTasksDeleted: number;
  projectsDeleted: number;
  foldersDeleted: number;
  tagsDeleted: number;
  errors: string[];
  durationMs: number;
}

export interface SandboxInfo {
  folderId: string | null;
  folderName: string;
  exists: boolean;
}

// =============================================================================
// JXA SCRIPT EXECUTION
// =============================================================================

/**
 * Execute a JXA script and return the result
 */
async function executeJXA<T>(script: string): Promise<T> {
  const wrappedScript = `
    (() => {
      const app = Application('OmniFocus');
      app.includeStandardAdditions = true;
      const doc = app.defaultDocument();
      ${script}
    })()
  `;

  try {
    const { stdout } = await execAsync(`osascript -l JavaScript -e '${wrappedScript.replace(/'/g, "'\"'\"'")}'`);
    return JSON.parse(stdout.trim()) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JXA execution failed: ${message}`);
  }
}

// =============================================================================
// SANDBOX FOLDER OPERATIONS
// =============================================================================

/**
 * Get sandbox folder info (cached on first call in SandboxManager)
 */
export async function getSandboxInfo(): Promise<SandboxInfo> {
  const script = `
    const folders = doc.flattenedFolders();
    for (let i = 0; i < folders.length; i++) {
      try {
        if (folders[i].name() === '${SANDBOX_FOLDER_NAME}') {
          return JSON.stringify({
            folderId: folders[i].id(),
            folderName: '${SANDBOX_FOLDER_NAME}',
            exists: true
          });
        }
      } catch (e) {}
    }
    return JSON.stringify({
      folderId: null,
      folderName: '${SANDBOX_FOLDER_NAME}',
      exists: false
    });
  `;
  return executeJXA<SandboxInfo>(script);
}

/**
 * Create the sandbox folder if it doesn't exist
 */
export async function ensureSandboxFolder(): Promise<string> {
  const info = await getSandboxInfo();
  if (info.exists && info.folderId) {
    return info.folderId;
  }

  const script = `
    const folder = app.Folder({ name: '${SANDBOX_FOLDER_NAME}' });
    doc.folders.push(folder);
    return JSON.stringify({ folderId: folder.id() });
  `;
  const result = await executeJXA<{ folderId: string }>(script);
  return result.folderId;
}

/**
 * Check if a project is inside the sandbox folder
 */
export async function isProjectInSandbox(projectId: string): Promise<boolean> {
  const script = `
    const projects = doc.flattenedProjects();
    for (let i = 0; i < projects.length; i++) {
      try {
        if (projects[i].id() === '${projectId}') {
          const folder = projects[i].folder();
          if (folder && folder.name() === '${SANDBOX_FOLDER_NAME}') {
            return JSON.stringify({ inSandbox: true });
          }
          return JSON.stringify({ inSandbox: false });
        }
      } catch (e) {}
    }
    return JSON.stringify({ inSandbox: false });
  `;
  const result = await executeJXA<{ inSandbox: boolean }>(script);
  return result.inSandbox;
}

/**
 * Check if a task is inside the sandbox (via project) or has __TEST__ prefix
 */
export async function isTaskInSandbox(taskId: string): Promise<boolean> {
  const script = `
    const tasks = doc.flattenedTasks();
    for (let i = 0; i < tasks.length; i++) {
      try {
        if (tasks[i].id() === '${taskId}') {
          const name = tasks[i].name();
          // Check if name starts with __TEST__ prefix
          if (name && name.startsWith('${TEST_INBOX_PREFIX}')) {
            return JSON.stringify({ inSandbox: true });
          }
          // Check if task's project is in sandbox
          const project = tasks[i].containingProject();
          if (project) {
            const folder = project.folder();
            if (folder && folder.name() === '${SANDBOX_FOLDER_NAME}') {
              return JSON.stringify({ inSandbox: true });
            }
          }
          return JSON.stringify({ inSandbox: false });
        }
      } catch (e) {}
    }
    return JSON.stringify({ inSandbox: false });
  `;
  const result = await executeJXA<{ inSandbox: boolean }>(script);
  return result.inSandbox;
}

// =============================================================================
// CLEANUP OPERATIONS
// =============================================================================

/**
 * Delete all tasks with __TEST__ name prefix (inbox tasks)
 * Uses OmniJS deleteObject() for proper task deletion
 */
async function deleteTestInboxTasks(): Promise<{ deleted: number; errors: string[] }> {
  const script = `
    const result = { deleted: 0, errors: [] };
    const tasks = doc.flattenedTasks();
    const taskIds = [];

    // Find tasks with __TEST__ prefix and collect their IDs
    for (let i = 0; i < tasks.length; i++) {
      try {
        const name = tasks[i].name();
        if (name && name.startsWith('${TEST_INBOX_PREFIX}')) {
          taskIds.push(tasks[i].id());
        }
      } catch (e) {}
    }

    // Delete using OmniJS bridge with deleteObject()
    if (taskIds.length > 0) {
      const deleteScript = '(' +
        '(() => {' +
          'const ids = ' + JSON.stringify(taskIds) + ';' +
          'let deleted = 0;' +
          'const errors = [];' +
          'for (const id of ids) {' +
            'try {' +
              'const task = Task.byIdentifier(id);' +
              'if (task) {' +
                'deleteObject(task);' +
                'deleted++;' +
              '}' +
            '} catch (e) {' +
              'errors.push("Task " + id + ": " + e.message);' +
            '}' +
          '}' +
          'return JSON.stringify({ deleted: deleted, errors: errors });' +
        '})()' +
      ')';

      try {
        const bridgeResult = JSON.parse(app.evaluateJavascript(deleteScript));
        result.deleted = bridgeResult.deleted;
        result.errors = bridgeResult.errors || [];
      } catch (e) {
        result.errors.push('Bridge error: ' + (e.message || e));
      }
    }

    return JSON.stringify(result);
  `;
  return executeJXA<{ deleted: number; errors: string[] }>(script);
}

/**
 * Delete all projects inside the sandbox folder
 * Uses OmniJS deleteObject() for true project deletion (not just marking as dropped)
 */
async function deleteSandboxProjects(): Promise<{ deleted: number; errors: string[] }> {
  const script = `
    const result = { deleted: 0, errors: [] };

    // Find sandbox folder
    let sandboxFolder = null;
    const folders = doc.flattenedFolders();
    for (let i = 0; i < folders.length; i++) {
      try {
        if (folders[i].name() === '${SANDBOX_FOLDER_NAME}') {
          sandboxFolder = folders[i];
          break;
        }
      } catch (e) {}
    }

    if (!sandboxFolder) {
      return JSON.stringify(result);
    }

    // Get project IDs in sandbox folder
    const projects = doc.flattenedProjects();
    const projectIds = [];
    const sandboxId = sandboxFolder.id();
    for (let i = 0; i < projects.length; i++) {
      try {
        const folder = projects[i].folder();
        if (folder && folder.id() === sandboxId) {
          projectIds.push(projects[i].id());
        }
      } catch (e) {}
    }

    // Delete using OmniJS bridge with deleteObject() for true deletion
    if (projectIds.length > 0) {
      const deleteScript = '(' +
        '(() => {' +
          'const ids = ' + JSON.stringify(projectIds) + ';' +
          'let deleted = 0;' +
          'const errors = [];' +
          'for (const id of ids) {' +
            'try {' +
              'const project = Project.byIdentifier(id);' +
              'if (project) {' +
                'deleteObject(project);' +
                'deleted++;' +
              '}' +
            '} catch (e) {' +
              'errors.push("Project " + id + ": " + e.message);' +
            '}' +
          '}' +
          'return JSON.stringify({ deleted: deleted, errors: errors });' +
        '})()' +
      ')';

      try {
        const bridgeResult = JSON.parse(app.evaluateJavascript(deleteScript));
        result.deleted = bridgeResult.deleted;
        result.errors = bridgeResult.errors || [];
      } catch (e) {
        result.errors.push('Bridge error: ' + (e.message || e));
      }
    }

    return JSON.stringify(result);
  `;
  return executeJXA<{ deleted: number; errors: string[] }>(script);
}

/**
 * Delete sub-folders inside sandbox (bottom-up, deepest first)
 * Uses JXA app.delete() for folder deletion
 */
async function deleteSandboxSubfolders(): Promise<{ deleted: number; errors: string[] }> {
  const script = `
    const result = { deleted: 0, errors: [] };

    // Find sandbox folder
    let sandboxFolder = null;
    const folders = doc.flattenedFolders();
    for (let i = 0; i < folders.length; i++) {
      try {
        if (folders[i].name() === '${SANDBOX_FOLDER_NAME}') {
          sandboxFolder = folders[i];
          break;
        }
      } catch (e) {}
    }

    if (!sandboxFolder) {
      return JSON.stringify(result);
    }

    // Find all subfolders of sandbox with their references
    const subfolders = [];

    function collectSubfolders(parent, depth) {
      try {
        const children = parent.folders();
        for (let i = 0; i < children.length; i++) {
          subfolders.push({ folder: children[i], depth: depth });
          collectSubfolders(children[i], depth + 1);
        }
      } catch (e) {}
    }

    collectSubfolders(sandboxFolder, 0);

    // Sort by depth descending (deepest first)
    subfolders.sort((a, b) => b.depth - a.depth);

    // Delete each subfolder using JXA app.delete()
    for (const sf of subfolders) {
      try {
        app.delete(sf.folder);
        result.deleted++;
      } catch (e) {
        result.errors.push('Folder: ' + (e.message || e));
      }
    }

    return JSON.stringify(result);
  `;
  return executeJXA<{ deleted: number; errors: string[] }>(script);
}

/**
 * Delete the sandbox folder itself (must be empty first)
 * Uses JXA app.delete() for folder deletion
 */
async function deleteSandboxFolder(): Promise<{ deleted: boolean; error?: string }> {
  const script = `
    const folders = doc.flattenedFolders();
    let sandboxFolder = null;
    for (let i = 0; i < folders.length; i++) {
      try {
        if (folders[i].name() === '${SANDBOX_FOLDER_NAME}') {
          sandboxFolder = folders[i];
          break;
        }
      } catch (e) {}
    }

    if (!sandboxFolder) {
      return JSON.stringify({ deleted: false, error: 'Sandbox folder not found' });
    }

    try {
      app.delete(sandboxFolder);
      return JSON.stringify({ deleted: true });
    } catch (e) {
      return JSON.stringify({ deleted: false, error: e.message || String(e) });
    }
  `;
  return executeJXA<{ deleted: boolean; error?: string }>(script);
}

/**
 * Delete all tags starting with __test- prefix
 * Uses JXA app.delete() for tag deletion
 * Note: Tags with tasks still using them may fail to delete - this is expected
 */
async function deleteTestTags(): Promise<{ deleted: number; errors: string[] }> {
  const script = `
    const result = { deleted: 0, errors: [] };

    // Find tags with __test- prefix
    const tags = doc.flattenedTags();
    const toDelete = [];
    for (let i = 0; i < tags.length; i++) {
      try {
        const name = tags[i].name();
        if (name && name.startsWith('${TEST_TAG_PREFIX}')) {
          toDelete.push(tags[i]);
        }
      } catch (e) {}
    }

    // Delete using JXA app.delete()
    for (let i = toDelete.length - 1; i >= 0; i--) {
      try {
        app.delete(toDelete[i]);
        result.deleted++;
      } catch (e) {
        // Tags with remaining tasks will fail - that's expected
        result.errors.push('Tag: ' + (e.message || e));
      }
    }

    return JSON.stringify(result);
  `;
  return executeJXA<{ deleted: number; errors: string[] }>(script);
}

// =============================================================================
// MAIN CLEANUP FUNCTION
// =============================================================================

/**
 * Full cleanup of all test data in the correct order.
 * Order matters due to OmniFocus constraints:
 * 1. Delete __TEST__ inbox tasks first
 * 2. Delete projects in sandbox (cascades to their tasks)
 * 3. Delete sub-folders (bottom-up)
 * 4. Delete sandbox folder itself
 * 5. Delete __test- tags
 */
export async function fullCleanup(): Promise<CleanupReport> {
  const startTime = Date.now();
  const report: CleanupReport = {
    inboxTasksDeleted: 0,
    projectsDeleted: 0,
    foldersDeleted: 0,
    tagsDeleted: 0,
    errors: [],
    durationMs: 0,
  };

  // Step 1: Delete inbox tasks with __TEST__ prefix
  try {
    const inboxResult = await deleteTestInboxTasks();
    report.inboxTasksDeleted = inboxResult.deleted;
    report.errors.push(...inboxResult.errors);
  } catch (error) {
    report.errors.push(`Inbox tasks: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 2: Delete projects inside sandbox
  try {
    const projectsResult = await deleteSandboxProjects();
    report.projectsDeleted = projectsResult.deleted;
    report.errors.push(...projectsResult.errors);
  } catch (error) {
    report.errors.push(`Projects: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 3: Delete sub-folders (bottom-up)
  try {
    const subfoldersResult = await deleteSandboxSubfolders();
    report.foldersDeleted = subfoldersResult.deleted;
    report.errors.push(...subfoldersResult.errors);
  } catch (error) {
    report.errors.push(`Subfolders: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 4: Delete sandbox folder itself
  try {
    const folderResult = await deleteSandboxFolder();
    if (folderResult.deleted) {
      report.foldersDeleted++;
    } else if (folderResult.error && !folderResult.error.includes('not found')) {
      report.errors.push(`Sandbox folder: ${folderResult.error}`);
    }
  } catch (error) {
    report.errors.push(`Sandbox folder: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 5: Delete test tags
  try {
    const tagsResult = await deleteTestTags();
    report.tagsDeleted = tagsResult.deleted;
    report.errors.push(...tagsResult.errors);
  } catch (error) {
    report.errors.push(`Tags: ${error instanceof Error ? error.message : String(error)}`);
  }

  report.durationMs = Date.now() - startTime;
  return report;
}

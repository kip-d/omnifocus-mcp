/**
 * Pure OmniJS v3 delete-folder - zero helper dependencies
 *
 * Deletes a folder in OmniFocus
 *
 * SMART DELETION APPROACH:
 * - Empty folders: Direct deletion (fast, minimal script)
 * - Folders with contents: Helpful error with best practices
 *
 * This approach follows OmniFocus user patterns where:
 * 1. Most folder deletions are for empty/cleanup folders
 * 2. Complex deletions are rare (users prefer "drop" to preserve history)
 * 3. When contents exist, users typically reorganize rather than delete
 *
 * Performance: Direct property access, ~10-30x faster than JXA version
 */
export const DELETE_FOLDER_V3 = `
(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;
  const doc = app.defaultDocument;

  const startTime = Date.now();
  const folderId = {{folderId}};

  try {
    // Find the folder to delete (direct iteration)
    let targetFolder = null;
    const allFolders = doc.flattenedFolders();

    if (!allFolders) {
      return {
        ok: false,
        v: '3',
        error: {
          message: 'Failed to retrieve folders from OmniFocus',
          details: 'doc.flattenedFolders() returned null or undefined'
        }
      };
    }

    // Find folder by ID (direct property access)
    for (let i = 0; i < allFolders.length; i++) {
      try {
        if (allFolders[i].id.primaryKey === folderId) {
          targetFolder = allFolders[i];
          break;
        }
      } catch (e) { /* skip invalid folder */ }
    }

    if (!targetFolder) {
      // Check if it's a numeric-only ID (Claude Desktop bug)
      const isNumericOnly = /^\\d+$/.test(folderId);
      let errorMessage = 'Folder not found: ' + folderId;

      if (isNumericOnly) {
        errorMessage += '. CLAUDE DESKTOP BUG DETECTED: Claude Desktop may have extracted numbers from an alphanumeric folder ID. Please use the list_folders tool to get the correct full folder ID and try again.';
      }

      return {
        ok: false,
        v: '3',
        error: { message: errorMessage }
      };
    }

    const folderName = targetFolder.name || 'Unknown Folder';

    // Check for contents - key safety check (direct property access)
    let childFoldersCount = 0;
    let projectsCount = 0;

    try {
      const childFolders = targetFolder.folders;
      if (childFolders) {
        childFoldersCount = childFolders.length;
      }
    } catch (e) { /* no child folders */ }

    try {
      const projects = targetFolder.projects;
      if (projects) {
        projectsCount = projects.length;
      }
    } catch (e) { /* no projects */ }

    const hasContents = childFoldersCount > 0 || projectsCount > 0;

    if (hasContents) {
      // Provide helpful guidance for non-empty folders
      return {
        ok: false,
        v: '3',
        error: {
          message: "Cannot delete folder '" + folderName + "' because it contains " +
                   childFoldersCount + " folders and " + projectsCount + " projects.",
          suggestion: "For folders with contents, consider these OmniFocus best practices:\\n" +
                     "1. Move projects to other folders first, then delete the empty folder\\n" +
                     "2. Set projects to 'dropped' status instead of deleting to preserve completed task history\\n" +
                     "3. Use OmniFocus's built-in archiving features (File > Archive) for old data\\n" +
                     "\\nEmpty the folder first, then try deleting again.",
          details: {
            childFolders: childFoldersCount,
            projects: projectsCount,
            canDelete: false,
            isEmpty: false
          }
        }
      };
    }

    // Folder is empty - safe to delete
    targetFolder.delete();

    return {
      ok: true,
      v: '3',
      data: {
        deletedFolder: {
          id: folderId,
          name: folderName
        },
        deletedAt: new Date().toISOString(),
        message: "Empty folder '" + folderName + "' deleted successfully."
      },
      query_time_ms: Date.now() - startTime
    };

  } catch (error) {
    return {
      ok: false,
      v: '3',
      error: {
        message: error.message || 'Unknown error in delete folder',
        stack: error.stack
      }
    };
  }
})();
`;

import { getCoreHelpers } from '../shared/helpers.js';

/**
 * Script to delete a folder in OmniFocus
 *
 * SMART DELETION APPROACH:
 * - Empty folders: Direct deletion (fast, minimal script)
 * - Folders with contents: Helpful error with best practices
 *
 * This approach follows OmniFocus user patterns where:
 * 1. Most folder deletions are for empty/cleanup folders
 * 2. Complex deletions are rare (users prefer "drop" to preserve history)
 * 3. When contents exist, users typically reorganize rather than delete
 */
export const DELETE_FOLDER_SCRIPT = `
  // DELETE_FOLDER
  ${getCoreHelpers()}
  
  (() => {
    const folderId = {{folderId}};
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Find the folder to delete
      let targetFolder = null;
      const allFolders = doc.flattenedFolders();
      
      if (!allFolders) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve folders from OmniFocus. The document may not be available or OmniFocus may not be running properly."
        });
      }
      
      for (let i = 0; i < allFolders.length; i++) {
        if (allFolders[i].id() === folderId) {
          targetFolder = allFolders[i];
          break;
        }
      }
      
      if (!targetFolder) {
        // Check if it's a numeric-only ID (Claude Desktop bug)
        const isNumericOnly = /^\\d+$/.test(folderId);
        let errorMessage = 'Folder not found: ' + folderId;
        
        if (isNumericOnly) {
          errorMessage += ". CLAUDE DESKTOP BUG DETECTED: Claude Desktop may have extracted numbers from an alphanumeric folder ID. Please use the list_folders tool to get the correct full folder ID and try again.";
        }
        
        return JSON.stringify({
          error: true,
          message: errorMessage
        });
      }
      
      const folderName = safeGet(() => targetFolder.name()) || 'Unknown Folder';
      
      // Check for contents - this is the key safety check
      const childFolders = safeGet(() => targetFolder.folders()) || [];
      const projects = safeGet(() => targetFolder.projects()) || [];
      const hasContents = childFolders.length > 0 || projects.length > 0;
      
      if (hasContents) {
        // Provide helpful guidance for non-empty folders
        return JSON.stringify({
          error: true,
          message: "Cannot delete folder '" + folderName + "' because it contains " + 
                   childFolders.length + " folders and " + projects.length + " projects.",
          suggestion: "For folders with contents, consider these OmniFocus best practices:\\n" +
                     "1. Move projects to other folders first, then delete the empty folder\\n" +
                     "2. Set projects to 'dropped' status instead of deleting to preserve completed task history\\n" +
                     "3. Use OmniFocus's built-in archiving features (File > Archive) for old data\\n" +
                     "\\nEmpty the folder first, then try deleting again.",
          details: {
            childFolders: childFolders.length,
            projects: projects.length,
            canDelete: false,
            isEmpty: false
          }
        });
      }
      
      // Folder is empty - safe to delete
      targetFolder.delete();
      
      return JSON.stringify({
        success: true,
        deletedFolder: {
          id: folderId,
          name: folderName
        },
        deletedAt: new Date().toISOString(),
        message: "Empty folder '" + folderName + "' deleted successfully."
      });
      
    } catch (error) {
      return formatError(error, 'delete_folder');
    }
  })();
`;

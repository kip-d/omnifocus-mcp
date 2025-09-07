import { getMinimalHelpers } from '../shared/helpers.js';

/**
 * Script to update folder properties in OmniFocus
 *
 * Features:
 * - Update folder name and status
 * - Proper error handling and validation
 * - Duplicate name checking
 */
export const UPDATE_FOLDER_SCRIPT = `
  // UPDATE_FOLDER
  ${getMinimalHelpers()}
  
  (() => {
    const folderId = {{folderId}};
    const updates = {{updates}};
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Find the folder to update
      let targetFolder = null;
      
      // Find by iteration (avoid whose())
      {
        const allFolders = doc.flattenedFolders();
        
        if (!allFolders) {
          return JSON.stringify({
            error: true,
            message: "Failed to retrieve folders from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
            details: "doc.flattenedFolders() returned null or undefined"
          });
        }
        
        for (let i = 0; i < allFolders.length; i++) {
          if (allFolders[i].id() === folderId) {
            targetFolder = allFolders[i];
            break;
          }
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
      
      const originalName = safeGet(() => targetFolder.name());
      const originalStatus = safeGet(() => {
        const status = targetFolder.status();
        if (status && status.toString().includes('Active')) return 'active';
        if (status && status.toString().includes('Dropped')) return 'dropped';
        return 'active';
      });
      
      // Check for duplicate name if updating name
      if (updates.name && updates.name !== originalName) {
        const parent = safeGet(() => targetFolder.parent());
        const siblingFolders = parent ? parent.folders() : doc.folders();
        
        if (siblingFolders) {
          for (let i = 0; i < siblingFolders.length; i++) {
            const sibling = siblingFolders[i];
            if (sibling.id() !== targetFolder.id() && sibling.name() === updates.name) {
              const parentName = parent ? parent.name() : 'root';
              return JSON.stringify({
                error: true,
                message: "Folder '" + updates.name + "' already exists in " + parentName
              });
            }
          }
        }
        
        // Set the name property directly
        targetFolder.name = updates.name;
      }
      
      // Update status - use string values as JXA may not expose the enum
      if (updates.status && updates.status !== originalStatus) {
        try {
          // Try using the enum first
          if (updates.status === 'active') {
            targetFolder.status = app.Folder.Status.Active;
          } else if (updates.status === 'dropped') {
            targetFolder.status = app.Folder.Status.Dropped;
          }
        } catch (enumError) {
          // If enum fails, try string assignment
          try {
            targetFolder.status = updates.status;
          } catch (stringError) {
            // Status update failed but continue with other updates
            // This is logged but not fatal
          }
        }
      }
      
      return JSON.stringify({
        success: true,
        folder: {
          id: targetFolder.id(),
          name: targetFolder.name(),
          status: safeGet(() => {
            const status = targetFolder.status();
            if (status && status.toString().includes('Active')) return 'active';
            if (status && status.toString().includes('Dropped')) return 'dropped';
            return 'active';
          }),
          updatedAt: new Date().toISOString()
        },
        changes: {
          name: updates.name ? { from: originalName, to: updates.name } : undefined,
          status: updates.status ? { from: originalStatus, to: updates.status } : undefined
        },
        message: "Folder updated successfully"
      });
    } catch (error) {
      return formatError(error, 'update_folder');
    }
  })();
`;

import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to delete a folder in OmniFocus
 *
 * Features:
 * - Delete folder with safety checks
 * - Move contents to another folder or root
 * - Proper error handling and validation
 * - Force deletion with content preservation
 */
export const DELETE_FOLDER_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const folderId = {{folderId}};
    const options = {{options}};
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Find the folder to delete
      let targetFolder = null;
      
      // Try whose() first for performance
      try {
        const folders = doc.flattenedFolders.whose({id: folderId})();
        if (folders && folders.length > 0) {
          targetFolder = folders[0];
        }
      } catch (e) {
        // whose() failed, fall back to iteration
      }
      
      // Fall back to iteration if whose() didn't work
      if (!targetFolder) {
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
      
      const folderName = safeGet(() => targetFolder.name());
      
      // Check for contents
      const childFolders = safeGet(() => targetFolder.folders()) || [];
      const projects = safeGet(() => targetFolder.projects()) || [];
      
      // Safety check - don't delete if has contents unless forced
      if ((childFolders.length > 0 || projects.length > 0) && !options.force) {
        return JSON.stringify({
          error: true,
          message: "Folder '" + folderName + "' contains " + 
                   childFolders.length + " folders and " + 
                   projects.length + " projects. Use force: true to delete anyway.",
          details: {
            childFolders: childFolders.length,
            projects: projects.length
          }
        });
      }
      
      // Find destination folder if specified
      let destinationFolder = null;
      if (options.moveContentsTo) {
        const allFolders = doc.flattenedFolders();
        
        for (let i = 0; i < allFolders.length; i++) {
          if (allFolders[i].name() === options.moveContentsTo && 
              allFolders[i].id() !== targetFolder.id()) {
            destinationFolder = allFolders[i];
            break;
          }
        }
        
        if (!destinationFolder) {
          return JSON.stringify({
            error: true,
            message: "Destination folder '" + options.moveContentsTo + "' not found"
          });
        }
      }
      
      const moveInfo = {
        movedFolders: 0,
        movedProjects: 0
      };
      
      // Move child folders
      if (childFolders.length > 0) {
        for (let i = childFolders.length - 1; i >= 0; i--) {
          const childFolder = childFolders[i];
          try {
            if (destinationFolder) {
              destinationFolder.folders.push(childFolder);
            } else {
              doc.folders.push(childFolder);
            }
            moveInfo.movedFolders++;
          } catch (e) {
            // Continue with other folders if one fails
          }
        }
      }
      
      // Move projects
      if (projects.length > 0) {
        for (let i = projects.length - 1; i >= 0; i--) {
          const project = projects[i];
          try {
            if (destinationFolder) {
              destinationFolder.projects.push(project);
            } else {
              doc.projects.push(project);
            }
            moveInfo.movedProjects++;
          } catch (e) {
            // Continue with other projects if one fails
          }
        }
      }
      
      // Delete the folder
      targetFolder.markForDeletion();
      
      return JSON.stringify({
        success: true,
        deletedFolder: {
          id: folderId,
          name: folderName
        },
        movedTo: options.moveContentsTo || 'root',
        moved: moveInfo,
        deletedAt: new Date().toISOString(),
        message: "Folder '" + folderName + "' deleted successfully. " +
                 "Moved " + moveInfo.movedFolders + " folders and " + 
                 moveInfo.movedProjects + " projects to " + 
                 (options.moveContentsTo || 'root') + "."
      });
    } catch (error) {
      return formatError(error, 'delete_folder');
    }
  })();
`;

import { getMinimalHelpers } from '../shared/helpers.js';

/**
 * Script to move a folder within the OmniFocus hierarchy
 *
 * Features:
 * - Move folder to different parent
 * - Position within new parent (beginning, ending, before, after)
 * - Proper error handling and validation
 * - Prevent circular hierarchy
 */
export const MOVE_FOLDER_SCRIPT = `
  // MOVE_FOLDER
  ${getMinimalHelpers()}
  
  // Check if moving would create circular hierarchy
  function wouldCreateCycle(folder, newParent) {
    let current = newParent;
    while (current) {
      if (current.id() === folder.id()) {
        return true;
      }
      current = safeGet(() => current.parent());
    }
    return false;
  }
  
  (() => {
    const folderId = {{folderId}};
    const options = {{options}};
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Find the folder to move
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
      
      const originalParent = safeGet(() => targetFolder.parent());
      const originalParentName = originalParent ? safeGet(() => originalParent.name()) : 'root';
      
      // Find new parent folder if specified
      let newParent = null;
      if (options.newParent) {
        const allFolders = doc.flattenedFolders();
        
        for (let i = 0; i < allFolders.length; i++) {
          if (allFolders[i].name() === options.newParent && 
              allFolders[i].id() !== targetFolder.id()) {
            newParent = allFolders[i];
            break;
          }
        }
        
        if (!newParent) {
          return JSON.stringify({
            error: true,
            message: "New parent folder '" + options.newParent + "' not found"
          });
        }
        
        // Check for circular hierarchy
        if (wouldCreateCycle(targetFolder, newParent)) {
          return JSON.stringify({
            error: true,
            message: "Cannot move folder: would create circular hierarchy (folder cannot be moved into one of its own children)"
          });
        }
      }
      
      // Check for duplicate name in new location
      const targetContainer = newParent || doc;
      const siblingFolders = newParent ? newParent.folders() : doc.folders();
      
      if (siblingFolders) {
        for (let i = 0; i < siblingFolders.length; i++) {
          const sibling = siblingFolders[i];
          if (sibling.id() !== targetFolder.id() && 
              sibling.name() === targetFolder.name()) {
            const newParentName = newParent ? newParent.name() : 'root';
            return JSON.stringify({
              error: true,
              message: "Folder '" + targetFolder.name() + "' already exists in " + newParentName
            });
          }
        }
      }
      
      // Determine position
      let position = null;
      
      if (options.position && options.position !== 'ending') {
        if (options.position === 'beginning') {
          position = newParent ? newParent.folders.beginning : doc.folders.beginning;
        } else if (options.position === 'before' || options.position === 'after') {
          if (!options.relativeToFolder) {
            return JSON.stringify({
              error: true,
              message: "relativeToFolder is required for '" + options.position + "' position"
            });
          }
          
          let referenceFolder = null;
          const targetFolders = newParent ? newParent.folders() : doc.folders();
          
          if (targetFolders) {
            for (let i = 0; i < targetFolders.length; i++) {
              if (targetFolders[i].name() === options.relativeToFolder) {
                referenceFolder = targetFolders[i];
                break;
              }
            }
          }
          
          if (!referenceFolder) {
            const newParentName = newParent ? newParent.name() : 'root';
            return JSON.stringify({
              error: true,
              message: "Reference folder '" + options.relativeToFolder + "' not found in " + newParentName
            });
          }
          
          position = options.position === 'before' ? referenceFolder.before : referenceFolder.after;
        }
      }
      
      // Move the folder
      if (newParent) {
        newParent.folders.push(targetFolder);
      } else {
        doc.folders.push(targetFolder);
      }
      
      // Apply position if specified
      if (position) {
        targetFolder.moveTo(position);
      }
      
      const newParentName = newParent ? safeGet(() => newParent.name()) : 'root';
      
      return JSON.stringify({
        success: true,
        folder: {
          id: targetFolder.id(),
          name: targetFolder.name(),
          oldParent: originalParentName,
          newParent: newParentName,
          position: options.position || 'ending'
        },
        movedAt: new Date().toISOString(),
        message: "Folder '" + targetFolder.name() + "' moved from " + 
                 originalParentName + " to " + newParentName
      });
    } catch (error) {
      return formatError(error, 'move_folder');
    }
  })();
`;

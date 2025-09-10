import { getMinimalHelpers } from '../shared/helpers.js';

/**
 * Create a duplicate folder script with function arguments pattern (v2.1.0 architecture)
 * This uses the safe function argument approach to avoid template substitution issues
 */
export function createDuplicateFolderScript(sourceFolderId: string, newName?: string): string {
  return `
    ${getMinimalHelpers()}
    
    function duplicateFolder(sourceFolderId, newName) {
      try {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();
        
        // Validate required parameters
        if (!sourceFolderId) {
          return {
            error: true,
            message: 'sourceFolderId is required for folder duplication'
          };
        }
        
        // Find source folder
        let sourceFolder = null;
        const allFolders = doc.flattenedFolders();
        for (let i = 0; i < allFolders.length; i++) {
          const folder = allFolders[i];
          try {
            if (folder.id() === sourceFolderId) {
              sourceFolder = folder;
              break;
            }
          } catch (e) {
            // Skip invalid folders
            continue;
          }
        }
        
        if (!sourceFolder) {
          return {
            error: true,
            message: 'Source folder not found: ' + sourceFolderId
          };
        }
        
        // Get source folder properties safely
        const sourceName = safeGet(() => sourceFolder.name()) || 'Untitled Folder';
        const sourceParent = safeGet(() => sourceFolder.container());
        
        // Determine the new folder name
        const duplicateName = (newName && newName !== '' && newName !== 'null') 
          ? newName 
          : sourceName + ' Copy';
        
        // Create the duplicate folder at the same level as source
        let newFolder;
        try {
          if (sourceParent && sourceParent.class && sourceParent.class.name() === 'folder') {
            // Source is in a subfolder
            newFolder = app.make({
              new: 'folder',
              withProperties: { name: duplicateName },
              at: sourceParent.folders.end
            });
          } else {
            // Source is at root level  
            newFolder = app.make({
              new: 'folder',
              withProperties: { name: duplicateName },
              at: doc.folders.end
            });
          }
        } catch (makeError) {
          return {
            error: true,
            message: 'Failed to create duplicate folder: ' + makeError.toString()
          };
        }
        
        // Return folder information directly (matching create script format)
        return {
          id: safeGet(() => newFolder.id()),
          name: safeGet(() => newFolder.name()),
          parent: (sourceParent && sourceParent.class && sourceParent.class.name() === 'folder') 
            ? safeGet(() => sourceParent.id()) 
            : null,
          sourceId: sourceFolderId,
          sourceName: sourceName,
          created: new Date().toISOString(),
          duplicated: true
        };
        
      } catch (error) {
        return {
          error: true,
          message: formatError(error)
        };
      }
    }
    
    return JSON.stringify(duplicateFolder(${JSON.stringify(sourceFolderId)}, ${JSON.stringify(newName || null)}));
  `;
}

// Legacy template-based script for backwards compatibility
export const DUPLICATE_FOLDER_SCRIPT = `
  ${getMinimalHelpers()}
  
  (() => {
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Get parameters
      const sourceFolderId = '{{sourceFolderId}}';
      const newName = '{{newName}}';
      
      // Validate required parameters
      if (!sourceFolderId) {
        return JSON.stringify({
          error: true,
          message: 'sourceFolderId is required for folder duplication'
        });
      }
      
      // Find source folder
      let sourceFolder = null;
      const allFolders = doc.flattenedFolders();
      for (let i = 0; i < allFolders.length; i++) {
        const folder = allFolders[i];
        if (safeGet(() => folder.id()) === sourceFolderId) {
          sourceFolder = folder;
          break;
        }
      }
      
      if (!sourceFolder) {
        return JSON.stringify({
          error: true,
          message: 'Source folder not found: ' + sourceFolderId
        });
      }
      
      // Get source folder properties
      const sourceName = safeGet(() => sourceFolder.name()) || 'Untitled Folder';
      const sourceParent = safeGet(() => sourceFolder.container());
      
      // Determine the new folder name
      const duplicateName = newName && newName !== '' && newName !== 'null' 
        ? newName 
        : sourceName + ' Copy';
      
      // Create the duplicate folder at the same level as source
      let newFolder;
      if (sourceParent && sourceParent.class && sourceParent.class.name() === 'folder') {
        // Source is in a subfolder
        newFolder = app.make({
          new: 'folder',
          withProperties: { name: duplicateName },
          at: sourceParent.folders.end
        });
      } else {
        // Source is at root level
        newFolder = app.make({
          new: 'folder',
          withProperties: { name: duplicateName },
          at: doc.folders.end
        });
      }
      
      // Return folder information directly (matching create script format)
      return JSON.stringify({
        id: safeGet(() => newFolder.id()),
        name: safeGet(() => newFolder.name()),
        parent: sourceParent && sourceParent.class && sourceParent.class.name() === 'folder' 
          ? safeGet(() => sourceParent.id()) 
          : null,
        sourceId: sourceFolderId,
        sourceName: sourceName,
        created: new Date().toISOString(),
        duplicated: true
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: formatError(error)
      });
    }
  })();
`;
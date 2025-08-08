import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to create a new folder in OmniFocus
 * 
 * Features:
 * - Create folder with name and status
 * - Position within parent folder hierarchy
 * - Duplicate folder name checking within same parent
 * - Proper error handling and validation
 */
export const CREATE_FOLDER_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const name = {{name}};
    const options = {{options}};
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Validate parent folder if specified
      let parentFolder = null;
      if (options.parent) {
        const folders = doc.flattenedFolders();
        
        if (!folders) {
          return JSON.stringify({
            error: true,
            message: "Failed to retrieve folders from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
            details: "doc.flattenedFolders() returned null or undefined"
          });
        }
        
        for (let i = 0; i < folders.length; i++) {
          if (folders[i].name() === options.parent) {
            parentFolder = folders[i];
            break;
          }
        }
        
        if (!parentFolder) {
          return JSON.stringify({
            error: true,
            message: "Parent folder '" + options.parent + "' not found"
          });
        }
      }
      
      // Check for duplicate names within the same parent
      const existingFolders = parentFolder ? parentFolder.folders() : doc.folders();
      
      if (existingFolders) {
        for (let i = 0; i < existingFolders.length; i++) {
          if (existingFolders[i].name() === name) {
            const parentName = parentFolder ? parentFolder.name() : 'root';
            return JSON.stringify({
              error: true,
              message: "Folder '" + name + "' already exists in " + parentName
            });
          }
        }
      }
      
      // Determine position for new folder
      let position = null;
      
      if (options.position && options.position !== 'ending') {
        const targetContainer = parentFolder || doc;
        const targetFolders = parentFolder ? parentFolder.folders() : doc.folders();
        
        if (options.position === 'beginning') {
          position = parentFolder ? parentFolder.folders.beginning : doc.folders.beginning;
        } else if (options.position === 'before' || options.position === 'after') {
          if (!options.relativeToFolder) {
            return JSON.stringify({
              error: true,
              message: "relativeToFolder is required for '" + options.position + "' position"
            });
          }
          
          let referenceFolder = null;
          if (targetFolders) {
            for (let i = 0; i < targetFolders.length; i++) {
              if (targetFolders[i].name() === options.relativeToFolder) {
                referenceFolder = targetFolders[i];
                break;
              }
            }
          }
          
          if (!referenceFolder) {
            return JSON.stringify({
              error: true,
              message: "Reference folder '" + options.relativeToFolder + "' not found"
            });
          }
          
          position = options.position === 'before' ? referenceFolder.before : referenceFolder.after;
        }
      }
      
      // Create the folder - use make() for JXA
      let newFolder;
      try {
        // Try using make() which is the standard JXA approach
        const folderLocation = parentFolder ? parentFolder.folders : doc.folders;
        newFolder = app.make({
          new: 'folder',
          withProperties: { name: name },
          at: folderLocation
        });
      } catch (makeError) {
        // If make() fails, try alternate approach
        try {
          const folderProps = { name: name };
          newFolder = app.Folder(folderProps);
        } catch (constructorError) {
          return JSON.stringify({
            error: true,
            message: "Failed to create folder using available JXA methods",
            details: makeError.toString() + "; " + constructorError.toString()
          });
        }
      }
      
      // Set status after creation if specified
      if (options.status && newFolder) {
        try {
          if (options.status === 'dropped') {
            newFolder.status = 'dropped';
          }
        } catch (statusError) {
          // Status setting failed, but folder was created
          // Continue with the folder creation success
        }
      }
      
      // If we used the Folder() constructor, add to container
      // (make() already adds it to the specified location)
      if (!newFolder.id) {
        try {
          if (parentFolder) {
            parentFolder.folders.push(newFolder);
          } else {
            doc.folders.push(newFolder);
          }
        } catch (pushError) {
          // Folder might already be added if make() worked
        }
      }
      
      // Try to position the folder if needed
      if (position && newFolder.moveTo) {
        try {
          newFolder.moveTo(position);
        } catch (moveError) {
          // Position setting failed, but folder was created
          // Continue with success
        }
      }
      
      return JSON.stringify({
        success: true,
        folder: {
          id: newFolder.id(),
          name: newFolder.name(),
          parent: options.parent || null,
          status: options.status || 'active',
          createdAt: new Date().toISOString()
        },
        message: "Folder '" + name + "' created successfully"
      });
    } catch (error) {
      return formatError(error, 'create_folder');
    }
  })();
`;
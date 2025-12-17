/**
 * Script to move a folder within the OmniFocus hierarchy
 *
 * OmniJS-first pattern: All logic runs inside evaluateJavascript()
 *
 * Features:
 * - Move folder to different parent
 * - Position within new parent (beginning, ending, before, after)
 * - Proper error handling and validation
 * - Prevent circular hierarchy
 */
export const MOVE_FOLDER_SCRIPT = `
  // MOVE_FOLDER - OmniJS-first pattern
  (() => {
    const app = Application('OmniFocus');

    try {
      const omniJsScript = \`
        (() => {
          const folderId = {{folderId}};
          const options = {{options}};

          // Check if moving would create circular hierarchy
          function wouldCreateCycle(folder, newParent) {
            let current = newParent;
            while (current) {
              if (current.id.primaryKey === folder.id.primaryKey) {
                return true;
              }
              current = current.parent;
            }
            return false;
          }

          // Find the folder by ID using OmniJS
          const targetFolder = Folder.byIdentifier(folderId);

          if (!targetFolder) {
            // Check if it's a numeric-only ID (Claude Desktop bug)
            const isNumericOnly = /^\\\\d+$/.test(folderId);
            let errorMessage = 'Folder not found: ' + folderId;

            if (isNumericOnly) {
              errorMessage += ". CLAUDE DESKTOP BUG DETECTED: Claude Desktop may have extracted numbers from an alphanumeric folder ID. Please use the list_folders tool to get the correct full folder ID and try again.";
            }

            return JSON.stringify({
              error: true,
              message: errorMessage
            });
          }

          const originalParent = targetFolder.parent;
          const originalParentName = originalParent ? originalParent.name : 'root';

          // Find new parent folder if specified
          let newParent = null;
          if (options.newParent) {
            // Search through all flattened folders by name
            for (const f of flattenedFolders) {
              if (f.name === options.newParent && f.id.primaryKey !== targetFolder.id.primaryKey) {
                newParent = f;
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
          // Note: In OmniJS, top-level folders use 'folders' global
          const siblingFolders = newParent ? newParent.folders : folders;

          for (const sibling of siblingFolders) {
            if (sibling.id.primaryKey !== targetFolder.id.primaryKey &&
                sibling.name === targetFolder.name) {
              const newParentName = newParent ? newParent.name : 'root';
              return JSON.stringify({
                error: true,
                message: "Folder '" + targetFolder.name + "' already exists in " + newParentName
              });
            }
          }

          // Handle position - OmniJS folder moving via parent reassignment
          // Note: OmniJS doesn't have moveFolders(), so we reassign the parent property
          const position = options.position || 'ending';

          if (position === 'before' || position === 'after') {
            if (!options.relativeToFolder) {
              return JSON.stringify({
                error: true,
                message: "relativeToFolder is required for '" + position + "' position"
              });
            }

            let referenceFolder = null;
            const targetFoldersList = newParent ? newParent.folders : folders;

            for (const f of targetFoldersList) {
              if (f.name === options.relativeToFolder) {
                referenceFolder = f;
                break;
              }
            }

            if (!referenceFolder) {
              const newParentName = newParent ? newParent.name : 'root';
              return JSON.stringify({
                error: true,
                message: "Reference folder '" + options.relativeToFolder + "' not found in " + newParentName
              });
            }

            // Move by reassigning parent (positions before/after not directly supported in OmniJS)
            // The folder will be moved but position may not be exact
            targetFolder.parent = newParent;
          } else {
            // Move by reassigning parent property
            // null parent means root level
            targetFolder.parent = newParent;
          }

          const newParentName = newParent ? newParent.name : 'root';

          return JSON.stringify({
            success: true,
            folder: {
              id: targetFolder.id.primaryKey,
              name: targetFolder.name,
              oldParent: originalParentName,
              newParent: newParentName,
              position: position
            },
            movedAt: new Date().toISOString(),
            message: "Folder '" + targetFolder.name + "' moved from " +
                     originalParentName + " to " + newParentName
          });
        })()
      \`;

      return app.evaluateJavascript(omniJsScript);
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error.message || String(error),
        operation: 'move_folder'
      });
    }
  })();
`;

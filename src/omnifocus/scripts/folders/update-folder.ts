/**
 * Script to update folder properties in OmniFocus
 *
 * OmniJS-first pattern: All logic runs inside evaluateJavascript()
 *
 * Features:
 * - Update folder name and status
 * - Proper error handling and validation
 * - Duplicate name checking
 */
export const UPDATE_FOLDER_SCRIPT = `
  // UPDATE_FOLDER - OmniJS-first pattern
  (() => {
    const app = Application('OmniFocus');

    try {
      const omniJsScript = \`
        (() => {
          const folderId = "{{folderId}}";
          const updates = {{updates}};

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

          const originalName = targetFolder.name;
          const originalStatus = targetFolder.status ? targetFolder.status.name : 'Active';

          // Check for duplicate name if updating name
          if (updates.name && updates.name !== originalName) {
            const parent = targetFolder.parent;
            // Note: In OmniJS, top-level folders use 'folders' global, not library.folders
            const siblingFolders = parent ? parent.folders : folders;

            for (const sibling of siblingFolders) {
              if (sibling.id.primaryKey !== targetFolder.id.primaryKey && sibling.name === updates.name) {
                const parentName = parent ? parent.name : 'root';
                return JSON.stringify({
                  error: true,
                  message: "Folder '" + updates.name + "' already exists in " + parentName
                });
              }
            }

            // Set the name property directly in OmniJS
            targetFolder.name = updates.name;
          }

          // Update status using OmniJS Folder.Status enum
          if (updates.status) {
            const statusMap = {
              'active': Folder.Status.Active,
              'dropped': Folder.Status.Dropped
            };
            const newStatus = statusMap[updates.status.toLowerCase()];
            if (newStatus && targetFolder.status !== newStatus) {
              targetFolder.status = newStatus;
            }
          }

          // Get final status for response
          const finalStatus = targetFolder.status ? targetFolder.status.name.toLowerCase() : 'active';

          return JSON.stringify({
            success: true,
            folder: {
              id: targetFolder.id.primaryKey,
              name: targetFolder.name,
              status: finalStatus,
              updatedAt: new Date().toISOString()
            },
            changes: {
              name: updates.name ? { from: originalName, to: updates.name } : undefined,
              status: updates.status ? { from: originalStatus.toLowerCase(), to: updates.status } : undefined
            },
            message: "Folder updated successfully"
          });
        })()
      \`;

      return app.evaluateJavascript(omniJsScript);
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error.message || String(error),
        operation: 'update_folder'
      });
    }
  })();
`;

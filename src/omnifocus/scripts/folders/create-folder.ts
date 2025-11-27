/**
 * Script to create a new folder in OmniFocus
 *
 * Architecture: OmniJS-first (2025+)
 * - Minimal JXA wrapper for osascript execution
 * - All logic in OmniJS via evaluateJavascript()
 *
 * Features:
 * - Create folder with name and status
 * - Position within parent folder hierarchy
 * - Duplicate folder name checking within same parent
 * - Proper error handling and validation
 */

export interface CreateFolderOptions {
  parent?: string | null;
  status?: 'active' | 'dropped';
  position?: 'beginning' | 'ending' | 'before' | 'after';
  relativeToFolder?: string;
}

export interface CreateFolderParams {
  name: string;
  options: CreateFolderOptions;
}

export function buildCreateFolderScript(params: CreateFolderParams): string {
  const serializedParams = JSON.stringify({
    name: params.name,
    options: params.options || {},
  });

  return `
    (() => {
      const app = Application('OmniFocus');

      try {
        const omniJsScript = \`
          (() => {
            const params = ${serializedParams};
            const name = params.name;
            const options = params.options || {};

            // Validate parent folder if specified
            let parentFolder = null;
            if (options.parent) {
              // Try by ID first, then by name
              parentFolder = Folder.byIdentifier(options.parent);

              if (!parentFolder) {
                // Search by name
                const allFolders = flattenedFolders;
                for (let i = 0; i < allFolders.length; i++) {
                  if (allFolders[i].name === options.parent) {
                    parentFolder = allFolders[i];
                    break;
                  }
                }
              }

              if (!parentFolder) {
                return JSON.stringify({
                  success: false,
                  error: "Parent folder '" + options.parent + "' not found"
                });
              }
            }

            // Check for duplicate names within the same parent
            // Note: In OmniJS, top-level folders are accessed via 'folders' global, not 'library.folders'
            const existingFolders = parentFolder ? parentFolder.folders : folders;

            for (let i = 0; i < existingFolders.length; i++) {
              if (existingFolders[i].name === name) {
                const parentName = parentFolder ? parentFolder.name : 'root';
                return JSON.stringify({
                  success: false,
                  error: "Folder '" + name + "' already exists in " + parentName
                });
              }
            }

            // Create the folder
            let newFolder;
            try {
              if (parentFolder) {
                newFolder = new Folder(name, parentFolder);
              } else {
                newFolder = new Folder(name);
              }
            } catch (createError) {
              return JSON.stringify({
                success: false,
                error: "Failed to create folder: " + (createError.message || String(createError))
              });
            }

            // Set status after creation if specified
            if (options.status === 'dropped' && newFolder) {
              try {
                newFolder.status = Folder.Status.Dropped;
              } catch (statusError) {
                // Status setting failed, but folder was created
              }
            }

            // Handle positioning
            if (options.position && options.position !== 'ending' && newFolder) {
              try {
                const targetFolders = parentFolder ? parentFolder.folders : folders;

                if (options.position === 'beginning') {
                  moveFolders([newFolder], targetFolders.beginning);
                } else if ((options.position === 'before' || options.position === 'after') && options.relativeToFolder) {
                  let referenceFolder = null;
                  for (let i = 0; i < targetFolders.length; i++) {
                    if (targetFolders[i].name === options.relativeToFolder) {
                      referenceFolder = targetFolders[i];
                      break;
                    }
                  }

                  if (referenceFolder) {
                    if (options.position === 'before') {
                      moveFolders([newFolder], referenceFolder.before);
                    } else {
                      moveFolders([newFolder], referenceFolder.after);
                    }
                  }
                }
              } catch (positionError) {
                // Position setting failed, but folder was created
              }
            }

            // Build response
            const folderPath = [];
            let current = newFolder.parent;
            while (current) {
              folderPath.unshift(current.name);
              current = current.parent;
            }

            return JSON.stringify({
              success: true,
              folder: {
                id: newFolder.id.primaryKey,
                name: newFolder.name,
                parent: parentFolder ? parentFolder.name : null,
                parentId: parentFolder ? parentFolder.id.primaryKey : null,
                path: folderPath.length > 0 ? folderPath.join('/') + '/' + newFolder.name : newFolder.name,
                status: newFolder.status === Folder.Status.Dropped ? 'dropped' : 'active',
                createdAt: new Date().toISOString()
              },
              message: "Folder '" + name + "' created successfully"
            });
          })()
        \`;

        const result = app.evaluateJavascript(omniJsScript);
        return result;

      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error.message || String(error),
          context: 'create_folder'
        });
      }
    })()
  `;
}

// Legacy export for backwards compatibility (template-based)
export const CREATE_FOLDER_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');

    try {
      const omniJsScript = \`
        (() => {
          const name = {{name}};
          const options = {{options}};

          // Validate parent folder if specified
          let parentFolder = null;
          if (options.parent) {
            parentFolder = Folder.byIdentifier(options.parent);

            if (!parentFolder) {
              const allFolders = flattenedFolders;
              for (let i = 0; i < allFolders.length; i++) {
                if (allFolders[i].name === options.parent) {
                  parentFolder = allFolders[i];
                  break;
                }
              }
            }

            if (!parentFolder) {
              return JSON.stringify({
                success: false,
                error: "Parent folder '" + options.parent + "' not found"
              });
            }
          }

          // Check for duplicate names
          // Note: In OmniJS, top-level folders are accessed via 'folders' global
          const existingFolders = parentFolder ? parentFolder.folders : folders;
          for (let i = 0; i < existingFolders.length; i++) {
            if (existingFolders[i].name === name) {
              return JSON.stringify({
                success: false,
                error: "Folder '" + name + "' already exists in " + (parentFolder ? parentFolder.name : 'root')
              });
            }
          }

          // Create the folder
          let newFolder;
          if (parentFolder) {
            newFolder = new Folder(name, parentFolder);
          } else {
            newFolder = new Folder(name);
          }

          // Set status
          if (options.status === 'dropped') {
            newFolder.status = Folder.Status.Dropped;
          }

          return JSON.stringify({
            success: true,
            folder: {
              id: newFolder.id.primaryKey,
              name: newFolder.name,
              parent: options.parent || null,
              status: options.status || 'active',
              createdAt: new Date().toISOString()
            },
            message: "Folder '" + name + "' created successfully"
          });
        })()
      \`;

      const result = app.evaluateJavascript(omniJsScript);
      return result;

    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message || String(error),
        context: 'create_folder'
      });
    }
  })()
`;

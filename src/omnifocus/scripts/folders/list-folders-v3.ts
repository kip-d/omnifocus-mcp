/**
 * List folders script using OmniJS bridge for accurate hierarchy
 *
 * Key insight: JXA folder.parent() returns null, but OmniJS folder.parent works correctly
 */

export interface ListFoldersV3Options {
  limit?: number;
  includeProjects?: boolean;
  includeSubfolders?: boolean;
  search?: string;
  status?: string[];
  sortBy?: 'name' | 'depth' | 'path';
  sortOrder?: 'asc' | 'desc';
}

export function buildListFoldersScriptV3(options: ListFoldersV3Options = {}): string {
  const {
    limit = 100,
    includeProjects = false,
    includeSubfolders = true,
    search = '',
    status = [],
    sortBy = 'path',
    sortOrder = 'asc',
  } = options;

  return `
    (() => {
      const app = Application('OmniFocus');

      try {
        // OmniJS script for bulk folder access with proper hierarchy
        const omniJsScript = \`
          (() => {
            const results = [];
            let count = 0;
            const limit = ${limit};
            const searchFilter = ${JSON.stringify(search)}.toLowerCase();
            const statusFilter = ${JSON.stringify(status)};
            const includeProjects = ${includeProjects};
            const includeSubfolders = ${includeSubfolders};

            // Helper to build folder path by walking up parent chain
            function getFolderPath(folder) {
              if (!folder) return '';
              const parts = [];
              let current = folder;
              while (current) {
                parts.unshift(current.name);
                current = current.parent;
              }
              return parts.join('/');
            }

            // Helper to calculate depth
            function getFolderDepth(folder) {
              let depth = 0;
              let current = folder.parent;
              while (current) {
                depth++;
                current = current.parent;
              }
              return depth;
            }

            // Helper to get folder status
            function getFolderStatus(folder) {
              if (folder.status === Folder.Status.Dropped) return 'dropped';
              return 'active';
            }

            // Process all folders
            flattenedFolders.forEach(folder => {
              if (count >= limit) return;

              // Search filter
              if (searchFilter) {
                const name = (folder.name || '').toLowerCase();
                if (!name.includes(searchFilter)) return;
              }

              // Status filter
              if (statusFilter.length > 0) {
                const status = getFolderStatus(folder);
                if (!statusFilter.includes(status)) return;
              }

              const depth = getFolderDepth(folder);
              const path = getFolderPath(folder);

              // Build folder object
              const folderObj = {
                id: folder.id.primaryKey,
                name: folder.name || 'Unnamed Folder',
                status: getFolderStatus(folder),
                depth: depth,
                path: path,
              };

              // Parent info
              if (folder.parent) {
                folderObj.parentId = folder.parent.id.primaryKey;
                folderObj.parentName = folder.parent.name;
              }

              // Child folders
              if (includeSubfolders && folder.folders && folder.folders.length > 0) {
                folderObj.children = [];
                folder.folders.forEach(child => {
                  folderObj.children.push({
                    id: child.id.primaryKey,
                    name: child.name
                  });
                });
                folderObj.childCount = folder.folders.length;
              }

              // Projects in folder (direct children only)
              if (includeProjects && folder.projects && folder.projects.length > 0) {
                folderObj.projects = [];
                folder.projects.forEach(proj => {
                  folderObj.projects.push({
                    id: proj.id.primaryKey,
                    name: proj.name,
                    status: proj.status === Project.Status.Active ? 'active' :
                            proj.status === Project.Status.OnHold ? 'on-hold' :
                            proj.status === Project.Status.Done ? 'done' : 'dropped'
                  });
                });
                folderObj.projectCount = folder.projects.length;
              }

              results.push(folderObj);
              count++;
            });

            // Sort results
            const sortBy = '${sortBy}';
            const sortOrder = '${sortOrder}';

            results.sort((a, b) => {
              let valueA, valueB;

              switch (sortBy) {
                case 'depth':
                  valueA = a.depth;
                  valueB = b.depth;
                  break;
                case 'path':
                  valueA = a.path.toLowerCase();
                  valueB = b.path.toLowerCase();
                  break;
                case 'name':
                default:
                  valueA = a.name.toLowerCase();
                  valueB = b.name.toLowerCase();
              }

              if (sortOrder === 'desc') {
                return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
              } else {
                return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
              }
            });

            return JSON.stringify({
              success: true,
              folders: results,
              metadata: {
                returned_count: results.length,
                total_available: flattenedFolders.length
              }
            });
          })()
        \`;

        const result = app.evaluateJavascript(omniJsScript);
        return result;

      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error.message || String(error),
          details: { context: 'list_folders_v3' }
        });
      }
    })()
  `;
}

import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to list folders in OmniFocus with hierarchy information
 * 
 * Features:
 * - List all folders with filtering options
 * - Include parent/child hierarchy information
 * - Optional project counts for each folder
 * - Search and status filtering
 * - Sort by name, depth, or modification date
 */
export const LIST_FOLDERS_SCRIPT = `
  ${getAllHelpers()}
  
  // Folder serialization helper
  function serializeFolder(folder, includeHierarchy = true, includeProjects = false, depth = 0) {
    const folderObj = {
      id: safeGet(() => folder.id()),
      name: safeGet(() => folder.name()),
      status: safeGet(() => {
        const status = folder.status();
        if (status && status.toString().includes('Active')) return 'active';
        if (status && status.toString().includes('Dropped')) return 'dropped';
        return 'active';
      })
    };
    
    if (includeHierarchy) {
      folderObj.depth = depth;
      
      // Get parent folder
      const parent = safeGet(() => folder.parent());
      if (parent) {
        folderObj.parent = safeGet(() => parent.name());
        folderObj.parentId = safeGet(() => parent.id());
      }
      
      // Get child folders
      const children = safeGet(() => folder.folders());
      if (children && children.length > 0) {
        folderObj.children = [];
        for (let i = 0; i < children.length; i++) {
          folderObj.children.push(safeGet(() => children[i].name()));
        }
      }
      
      // Build hierarchy path
      const pathParts = [];
      let currentFolder = folder;
      while (currentFolder) {
        const currentName = safeGet(() => currentFolder.name());
        if (currentName) {
          pathParts.unshift(currentName);
        }
        currentFolder = safeGet(() => currentFolder.parent());
      }
      folderObj.path = pathParts.join(' > ');
    }
    
    if (includeProjects) {
      const projects = safeGet(() => folder.projects());
      if (projects) {
        folderObj.projects = [];
        for (let i = 0; i < projects.length; i++) {
          const projectName = safeGet(() => projects[i].name());
          if (projectName) {
            folderObj.projects.push(projectName);
          }
        }
      }
    }
    
    return folderObj;
  }
  
  // Build hierarchy recursively
  function buildFolderHierarchy(folders, parent = null, depth = 0) {
    const result = [];
    
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      const folderParent = safeGet(() => folder.parent());
      
      // Check if this folder belongs to the current parent level
      if ((parent === null && folderParent === null) || 
          (parent !== null && folderParent !== null && 
           safeGet(() => folderParent.id()) === safeGet(() => parent.id()))) {
        result.push(folder);
      }
    }
    
    return result;
  }
  
  (() => {
    const options = {{options}};
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      const allFolders = doc.flattenedFolders();
      
      if (!allFolders) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve folders from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
          details: "doc.flattenedFolders() returned null or undefined"
        });
      }
      
      let filteredFolders = [];
      
      // Apply filters
      for (let i = 0; i < allFolders.length; i++) {
        const folder = allFolders[i];
        let includeFolder = true;
        
        // Status filter
        if (options.status && options.status.length > 0) {
          const folderStatus = safeGet(() => {
            const status = folder.status();
            if (status && status.toString().includes('Active')) return 'active';
            if (status && status.toString().includes('Dropped')) return 'dropped';
            return 'active';
          });
          
          if (!options.status.includes(folderStatus)) {
            includeFolder = false;
          }
        }
        
        // Search filter
        if (options.search && includeFolder) {
          const folderName = safeGet(() => folder.name(), '');
          if (!folderName.toLowerCase().includes(options.search.toLowerCase())) {
            includeFolder = false;
          }
        }
        
        if (includeFolder) {
          filteredFolders.push(folder);
        }
      }
      
      // Sort folders
      const sortBy = options.sortBy || 'name';
      const sortOrder = options.sortOrder || 'asc';
      
      filteredFolders.sort((a, b) => {
        let valueA, valueB;
        
        switch (sortBy) {
          case 'name':
            valueA = safeGet(() => a.name(), '').toLowerCase();
            valueB = safeGet(() => b.name(), '').toLowerCase();
            break;
          case 'status':
            valueA = safeGet(() => {
              const status = a.status();
              if (status && status.toString().includes('Active')) return 'active';
              if (status && status.toString().includes('Dropped')) return 'dropped';
              return 'active';
            });
            valueB = safeGet(() => {
              const status = b.status();
              if (status && status.toString().includes('Active')) return 'active';
              if (status && status.toString().includes('Dropped')) return 'dropped';
              return 'active';
            });
            break;
          case 'depth':
            // Calculate depth by counting parents
            valueA = 0;
            valueB = 0;
            let parentA = safeGet(() => a.parent());
            let parentB = safeGet(() => b.parent());
            while (parentA) {
              valueA++;
              parentA = safeGet(() => parentA.parent());
            }
            while (parentB) {
              valueB++;
              parentB = safeGet(() => parentB.parent());
            }
            break;
          default:
            valueA = safeGet(() => a.name(), '').toLowerCase();
            valueB = safeGet(() => b.name(), '').toLowerCase();
        }
        
        if (sortOrder === 'desc') {
          return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
        } else {
          return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
        }
      });
      
      // Apply limit
      const limit = options.limit || 100;
      if (filteredFolders.length > limit) {
        filteredFolders = filteredFolders.slice(0, limit);
      }
      
      // Serialize folders
      const serializedFolders = [];
      for (let i = 0; i < filteredFolders.length; i++) {
        const folder = filteredFolders[i];
        
        // Calculate depth
        let depth = 0;
        let parent = safeGet(() => folder.parent());
        while (parent) {
          depth++;
          parent = safeGet(() => parent.parent());
        }
        
        const serialized = serializeFolder(
          folder, 
          options.includeHierarchy !== false, 
          options.includeProjects === true, 
          depth
        );
        
        serializedFolders.push(serialized);
      }
      
      return JSON.stringify({
        success: true,
        folders: serializedFolders,
        count: serializedFolders.length,
        totalFolders: allFolders.length,
        filters: {
          status: options.status,
          search: options.search
        },
        message: "Retrieved " + serializedFolders.length + " folders"
      });
    } catch (error) {
      return formatError(error, 'list_folders');
    }
  })();
`;
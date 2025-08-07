import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to create a new project in OmniFocus
 * 
 * Features:
 * - Create project with name, note, dates, and flagged status
 * - Place in specific folder (creates folder if needed)
 * - Duplicate project name checking
 * - Proper error handling and validation
 */
export const CREATE_PROJECT_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const name = {{name}};
    const options = {{options}};
    
    try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Check if project already exists
    const existingProjects = doc.flattenedProjects();
    
    // Check if existingProjects is null or undefined
    if (!existingProjects) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve projects from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedProjects() returned null or undefined"
      });
    }
    for (let i = 0; i < existingProjects.length; i++) {
      if (existingProjects[i].name() === name) {
        return JSON.stringify({
          error: true,
          message: "Project '" + name + "' already exists"
        });
      }
    }
    
    // Create the project
    const projectProps = { name: name };
    
    // Add optional properties
    if (options.note) {
      projectProps.note = options.note;
    }
    
    if (options.deferDate) {
      projectProps.deferDate = new Date(options.deferDate);
    }
    
    if (options.dueDate) {
      projectProps.dueDate = new Date(options.dueDate);
    }
    
    if (options.flagged !== undefined) {
      projectProps.flagged = options.flagged;
    }
    
    if (options.sequential !== undefined) {
      projectProps.sequential = options.sequential;
    }
    
    // Create project
    const newProject = app.Project(projectProps);
    
    // Add to specific folder if specified
    if (options.folder) {
      const folders = doc.flattenedFolders();
      
      // Check if folders is null or undefined
      if (!folders) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve folders from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
          details: "doc.flattenedFolders() returned null or undefined"
        });
      }
      let targetFolder = null;
      
      for (let i = 0; i < folders.length; i++) {
        if (folders[i].name() === options.folder) {
          targetFolder = folders[i];
          break;
        }
      }
      
      if (targetFolder) {
        targetFolder.projects.push(newProject);
      } else {
        // Create folder if it doesn't exist
        targetFolder = app.Folder({name: options.folder});
        doc.folders.push(targetFolder);
        targetFolder.projects.push(newProject);
      }
    } else {
      // Add to root projects
      doc.projects.push(newProject);
    }
    
    return JSON.stringify({
      success: true,
      project: {
        id: newProject.id(),
        name: newProject.name(),
        createdAt: new Date().toISOString()
      },
      message: "Project '" + name + "' created successfully"
    });
  } catch (error) {
    return formatError(error, 'create_project');
  }
  })();
`;
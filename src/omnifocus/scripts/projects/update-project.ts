import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to update an existing project in OmniFocus
 * 
 * Features:
 * - Update name, note, dates, and flagged status
 * - Change project status (active, onHold, dropped, done)
 * - Move project to different folder
 * - Duplicate name checking
 * - Detailed change tracking
 */
export const UPDATE_PROJECT_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
  const projectId = {{projectId}};
  const updates = {{updates}};
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Find the project by ID
    const projects = doc.flattenedProjects();
    
    // Check if projects is null or undefined
    if (!projects) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve projects from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedProjects() returned null or undefined"
      });
    }
    let targetProject = null;
    
    for (let i = 0; i < projects.length; i++) {
      if (projects[i].id() === projectId) {
        targetProject = projects[i];
        break;
      }
    }
    
    if (!targetProject) {
      return JSON.stringify({
        error: true,
        message: "Project with ID '" + projectId + "' not found. Use 'list_projects' tool to see available projects."
      });
    }
    
    // Apply updates
    const changes = [];
    
    if (updates.name && updates.name !== targetProject.name()) {
      // Check if new name already exists
      for (let i = 0; i < projects.length; i++) {
        if (projects[i].name() === updates.name && projects[i] !== targetProject) {
          return JSON.stringify({
            error: true,
            message: "Project '" + updates.name + "' already exists"
          });
        }
      }
      targetProject.name = updates.name;
      changes.push("Name changed to '" + updates.name + "'");
    }
    
    if (updates.note !== undefined) {
      targetProject.note = updates.note;
      changes.push("Note updated");
    }
    
    if (updates.deferDate !== undefined) {
      if (updates.deferDate === null) {
        targetProject.deferDate = null;
        changes.push("Defer date removed");
      } else {
        targetProject.deferDate = new Date(updates.deferDate);
        changes.push("Defer date set to " + updates.deferDate);
      }
    }
    
    if (updates.dueDate !== undefined) {
      if (updates.dueDate === null) {
        targetProject.dueDate = null;
        changes.push("Due date removed");
      } else {
        targetProject.dueDate = new Date(updates.dueDate);
        changes.push("Due date set to " + updates.dueDate);
      }
    }
    
    if (updates.flagged !== undefined) {
      targetProject.flagged = updates.flagged;
      changes.push(updates.flagged ? "Flagged" : "Unflagged");
    }
    
    if (updates.sequential !== undefined) {
      targetProject.sequential = updates.sequential;
      changes.push(updates.sequential ? "Set to sequential (tasks must be done in order)" : "Set to parallel (tasks can be done in any order)");
    }
    
    if (updates.status) {
      if (updates.status === 'active') {
        targetProject.status = app.Project.Status.active;
        changes.push("Status set to active");
      } else if (updates.status === 'onHold') {
        targetProject.status = app.Project.Status.onHold;
        changes.push("Status set to on hold");
      } else if (updates.status === 'dropped') {
        targetProject.status = app.Project.Status.dropped;
        changes.push("Status set to dropped");
      } else if (updates.status === 'done') {
        targetProject.status = app.Project.Status.done;
        targetProject.completionDate = new Date();
        changes.push("Project completed");
      }
    }
    
    if (updates.folder !== undefined) {
      // Handle folder movement
      try {
        if (updates.folder === null) {
          // Move to root by using moveTo with location Beginning
          targetProject.moveTo(doc.projects, { at: app.LocationSpecifier.beginning });
          changes.push("Moved to root folder");
        } else {
          // Move to specific folder
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
            if (folders[i].name === updates.folder) {
              targetFolder = folders[i];
              break;
            }
          }
          
          if (!targetFolder) {
            // Create folder if it doesn't exist
            targetFolder = app.Folder({name: updates.folder});
            doc.folders.push(targetFolder);
            changes.push("Created folder '" + updates.folder + "'");
          }
          
          // Move project to target folder
          targetProject.moveTo(targetFolder.projects, { at: app.LocationSpecifier.beginning });
          changes.push("Moved to folder '" + updates.folder + "'");
        }
      } catch (moveError) {
        // Fallback: Note the limitation
        changes.push("Note: Folder change requires manual move in OmniFocus");
      }
    }
    
    if (changes.length === 0) {
      return JSON.stringify({
        success: true,
        message: "No changes made to project"
      });
    }
    
    return JSON.stringify({
      success: true,
      project: {
        id: targetProject.id(),
        name: targetProject.name()
      },
      changes: changes,
      message: "Project updated successfully"
    });
  } catch (error) {
    return formatError(error, 'update_project');
  }
  })();
`;
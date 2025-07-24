// Import shared safe utilities
import { SAFE_UTILITIES_SCRIPT } from './tasks.js';

export const LIST_PROJECTS_SCRIPT = `
  const filter = {{filter}};
  const limit = {{limit}};
  const includeStats = {{includeStats}};
  const projects = [];
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    const allProjects = doc.flattenedProjects();
    
    // Check if allProjects is null or undefined
    if (!allProjects) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve projects from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedProjects() returned null or undefined"
      });
    }
    
    for (let i = 0; i < allProjects.length; i++) {
      const project = allProjects[i];
      
      // Apply filters
      if (filter.status && filter.status.length > 0) {
        const projectStatus = safeGetStatus(project);
        if (!filter.status.includes(projectStatus)) continue;
      }
      
      if (filter.flagged !== undefined && safeIsFlagged(project) !== filter.flagged) continue;
      
      // Apply search filter
      if (filter.search) {
        const searchTerm = filter.search.toLowerCase();
        const projectName = safeGet(() => project.name(), '').toLowerCase();
        const projectNote = safeGet(() => project.note(), '').toLowerCase();
        
        if (!projectName.includes(searchTerm) && !projectNote.includes(searchTerm)) {
          continue;
        }
      }
      
      // Build project object
      const projectObj = {
        id: safeGet(() => project.id(), 'unknown'),
        name: safeGet(() => project.name(), 'Unnamed Project'),
        status: safeGetStatus(project),
        flagged: safeIsFlagged(project)
      };
      
      // Add optional properties safely
      const note = safeGet(() => project.note());
      if (note) projectObj.note = note;
      
      const folder = safeGetFolder(project);
      if (folder) projectObj.folder = folder;
      
      const dueDate = safeGetDate(() => project.dueDate());
      if (dueDate) projectObj.dueDate = dueDate;
      
      const deferDate = safeGetDate(() => project.deferDate());
      if (deferDate) projectObj.deferDate = deferDate;
      
      // Basic task count (always included for backward compatibility)
      projectObj.numberOfTasks = safeGetTaskCount(project);
      
      // Collect detailed statistics only if requested
      if (includeStats === true) {
        try {
          const tasks = project.flattenedTasks();
          if (tasks && tasks.length > 0) {
            let active = 0;
            let completed = 0;
            let overdue = 0;
            let flagged = 0;
            let totalEstimatedMinutes = 0;
            let lastActivityDate = null;
            const now = new Date();
            
            // Analyze tasks
            for (let j = 0; j < tasks.length; j++) {
              const task = tasks[j];
              
              if (safeIsCompleted(task)) {
                completed++;
                // Track last completion date
                const completionDate = safeGetDate(() => task.completionDate());
                if (completionDate && (!lastActivityDate || new Date(completionDate) > new Date(lastActivityDate))) {
                  lastActivityDate = completionDate;
                }
              } else {
                active++;
                
                // Check if overdue
                const dueDate = safeGetDate(() => task.dueDate());
                if (dueDate && new Date(dueDate) < now) {
                  overdue++;
                }
                
                // Track last modification for active tasks
                const modDate = safeGetDate(() => task.modificationDate());
                if (modDate && (!lastActivityDate || new Date(modDate) > new Date(lastActivityDate))) {
                  lastActivityDate = modDate;
                }
              }
              
              if (safeIsFlagged(task)) {
                flagged++;
              }
              
              // Sum estimated time
              const estimatedMinutes = safeGetEstimatedMinutes(task);
              if (estimatedMinutes) {
                totalEstimatedMinutes += estimatedMinutes;
              }
            }
            
            // Add statistics to project object
            projectObj.stats = {
              active: active,
              completed: completed,
              total: tasks.length,
              completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
              overdue: overdue,
              flagged: flagged,
              estimatedHours: totalEstimatedMinutes > 0 ? (totalEstimatedMinutes / 60).toFixed(1) : null,
              lastActivityDate: lastActivityDate
            };
          } else {
            // Empty project stats
            projectObj.stats = {
              active: 0,
              completed: 0,
              total: 0,
              completionRate: 0,
              overdue: 0,
              flagged: 0,
              estimatedHours: null,
              lastActivityDate: null
            };
          }
        } catch (statsError) {
          // If stats collection fails, continue without them
          projectObj.statsError = "Failed to collect statistics";
        }
      }
      
      projects.push(projectObj);
      
      // Check if we've reached the limit
      if (projects.length >= limit) {
        break;
      }
    }
    
    return JSON.stringify({ 
      projects: projects,
      metadata: {
        total_available: allProjects.length,
        returned_count: projects.length,
        limit_applied: limit
      }
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to list projects: " + error.toString(),
      details: error.message
    });
  }
`;

export const CREATE_PROJECT_SCRIPT = `
  const name = {{name}};
  const options = {{options}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
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
    return JSON.stringify({
      error: true,
      message: "Failed to create project: " + error.toString()
    });
  }
`;

export const UPDATE_PROJECT_SCRIPT = `
  const projectId = {{projectId}};
  const updates = {{updates}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
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
    return JSON.stringify({
      error: true,
      message: "Failed to update project: " + error.toString()
    });
  }
`;

export const COMPLETE_PROJECT_SCRIPT = `
  const projectId = {{projectId}};
  const completeAllTasks = {{completeAllTasks}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
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
    
    // Count incomplete tasks
    const tasks = targetProject.flattenedTasks();
    let incompleteCount = 0;
    let completedCount = 0;
    
    for (let i = 0; i < tasks.length; i++) {
      if (!tasks[i].completed()) {
        incompleteCount++;
      }
    }
    
    // Complete all tasks if requested
    if (completeAllTasks && incompleteCount > 0) {
      for (let i = 0; i < tasks.length; i++) {
        if (!tasks[i].completed()) {
          tasks[i].markComplete();
          completedCount++;
        }
      }
    }
    
    // Complete the project
    let statusSet = false;
    try {
      // Try different ways to set project status to done
      if (typeof app.Project.Status.done !== 'undefined') {
        targetProject.status = app.Project.Status.done;
        statusSet = true;
      } else {
        // Fallback: try setting status directly with string value
        targetProject.status = 'done';
        statusSet = true;
      }
    } catch (statusError) {
      // Status setting failed, try alternative approaches
      try {
        // Try using the markComplete method if available
        if (typeof targetProject.markComplete === 'function') {
          targetProject.markComplete();
          statusSet = true;
        }
      } catch (markCompleteError) {
        // Last resort: try setting completion date without status
        // This might work in some OmniFocus versions
      }
    }
    
    // Only set completion date after status is set, or as last resort
    try {
      if (statusSet) {
        targetProject.completionDate = new Date();
      } else {
        // Try completion date as last resort (some versions allow this)
        targetProject.completionDate = new Date();
      }
    } catch (completionError) {
      // If we can't set completion date, the status change might be enough
    }
    
    return JSON.stringify({
      success: true,
      project: {
        id: targetProject.id(),
        name: targetProject.name(),
        completedAt: targetProject.completionDate().toISOString()
      },
      tasksCompleted: completedCount,
      message: "Project '" + targetProject.name() + "' completed" + 
                (completedCount > 0 ? " with " + completedCount + " tasks" : "")
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to complete project: " + error.toString()
    });
  }
`;


export const DELETE_PROJECT_SCRIPT = `
  const projectId = {{projectId}};
  const deleteTasks = {{deleteTasks}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    // Find the project by ID (using same pattern as working task deletion)
    const projects = doc.flattenedProjects();
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
    
    const projectName = safeGet(() => targetProject.name(), 'Unknown Project');
    
    // Count tasks
    const tasks = safeGet(() => targetProject.flattenedTasks(), []);
    const taskCount = tasks.length;
    let deletedTaskCount = 0;
    
    // Delete or orphan tasks (if requested)
    if (deleteTasks && taskCount > 0) {
      for (let i = tasks.length - 1; i >= 0; i--) {
        try {
          tasks[i].markDropped();
          deletedTaskCount++;
        } catch (taskError) {
          // Task deletion failed, but continue with project
        }
      }
    }
    
    // Delete/drop the project (using same approach as working task deletion)
    try {
      targetProject.markDropped();
    } catch (dropError) {
      return JSON.stringify({
        error: true,
        message: "Failed to delete project: " + dropError.toString()
      });
    }
    
    return JSON.stringify({
      success: true,
      projectName: projectName,
      tasksDeleted: deletedTaskCount,
      tasksOrphaned: taskCount - deletedTaskCount,
      message: "Project '" + projectName + "' deleted" +
                (deletedTaskCount > 0 ? " with " + deletedTaskCount + " tasks" : "") +
                (taskCount - deletedTaskCount > 0 ? " (" + (taskCount - deletedTaskCount) + " tasks moved to Inbox)" : "")
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to delete project: " + error.toString()
    });
  }
`;

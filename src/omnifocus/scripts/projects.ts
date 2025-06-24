export const LIST_PROJECTS_SCRIPT = `
  const filter = {{filter}};
  const projects = [];
  
  try {
    const allProjects = doc.flattenedProjects();
    
    for (let i = 0; i < allProjects.length; i++) {
      const project = allProjects[i];
      
      // Apply filters
      if (filter.status && filter.status.length > 0) {
        const projectStatus = project.status();
        if (!filter.status.includes(projectStatus)) continue;
      }
      
      if (filter.flagged !== undefined && project.flagged() !== filter.flagged) continue;
      
      // Apply search filter
      if (filter.search) {
        const searchTerm = filter.search.toLowerCase();
        const projectName = project.name().toLowerCase();
        let projectNote = '';
        try {
          const note = project.note();
          if (note) projectNote = note.toLowerCase();
        } catch (e) {}
        
        if (!projectName.includes(searchTerm) && !projectNote.includes(searchTerm)) {
          continue;
        }
      }
      
      // Build project object
      const projectObj = {
        id: project.id.primaryKey,
        name: project.name(),
        status: project.status(),
        flagged: project.flagged()
      };
      
      // Add optional properties safely
      try {
        const note = project.note();
        if (note) projectObj.note = note;
      } catch (e) {}
      
      try {
        const folder = project.folder();
        if (folder) projectObj.folder = folder.name();
      } catch (e) {}
      
      try {
        const dueDate = project.dueDate();
        if (dueDate) projectObj.dueDate = dueDate.toISOString();
      } catch (e) {}
      
      try {
        const deferDate = project.deferDate();
        if (deferDate) projectObj.deferDate = deferDate.toISOString();
      } catch (e) {}
      
      try {
        const tasks = project.flattenedTasks();
        projectObj.numberOfTasks = tasks.length;
      } catch (e) {
        projectObj.numberOfTasks = 0;
      }
      
      projects.push(projectObj);
    }
    
    return JSON.stringify({ projects: projects });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to list projects: " + error.toString(),
      details: error.message
    });
  }
`;

export const CREATE_PROJECT_SCRIPT = `
  const projectData = {{projectData}};
  
  try {
    // Create the project
    const project = app.Project({name: projectData.name});
    
    // Set properties
    if (projectData.note !== undefined) project.note = projectData.note;
    if (projectData.status !== undefined) project.status = projectData.status;
    if (projectData.flagged !== undefined) project.flagged = projectData.flagged;
    if (projectData.dueDate !== undefined) project.dueDate = projectData.dueDate ? new Date(projectData.dueDate) : null;
    if (projectData.deferDate !== undefined) project.deferDate = projectData.deferDate ? new Date(projectData.deferDate) : null;
    if (projectData.sequential !== undefined) project.sequential = projectData.sequential;
    
    // Add to folder or root
    if (projectData.folder) {
      try {
        const folders = doc.flattenedFolders();
        let targetFolder = null;
        for (let i = 0; i < folders.length; i++) {
          if (folders[i].name() === projectData.folder) {
            targetFolder = folders[i];
            break;
          }
        }
        
        if (!targetFolder) {
          // Create folder if it doesn't exist
          targetFolder = app.Folder({name: projectData.folder});
          doc.folders.push(targetFolder);
        }
        targetFolder.projects.push(project);
      } catch (e) {
        // Fallback to root
        doc.projects.push(project);
      }
    } else {
      doc.projects.push(project);
    }
    
    return JSON.stringify({
      id: project.id.primaryKey,
      name: project.name,
      created: true
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
  
  try {
    // Find project by ID
    const projects = doc.flattenedProjects();
    let project = null;
    for (let i = 0; i < projects.length; i++) {
      if (projects[i].id.primaryKey === projectId) {
        project = projects[i];
        break;
      }
    }
    if (!project) {
      return JSON.stringify({ error: true, message: 'Project not found' });
    }
    
    // Apply updates
    if (updates.name !== undefined) project.name = updates.name;
    if (updates.note !== undefined) project.note = updates.note;
    if (updates.status !== undefined) project.status = updates.status;
    if (updates.flagged !== undefined) project.flagged = updates.flagged;
    if (updates.dueDate !== undefined) project.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    if (updates.deferDate !== undefined) project.deferDate = updates.deferDate ? new Date(updates.deferDate) : null;
    if (updates.sequential !== undefined) project.sequential = updates.sequential;
    
    return JSON.stringify({
      id: project.id.primaryKey,
      updated: true
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to update project: " + error.toString()
    });
  }
`;

export const ARCHIVE_PROJECT_SCRIPT = `
  const projectId = {{projectId}};
  const archiveType = {{archiveType}}; // 'completed' or 'dropped'
  
  try {
    // Find project by ID
    const projects = doc.flattenedProjects();
    let project = null;
    for (let i = 0; i < projects.length; i++) {
      if (projects[i].id.primaryKey === projectId) {
        project = projects[i];
        break;
      }
    }
    if (!project) {
      return JSON.stringify({ error: true, message: 'Project not found' });
    }
    
    if (archiveType === 'completed') {
      project.markComplete();
    } else if (archiveType === 'dropped') {
      project.drop();
    } else {
      return JSON.stringify({ error: true, message: 'Invalid archive type' });
    }
    
    return JSON.stringify({
      id: project.id.primaryKey,
      archived: true,
      status: project.status
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to archive project: " + error.toString()
    });
  }
`;
import { getAllHelpers } from '../shared/helpers.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

/**
 * Script to create a new project in OmniFocus
 * 
 * Features:
 * - Create project with name, note, dates, and flagged status
 * - Place in specific folder (creates folder if needed)
 * - Set review dates and intervals for GTD workflows
 * - Configure advanced properties (completedByChildren, singleton)
 * - Duplicate project name checking
 * - Proper error handling and validation
 */
export const CREATE_PROJECT_SCRIPT = `
  ${getAllHelpers()}
  ${REPEAT_HELPERS}
  
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
    
    // Review-related properties
    if (options.nextReviewDate) {
      projectProps.nextReviewDate = new Date(options.nextReviewDate);
    }
    
    // Advanced project properties
    if (options.completedByChildren !== undefined) {
      projectProps.completedByChildren = options.completedByChildren;
    }
    
    if (options.singleton !== undefined) {
      projectProps.singleton = options.singleton;
    }
    
    // Set repeat rule if provided
    if (options.repeatRule) {
      try {
        const repetitionRule = createRepetitionRule(options.repeatRule);
        if (repetitionRule) {
          projectProps.repetitionRule = repetitionRule;
          console.log('Applied repeat rule to project:', options.repeatRule);
        }
      } catch (error) {
        console.log('Warning: Failed to apply repeat rule to project:', error.message);
        // Continue without repeat rule rather than failing project creation
      }
    }
    
    // Create project
    const newProject = app.Project(projectProps);
    
    // Set review interval after project creation (cannot be set during construction)
    if (options.reviewInterval) {
      try {
        // Set review interval as a plain object (JXA doesn't have ReviewInterval constructor)
        newProject.reviewInterval = {
          unit: options.reviewInterval.unit,
          steps: options.reviewInterval.steps || 1,
          fixed: options.reviewInterval.fixed || false
        };
        
        // If nextReviewDate wasn't provided but reviewInterval was, calculate it
        if (!options.nextReviewDate && options.reviewInterval) {
          const now = new Date();
          const intervalMs = getIntervalMilliseconds(options.reviewInterval.unit, options.reviewInterval.steps || 1);
          newProject.nextReviewDate = new Date(now.getTime() + intervalMs);
        }
      } catch (reviewError) {
        // Log but don't fail the project creation
        console.log('Warning: Could not set review interval: ' + reviewError.message);
      }
    }
    
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
        createdAt: new Date().toISOString(),
        nextReviewDate: newProject.nextReviewDate ? newProject.nextReviewDate().toISOString() : null,
        reviewInterval: newProject.reviewInterval ? {
          unit: newProject.reviewInterval().unit,
          steps: newProject.reviewInterval().steps
        } : null,
        completedByChildren: newProject.completedByChildren ? newProject.completedByChildren() : false,
        singleton: newProject.singleton ? newProject.singleton() : false
      },
      message: "Project '" + name + "' created successfully"
    });
  } catch (error) {
    return formatError(error, 'create_project');
  }
  
  // Helper function to convert review interval to milliseconds
  function getIntervalMilliseconds(unit, steps) {
    const msPerUnit = {
      'day': 24 * 60 * 60 * 1000,
      'week': 7 * 24 * 60 * 60 * 1000,
      'month': 30 * 24 * 60 * 60 * 1000, // Approximate
      'year': 365 * 24 * 60 * 60 * 1000   // Approximate
    };
    return (msPerUnit[unit] || msPerUnit['week']) * steps;
  }
  
  })();
`;
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
    
    // Create project with object parameter (despite TypeScript definition, JXA expects object)
    const projectProps = { name: name };
    
    // Add simple properties that can be set during creation
    if (options.note) {
      projectProps.note = options.note;
    }
    
    if (options.flagged !== undefined) {
      projectProps.flagged = options.flagged;
    }
    
    if (options.sequential !== undefined) {
      projectProps.sequential = options.sequential;
    }
    
    if (options.completedByChildren !== undefined) {
      projectProps.completedByChildren = options.completedByChildren;
    }
    
    // Create the project
    const newProject = app.Project(projectProps);
    
    // Set date properties after creation to avoid type conversion issues
    if (options.deferDate) {
      try {
        newProject.deferDate = new Date(options.deferDate);
      } catch (e) {
        console.log('Warning: Could not set defer date:', e.message);
      }
    }
    
    if (options.dueDate) {
      try {
        newProject.dueDate = new Date(options.dueDate);
      } catch (e) {
        console.log('Warning: Could not set due date:', e.message);
      }
    }
    
    if (options.nextReviewDate) {
      try {
        newProject.nextReviewDate = new Date(options.nextReviewDate);
      } catch (e) {
        console.log('Warning: Could not set next review date:', e.message);
      }
    }
    
    // Set repeat rule after project creation
    // NOTE: RepetitionRule creation has issues with JXA, commenting out for now
    // TODO: Investigate alternative approach for project repeat rules
    /*
    if (options.repeatRule) {
      try {
        const repetitionRule = createRepetitionRule(options.repeatRule);
        if (repetitionRule && typeof repetitionRule !== 'object') {
          newProject.repetitionRule = repetitionRule;
          console.log('Applied repeat rule to project:', options.repeatRule);
        }
      } catch (error) {
        console.log('Warning: Failed to apply repeat rule to project:', error.message);
        // Continue without repeat rule rather than failing project creation
      }
    }
    */
    
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
        nextReviewDate: safeGet(() => {
          const date = newProject.nextReviewDate();
          return date ? date.toISOString() : null;
        }, null),
        reviewInterval: safeGet(() => {
          const interval = newProject.reviewInterval();
          return interval ? {
            unit: interval.unit,
            steps: interval.steps
          } : null;
        }, null),
        completedByChildren: safeGet(() => newProject.completedByChildren(), false),
        singleton: safeGet(() => newProject.singleton(), false)
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

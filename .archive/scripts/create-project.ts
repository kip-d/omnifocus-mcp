import { getUnifiedHelpers } from '../shared/helpers.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';

/**
 * Script to create a new project in OmniFocus
 *
 * OPTIMIZED FOR SIZE: Uses minimal helpers to stay under 19KB limit
 * Features:
 * - Create project with name, note, dates, and flagged status
 * - Place in specific folder (creates folder if needed)
 * - Set review dates and intervals for GTD workflows
 * - Configure advanced properties (completedByChildren, singleton)
 * - Duplicate project name checking
 * - Proper error handling and validation
 */
export const CREATE_PROJECT_SCRIPT = `
  ${getUnifiedHelpers()}
  ${REPEAT_HELPERS}
  ${getMinimalTagBridge()}
  
  
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
    
    // Set repeat rule after project creation (using evaluateJavascript bridge)
    if (options.repeatRule) {
      try {
        const ruleData = prepareRepetitionRuleData(options.repeatRule);
        if (ruleData && ruleData.needsBridge) {
          // Get the project ID for the bridge
          const projectId = newProject.id();
          
          // Apply repetition rule via evaluateJavascript bridge
          // Note: Projects also use Task.RepetitionRule
          const success = applyRepetitionRuleViaBridge(projectId, ruleData);
          if (success) {
            console.log('Applied repeat rule to project via bridge:', options.repeatRule);
          } else {
            console.log('Warning: Could not apply repeat rule to project via bridge');
          }
        }
      } catch (error) {
        console.log('Warning: Failed to apply repeat rule to project:', error.message);
        // Continue without repeat rule rather than failing project creation
      }
    }
    
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

    // Apply tags using OmniJS bridge for reliable visibility
    // Note: We use project name for lookup because newly created projects
    // are not immediately visible to OmniJS's Project.byIdentifier()
    let tagResult = null;
    if (options.tags && options.tags.length > 0) {
      try {
        // Use bridge for tag assignment (required for OmniFocus 4.x)
        const bridgeResult = bridgeSetProjectTags(app, name, options.tags);

        if (bridgeResult && bridgeResult.success) {
          tagResult = {
            success: true,
            tagsAdded: bridgeResult.tags || [],
            totalTags: bridgeResult.tags ? bridgeResult.tags.length : 0
          };
          console.log('Successfully added ' + tagResult.totalTags + ' tags to project via bridge');
        } else {
          tagResult = {
            success: false,
            error: bridgeResult ? bridgeResult.error : 'Unknown bridge error',
            tagsAdded: []
          };
          console.log('Warning: Failed to add tags via bridge:', bridgeResult ? bridgeResult.error : 'unknown');
        }
      } catch (tagError) {
        tagResult = {
          success: false,
          error: tagError.message,
          tagsAdded: []
        };
        console.log('Warning: Error adding tags:', tagError.message);
      }
    }

    return JSON.stringify({
      success: true,
      project: {
        id: newProject.id(),
        name: newProject.name(),
        createdAt: new Date().toISOString(),
        tags: tagResult && tagResult.success ? tagResult.tagsAdded : [],
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
      tagResult: tagResult,
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

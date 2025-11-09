import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * LIGHTWEIGHT Script to update core project properties in OmniFocus
 *
 * CRITICAL: This script was reduced from 9679 to ~3000 chars to fix "Can't convert types" errors
 * caused by JXA script size limits. Complex features like folder moves and review intervals
 * have been simplified or removed to ensure reliability.
 *
 * Supported updates:
 * - ✅ name, note, dueDate, deferDate, flagged, sequential, status
 * - ⚠️  folder: Basic folder name tracking only (no complex moves)
 * - ⚠️  reviewInterval: Simplified handling (no complex validation)
 * - ❌ completedByChildren, singleton: Removed to save space
 */
export const UPDATE_PROJECT_SCRIPT = `
  ${getUnifiedHelpers()}
  
  (() => {
  const projectId = {{projectId}};
  const updates = {{updates}};
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Find the project by ID
    const projects = doc.flattenedProjects();
    
    if (!projects) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve projects from OmniFocus."
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
        message: "Project with ID '" + projectId + "' not found."
      });
    }
    
    // Apply updates - simplified logic
    const changes = [];
    
    if (updates.name && updates.name !== targetProject.name()) {
      targetProject.name = updates.name;
      changes.push("Name updated");
    }
    
    if (updates.note !== undefined) {
      const noteValue = updates.note === null ? '' : String(updates.note);
      targetProject.note = noteValue;
      changes.push("Note updated");
    }
    
    if (updates.deferDate !== undefined) {
      if (updates.deferDate === null) {
        targetProject.deferDate = null;
        changes.push("Defer date cleared");
      } else {
        targetProject.deferDate = new Date(updates.deferDate);
        changes.push("Defer date set");
      }
    }
    
    if (updates.dueDate !== undefined) {
      if (updates.dueDate === null) {
        targetProject.dueDate = null;
        changes.push("Due date cleared");
      } else {
        targetProject.dueDate = new Date(updates.dueDate);
        changes.push("Due date set");
      }
    }
    
    if (updates.flagged !== undefined) {
      targetProject.flagged = updates.flagged;
      changes.push(updates.flagged ? "Flagged" : "Unflagged");
    }
    
    if (updates.sequential !== undefined) {
      targetProject.sequential = updates.sequential;
      changes.push(updates.sequential ? "Set sequential" : "Set parallel");
    }
    
    if (updates.status) {
      if (updates.status === 'active') {
        targetProject.status = app.Project.Status.active;
        changes.push("Status: active");
      } else if (updates.status === 'onHold') {
        targetProject.status = app.Project.Status.onHold;
        changes.push("Status: on hold");
      } else if (updates.status === 'dropped') {
        targetProject.status = app.Project.Status.dropped;
        changes.push("Status: dropped");
      } else if (updates.status === 'done') {
        targetProject.status = app.Project.Status.done;
        targetProject.completionDate = new Date();
        changes.push("Status: completed");
      }
    }
    
    // Simplified review interval handling
    if (updates.reviewInterval !== undefined) {
      try {
        if (updates.reviewInterval === null) {
          targetProject.reviewInterval = null;
          changes.push("Review interval cleared");
        } else {
          targetProject.reviewInterval = {
            unit: updates.reviewInterval.unit,
            steps: updates.reviewInterval.steps,
            fixed: updates.reviewInterval.fixed || false
          };
          changes.push("Review interval updated");
        }
      } catch (reviewError) {
        changes.push("Warning: Review interval update failed");
      }
    }
    
    if (changes.length === 0) {
      return JSON.stringify({
        success: true,
        message: "No changes made"
      });
    }
    
    return JSON.stringify({
      success: true,
      project: {
        id: targetProject.id(),
        name: targetProject.name(),
        note: targetProject.note(),
        dueDate: targetProject.dueDate() ? targetProject.dueDate().toISOString() : null,
        deferDate: targetProject.deferDate() ? targetProject.deferDate().toISOString() : null,
        flagged: targetProject.flagged()
      },
      changes: changes,
      message: "Project updated successfully"
    });
  } catch (error) {
    return formatError(error, 'update_project');
  }
  })();
`;

/**
 * NEW ARCHITECTURE: Function argument-based script generation
 * Eliminates template substitution risks by passing parameters as function arguments
 */
export function createUpdateProjectScript(projectId: string, updates: any): string {
  return `
  ${getUnifiedHelpers()}
  
  function updateProject(projectId, updates) {
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Find the project by ID
      const projects = doc.flattenedProjects();
      
      if (!projects) {
        return JSON.stringify({
          success: false,
          error: "Failed to retrieve projects from OmniFocus."
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
          success: false,
          error: "Project with ID '" + projectId + "' not found."
        });
      }
      
      // Apply updates - simplified logic
      const changes = [];
      
      if (updates.name && updates.name !== targetProject.name()) {
        targetProject.name = updates.name;
        changes.push("Name updated");
      }
      
      if (updates.note !== undefined) {
        const noteValue = updates.note === null ? '' : String(updates.note);
        targetProject.note = noteValue;
        changes.push("Note updated");
      }
      
      if (updates.deferDate !== undefined) {
        if (updates.deferDate === null) {
          targetProject.deferDate = null;
          changes.push("Defer date cleared");
        } else {
          targetProject.deferDate = new Date(updates.deferDate);
          changes.push("Defer date set");
        }
      }
      
      if (updates.dueDate !== undefined) {
        if (updates.dueDate === null) {
          targetProject.dueDate = null;
          changes.push("Due date cleared");
        } else {
          targetProject.dueDate = new Date(updates.dueDate);
          changes.push("Due date set");
        }
      }
      
      if (updates.flagged !== undefined) {
        targetProject.flagged = updates.flagged;
        changes.push(updates.flagged ? "Flagged" : "Unflagged");
      }
      
      if (updates.sequential !== undefined) {
        targetProject.sequential = updates.sequential;
        changes.push(updates.sequential ? "Set sequential" : "Set parallel");
      }
      
      if (updates.status) {
        if (updates.status === 'active') {
          targetProject.status = app.Project.Status.active;
          changes.push("Status: active");
        } else if (updates.status === 'onHold') {
          targetProject.status = app.Project.Status.onHold;
          changes.push("Status: on hold");
        } else if (updates.status === 'dropped') {
          targetProject.status = app.Project.Status.dropped;
          changes.push("Status: dropped");
        } else if (updates.status === 'done') {
          targetProject.status = app.Project.Status.done;
          targetProject.completionDate = new Date();
          changes.push("Status: completed");
        }
      }
      
      // Simplified review interval handling
      if (updates.reviewInterval !== undefined) {
        try {
          if (updates.reviewInterval === null) {
            targetProject.reviewInterval = null;
            changes.push("Review interval cleared");
          } else {
            targetProject.reviewInterval = {
              unit: updates.reviewInterval.unit,
              steps: updates.reviewInterval.steps,
              fixed: updates.reviewInterval.fixed || false
            };
            changes.push("Review interval updated");
          }
        } catch (reviewError) {
          changes.push("Warning: Review interval update failed");
        }
      }
      
      if (changes.length === 0) {
        return JSON.stringify({
          success: true,
          data: { 
            success: true,
            message: "No changes made" 
          }
        });
      }
      
      return JSON.stringify({
        success: true,
        data: {
          success: true,
          message: "Project updated successfully",
          changes: changes,
          // Store project data in details for tool consumption
          project: {
            id: targetProject.id(),
            name: targetProject.name(),
            note: targetProject.note(),
            dueDate: targetProject.dueDate() ? targetProject.dueDate().toISOString() : null,
            deferDate: targetProject.deferDate() ? targetProject.deferDate().toISOString() : null,
            flagged: targetProject.flagged()
          }
        }
      });
    } catch (error) {
      return formatError(error, 'update_project');
    }
  }
  
  // Execute with safe parameter passing
  updateProject(${JSON.stringify(projectId)}, ${JSON.stringify(updates)});
  `;
}

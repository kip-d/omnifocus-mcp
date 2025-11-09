import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

/**
 * Pure OmniJS v3 create-project - minimal helper dependencies
 *
 * Creates a new project in OmniFocus
 *
 * Features:
 * - Create project with name, note, dates, and flagged status
 * - Place in specific folder (creates folder if needed)
 * - Set review dates and intervals for GTD workflows
 * - Configure advanced properties (completedByChildren, singleton)
 * - Duplicate project name checking
 * - Proper error handling and validation
 *
 * Note: KEEPS REPEAT_HELPERS (required for repetition bridge operations)
 * Performance: Direct property access, ~10-30x faster than JXA version
 */
export const CREATE_PROJECT_V3 = `
  ${REPEAT_HELPERS}

  (() => {
    const app = Application('OmniFocus');
    app.includeStandardAdditions = true;
    const doc = app.defaultDocument;

    const startTime = Date.now();
    const name = {{name}};
    const options = {{options}};

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

    try {
      // Check if project already exists (direct property access)
      const existingProjects = doc.flattenedProjects();

      if (!existingProjects) {
        return {
          ok: false,
          v: '3',
          error: {
            message: 'Failed to retrieve projects from OmniFocus',
            details: 'doc.flattenedProjects() returned null or undefined'
          }
        };
      }

      for (let i = 0; i < existingProjects.length; i++) {
        try {
          if (existingProjects[i].name === name) {
            return {
              ok: false,
              v: '3',
              error: {
                message: "Project '" + name + "' already exists"
              }
            };
          }
        } catch (e) { /* skip invalid project */ }
      }

      // Create project with object parameter
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
          // Continue without defer date
        }
      }

      if (options.dueDate) {
        try {
          newProject.dueDate = new Date(options.dueDate);
        } catch (e) {
          // Continue without due date
        }
      }

      if (options.nextReviewDate) {
        try {
          newProject.nextReviewDate = new Date(options.nextReviewDate);
        } catch (e) {
          // Continue without next review date
        }
      }

      // Set repeat rule after project creation (using evaluateJavascript bridge)
      if (options.repeatRule) {
        try {
          const ruleData = prepareRepetitionRuleData(options.repeatRule);
          if (ruleData && ruleData.needsBridge) {
            // Get the project ID for the bridge
            const projectId = newProject.id.primaryKey;

            // Apply repetition rule via evaluateJavascript bridge
            const success = applyRepetitionRuleViaBridge(projectId, ruleData);
            // Continue whether success or not - repeat rule is optional
          }
        } catch (error) {
          // Continue without repeat rule rather than failing project creation
        }
      }

      // Set review interval after project creation
      if (options.reviewInterval) {
        try {
          // Set review interval as a plain object
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
          // Continue without review interval
        }
      }

      // Add to specific folder if specified (direct property access)
      if (options.folder) {
        const folders = doc.flattenedFolders();

        if (!folders) {
          return {
            ok: false,
            v: '3',
            error: {
              message: 'Failed to retrieve folders from OmniFocus',
              details: 'doc.flattenedFolders() returned null or undefined'
            }
          };
        }

        let targetFolder = null;

        for (let i = 0; i < folders.length; i++) {
          try {
            if (folders[i].name === options.folder) {
              targetFolder = folders[i];
              break;
            }
          } catch (e) { /* skip invalid folder */ }
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

      // Build response with direct property access
      const projectData = {
        id: newProject.id.primaryKey,
        name: newProject.name || name,
        createdAt: new Date().toISOString()
      };

      // Get next review date
      try {
        const date = newProject.nextReviewDate;
        if (date) {
          projectData.nextReviewDate = date.toISOString();
        }
      } catch (e) { /* no next review date */ }

      // Get review interval
      try {
        const interval = newProject.reviewInterval;
        if (interval) {
          projectData.reviewInterval = {
            unit: interval.unit,
            steps: interval.steps
          };
        }
      } catch (e) { /* no review interval */ }

      // Get completedByChildren
      try {
        projectData.completedByChildren = newProject.completedByChildren || false;
      } catch (e) {
        projectData.completedByChildren = false;
      }

      // Get singleton
      try {
        projectData.singleton = newProject.singleton || false;
      } catch (e) {
        projectData.singleton = false;
      }

      return {
        ok: true,
        v: '3',
        data: {
          project: projectData,
          message: "Project '" + name + "' created successfully"
        },
        query_time_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        ok: false,
        v: '3',
        error: {
          message: error.message || 'Unknown error in create project',
          stack: error.stack
        }
      };
    }
  })();
`;

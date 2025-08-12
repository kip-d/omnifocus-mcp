/**
 * Scripts for perspective-related operations
 */

import { OmniAutomation } from '../OmniAutomation.js';

/**
 * List all available perspectives with their details
 */
export const LIST_PERSPECTIVES_SCRIPT = {
  name: 'listPerspectives',
  description: 'Get all available perspectives with filter rules',

  omniFocusScript: `
    (() => {
      const result = {
        builtIn: [],
        custom: [],
        error: null
      };
      
      try {
        // Get built-in perspectives
        if (typeof Perspective !== "undefined") {
          // Built-in perspectives
          if (Perspective.BuiltIn && Perspective.BuiltIn.all) {
            result.builtIn = Perspective.BuiltIn.all.map(p => ({
              name: p.name,
              type: "builtin"
            }));
          }
          
          // Custom perspectives with filter rules
          if (Perspective.Custom && Perspective.Custom.all) {
            result.custom = Perspective.Custom.all.map(p => {
              const perspective = {
                name: p.name,
                identifier: p.identifier,
                type: "custom"
              };
              
              // Try to get filter rules
              try {
                if (p.archivedFilterRules) {
                  perspective.filterRules = p.archivedFilterRules;
                }
                if (p.archivedTopLevelFilterAggregation) {
                  perspective.filterAggregation = p.archivedTopLevelFilterAggregation;
                }
              } catch (e) {
                // Some perspectives might not have accessible rules
                perspective.filterRules = null;
              }
              
              return perspective;
            });
          }
        }
      } catch (e) {
        result.error = e.toString();
      }
      
      return JSON.stringify(result);
    })()
  `,

  jxaWrapper: (_builder: OmniAutomation) => {
    const jsCode = LIST_PERSPECTIVES_SCRIPT.omniFocusScript.replace(/\n/g, '\\n').replace(/"/g, '\\"');
    return `
      (() => {
        const app = Application('OmniFocus');
        app.includeStandardAdditions = true;
        
        try {
          const resultJson = app.evaluateJavascript("${jsCode}");
          const result = JSON.parse(resultJson);
          
          // Combine and format perspectives
          const perspectives = [];
          
          // Add built-in perspectives
          if (result.builtIn) {
            result.builtIn.forEach(p => {
              perspectives.push({
                name: p.name,
                type: 'builtin',
                identifier: null,
                filterRules: null
              });
            });
          }
          
          // Add custom perspectives
          if (result.custom) {
            result.custom.forEach(p => {
              perspectives.push({
                name: p.name,
                type: 'custom',
                identifier: p.identifier,
                filterRules: p.filterRules || null,
                filterAggregation: p.filterAggregation || 'all'
              });
            });
          }
          
          return JSON.stringify({
            perspectives: perspectives,
            count: perspectives.length,
            error: result.error
          }, null, 2);
        } catch (e) {
          return JSON.stringify({ error: e.toString() });
        }
      })()
    `;
  },
};

/**
 * Get tasks matching a specific perspective's filters
 */
export const QUERY_PERSPECTIVE_SCRIPT = {
  name: 'queryPerspective',
  description: 'Get tasks that would appear in a specific perspective',

  omniFocusScript: (perspectiveName: string, limit: number = 100) => `
    (() => {
      const result = {
        perspectiveName: "${perspectiveName}",
        tasks: [],
        filterRules: null,
        error: null
      };
      
      try {
        // First, try to find the perspective and get its rules
        let perspective = null;
        let rules = null;
        
        // Check built-in perspectives
        if (Perspective.BuiltIn) {
          const builtInNames = ["Inbox", "Projects", "Tags", "Forecast", "Flagged", "Nearby", "Review"];
          if (builtInNames.includes("${perspectiveName}")) {
            perspective = { name: "${perspectiveName}", type: "builtin" };
            // Set known rules for built-in perspectives
            switch("${perspectiveName}") {
              case "Flagged":
                rules = [{ actionStatus: "flagged" }, { actionAvailability: "remaining" }];
                break;
              case "Inbox":
                rules = [{ actionHasNoProject: true }, { actionAvailability: "remaining" }];
                break;
              // Add more built-in perspective rules as needed
            }
          }
        }
        
        // Check custom perspectives
        if (!perspective && Perspective.Custom) {
          const custom = Perspective.Custom.byName("${perspectiveName}");
          if (custom) {
            perspective = { name: custom.name, type: "custom", identifier: custom.identifier };
            try {
              if (custom.archivedFilterRules) {
                rules = custom.archivedFilterRules;
                result.filterRules = rules;
              }
            } catch (e) {
              // Rules not accessible
            }
          }
        }
        
        if (!perspective) {
          result.error = "Perspective not found: ${perspectiveName}";
          return JSON.stringify(result);
        }
        
        // Now query tasks based on the perspective type
        // This is a simplified implementation - full translation would be more complex
        let tasks = [];
        
        if ("${perspectiveName}" === "Flagged") {
          tasks = flattenedTasks.filter(t => t.flagged && !t.completed);
        } else if ("${perspectiveName}" === "Inbox") {
          tasks = flattenedTasks.filter(t => !t.project && !t.completed);
        } else if (rules) {
          // Try to apply custom rules
          tasks = flattenedTasks.filter(t => {
            if (!t.completed) {
              // Apply filter rules (simplified)
              for (const rule of rules) {
                if (rule.actionAvailability === "available" && !t.available) return false;
                if (rule.actionAvailability === "remaining" && t.completed) return false;
                if (rule.actionStatus === "flagged" && !t.flagged) return false;
                if (rule.actionStatus === "due" && !t.dueDate) return false;
                if (rule.actionHasNoProject === true && t.project) return false;
                if (rule.actionIsLeaf === true && t.hasChildren) return false;
              }
              return true;
            }
            return false;
          });
        } else {
          // Fallback to available tasks
          tasks = flattenedTasks.filter(t => t.available && !t.completed);
        }
        
        // Limit results
        tasks = tasks.slice(0, ${limit});
        
        // Format task data
        result.tasks = tasks.map(t => ({
          id: t.id.primaryKey,
          name: t.name,
          flagged: t.flagged,
          dueDate: t.dueDate ? t.dueDate.toISOString() : null,
          deferDate: t.deferDate ? t.deferDate.toISOString() : null,
          project: t.project ? t.project.name : null,
          available: t.available,
          hasChildren: t.hasChildren
        }));
        
        result.taskCount = result.tasks.length;
        
      } catch (e) {
        result.error = e.toString();
      }
      
      return JSON.stringify(result);
    })()
  `,

  jxaWrapper: (_builder: OmniAutomation, perspectiveName: string, limit: number = 100) => {
    const omniFocusCode = QUERY_PERSPECTIVE_SCRIPT.omniFocusScript(perspectiveName, limit);
    const jsCode = omniFocusCode.replace(/\n/g, '\\n').replace(/"/g, '\\"');

    return `
      (() => {
        const app = Application('OmniFocus');
        app.includeStandardAdditions = true;
        
        try {
          const resultJson = app.evaluateJavascript("${jsCode}");
          return resultJson;
        } catch (e) {
          return JSON.stringify({ error: e.toString() });
        }
      })()
    `;
  },
};

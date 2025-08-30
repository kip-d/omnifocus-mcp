import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to query tasks from a specific perspective
 * Uses evaluateJavascript bridge to apply perspective filters
 */
export const QUERY_PERSPECTIVE_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const perspectiveName = {{perspectiveName}};
    const limit = {{limit}} || 50;
    const includeDetails = {{includeDetails}} || false;
    
    try {
      // Use evaluateJavascript to query perspective tasks WITHOUT changing window
      const queryScript = \`
        (() => {
          const perspectiveName = \${JSON.stringify(perspectiveName)};
          const limit = \${limit};
          
          // Find the perspective without changing the window
          let perspective = null;
          let filterRules = null;
          let aggregation = "all";
          
          // Check built-in perspectives first
          const builtInNames = ["Inbox", "Projects", "Tags", "Forecast", "Flagged", "Nearby", "Review"];
          if (builtInNames.includes(perspectiveName)) {
            perspective = { name: perspectiveName, type: "builtin" };
            // Define known filter rules for built-in perspectives
            switch(perspectiveName) {
              case "Flagged":
                filterRules = [{actionStatus: "flagged"}, {actionAvailability: "remaining"}];
                aggregation = "all";
                break;
              case "Inbox":
                filterRules = [{actionHasNoProject: true}, {actionAvailability: "remaining"}];
                aggregation = "all";
                break;
              case "Forecast":
                filterRules = [{actionHasDueDate: true}, {actionAvailability: "remaining"}];
                aggregation = "all";
                break;
              case "Review":
                // Review is for projects, not tasks
                filterRules = [{actionIsProject: true}];
                aggregation = "all";
                break;
              case "Projects":
                filterRules = [{actionIsProjectOrGroup: true}];
                aggregation = "all";
                break;
              case "Tags":
                // Tags view shows all tasks grouped by tags
                filterRules = [{actionAvailability: "remaining"}];
                aggregation = "all";
                break;
            }
          } else {
            // Try to find custom perspective
            try {
              const customPerspective = Perspective.Custom.byName(perspectiveName);
              if (customPerspective) {
                perspective = {
                  name: customPerspective.name,
                  type: "custom",
                  identifier: customPerspective.identifier
                };
                filterRules = customPerspective.archivedFilterRules || [];
                aggregation = customPerspective.archivedTopLevelFilterAggregation || "all";
              }
            } catch (e) {
              // Custom perspective not found or not accessible
            }
          }
          
          if (!perspective) {
            return JSON.stringify({
              success: false,
              error: "Perspective not found: " + perspectiveName
            });
          }
          
          // Helper function to check if task matches a single rule
          function matchesRule(task, rule) {
            // Availability rules
            if (rule.actionAvailability) {
              switch(rule.actionAvailability) {
                case "available":
                  if (!task.available) return false;
                  break;
                case "remaining":
                  if (task.completed || task.dropped) return false;
                  break;
                case "completed":
                  if (!task.completed) return false;
                  break;
                case "dropped":
                  if (!task.dropped) return false;
                  break;
              }
            }
            
            // Status rules
            if (rule.actionStatus === "flagged" && !task.flagged) return false;
            if (rule.actionStatus === "due" && !task.dueDate) return false;
            
            // Date rules
            if (rule.actionHasDueDate === true && !task.dueDate) return false;
            if (rule.actionHasDueDate === false && task.dueDate) return false;
            if (rule.actionHasDeferDate === true && !task.deferDate) return false;
            if (rule.actionHasDeferDate === false && task.deferDate) return false;
            
            // Project/Group rules
            if (rule.actionHasNoProject === true && task.containingProject) return false;
            if (rule.actionHasNoProject === false && !task.containingProject) return false;
            if (rule.actionIsProject === true && !task.project) return false;
            if (rule.actionIsProjectOrGroup === true && !task.project && !task.hasChildren) return false;
            if (rule.actionIsLeaf === true && task.hasChildren) return false;
            if (rule.actionIsLeaf === false && !task.hasChildren) return false;
            
            // Tag rules
            if (rule.actionIsUntagged === true && task.tags && task.tags.length > 0) return false;
            if (rule.actionIsUntagged === false && (!task.tags || task.tags.length === 0)) return false;
            
            if (rule.actionHasAnyOfTags && rule.actionHasAnyOfTags.length > 0) {
              if (!task.tags || task.tags.length === 0) return false;
              const taskTagIds = task.tags.map(t => t.id.primaryKey);
              const hasAny = rule.actionHasAnyOfTags.some(tagId => taskTagIds.includes(tagId));
              if (!hasAny) return false;
            }
            
            return true;
          }
          
          // Helper function to apply all filter rules with aggregation
          function matchesAllRules(task, rules, aggregationType) {
            if (!rules || rules.length === 0) return true;
            
            if (aggregationType === "all") {
              // All rules must match
              return rules.every(rule => matchesRule(task, rule));
            } else if (aggregationType === "any") {
              // At least one rule must match
              return rules.some(rule => matchesRule(task, rule));
            } else if (aggregationType === "none") {
              // No rules should match
              return !rules.some(rule => matchesRule(task, rule));
            }
            
            return true;
          }
          
          // Now filter tasks based on perspective rules
          const allTasks = flattenedTasks;
          const tasks = [];
          let count = 0;
          
          for (const task of allTasks) {
            if (count >= limit) break;
            
            // Apply filter rules
            if (matchesAllRules(task, filterRules, aggregation)) {
              tasks.push({
                id: task.id.primaryKey,
                name: task.name,
                flagged: task.flagged,
                dueDate: task.dueDate ? task.dueDate.toISOString() : null,
                deferDate: task.deferDate ? task.deferDate.toISOString() : null,
                completed: task.completed || false,
                project: task.containingProject ? task.containingProject.name : null,
                available: task.available || false,
                tags: task.tags ? task.tags.map(t => t.name) : []
              });
              count++;
            }
          }
          
          return JSON.stringify({
            success: true,
            tasks: tasks,
            perspectiveName: perspective.name,
            perspectiveType: perspective.type,
            filterRules: filterRules,
            aggregation: aggregation,
            count: tasks.length
          });
        })()
      \`;
      
      const result = app.evaluateJavascript(queryScript);
      const parsed = JSON.parse(result);
      
      if (parsed.success) {
        // Convert task IDs back to JXA format and get full details if requested
        const tasks = [];
        const allTasks = doc.flattenedTasks();
        
        for (let i = 0; i < parsed.tasks.length; i++) {
          const perspectiveTask = parsed.tasks[i];
          
          // Find the actual task by ID
          for (let j = 0; j < allTasks.length; j++) {
            if (safeGet(() => allTasks[j].id()) === perspectiveTask.id) {
              const task = allTasks[j];
              tasks.push(serializeTask(task, includeDetails));
              break;
            }
          }
        }
        
        return JSON.stringify({
          perspectiveName: parsed.perspectiveName,
          tasks: tasks,
          metadata: {
            total_count: tasks.length,
            perspective_type: parsed.note || 'full',
            limit_applied: limit
          }
        });
      } else {
        return JSON.stringify({
          error: true,
          message: parsed.error || 'Failed to query perspective'
        });
      }
      
    } catch (error) {
      return formatError(error, 'query_perspective');
    }
  })();
`;

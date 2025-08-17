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
      // Use evaluateJavascript to query perspective tasks
      const queryScript = [
        '(() => {',
        '  const perspectiveName = "' + perspectiveName + '";',
        '  const limit = ' + limit + ';',
        '  ',
        '  // Find the perspective',
        '  const perspective = Perspective.all.find(p => ',
        '    p.name.toLowerCase() === perspectiveName.toLowerCase()',
        '  );',
        '  ',
        '  if (!perspective) {',
        '    return JSON.stringify({',
        '      success: false,',
        '      error: "Perspective not found: " + perspectiveName',
        '    });',
        '  }',
        '  ',
        '  try {',
        '    // Apply the perspective to get tasks',
        '    const window = document.windows[0];',
        '    window.perspective = perspective;',
        '    ',
        '    // Get the content from the current view',
        '    const content = window.content;',
        '    const tasks = [];',
        '    let count = 0;',
        '    ',
        '    // Extract tasks from the content',
        '    if (content && content.tasks) {',
        '      for (const task of content.tasks) {',
        '        if (count >= limit) break;',
        '        ',
        '        tasks.push({',
        '          id: task.id.primaryKey,',
        '          name: task.name,',
        '          flagged: task.flagged,',
        '          dueDate: task.dueDate ? task.dueDate.toISOString() : null,',
        '          project: task.containingProject ? task.containingProject.name : null',
        '        });',
        '        count++;',
        '      }',
        '    }',
        '    ',
        '    return JSON.stringify({',
        '      success: true,',
        '      tasks: tasks,',
        '      perspectiveName: perspective.name,',
        '      count: tasks.length',
        '    });',
        '  } catch (error) {',
        '    // Fallback: try to get tasks using perspective rules',
        '    const allTasks = Task.all;',
        '    const tasks = [];',
        '    let count = 0;',
        '    ',
        '    for (const task of allTasks) {',
        '      if (count >= limit) break;',
        '      ',
        '      // Apply basic perspective filters if available',
        '      if (perspective.filterRules) {',
        '        if (perspective.filterRules.available && !task.available) continue;',
        '        if (perspective.filterRules.flagged && !task.flagged) continue;',
        '      }',
        '      ',
        '      tasks.push({',
        '        id: task.id.primaryKey,',
        '        name: task.name,',
        '        flagged: task.flagged',
        '      });',
        '      count++;',
        '    }',
        '    ',
        '    return JSON.stringify({',
        '      success: true,',
        '      tasks: tasks,',
        '      perspectiveName: perspectiveName,',
        '      count: tasks.length,',
        '      note: "Using simplified filter rules"',
        '    });',
        '  }',
        '})()'
      ].join('');
      
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
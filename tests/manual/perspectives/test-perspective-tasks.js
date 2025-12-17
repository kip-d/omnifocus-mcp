(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;

  try {
    // Try to get tasks from a specific perspective using evaluateJavascript
    const jsCode = `
      (() => {
        const result = {
          perspectives: [],
          windows: []
        };
        
        // List all perspectives with details
        if (typeof Perspective !== "undefined") {
          // Get custom perspectives
          if (Perspective.Custom && Perspective.Custom.all) {
            result.perspectives = Perspective.Custom.all.map(p => ({
              name: p.name,
              identifier: p.identifier,
              type: "custom"
            }));
          }
          
          // Add built-in perspectives
          if (Perspective.BuiltIn && Perspective.BuiltIn.all) {
            const builtIn = Perspective.BuiltIn.all.map(p => ({
              name: p.name,
              type: "builtin"
            }));
            result.perspectives = result.perspectives.concat(builtIn);
          }
        }
        
        // Check windows and their perspectives
        if (typeof Document !== "undefined" && Document.windows) {
          result.windows = Document.windows.map(w => {
            const info = {
              id: w.id,
              isTab: w.isTab
            };
            
            // Try to get the window's current perspective
            if (w.perspective) {
              info.perspectiveName = w.perspective.name;
            }
            
            // Try to get selected tasks (what's visible in the perspective)
            if (w.selection && w.selection.tasks) {
              info.selectedTaskCount = w.selection.tasks.length;
              // Get first few task names as sample
              info.sampleTasks = w.selection.tasks.slice(0, 3).map(t => t.name);
            }
            
            // Try to get content (what's displayed in the perspective)
            if (w.content && w.content.tasks) {
              info.contentTaskCount = w.content.tasks.length;
              info.sampleContent = w.content.tasks.slice(0, 3).map(t => t.name);
            }
            
            return info;
          });
        }
        
        // Try to switch to a specific perspective and get its tasks
        const testPerspectiveName = "Flagged"; // Built-in perspective for testing
        try {
          const perspective = Perspective.BuiltIn.Flagged;
          if (perspective && Document.windows.length > 0) {
            const window = Document.windows[0];
            // Try to set the perspective
            window.perspective = perspective;
            result.switchedTo = testPerspectiveName;
            
            // Now try to get the tasks in this perspective
            if (window.content && window.content.tasks) {
              result.flaggedTasks = window.content.tasks.map(t => ({
                name: t.name,
                flagged: t.flagged,
                dueDate: t.dueDate ? t.dueDate.toISOString() : null
              }));
            }
          }
        } catch (e) {
          result.switchError = e.toString();
        }
        
        return JSON.stringify(result);
      })()
    `;

    const resultJson = app.evaluateJavascript(jsCode);
    const result = JSON.parse(resultJson);

    return JSON.stringify(result, null, 2);
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  }
})();

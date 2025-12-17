(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;

  try {
    const jsCode = `
      (() => {
        const result = {
          perspectiveName: "Flagged",
          tasks: [],
          error: null
        };
        
        try {
          // Get flagged tasks
          const tasks = flattenedTasks.filter(t => t.flagged && !t.completed);
          result.taskCount = tasks.length;
          result.tasks = tasks.slice(0, 5).map(t => ({
            name: t.name,
            flagged: t.flagged
          }));
        } catch (e) {
          result.error = e.toString();
        }
        
        return JSON.stringify(result);
      })()
    `;

    const resultJson = app.evaluateJavascript(jsCode);
    return resultJson;
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  }
})();

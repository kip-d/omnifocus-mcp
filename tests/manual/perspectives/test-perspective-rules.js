(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;

  try {
    const jsCode = `
      (() => {
        const result = {
          perspectives: []
        };
        
        // Try to get custom perspective details including filter rules
        if (typeof Perspective !== "undefined" && Perspective.Custom && Perspective.Custom.all) {
          result.perspectives = Perspective.Custom.all.map(p => {
            const info = {
              name: p.name,
              identifier: p.identifier
            };
            
            // Try to get archived filter rules (mentioned in API)
            try {
              if (p.archivedFilterRules) {
                info.filterRules = p.archivedFilterRules;
              }
            } catch (e) {
              info.filterError = e.toString();
            }
            
            // Try to get top level filter aggregation
            try {
              if (p.archivedTopLevelFilterAggregation) {
                info.filterAggregation = p.archivedTopLevelFilterAggregation;
              }
            } catch (e) {
              info.aggregationError = e.toString();
            }
            
            // Try to get file representation (might contain rules)
            try {
              if (p.fileWrapper) {
                const wrapper = p.fileWrapper();
                if (wrapper) {
                  // Try to get the contents
                  info.hasFileWrapper = true;
                }
              }
            } catch (e) {
              info.wrapperError = e.toString();
            }
            
            return info;
          });
        }
        
        // Also check if we can query tasks matching built-in perspective logic
        // For example, Flagged perspective should match flagged tasks
        const flaggedTest = {
          perspectiveName: "Flagged"
        };
        
        try {
          // Count flagged tasks the hard way
          const allTasks = flattenedTasks.filter(t => !t.completed && t.flagged);
          flaggedTest.flaggedTaskCount = allTasks.length;
          flaggedTest.sampleTasks = allTasks.slice(0, 3).map(t => ({
            name: t.name,
            dueDate: t.dueDate ? t.dueDate.toISOString() : null
          }));
        } catch (e) {
          flaggedTest.error = e.toString();
        }
        
        result.flaggedTest = flaggedTest;
        
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

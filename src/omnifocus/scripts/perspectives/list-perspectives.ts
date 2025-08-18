import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to list all available perspectives in OmniFocus
 * Uses evaluateJavascript bridge to access perspective information
 */
export const LIST_PERSPECTIVES_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    try {
      // Use evaluateJavascript to get perspective information
      const perspectiveScript = [
        '(() => {',
        '  const result = {',
        '    builtIn: [],',
        '    custom: [],',
        '    error: null',
        '  };',
        '  ',
        '  try {',
        '    // Get built-in perspectives',
        '    if (typeof Perspective !== "undefined") {',
        '      // Built-in perspectives',
        '      const builtInNames = ["Inbox", "Projects", "Tags", "Forecast", "Flagged", "Nearby", "Review"];',
        '      for (const name of builtInNames) {',
        '        result.builtIn.push({',
        '          name: name,',
        '          type: "builtin",',
        '          isBuiltIn: true',
        '        });',
        '      }',
        '      ',
        '      // Custom perspectives with filter rules',
        '      if (Perspective.Custom && Perspective.Custom.all) {',
        '        result.custom = Perspective.Custom.all.map(p => {',
        '          const perspective = {',
        '            name: p.name,',
        '            identifier: p.identifier,',
        '            type: "custom",',
        '            isBuiltIn: false',
        '          };',
        '          ',
        '          // Try to get filter rules',
        '          try {',
        '            if (p.archivedFilterRules) {',
        '              perspective.filterRules = p.archivedFilterRules;',
        '            }',
        '            if (p.archivedTopLevelFilterAggregation) {',
        '              perspective.filterAggregation = p.archivedTopLevelFilterAggregation;',
        '            }',
        '          } catch (e) {',
        '            // Some perspectives might not have accessible rules',
        '            perspective.filterRules = null;',
        '          }',
        '          ',
        '          return perspective;',
        '        });',
        '      }',
        '    }',
        '  } catch (e) {',
        '    result.error = e.toString();',
        '  }',
        '  ',
        '  return JSON.stringify(result);',
        '})()'
      ].join('');
      
      const result = app.evaluateJavascript(perspectiveScript);
      const parsed = JSON.parse(result);
      
      // Combine and format perspectives
      const perspectives = [];
      
      // Add built-in perspectives
      if (parsed.builtIn) {
        parsed.builtIn.forEach(p => {
          perspectives.push({
            name: p.name,
            type: 'builtin',
            isBuiltIn: true,
            identifier: null,
            filterRules: null
          });
        });
      }
      
      // Add custom perspectives
      if (parsed.custom) {
        parsed.custom.forEach(p => {
          perspectives.push({
            name: p.name,
            type: 'custom',
            isBuiltIn: false,
            identifier: p.identifier,
            filterRules: p.filterRules || null,
            filterAggregation: p.filterAggregation || 'all'
          });
        });
      }
      
      return JSON.stringify({
        perspectives: perspectives,
        count: perspectives.length,
        error: parsed.error
      });
    } catch (error) {
      return formatError(error, 'list_perspectives');
    }
  })();
`;
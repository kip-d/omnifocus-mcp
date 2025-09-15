import { getMinimalHelpers } from '../shared/helpers.js';

/**
 * Script to list all available perspectives in OmniFocus
 * Uses direct JXA access to perspective objects
 */
export const LIST_PERSPECTIVES_SCRIPT = `
  ${getMinimalHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    try {
      const perspectives = [];
      
      // First, add known built-in perspectives
      const builtInNames = ["Inbox", "Projects", "Tags", "Forecast", "Flagged", "Review"];
      builtInNames.forEach(name => {
        perspectives.push({
          name: name,
          type: 'builtin',
          isBuiltIn: true,
          identifier: null,
          filterRules: null
        });
      });
      
      // Try to access custom perspectives via JXA
      try {
        const allPerspectives = doc.perspectives();
        
        if (allPerspectives && allPerspectives.length > 0) {
          for (let i = 0; i < allPerspectives.length; i++) {
            try {
              const p = allPerspectives[i];
              const name = safeGet(() => p.name(), '');
              
              // Skip empty names and built-in perspectives we already added
              if (name && !builtInNames.includes(name)) {
                perspectives.push({
                  name: name,
                  type: 'custom',
                  isBuiltIn: false,
                  identifier: safeGet(() => p.id()),
                  filterRules: null // JXA doesn't expose filter rules directly
                });
              }
            } catch (e) {
              // Skip perspectives that can't be accessed
            }
          }
        }
      } catch (e) {
        // If perspectives() doesn't work, we still have built-ins
        console.log('Could not access custom perspectives:', e.message);
      }
      
      return JSON.stringify({
        items: perspectives,
        summary: {
          total: perspectives.length,
          insights: ["Found " + perspectives.length + " perspectives (" + perspectives.filter(p => p.isBuiltIn).length + " built-in, " + perspectives.filter(p => !p.isBuiltIn).length + " custom)"]
        }
      });
    } catch (error) {
      return formatError(error, 'list_perspectives');
    }
  })();
`;

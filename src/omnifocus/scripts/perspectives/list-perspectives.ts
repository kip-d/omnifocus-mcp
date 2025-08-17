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
        '  const perspectives = [];',
        '  ',
        '  // Get all perspectives from the document',
        '  const allPerspectives = Perspective.all;',
        '  ',
        '  for (const perspective of allPerspectives) {',
        '    try {',
        '      const perspectiveData = {',
        '        name: perspective.name,',
        '        identifier: perspective.identifier,',
        '        isBuiltIn: perspective.isBuiltIn,',
        '        ',
        '        // Get filter rules if available',
        '        filterRules: {}',
        '      };',
        '      ',
        '      // Try to extract filter information',
        '      if (perspective.filterRules) {',
        '        perspectiveData.filterRules = {',
        '          available: perspective.filterRules.available || null,',
        '          flagged: perspective.filterRules.flagged || null,',
        '          duration: perspective.filterRules.duration || null,',
        '          tags: perspective.filterRules.tags || []',
        '        };',
        '      }',
        '      ',
        '      perspectives.push(perspectiveData);',
        '    } catch (e) {',
        '      // Skip perspectives we cannot read',
        '    }',
        '  }',
        '  ',
        '  return JSON.stringify({',
        '    success: true,',
        '    perspectives: perspectives,',
        '    count: perspectives.length',
        '  });',
        '})()'
      ].join('');
      
      const result = app.evaluateJavascript(perspectiveScript);
      const parsed = JSON.parse(result);
      
      if (parsed.success) {
        return JSON.stringify({
          perspectives: parsed.perspectives,
          metadata: {
            total_count: parsed.count,
            has_custom: parsed.perspectives.some(p => !p.isBuiltIn)
          }
        });
      } else {
        // Fallback to JXA perspective windows
        const windows = app.documentWindows();
        const perspectives = [];
        
        for (let i = 0; i < windows.length; i++) {
          try {
            const window = windows[i];
            const perspectiveName = safeGet(() => window.perspectiveName());
            if (perspectiveName) {
              perspectives.push({
                name: perspectiveName,
                isActive: i === 0
              });
            }
          } catch (e) {
            // Skip windows we can't read
          }
        }
        
        return JSON.stringify({
          perspectives: perspectives,
          metadata: {
            total_count: perspectives.length,
            note: 'Limited perspective information available via JXA'
          }
        });
      }
      
    } catch (error) {
      return formatError(error, 'list_perspectives');
    }
  })();
`;
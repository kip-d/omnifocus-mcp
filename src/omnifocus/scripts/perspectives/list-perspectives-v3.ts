/**
 * Pure OmniJS v3 - List Perspectives Script
 *
 * Zero helper dependencies - direct property access
 *
 * Features:
 * - Lists all available perspectives (built-in and custom)
 * - Direct JXA property access with inline error handling
 */
export const LIST_PERSPECTIVES_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();

    const startTime = Date.now();

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

      // Try to access custom perspectives via JXA (direct property access)
      try {
        const allPerspectives = doc.perspectives();

        if (allPerspectives && allPerspectives.length > 0) {
          for (let i = 0; i < allPerspectives.length; i++) {
            try {
              const p = allPerspectives[i];

              // Direct property access with try/catch
              let name = '';
              try {
                name = p.name();
              } catch (e) {
                // Skip if name can't be accessed
                continue;
              }

              // Skip empty names and built-in perspectives we already added
              if (name && !builtInNames.includes(name)) {
                let identifier = null;
                try {
                  identifier = p.id();
                } catch (e) {
                  // identifier might not be accessible
                }

                perspectives.push({
                  name: name,
                  type: 'custom',
                  isBuiltIn: false,
                  identifier: identifier,
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
      }

      // V3 response format
      return {
        ok: true,
        v: '3',
        data: {
          items: perspectives,
          summary: {
            total: perspectives.length,
            insights: [
              "Found " + perspectives.length + " perspectives (" +
              perspectives.filter(p => p.isBuiltIn).length + " built-in, " +
              perspectives.filter(p => !p.isBuiltIn).length + " custom)"
            ]
          }
        },
        query_time_ms: Date.now() - startTime
      };
    } catch (error) {
      return {
        ok: false,
        v: '3',
        error: {
          message: error.message || String(error),
          stack: error.stack,
          operation: 'list_perspectives'
        }
      };
    }
  })();
`;

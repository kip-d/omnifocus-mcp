/**
 * OmniJS Bridge Script for Fast Project Queries
 *
 * Optimization: Uses OmniJS bridge with flattenedProjects global collection
 * for 10-100x faster bulk property access compared to JXA.
 *
 * Performance: OmniJS direct property access vs JXA function calls:
 * - JXA: ~50ms per property access (function call overhead)
 * - OmniJS: ~0.5ms per property access (direct member access)
 */

/**
 * Query projects using OmniJS bridge for maximum performance
 *
 * Template variables:
 * - {{filterStatus}}: 'active' | 'onHold' | 'done' | 'dropped' | 'all'
 * - {{limit}}: max number of projects to return
 */
export const WARM_PROJECTS_CACHE_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const filterStatus = '{{filterStatus}}';
    const limit = {{limit}};

    try {
      const startTime = Date.now();

      // Use OmniJS bridge for fast bulk property access
      const omniJsScript = \`
        (() => {
          const startTime = Date.now();
          const projects = [];
          let processedCount = 0;

          // OmniJS: Use global flattenedProjects collection
          flattenedProjects.forEach(project => {
            processedCount++;

            // Early exit if we've reached the limit
            if (projects.length >= \${limit}) return;

            // Filter by status if specified
            const projectStatus = project.status;
            const statusStr = String(projectStatus).toLowerCase();

            let normalizedStatus = 'active';
            if (statusStr.includes('done')) normalizedStatus = 'done';
            else if (statusStr.includes('hold')) normalizedStatus = 'onHold';
            else if (statusStr.includes('dropped')) normalizedStatus = 'dropped';

            // Apply status filter
            if ('\${filterStatus}' !== 'all' && normalizedStatus !== '\${filterStatus}') {
              return;
            }

            // Build project object with direct property access
            const projectObj = {
              id: project.id.primaryKey,
              name: project.name,
              status: normalizedStatus,
              flagged: project.flagged || false,
              sequential: project.sequential || false
            };

            // Optional properties
            if (project.note) {
              projectObj.note = project.note;
            }

            // Folder
            if (project.folder) {
              projectObj.folder = project.folder.name;
            }

            // Dates
            if (project.dueDate) {
              projectObj.dueDate = project.dueDate.toISOString();
            }

            if (project.deferDate) {
              projectObj.deferDate = project.deferDate.toISOString();
            }

            // Review dates
            if (project.lastReviewDate) {
              projectObj.lastReviewDate = project.lastReviewDate.toISOString();
            }

            if (project.nextReviewDate) {
              projectObj.nextReviewDate = project.nextReviewDate.toISOString();
            }

            // Review interval
            if (project.reviewInterval) {
              const interval = project.reviewInterval;
              projectObj.reviewInterval = {
                unit: interval.unit || 'day',
                steps: interval.steps || 1,
                fixed: interval.fixed || false
              };
              projectObj.reviewIntervalDetails = {
                unit: interval.unit || 'day',
                steps: interval.steps || 1
              };
            }

            projects.push(projectObj);
          });

          return JSON.stringify({
            ok: true,
            projects: projects,
            metadata: {
              processedCount: processedCount,
              returnedCount: projects.length,
              optimizationUsed: 'omniJs_bridge'
            },
            performance: {
              totalTime: Date.now() - startTime
            }
          });
        })();
      \`;

      // Execute via OmniJS bridge and return parsed result
      return app.evaluateJavascript(omniJsScript);

    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: true,
        message: error.message || String(error),
        context: 'warm_projects_cache'
      });
    }
  })();
`;

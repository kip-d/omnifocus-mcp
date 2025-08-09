import { z } from 'zod';
import { BaseTool } from '../base.js';
import { DiagnosticOmniAutomation } from '../../omnifocus/DiagnosticOmniAutomation.js';
import { RunDiagnosticsSchema } from '../schemas/system-schemas.js';

export class RunDiagnosticsTool extends BaseTool<typeof RunDiagnosticsSchema> {
  name = 'run_diagnostics';
  description = 'Run diagnostics to identify OmniFocus connection issues. Tests permissions, script execution, and data access. Optionally provide testScript for custom diagnostics.';
  schema = RunDiagnosticsSchema;

  private diagnosticOmni: DiagnosticOmniAutomation;

  constructor(cache: any) {
    super(cache);
    this.diagnosticOmni = new DiagnosticOmniAutomation();
  }

  async executeValidated(args: z.infer<typeof RunDiagnosticsSchema>): Promise<any> {
    const results: any = {
      timestamp: new Date().toISOString(),
      tests: {},
    };

    try {
      // Test 1: Basic connection
      this.logger.info('Running Test 1: Basic Connection');
      const basicScript = `
        return JSON.stringify({
          test: 'basic_connection',
          appName: app.name(),
          docAvailable: doc ? true : false
        });
      `;

      try {
        const result = await this.diagnosticOmni.execute<any>(basicScript);
        results.tests.basic_connection = {
          success: true,
          result: result,
        };
      } catch (error: any) {
        results.tests.basic_connection = {
          success: false,
          error: error.message,
          stderr: error.stderr,
        };
      }

      // Test 2: Collection access
      this.logger.info('Running Test 2: Collection Access');
      const collectionScript = `
        const collections = {};
        
        try {
          const tasks = doc.flattenedTasks();
          collections.tasks = {
            type: typeof tasks,
            isNull: tasks === null,
            isUndefined: tasks === undefined,
            length: tasks ? tasks.length : 'N/A'
          };
        } catch (e) {
          collections.tasks = { error: e.toString() };
        }
        
        try {
          const projects = doc.flattenedProjects();
          collections.projects = {
            type: typeof projects,
            isNull: projects === null,
            isUndefined: projects === undefined,
            length: projects ? projects.length : 'N/A'
          };
        } catch (e) {
          collections.projects = { error: e.toString() };
        }
        
        try {
          const tags = doc.flattenedTags();
          collections.tags = {
            type: typeof tags,
            isNull: tags === null,
            isUndefined: tags === undefined,
            length: tags ? tags.length : 'N/A'
          };
        } catch (e) {
          collections.tags = { error: e.toString() };
        }
        
        return JSON.stringify({
          test: 'collection_access',
          collections: collections
        });
      `;

      try {
        const result = await this.diagnosticOmni.execute<any>(collectionScript);
        results.tests.collection_access = {
          success: true,
          result: result,
        };
      } catch (error: any) {
        results.tests.collection_access = {
          success: false,
          error: error.message,
          stderr: error.stderr,
        };
      }

      // Test 3: Property access
      this.logger.info('Running Test 3: Property Access');
      const propertyScript = `
        const tests = [];
        
        try {
          const tasks = doc.flattenedTasks();
          if (tasks && tasks.length > 0) {
            const firstTask = tasks[0];
            tests.push({
              test: 'task_id',
              success: true,
              value: firstTask.id()
            });
            
            tests.push({
              test: 'task_name',
              success: true,
              value: firstTask.name()
            });
            
            tests.push({
              test: 'task_completed',
              success: true,
              value: firstTask.completed()
            });
          } else {
            tests.push({
              test: 'no_tasks',
              success: false,
              reason: 'No tasks available'
            });
          }
        } catch (e) {
          tests.push({
            test: 'property_access_error',
            success: false,
            error: e.toString()
          });
        }
        
        return JSON.stringify({
          test: 'property_access',
          tests: tests
        });
      `;

      try {
        const result = await this.diagnosticOmni.execute<any>(propertyScript);
        results.tests.property_access = {
          success: true,
          result: result,
        };
      } catch (error: any) {
        results.tests.property_access = {
          success: false,
          error: error.message,
          stderr: error.stderr,
        };
      }

      // Test 4: Run actual LIST_TASKS_SCRIPT
      if (args.testScript === 'list_tasks') {
        this.logger.info('Running Test 4: Actual LIST_TASKS_SCRIPT');
        const { LIST_TASKS_SCRIPT } = await import('../../omnifocus/scripts/tasks.js');
        const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, {
          filter: { limit: 1 },
        });

        try {
          const result = await this.diagnosticOmni.execute<any>(script);
          results.tests.list_tasks_script = {
            success: true,
            result: result,
          };
        } catch (error: any) {
          results.tests.list_tasks_script = {
            success: false,
            error: error.message,
            stderr: error.stderr,
          };
        }
      }

      // Add diagnostic logs
      results.diagnostic_logs = this.diagnosticOmni.getDiagnosticLog();

      return {
        success: true,
        data: results,
        metadata: {
          operation: 'run_diagnostics',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}

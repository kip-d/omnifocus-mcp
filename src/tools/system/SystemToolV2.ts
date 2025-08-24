import { z } from 'zod';
import { BaseTool } from '../base.js';
import { getVersionInfo } from '../../utils/version.js';
import { DiagnosticOmniAutomation } from '../../omnifocus/DiagnosticOmniAutomation.js';
import { createSuccessResponse, createErrorResponse, OperationTimer, StandardResponse } from '../../utils/response-format.js';

// Consolidated schema for all system operations
const SystemToolSchema = z.object({
  operation: z.enum(['version', 'diagnostics'])
    .default('version')
    .describe('Operation to perform: get version info or run diagnostics'),

  // Diagnostics operation parameters
  testScript: z.string()
    .optional()
    .default('list_tasks')
    .describe('Optional custom script to test for diagnostics (defaults to basic list_tasks)'),
});

interface VersionInfo {
  name: string;
  version: string;
  description: string;
  build: {
    hash: string;
    branch: string;
    commitDate: string;
    commitMessage: string;
    dirty: boolean;
    timestamp: string;
    buildId: string;
  };
  runtime: {
    node: string;
    platform: string;
    arch: string;
  };
  git: {
    repository: string;
    homepage: string;
  };
}

interface DiagnosticsResult {
  timestamp: string;
  tests: {
    [key: string]: {
      success: boolean;
      result?: any;
      error?: string;
      stderr?: string;
    };
  };
}

type SystemResponse = StandardResponse<VersionInfo | DiagnosticsResult>;

export class SystemToolV2 extends BaseTool<typeof SystemToolSchema> {
  name = 'system';
  description = 'System utilities for OmniFocus MCP: get version information or run diagnostics. Use operation="version" for version info, operation="diagnostics" to test OmniFocus connection.';
  schema = SystemToolSchema;

  private diagnosticOmni: DiagnosticOmniAutomation;

  constructor(cache: any) {
    super(cache);
    this.diagnosticOmni = new DiagnosticOmniAutomation();
  }

  async executeValidated(args: z.infer<typeof SystemToolSchema>): Promise<SystemResponse> {
    const { operation } = args;

    switch (operation) {
      case 'version':
        return this.getVersion();
      case 'diagnostics':
        return this.runDiagnostics(args);
      default:
        return createErrorResponse(
          'system',
          'INVALID_OPERATION',
          `Invalid operation: ${operation}`,
          { operation },
          { executionTime: 0 },
        );
    }
  }

  private async getVersion(): Promise<StandardResponse<VersionInfo>> {
    const timer = new OperationTimer();

    try {
      const versionInfo = getVersionInfo();
      return createSuccessResponse(
        'system',
        versionInfo,
        {
          ...timer.toMetadata(),
          operation: 'version',
        },
      );
    } catch (error) {
      return createErrorResponse(
        'system',
        'VERSION_ERROR',
        error instanceof Error ? error.message : 'Failed to get version info',
        { operation: 'version' },
        timer.toMetadata(),
      );
    }
  }

  private async runDiagnostics(args: z.infer<typeof SystemToolSchema>): Promise<StandardResponse<DiagnosticsResult>> {
    const timer = new OperationTimer();
    const results: DiagnosticsResult = {
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

      // Test 4: Run actual LIST_TASKS_SCRIPT if requested
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

      // Determine overall health
      const allSuccessful = Object.values(results.tests).every(test => test.success);

      return createSuccessResponse(
        'system',
        results,
        {
          ...timer.toMetadata(),
          operation: 'diagnostics',
          health: allSuccessful ? 'healthy' : 'degraded',
          testScript: args.testScript,
        },
      );

    } catch (error) {
      return createErrorResponse(
        'system',
        'DIAGNOSTICS_ERROR',
        error instanceof Error ? error.message : 'Failed to run diagnostics',
        { operation: 'diagnostics' },
        timer.toMetadata(),
      );
    }
  }
}
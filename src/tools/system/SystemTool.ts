import { z } from 'zod';
import { BaseTool } from '../base.js';
import { getVersionInfo } from '../../utils/version.js';
import { getVersionInfo as getOmniFocusVersionInfo } from '../../omnifocus/version-detection.js';
import { DiagnosticOmniAutomation } from '../../omnifocus/DiagnosticOmniAutomation.js';
import {
  createSuccessResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
  StandardResponseV2,
} from '../../utils/response-format.js';
import { getSystemMetrics, getMetricsSummary } from '../../utils/metrics.js';

// Consolidated schema for all system operations
const SystemToolSchema = z.object({
  operation: z
    .enum(['version', 'diagnostics', 'metrics', 'cache'])
    .default('version')
    .describe(
      'Operation to perform: get version info, run diagnostics, get performance metrics, or get cache statistics',
    ),

  // Diagnostics operation parameters
  testScript: z
    .string()
    .optional()
    .default('list_tasks')
    .describe('Optional custom script to test for diagnostics (defaults to basic list_tasks)'),

  // Metrics operation parameters
  metricsType: z
    .enum(['summary', 'detailed'])
    .optional()
    .default('summary')
    .describe('Type of metrics to return: summary for overview, detailed for full metrics'),

  // Cache operation parameters
  cacheAction: z
    .enum(['stats', 'clear'])
    .optional()
    .default('stats')
    .describe('Cache action: stats to get statistics, clear to invalidate all cached data'),
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
      result?: unknown;
      error?: string;
      stderr?: string;
    };
  };
}

interface MetricsResult {
  timestamp: string;
  type: 'summary' | 'detailed';
  data: unknown; // Will be either SystemMetrics or MetricsSummary
}

type SystemResponse = StandardResponseV2<VersionInfo | DiagnosticsResult | MetricsResult | Record<string, unknown>>;

export class SystemTool extends BaseTool<typeof SystemToolSchema> {
  name = 'system';
  description =
    'System utilities for OmniFocus MCP: get version information, run diagnostics, view performance metrics, or get cache statistics. Use operation="version" for version info, operation="diagnostics" to test OmniFocus connection, operation="metrics" for performance analytics, operation="cache" for cache statistics.';
  schema = SystemToolSchema;
  meta = {
    // Phase 1: Essential metadata
    category: 'Utility' as const,
    stability: 'stable' as const,
    complexity: 'simple' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'read-only', 'diagnostics', 'system'],
    capabilities: ['version', 'diagnostics', 'metrics', 'health-check'],

    // Phase 2: Capability & Performance Documentation
    maxResults: null, // System tool returns single result object
    maxQueryDuration: 5000, // 5 seconds
    requiresPermission: true,
    requiredCapabilities: ['read'],
    limitations: [
      'Version operation returns build and runtime information',
      'Diagnostics operation tests OmniFocus connection (may add 1-2 seconds)',
      'Metrics operation shows performance statistics and cache hit rates',
      'Cache statistics available but minimal overhead',
    ],
  };

  annotations = {
    title: 'System Utilities',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };

  private diagnosticOmni: DiagnosticOmniAutomation;

  constructor(cache: import('../../cache/CacheManager.js').CacheManager) {
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
      case 'metrics':
        return this.getMetrics(args);
      case 'cache':
        return this.handleCacheOperation(args);
      default:
        return createErrorResponseV2(
          'system',
          'INVALID_OPERATION',
          `Invalid operation: ${String(operation)}`,
          undefined,
          { operation },
          { executionTime: 0 },
        );
    }
  }

  private async getVersion(): Promise<StandardResponseV2<VersionInfo>> {
    const timer = new OperationTimerV2();

    try {
      const versionInfo = getVersionInfo();

      // Get OmniFocus version for metadata
      const omniFocusVersion = await getOmniFocusVersionInfo();

      return createSuccessResponseV2('system', versionInfo, undefined, {
        ...timer.toMetadata(),
        operation: 'version',
        omnifocus_version: omniFocusVersion.version.version,
        omnifocus_features: {
          plannedDates: omniFocusVersion.features.hasPlannedDates,
          mutuallyExclusiveTags: omniFocusVersion.features.hasMutuallyExclusiveTags,
          enhancedRepeats: omniFocusVersion.features.hasEnhancedRepeats,
        },
      });
    } catch (error) {
      return createErrorResponseV2(
        'system',
        'VERSION_ERROR',
        error instanceof Error ? error.message : 'Failed to get version info',
        undefined,
        { operation: 'version' },
        timer.toMetadata(),
      );
    }
  }

  private async runDiagnostics(args: z.infer<typeof SystemToolSchema>): Promise<StandardResponseV2<DiagnosticsResult>> {
    const timer = new OperationTimerV2();
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
        const result: unknown = await this.diagnosticOmni.execute(basicScript);
        results.tests.basic_connection = {
          success: true,
          result,
        };
      } catch (error: unknown) {
        const err = error as { message?: string; stderr?: string };
        results.tests.basic_connection = {
          success: false,
          error: err.message || 'Unknown error',
          stderr: err.stderr,
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
        // Prefer plain execute so tests can mock without schema
        const result = await this.diagnosticOmni.execute(collectionScript);
        results.tests.collection_access = {
          success: true,
          result,
        };
      } catch (error: unknown) {
        const err = error as { message?: string; stderr?: string };
        results.tests.collection_access = {
          success: false,
          error: err.message || 'Unknown error',
          stderr: err.stderr,
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
        const result = await this.diagnosticOmni.execute(propertyScript);
        results.tests.property_access = {
          success: true,
          result,
        };
      } catch (error: unknown) {
        const err = error as { message?: string; stderr?: string };
        results.tests.property_access = {
          success: false,
          error: err.message || 'Unknown error',
          stderr: err.stderr,
        };
      }

      // Test 4: Method Availability (for analytics tools)
      this.logger.info('Running Test 4: Method Availability');
      const methodScript = `
        const methodTests = {};

        try {
          const tasks = doc.flattenedTasks();
          if (tasks && tasks.length > 0) {
            const firstTask = tasks[0];

            // Test methods used by analytics tools
            methodTests.blocked = {
              available: typeof firstTask.blocked === 'function',
              type: typeof firstTask.blocked
            };

            methodTests.next = {
              available: typeof firstTask.next === 'function',
              type: typeof firstTask.next
            };

            methodTests.effectivelyCompleted = {
              available: typeof firstTask.effectivelyCompleted === 'function',
              type: typeof firstTask.effectivelyCompleted
            };

            // Test if methods actually work (safely)
            if (typeof firstTask.blocked === 'function') {
              try {
                const blockedResult = firstTask.blocked();
                methodTests.blocked.testResult = { success: true, value: blockedResult };
              } catch (e) {
                methodTests.blocked.testResult = { success: false, error: e.toString() };
              }
            }

            if (typeof firstTask.next === 'function') {
              try {
                const nextResult = firstTask.next();
                methodTests.next.testResult = { success: true, value: nextResult };
              } catch (e) {
                methodTests.next.testResult = { success: false, error: e.toString() };
              }
            }
          } else {
            methodTests.error = 'No tasks available for method testing';
          }
        } catch (e) {
          methodTests.error = e.toString();
        }

        return JSON.stringify({
          test: 'method_availability',
          methods: methodTests
        });
      `;

      try {
        const result = await this.diagnosticOmni.execute(methodScript);
        results.tests.method_availability = {
          success: true,
          result,
        };
      } catch (error: unknown) {
        const err = error as { message?: string; stderr?: string };
        results.tests.method_availability = {
          success: false,
          error: err.message || 'Unknown error',
          stderr: err.stderr,
        };
      }

      // Test 5: Run actual list tasks script if requested
      if (args.testScript === 'list_tasks') {
        this.logger.info('Running Test 5: Actual LIST_TASKS_SCRIPT_V4 (AST-powered)');
        const { buildListTasksScriptV4 } = await import('../../omnifocus/scripts/tasks.js');
        // Generate V4 AST-powered script
        const script = buildListTasksScriptV4({
          filter: { limit: 1, mode: 'all' },
          fields: [], // Empty = include all fields
          limit: 1,
        });

        try {
          const result = await this.diagnosticOmni.execute(script);
          results.tests.list_tasks_script = {
            success: true,
            result,
          };
        } catch (error: unknown) {
          const err = error as { message?: string; stderr?: string };
          results.tests.list_tasks_script = {
            success: false,
            error: err.message || 'Unknown error',
            stderr: err.stderr,
          };
        }
      }

      // Determine overall health
      const allSuccessful = Object.values(results.tests).every((test) => test.success);

      return createSuccessResponseV2('system', results, undefined, {
        ...timer.toMetadata(),
        operation: 'diagnostics',
        health: allSuccessful ? 'healthy' : 'degraded',
        testScript: args.testScript,
      });
    } catch (error) {
      return createErrorResponseV2(
        'system',
        'DIAGNOSTICS_ERROR',
        error instanceof Error ? error.message : 'Failed to run diagnostics',
        undefined,
        { operation: 'diagnostics' },
        timer.toMetadata(),
      );
    }
  }

  private getMetrics(args: z.infer<typeof SystemToolSchema>): Promise<StandardResponseV2<MetricsResult>> {
    const timer = new OperationTimerV2();
    const { metricsType = 'summary' } = args;

    try {
      let metricsData: unknown;

      if (metricsType === 'detailed') {
        // Get full system metrics with all tool details
        metricsData = getSystemMetrics();
      } else {
        // Get summary metrics for quick overview
        metricsData = getMetricsSummary();
      }

      const result: MetricsResult = {
        timestamp: new Date().toISOString(),
        type: metricsType,
        data: metricsData,
      };

      return Promise.resolve(
        createSuccessResponseV2('system', result, undefined, {
          ...timer.toMetadata(),
          operation: 'metrics',
          metricsType,
        }),
      );
    } catch (error) {
      return Promise.resolve(
        createErrorResponseV2(
          'system',
          'METRICS_ERROR',
          error instanceof Error ? error.message : 'Failed to get metrics',
          undefined,
          { operation: 'metrics', metricsType },
          timer.toMetadata(),
        ),
      );
    }
  }

  private async handleCacheOperation(
    args: z.infer<typeof SystemToolSchema>,
  ): Promise<StandardResponseV2<Record<string, unknown>>> {
    const timer = new OperationTimerV2();
    const action = args.cacheAction || 'stats';

    try {
      if (action === 'clear') {
        // Clear all cached data
        const statsBefore = this.cache.getStats();
        const sizeBefore = statsBefore.size;
        this.cache.clear();

        const result = {
          timestamp: new Date().toISOString(),
          action: 'clear',
          cleared: {
            entriesRemoved: sizeBefore,
            success: true,
          },
          description: 'All cached data has been invalidated',
        };

        return Promise.resolve(
          createSuccessResponseV2('system', result, undefined, {
            ...timer.toMetadata(),
            operation: 'cache',
            action: 'clear',
          }),
        );
      }

      // Default: get cache stats
      const cacheStats = this.cache.getStats();

      const result = {
        timestamp: new Date().toISOString(),
        stats: {
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          evictions: cacheStats.evictions,
          size: cacheStats.size,
          hitRate:
            cacheStats.hits + cacheStats.misses > 0
              ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100
              : 0,
        },
        configuration: {
          categories: {
            tasks: '30 seconds TTL',
            projects: '5 minutes TTL',
            folders: '10 minutes TTL',
            analytics: '1 hour TTL',
            tags: '10 minutes TTL',
            reviews: '3 minutes TTL',
          },
        },
        description: 'Cache eliminates cold start delays for frequently accessed data',
      };

      return Promise.resolve(
        createSuccessResponseV2('system', result, undefined, {
          ...timer.toMetadata(),
          operation: 'cache',
        }),
      );
    } catch (error) {
      return Promise.resolve(
        createErrorResponseV2(
          'system',
          'CACHE_ERROR',
          error instanceof Error ? error.message : 'Failed to perform cache operation',
          undefined,
          { operation: 'cache', action },
          timer.toMetadata(),
        ),
      );
    }
  }
}

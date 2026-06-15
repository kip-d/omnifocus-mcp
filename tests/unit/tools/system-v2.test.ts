import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { SystemTool, SystemToolSchema } from '../../../src/tools/system/SystemTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { DiagnosticOmniAutomation } from '../../../src/omnifocus/DiagnosticOmniAutomation.js';
import * as versionUtils from '../../../src/utils/version.js';

// Output type for executeValidated: Zod fills in .default() values before dispatch
type SystemArgs = z.output<typeof SystemToolSchema>;

// Shape of result.data for the diagnostics operation (DiagnosticsResult is not exported)
type DiagnosticsData = {
  tests: Record<string, { success: boolean; error?: string; result?: unknown }>;
};

// Mock dependencies
vi.mock('../../../src/cache/CacheManager.js');
vi.mock('../../../src/omnifocus/DiagnosticOmniAutomation.js');
vi.mock('../../../src/utils/version.js');
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('SystemTool', () => {
  let tool: SystemTool;
  let mockCache: any;
  let mockDiagnosticOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
      get: vi.fn(() => null),
      set: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
    };

    mockDiagnosticOmni = {
      execute: vi.fn(),
      executeJson: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (DiagnosticOmniAutomation as any).mockImplementation(() => mockDiagnosticOmni);

    tool = new SystemTool(mockCache);
  });

  describe('version operation', () => {
    it('should return version information', async () => {
      const mockVersionInfo = {
        name: 'omnifocus-mcp',
        version: '2.0.0',
        description: 'OmniFocus MCP Server',
        build: {
          hash: 'abc123',
          branch: 'main',
          commitDate: '2024-01-01',
          commitMessage: 'feat: add v2 tools',
          dirty: false,
          timestamp: '2024-01-01T12:00:00Z',
          buildId: 'build123',
        },
        runtime: {
          node: 'v18.0.0',
          platform: 'darwin',
          arch: 'arm64',
        },
        git: {
          repository: 'https://github.com/example/omnifocus-mcp',
          homepage: 'https://example.com',
        },
        checkout: { hash: 'abc123' },
        stale: false,
        process: { startedAt: '2024-01-01T11:00:00Z', uptimeSeconds: 42 },
      };

      vi.mocked(versionUtils.getVersionInfo).mockReturnValue(mockVersionInfo);

      const result = await tool.executeValidated({ operation: 'version' } as SystemArgs);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockVersionInfo);
      expect(result.metadata.operation).toBe('version');
    });

    it('should handle version info errors', async () => {
      vi.mocked(versionUtils.getVersionInfo).mockImplementation(() => {
        throw new Error('Failed to get version');
      });

      const result = await tool.executeValidated({ operation: 'version' } as SystemArgs);

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('VERSION_ERROR');
      expect(result.error!.message).toBe('Failed to get version');
    });
  });

  describe('diagnostics operation', () => {
    it('should run basic diagnostics', async () => {
      mockDiagnosticOmni.execute
        .mockResolvedValueOnce({
          // basic_connection test
          test: 'basic_connection',
          appName: 'OmniFocus',
          docAvailable: true,
        })
        .mockResolvedValueOnce({
          // collection_access test
          test: 'collection_access',
          collections: {
            tasks: { type: 'object', length: 100 },
            projects: { type: 'object', length: 20 },
            tags: { type: 'object', length: 10 },
          },
        })
        .mockResolvedValueOnce({
          // property_access test
          test: 'property_access',
          tests: [
            { test: 'task_id', success: true, value: 'task123' },
            { test: 'task_name', success: true, value: 'Test Task' },
          ],
        });

      const result = await tool.executeValidated({
        operation: 'diagnostics',
      } as SystemArgs);

      expect(result.success).toBe(true);
      expect((result.data as DiagnosticsData).tests).toBeDefined();
      expect((result.data as DiagnosticsData).tests.basic_connection.success).toBe(true);
      expect((result.data as DiagnosticsData).tests.collection_access.success).toBe(true);
      expect((result.data as DiagnosticsData).tests.property_access.success).toBe(true);
      expect(result.metadata.health).toBe('healthy');
    });

    it('should run diagnostics with custom test script', async () => {
      mockDiagnosticOmni.execute
        .mockResolvedValueOnce({ test: 'basic_connection', appName: 'OmniFocus', docAvailable: true })
        .mockResolvedValueOnce({ test: 'collection_access', collections: {} })
        .mockResolvedValueOnce({ test: 'property_access', tests: [] })
        .mockResolvedValueOnce({ test: 'list_tasks', tasks: [] }); // Custom test

      const result = await tool.executeValidated({
        operation: 'diagnostics',
        testScript: 'list_tasks',
      } as SystemArgs);

      expect(result.success).toBe(true);
      expect((result.data as DiagnosticsData).tests.list_tasks_script).toBeDefined();
      expect((result.data as DiagnosticsData).tests.list_tasks_script.success).toBe(true);
      expect(result.metadata.test_script).toBe('list_tasks');
    });

    it('should handle failed diagnostic tests', async () => {
      mockDiagnosticOmni.execute
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce({ test: 'collection_access', collections: {} })
        .mockResolvedValueOnce({ test: 'property_access', tests: [] });

      const result = await tool.executeValidated({
        operation: 'diagnostics',
      } as SystemArgs);

      expect(result.success).toBe(true);
      expect((result.data as DiagnosticsData).tests.basic_connection.success).toBe(false);
      expect((result.data as DiagnosticsData).tests.basic_connection.error).toBe('Connection failed');
      expect(result.metadata.health).toBe('degraded');
    });

    it('should handle complete diagnostic failure', async () => {
      // Mock all diagnostic executions to fail
      mockDiagnosticOmni.execute.mockRejectedValue(new Error('Critical failure'));

      const result = await tool.executeValidated({
        operation: 'diagnostics',
      } as SystemArgs);

      // Should still return success: true but with failed tests
      expect(result.success).toBe(true);
      expect((result.data as DiagnosticsData).tests.basic_connection.success).toBe(false);
      expect((result.data as DiagnosticsData).tests.basic_connection.error).toBe('Critical failure');
    });
  });

  describe('invalid operation', () => {
    it('should return error for invalid operation', async () => {
      const result = await tool.executeValidated({
        operation: 'invalid' as any,
      } as SystemArgs);

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('INVALID_OPERATION');
      expect(result.error!.message).toContain('Invalid operation: invalid');
    });
  });

  describe('tool metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('system');
      expect(tool.description).toContain('System utilities for OmniFocus MCP');
      expect(tool.description).toContain('version');
      expect(tool.description).toContain('diagnostics');
    });
  });
});

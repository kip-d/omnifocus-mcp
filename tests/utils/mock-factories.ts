import { vi } from 'vitest';
import { z } from 'zod';
import { 
  createEntityResponse, 
  createErrorResponse, 
  createSuccessResponse,
  OperationTimer 
} from '../../src/utils/response-format.js';
import { SchemaTestHelper } from './schema-helpers.js';

/**
 * Mock Factories for Schema-Compliant Testing
 */

/**
 * Create a mock for ManageFolderTool
 */
export function createManageFolderMock(defaultResponses: Record<string, any> = {}) {
  // Keep track of what was passed to buildScript to determine operation
  let lastOperation: string | null = null;
  
  return {
    buildScript: vi.fn().mockImplementation((script: string, params: any) => {
      // Track operation from params for use in execute
      if (params?.operation) {
        lastOperation = params.operation;
      } else if (script.includes('CREATE_FOLDER')) {
        lastOperation = 'create';
      } else if (script.includes('UPDATE_FOLDER')) {
        lastOperation = 'update';
      } else if (script.includes('DELETE_FOLDER')) {
        lastOperation = 'delete';
      } else if (script.includes('MOVE_FOLDER')) {
        lastOperation = 'move';
      }
      return 'test script';
    }),
    execute: vi.fn().mockImplementation(async (script: string) => {
      // Return operation-specific responses based on what buildScript was called with
      switch (lastOperation) {
        case 'create':
          return defaultResponses.create || {
            folder: { 
              id: 'folder-1',
              name: 'Test Folder',
              status: 'active'
            }
          };
          
        case 'update':
          return defaultResponses.update || {
            folder: { 
              id: 'folder-1',
              name: 'Updated Folder',
              status: 'active'
            }
          };
          
        case 'delete':
          return defaultResponses.delete || {
            success: true,
            deletedFolder: { 
              id: 'folder-1',
              name: 'Deleted Folder'
            }
          };
          
        case 'move':
          return defaultResponses.move || {
            folder: {
              id: 'folder-1',
              name: 'Moved Folder',
              parent: 'folder-2'
            }
          };
          
        case 'set_status':
          return defaultResponses.set_status || {
            folder: {
              id: 'folder-1',
              name: 'Status Folder',
              status: 'dropped'
            }
          };
          
        case 'duplicate':
          return defaultResponses.duplicate || {
            folder: {
              id: 'folder-2',
              name: 'Test Folder (Copy)'
            }
          };
          
        default:
          return {
            error: true,
            message: `Unsupported operation: ${operation}`
          };
      }
    })
  };
}

/**
 * Create a mock for QueryFoldersTool
 */
export function createQueryFoldersMock(defaultResponses: Record<string, any> = {}) {
  return {
    buildScript: vi.fn().mockReturnValue('test script'),
    execute: vi.fn().mockImplementation(async (params: any) => {
      const operation = params.operation || 'list';
      
      switch (operation) {
        case 'list':
          return defaultResponses.list || {
            folders: [
              { id: '1', name: 'Test Folder', status: 'active' }
            ],
            metadata: {
              total_count: 1,
              timestamp: new Date().toISOString()
            }
          };
          
        case 'get':
          return defaultResponses.get || {
            folder: {
              id: params.folderId,
              name: 'Retrieved Folder',
              status: 'active'
            }
          };
          
        case 'search':
          return defaultResponses.search || {
            folders: [
              { id: '1', name: 'Search Result', status: 'active' }
            ],
            metadata: {
              total_count: 1,
              query: params.query
            }
          };
          
        case 'get_projects':
          return defaultResponses.get_projects || {
            projects: [
              { id: 'p1', name: 'Project in Folder' }
            ],
            folder: {
              id: params.folderId,
              name: 'Folder with Projects'
            }
          };
          
        default:
          return {
            error: true,
            message: `Unsupported operation: ${operation}`
          };
      }
    })
  };
}

/**
 * Create a mock for ExportTasksTool
 */
export function createExportTasksMock(defaultResponse: any = null) {
  return {
    buildScript: vi.fn().mockReturnValue('test script'),
    execute: vi.fn().mockImplementation(async (params: any) => {
      const format = params.format || 'json';
      
      if (defaultResponse) {
        return defaultResponse;
      }
      
      switch (format) {
        case 'json':
          return {
            format: 'json',
            data: '[]',
            count: 0
          };
          
        case 'csv':
          return {
            format: 'csv',
            data: 'id,name,completed\n',
            count: 0
          };
          
        case 'markdown':
          return {
            format: 'markdown',
            data: '# Tasks\n\nNo tasks found.',
            count: 0
          };
          
        default:
          return {
            error: true,
            message: `Unsupported format: ${format}`
          };
      }
    })
  };
}

/**
 * Create a mock for recurring tasks tools
 */
export function createRecurringTasksMock(defaultResponse: any = null) {
  return {
    buildScript: vi.fn().mockReturnValue('test script'),
    execute: vi.fn().mockImplementation(async (params: any) => {
      if (defaultResponse) {
        return defaultResponse;
      }
      
      return {
        tasks: [],
        summary: {
          total: 0,
          active: 0,
          patterns: {}
        },
        metadata: {
          timestamp: new Date().toISOString(),
          options: params
        }
      };
    })
  };
}

/**
 * Create a tool with all necessary mocks injected
 */
export function createMockedTool<T extends { new(cache: any): any }>(
  ToolClass: T,
  options: {
    cache?: any;
    omniAutomation?: any;
    logger?: any;
    mockResponses?: Record<string, any>;
  } = {}
): InstanceType<T> {
  const mockCache = options.cache || {
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
    invalidate: vi.fn(),
  };

  // If omniAutomation is provided and has both buildScript and execute, use it directly
  // Otherwise, wrap it or create a default
  let mockOmniAutomation = options.omniAutomation;
  if (!mockOmniAutomation || (!mockOmniAutomation.buildScript && !mockOmniAutomation.execute)) {
    mockOmniAutomation = {
      buildScript: vi.fn().mockReturnValue('test script'),
      execute: vi.fn().mockResolvedValue({}),
    };
  }

  const mockLogger = options.logger || {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  const tool = new ToolClass(mockCache);
  tool['omniAutomation'] = mockOmniAutomation;
  tool['logger'] = mockLogger;
  
  return tool;
}

/**
 * Create a response builder for consistent response structures
 */
export class ResponseBuilder {
  static success(data: any, metadata: any = {}) {
    return {
      success: true,
      data,
      metadata: {
        operation: metadata.operation || 'test',
        timestamp: new Date().toISOString(),
        from_cache: false,
        query_time_ms: 100,
        ...metadata
      }
    };
  }
  
  static error(code: string, message: string, details: any = null) {
    return {
      success: false,
      data: null,
      error: {
        code,
        message,
        details
      },
      metadata: {
        operation: 'test',
        timestamp: new Date().toISOString(),
        from_cache: false,
        query_time_ms: 0
      }
    };
  }
  
  static entity(operation: string, entity: any, metadata: any = {}) {
    return createEntityResponse(operation, entity, metadata);
  }
}

/**
 * Create a mock that simulates Claude Desktop string coercion
 */
export function createClaudeDesktopMock(
  innerMock: (params: any) => any
) {
  return vi.fn().mockImplementation((params: any) => {
    // Simulate Claude Desktop string conversion
    const stringified = SchemaTestHelper.stringifyParams(params);
    
    // Call inner mock with stringified params
    return innerMock(stringified);
  });
}
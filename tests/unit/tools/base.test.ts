import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { BaseTool } from '../../../src/tools/base';
import { CacheManager } from '../../../src/cache/CacheManager';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock dependencies
vi.mock('../../../src/omnifocus/OmniAutomation');
vi.mock('../../../src/cache/CacheManager');
vi.mock('fs');
vi.mock('os');

// Create a concrete test implementation
class TestTool extends BaseTool<z.ZodObject<any>> {
  name = 'test-tool';
  description = 'A test tool for testing BaseTool';
  
  schema = z.object({
    stringParam: z.string(),
    numberParam: z.number().optional(),
    booleanParam: z.boolean().optional(),
    arrayParam: z.array(z.string()).optional(),
    nestedParam: z.object({
      innerField: z.string(),
    }).optional(),
  });

  protected async executeValidated(args: z.infer<typeof this.schema>): Promise<any> {
    return { success: true, data: args };
  }
}

// Test tool that throws errors
class ErrorTestTool extends BaseTool<z.ZodObject<any>> {
  name = 'error-test-tool';
  description = 'A test tool that throws errors';
  
  schema = z.object({
    errorType: z.enum(['permission', 'timeout', 'not-running', 'omni-automation', 'generic']),
  });

  protected async executeValidated(args: z.infer<typeof this.schema>): Promise<any> {
    switch (args.errorType) {
      case 'permission':
        throw new Error('Error: -1743 - Not allowed to send Apple events');
      case 'timeout':
        throw new Error('Script execution timed out after 60 seconds');
      case 'not-running':
        throw new Error('OmniFocus is not running');
      case 'omni-automation':
        const error = new Error('Script failed');
        error.name = 'OmniAutomationError';
        (error as any).details = { script: 'test script', stderr: 'test stderr' };
        throw error;
      case 'generic':
      default:
        throw new Error('Generic error for testing');
    }
  }
}

describe('BaseTool', () => {
  let mockCache: CacheManager;
  let testTool: TestTool;
  let errorTestTool: ErrorTestTool;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup cache mock
    mockCache = new CacheManager();
    
    // Setup file system mocks
    vi.mocked(os.homedir).mockReturnValue('/home/test');
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    
    // Create test instances
    testTool = new TestTool(mockCache);
    errorTestTool = new ErrorTestTool(mockCache);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with cache manager', () => {
      expect(testTool).toBeInstanceOf(BaseTool);
      expect(testTool['cache']).toBe(mockCache);
    });

    it('should create OmniAutomation instance', () => {
      expect(testTool['omniAutomation']).toBeInstanceOf(OmniAutomation);
    });

    it('should create logger with correct name', () => {
      expect(testTool['logger']).toBeDefined();
      // Logger doesn't have a public prefix property, but we can verify it exists
      expect(testTool['logger']).toHaveProperty('debug');
      expect(testTool['logger']).toHaveProperty('info');
      expect(testTool['logger']).toHaveProperty('warn');
      expect(testTool['logger']).toHaveProperty('error');
    });
  });

  describe('properties', () => {
    it('should have required properties', () => {
      expect(testTool.name).toBe('test-tool');
      expect(testTool.description).toBe('A test tool for testing BaseTool');
      expect(testTool.schema).toBeDefined();
    });
  });

  describe('inputSchema', () => {
    it('should convert Zod schema to JSON Schema', () => {
      const jsonSchema = testTool.inputSchema;
      
      expect(jsonSchema).toMatchObject({
        type: 'object',
        properties: {
          stringParam: { type: 'string' },
          numberParam: { type: 'number' },
          booleanParam: { type: 'boolean' },
          arrayParam: {
            type: 'array',
            items: { type: 'string' },
          },
          nestedParam: {
            type: 'object',
            properties: {
              innerField: { type: 'string' },
            },
            required: ['innerField'],
          },
        },
        required: ['stringParam'],
      });
    });

    it('should handle enum types', () => {
      class EnumTool extends BaseTool {
        name = 'enum-tool';
        description = 'Test enum handling';
        schema = z.object({
          mode: z.enum(['list', 'query', 'update']),
        });
        
        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }
      
      const enumTool = new EnumTool(mockCache);
      const jsonSchema = enumTool.inputSchema;
      
      expect(jsonSchema.properties.mode).toMatchObject({
        type: 'string',
        enum: ['list', 'query', 'update'],
      });
    });

    it('should handle literal types', () => {
      class LiteralTool extends BaseTool {
        name = 'literal-tool';
        description = 'Test literal handling';
        schema = z.object({
          version: z.literal(2),
        });
        
        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }
      
      const literalTool = new LiteralTool(mockCache);
      const jsonSchema = literalTool.inputSchema;
      
      expect(jsonSchema.properties.version).toMatchObject({
        type: 'number',
        const: 2,
      });
    });

    it('should handle refined schemas', () => {
      class RefinedTool extends BaseTool {
        name = 'refined-tool';
        description = 'Test refined schema handling';
        schema = z.object({
          age: z.number(),
        }).refine(data => data.age >= 18, {
          message: 'Must be 18 or older',
        });
        
        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }
      
      const refinedTool = new RefinedTool(mockCache);
      const jsonSchema = refinedTool.inputSchema;
      
      // Should extract inner schema from refinement
      expect(jsonSchema).toMatchObject({
        type: 'object',
        properties: {
          age: { type: 'number' },
        },
        required: ['age'],
      });
    });
  });

  describe('execute', () => {
    it('should validate and execute with valid arguments', async () => {
      const args = {
        stringParam: 'test',
        numberParam: 42,
        booleanParam: true,
      };
      
      const result = await testTool.execute(args);
      
      expect(result).toEqual({
        success: true,
        data: args,
      });
    });

    it('should handle missing required parameters', async () => {
      const args = {
        numberParam: 42,
      };
      
      await expect(testTool.execute(args)).rejects.toThrow(McpError);
      
      try {
        await testTool.execute(args);
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
        expect((error as McpError).message).toContain('Invalid parameters');
        expect((error as McpError).message).toContain('stringParam');
      }
    });

    it('should handle invalid parameter types', async () => {
      const args = {
        stringParam: 123, // Should be string
        numberParam: 'not a number', // Should be number
      };
      
      await expect(testTool.execute(args)).rejects.toThrow(McpError);
      
      try {
        await testTool.execute(args);
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
        expect((error as McpError).data?.validation_errors).toBeDefined();
      }
    });

    it('should log validation failures', async () => {
      const args = { invalidParam: 'test' };
      
      try {
        await testTool.execute(args);
      } catch (error) {
        // Expected to throw
      }
      
      // Check that logging was attempted
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('tool-failures'),
        expect.objectContaining({ recursive: true })
      );
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('failures-'),
        expect.stringContaining('VALIDATION_ERROR'),
        expect.objectContaining({ flag: 'a' })
      );
    });

    it('should handle nested object validation', async () => {
      const args = {
        stringParam: 'test',
        nestedParam: {
          innerField: 'nested value',
        },
      };
      
      const result = await testTool.execute(args);
      
      expect(result).toEqual({
        success: true,
        data: args,
      });
    });

    it('should handle array validation', async () => {
      const args = {
        stringParam: 'test',
        arrayParam: ['item1', 'item2', 'item3'],
      };
      
      const result = await testTool.execute(args);
      
      expect(result).toEqual({
        success: true,
        data: args,
      });
    });
  });

  describe('handleError', () => {
    it('should handle permission errors', async () => {
      const result = await errorTestTool.execute({ errorType: 'permission' });
      
      expect(result).toMatchObject({
        success: false,
        data: null,
        error: {
          code: 'PERMISSION_DENIED',
          message: expect.stringContaining('Permission denied'),
        },
      });
    });

    it('should handle timeout errors', async () => {
      const result = await errorTestTool.execute({ errorType: 'timeout' });
      
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'SCRIPT_TIMEOUT',
          message: expect.stringContaining('timed out'),
        },
      });
    });

    it('should handle OmniFocus not running errors', async () => {
      const result = await errorTestTool.execute({ errorType: 'not-running' });
      
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'OMNIFOCUS_NOT_RUNNING',
          message: expect.stringContaining('OmniFocus is not running'),
        },
      });
    });

    it('should handle OmniAutomation errors', async () => {
      const result = await errorTestTool.execute({ errorType: 'omni-automation' });
      
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'OMNIFOCUS_ERROR',
          message: expect.stringContaining('Script failed'),
          details: expect.objectContaining({
            script: 'test script',
            stderr: 'test stderr',
          }),
        },
      });
    });

    it('should handle generic errors', async () => {
      const result = await errorTestTool.execute({ errorType: 'generic' });
      
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Generic error for testing',
        },
      });
    });

    it('should log execution failures', async () => {
      await errorTestTool.execute({ errorType: 'generic' });
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('failures-'),
        expect.stringContaining('EXECUTION_ERROR'),
        expect.objectContaining({ flag: 'a' })
      );
    });
  });

  describe('throwMcpError', () => {
    class ThrowingTool extends BaseTool {
      name = 'throwing-tool';
      description = 'Test throwMcpError method';
      schema = z.object({
        errorType: z.string(),
        shouldThrow: z.boolean().optional(),
      });
      
      protected async executeValidated(args: any): Promise<any> {
        // Only use throwMcpError if shouldThrow is true
        // Otherwise, use the default error handling which returns a response
        if (args.shouldThrow) {
          if (args.errorType === 'permission') {
            this.throwMcpError(new Error('Error: -1743'));
          } else if (args.errorType === 'omni') {
            const error = new Error('OmniAutomation error');
            error.name = 'OmniAutomationError';
            (error as any).details = { script: 'script', stderr: 'stderr' };
            this.throwMcpError(error);
          } else {
            this.throwMcpError(new Error('Generic error'));
          }
        } else {
          // Trigger normal error handling that returns a response
          if (args.errorType === 'permission') {
            throw new Error('Error: -1743');
          } else if (args.errorType === 'omni') {
            const error = new Error('OmniAutomation error');
            error.name = 'OmniAutomationError';
            (error as any).script = 'script';
            (error as any).stderr = 'stderr';
            throw error;
          } else {
            throw new Error('Generic error');
          }
        }
      }
    }
    
    it('should throw McpError for permission errors', async () => {
      const tool = new ThrowingTool(mockCache);
      
      await expect(tool.execute({ errorType: 'permission', shouldThrow: true })).rejects.toThrow(McpError);
      
      try {
        await tool.execute({ errorType: 'permission', shouldThrow: true });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InternalError);
        expect((error as McpError).message).toContain('Not authorized');
        expect((error as McpError).data?.code).toBe('PERMISSION_DENIED');
      }
    });

    it('should throw McpError for OmniAutomation errors', async () => {
      const tool = new ThrowingTool(mockCache);
      
      await expect(tool.execute({ errorType: 'omni', shouldThrow: true })).rejects.toThrow(McpError);
      
      try {
        await tool.execute({ errorType: 'omni', shouldThrow: true });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).data?.script).toBe('script');
        expect((error as McpError).data?.stderr).toBe('stderr');
      }
    });

    it('should throw McpError for generic errors', async () => {
      const tool = new ThrowingTool(mockCache);
      
      await expect(tool.execute({ errorType: 'generic', shouldThrow: true })).rejects.toThrow(McpError);
      
      try {
        await tool.execute({ errorType: 'generic', shouldThrow: true });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InternalError);
        expect((error as McpError).message).toContain('Generic error');
      }
    });
  });

  describe('zodToJsonSchema edge cases', () => {
    it('should handle union types with null', () => {
      class UnionTool extends BaseTool {
        name = 'union-tool';
        description = 'Test union with null';
        schema = z.object({
          nullableField: z.union([z.string(), z.null()]),
        });
        
        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }
      
      const unionTool = new UnionTool(mockCache);
      const jsonSchema = unionTool.inputSchema;
      
      expect(jsonSchema.properties.nullableField).toMatchObject({
        type: 'string',
      });
    });

    it('should handle deeply nested objects', () => {
      class NestedTool extends BaseTool {
        name = 'nested-tool';
        description = 'Test deeply nested objects';
        schema = z.object({
          level1: z.object({
            level2: z.object({
              level3: z.object({
                value: z.string(),
              }),
            }),
          }),
        });
        
        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }
      
      const nestedTool = new NestedTool(mockCache);
      const jsonSchema = nestedTool.inputSchema;
      
      expect(jsonSchema.properties.level1.properties.level2.properties.level3.properties.value).toMatchObject({
        type: 'string',
      });
    });

    it('should preserve descriptions', () => {
      class DescribedTool extends BaseTool {
        name = 'described-tool';
        description = 'Test description preservation';
        schema = z.object({
          field: z.string().describe('This is a field description'),
          optionalField: z.string().optional().describe('This is optional'),
        });
        
        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }
      
      const describedTool = new DescribedTool(mockCache);
      const jsonSchema = describedTool.inputSchema;
      
      expect(jsonSchema.properties.field.description).toBe('This is a field description');
      expect(jsonSchema.properties.optionalField.description).toBe('This is optional');
    });
  });

  describe('error logging', () => {
    it('should create logs directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      await testTool.execute({ invalidParam: 'test' }).catch(() => {});
      
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/home/test/.omnifocus-mcp/tool-failures',
        { recursive: true }
      );
    });

    it('should not create logs directory if it exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      await testTool.execute({ invalidParam: 'test' }).catch(() => {});
      
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle logging failures gracefully', async () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write failed');
      });
      
      // Should not throw even if logging fails
      await expect(testTool.execute({ invalidParam: 'test' })).rejects.toThrow(McpError);
    });

    it('should log with correct timestamp format', async () => {
      const mockDate = new Date('2025-08-25T10:00:00.000Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      
      await testTool.execute({ invalidParam: 'test' }).catch(() => {});
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('failures-2025-08-25.jsonl'),
        expect.stringContaining('2025-08-25T10:00:00.000Z'),
        expect.any(Object)
      );
    });
  });
});
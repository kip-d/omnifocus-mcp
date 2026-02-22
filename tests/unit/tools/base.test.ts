import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { BaseTool } from '../../../src/tools/base';
import { CacheManager } from '../../../src/cache/CacheManager';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ScriptErrorType } from '../../../src/utils/error-taxonomy.js';
import { OmniFocusReadTool } from '../../../src/tools/unified/OmniFocusReadTool.js';
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
    nestedParam: z
      .object({
        innerField: z.string(),
      })
      .optional(),
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

  describe('execJson', () => {
    it('should convert legacy error JSON strings into ScriptError results', async () => {
      const legacyError = JSON.stringify({ error: true, message: 'Task with ID abc not found' });

      // Provide a minimal omniAutomation stub so execJson calls resolve to our legacy payload
      const fakeAutomation = {
        executeJson: vi.fn().mockResolvedValue(legacyError),
        execute: vi.fn(),
      } as unknown as OmniAutomation;

      testTool.omniAutomation = fakeAutomation;

      const result = await (testTool as any).execJson('ignored-script');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task with ID abc not found');
      expect(fakeAutomation.executeJson).toHaveBeenCalled();
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
        schema = z
          .object({
            age: z.number(),
          })
          .refine((data) => data.age >= 18, {
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
        expect.objectContaining({ recursive: true }),
      );

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('failures-'),
        expect.stringContaining('VALIDATION_ERROR'),
        expect.objectContaining({ flag: 'a' }),
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
        data: expect.anything(), // V2 format returns {} instead of null
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
          message: expect.stringContaining('Generic error for testing'),
        },
      });
    });

    it('should log execution failures', async () => {
      await errorTestTool.execute({ errorType: 'generic' });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('failures-'),
        expect.stringContaining('EXECUTION_ERROR'),
        expect.objectContaining({ flag: 'a' }),
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

  describe('ZodLazy schema handling', () => {
    it('should resolve z.lazy() fields as object schemas, not strings', () => {
      const InnerSchema = z.lazy(() =>
        z.object({
          name: z.string(),
          value: z.number().optional(),
        }),
      );

      class LazyTool extends BaseTool {
        name = 'lazy-tool';
        description = 'Test z.lazy() handling';
        schema = z.object({
          filters: InnerSchema,
        });

        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }

      const lazyTool = new LazyTool(mockCache);
      const jsonSchema = lazyTool.inputSchema;

      // Should resolve to the object schema, not fall through to { type: 'string' }
      expect(jsonSchema.properties.filters).toMatchObject({
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'number' },
        },
        required: ['name'],
      });
    });

    it('should handle recursive schemas (AND/OR/NOT) without stack overflow', () => {
      // Simulates FilterSchema's recursive AND/OR/NOT pattern
      type RecursiveFilter = {
        name?: string;
        AND?: RecursiveFilter[];
        OR?: RecursiveFilter[];
        NOT?: RecursiveFilter;
      };

      const RecursiveFilterSchema: z.ZodType<RecursiveFilter> = z.lazy(() =>
        z.object({
          name: z.string().optional(),
          AND: z.array(RecursiveFilterSchema).optional(),
          OR: z.array(RecursiveFilterSchema).optional(),
          NOT: RecursiveFilterSchema.optional(),
        }),
      );

      class RecursiveTool extends BaseTool {
        name = 'recursive-tool';
        description = 'Test recursive z.lazy() handling';
        schema = z.object({
          filter: RecursiveFilterSchema,
        });

        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }

      const recursiveTool = new RecursiveTool(mockCache);

      // Should not throw (no infinite recursion)
      const jsonSchema = recursiveTool.inputSchema;

      // Top level should be an object with name, AND, OR, NOT
      expect(jsonSchema.properties.filter).toMatchObject({
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      });

      // AND should be an array
      expect(jsonSchema.properties.filter.properties.AND).toMatchObject({
        type: 'array',
      });

      // OR should be an array
      expect(jsonSchema.properties.filter.properties.OR).toMatchObject({
        type: 'array',
      });

      // NOT should resolve to an object (recursion still within depth limit)
      expect(jsonSchema.properties.filter.properties.NOT.type).toBe('object');
    });

    it('should cap recursion at depth 5 and return generic object schema', () => {
      // Create a deeply recursive schema that references itself
      type DeepRecursive = { child?: DeepRecursive };
      const DeepSchema: z.ZodType<DeepRecursive> = z.lazy(() =>
        z.object({
          child: DeepSchema.optional(),
        }),
      );

      class DeepTool extends BaseTool {
        name = 'deep-tool';
        description = 'Test recursion depth limit';
        schema = z.object({
          root: DeepSchema,
        });

        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }

      const deepTool = new DeepTool(mockCache);
      const jsonSchema = deepTool.inputSchema;

      // Should not throw
      expect(jsonSchema.properties.root).toBeDefined();
      expect(jsonSchema.properties.root.type).toBe('object');

      // Walk down the chain to verify it terminates
      let current = jsonSchema.properties.root;
      let depth = 0;
      while (current?.properties?.child?.type === 'object' && current?.properties?.child?.properties?.child) {
        current = current.properties.child;
        depth++;
        // Safety: prevent infinite loop in test itself
        if (depth > 10) break;
      }

      // Should have stopped before going infinitely deep
      expect(depth).toBeLessThanOrEqual(5);
    });

    it('should reset depth counter between separate schema conversions', () => {
      type RecursiveItem = { sub?: RecursiveItem };
      const ItemSchema: z.ZodType<RecursiveItem> = z.lazy(() =>
        z.object({
          sub: ItemSchema.optional(),
        }),
      );

      class ResetTool extends BaseTool {
        name = 'reset-tool';
        description = 'Test depth counter reset';
        schema = z.object({
          item: ItemSchema,
        });

        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }

      const tool = new ResetTool(mockCache);

      // Call inputSchema twice - both should succeed identically
      const schema1 = tool.inputSchema;
      const schema2 = tool.inputSchema;

      expect(schema1).toEqual(schema2);
      expect(schema1.properties.item.type).toBe('object');
    });

    it('should handle optional z.lazy() fields correctly in isOptionalField', () => {
      const LazyInner = z.lazy(() => z.object({ x: z.string() }));

      class OptionalLazyTool extends BaseTool {
        name = 'optional-lazy-tool';
        description = 'Test optional z.lazy()';
        schema = z.object({
          required_lazy: LazyInner,
          optional_lazy: LazyInner.optional(),
        });

        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }

      const tool = new OptionalLazyTool(mockCache);
      const jsonSchema = tool.inputSchema;

      // required_lazy should be in required array
      expect(jsonSchema.required).toContain('required_lazy');
      // optional_lazy should NOT be in required array
      expect(jsonSchema.required).not.toContain('optional_lazy');
    });

    it('should resolve OmniFocusReadTool filters as object with properties (real schema)', () => {
      // This test exercises the REAL wrapping chain that caused the original bug:
      // coerceObject(FilterSchema).optional() → ZodOptional<ZodEffects<ZodLazy<ZodObject>>>
      // Without the z.lazy() fix, filters would fall through to { type: 'string' }.
      const readTool = new OmniFocusReadTool(mockCache);
      const jsonSchema = readTool.inputSchema;

      // The top-level schema should have a 'query' property
      expect(jsonSchema.properties).toBeDefined();
      expect(jsonSchema.properties.query).toBeDefined();

      // query is a discriminatedUnion → has oneOf with multiple variants
      const querySchema = jsonSchema.properties.query as Record<string, unknown>;
      const oneOf = querySchema.oneOf as Record<string, unknown>[];
      expect(oneOf).toBeDefined();
      expect(oneOf.length).toBeGreaterThan(0);

      // Find the tasks variant (has type: "tasks" literal)
      const tasksVariant = oneOf.find((variant) => {
        const props = variant.properties as Record<string, Record<string, unknown>>;
        return props?.type?.const === 'tasks';
      }) as Record<string, unknown>;
      expect(tasksVariant).toBeDefined();

      // The filters property should be an OBJECT with properties, NOT { type: 'string' }
      const filtersSchema = (tasksVariant.properties as Record<string, Record<string, unknown>>).filters;
      expect(filtersSchema).toBeDefined();
      expect(filtersSchema.type).toBe('object');
      expect(filtersSchema.properties).toBeDefined();

      // Verify specific filter fields are present (proves full resolution through the chain)
      const filterProps = filtersSchema.properties as Record<string, Record<string, unknown>>;
      expect(filterProps.flagged).toMatchObject({ type: 'boolean' });
      expect(filterProps.project).toBeDefined();
      expect(filterProps.tags).toMatchObject({ type: 'object' });
      expect(filterProps.dueDate).toBeDefined();

      // Verify recursive fields (AND/OR/NOT) resolved as arrays/objects, not strings
      expect(filterProps.AND).toMatchObject({ type: 'array' });
      expect(filterProps.OR).toMatchObject({ type: 'array' });
      expect(filterProps.NOT).toMatchObject({ type: 'object' });
    });

    it('should preserve description on z.lazy() schemas', () => {
      const DescribedLazy = z.lazy(() => z.object({ val: z.string() })).describe('A lazy field');

      class DescribedLazyTool extends BaseTool {
        name = 'described-lazy-tool';
        description = 'Test description on z.lazy()';
        schema = z.object({
          data: DescribedLazy,
        });

        protected async executeValidated(args: any): Promise<any> {
          return { data: args };
        }
      }

      const tool = new DescribedLazyTool(mockCache);
      const jsonSchema = tool.inputSchema;

      // The resolved schema should be an object (not a string fallback)
      expect(jsonSchema.properties.data.type).toBe('object');
      expect(jsonSchema.properties.data.properties.val).toMatchObject({ type: 'string' });
    });
  });

  describe('error logging', () => {
    it('should create logs directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await testTool.execute({ invalidParam: 'test' }).catch(() => {});

      expect(fs.mkdirSync).toHaveBeenCalledWith('/home/test/.omnifocus-mcp/tool-failures', { recursive: true });
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
        expect.any(Object),
      );
    });
  });

  describe('Enhanced Error Categorization', () => {
    it('should categorize permission denied errors', async () => {
      const result = await errorTestTool.execute({ errorType: 'permission' });

      expect(result.error?.details?.errorType).toBe(ScriptErrorType.PERMISSION_DENIED);
      expect(result.error?.details?.severity).toBe('critical');
      expect(result.error?.details?.recoverable).toBe(true);
      expect(result.error?.details?.actionable).toBe('Grant automation permissions in System Settings');
      expect(result.error?.details?.recovery).toContain('You may see a permission dialog - click "OK" to grant access');
    });

    it('should categorize timeout errors', async () => {
      const result = await errorTestTool.execute({ errorType: 'timeout' });

      expect(result.error?.details?.errorType).toBe(ScriptErrorType.SCRIPT_TIMEOUT);
      expect(result.error?.details?.severity).toBe('medium');
      expect(result.error?.details?.recoverable).toBe(true);
      expect(result.error?.details?.actionable).toBe(
        'Reduce query scope or enable skipAnalysis for better performance',
      );
      expect(result.error?.details?.recovery).toContain(
        'Try reducing the amount of data requested (use limit parameter)',
      );
    });

    it('should categorize OmniFocus not running errors', async () => {
      const result = await errorTestTool.execute({ errorType: 'not-running' });

      expect(result.error?.details?.errorType).toBe(ScriptErrorType.OMNIFOCUS_NOT_RUNNING);
      expect(result.error?.details?.severity).toBe('critical');
      expect(result.error?.details?.recoverable).toBe(true);
      expect(result.error?.details?.actionable).toBe("Launch OmniFocus and ensure it's fully loaded");
      expect(result.error?.details?.recovery).toContain('Open OmniFocus from your Applications folder or Dock');
    });

    it('should categorize OmniAutomation errors', async () => {
      const result = await errorTestTool.execute({ errorType: 'omni-automation' });

      expect(result.error?.details?.errorType).toBe(ScriptErrorType.OMNIFOCUS_ERROR);
      expect(result.error?.details?.severity).toBe('high');
      expect(result.error?.details?.recoverable).toBe(true);
      expect(result.error?.details?.actionable).toBe('Clear OmniFocus dialogs and ensure app is responsive');
      expect(result.error?.details?.recovery).toContain('Check that OmniFocus is not showing any dialogs');
    });

    it('should categorize generic errors as internal errors', async () => {
      const result = await errorTestTool.execute({ errorType: 'generic' });

      expect(result.error?.details?.errorType).toBe(ScriptErrorType.INTERNAL_ERROR);
      expect(result.error?.details?.severity).toBe('high');
      expect(result.error?.details?.recoverable).toBe(false);
      expect(result.error?.details?.actionable).toBe('Retry operation and verify system state');
      expect(result.error?.details?.recovery).toContain('Try the operation again');
    });

    it('should include formatted error message', async () => {
      const result = await errorTestTool.execute({ errorType: 'permission' });

      // V2 format puts formatted message in suggestion field, not details.formatted
      expect(result.error?.suggestion).toBeDefined();
      expect(typeof result.error?.suggestion).toBe('string');
      const suggestion = result.error?.suggestion as string;
      expect(suggestion).toContain('Permission denied');
      expect(suggestion).toContain('Quick fix');
      expect(suggestion).toContain('How to resolve');

      // Details should have the individual categorization fields
      expect(result.error?.details?.errorType).toBeDefined();
      expect(result.error?.details?.severity).toBeDefined();
      expect(result.error?.details?.recoverable).toBeDefined();
      expect(result.error?.details?.actionable).toBeDefined();
      expect(result.error?.details?.recovery).toBeDefined();
    });

    it('should log error with categorization information', async () => {
      const writeFileSyncSpy = vi.mocked(fs.writeFileSync);

      await errorTestTool.execute({ errorType: 'timeout' });

      expect(writeFileSyncSpy).toHaveBeenCalled();
      const logCall = writeFileSyncSpy.mock.calls.find(
        (call) => typeof call[1] === 'string' && call[1].includes('categorization'),
      );

      expect(logCall).toBeTruthy();
      if (logCall) {
        const logEntry = JSON.parse(logCall[1] as string);
        expect(logEntry.categorization).toMatchObject({
          errorType: ScriptErrorType.SCRIPT_TIMEOUT,
          severity: 'medium',
          recoverable: true,
          actionable: 'Reduce query scope or enable skipAnalysis for better performance',
        });
      }
    });

    it('should preserve original error in categorized response', async () => {
      const result = await errorTestTool.execute({ errorType: 'generic' });

      expect(result.error?.details?.originalError).toBeInstanceOf(Error);
      expect(result.error?.details?.originalError.message).toContain('Generic error for testing');
    });

    it('should include context in categorized errors', async () => {
      // The error test tool doesn't provide context, but we can test that context is preserved
      const result = await errorTestTool.execute({ errorType: 'permission' });

      // Context should be included in the error details (even if empty)
      expect('context' in (result.error?.details || {})).toBe(true);
    });
  });
});

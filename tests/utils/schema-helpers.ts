import { z, ZodSchema } from 'zod';
import { vi } from 'vitest';
import type { BaseTool } from '../../src/tools/base.js';

/**
 * Schema Test Helper Utilities
 * Provides functions to work with Zod schemas in tests
 */
export class SchemaTestHelper {
  /**
   * Generate valid parameters from a schema with defaults
   */
  static generateValidParams<T extends ZodSchema>(
    schema: T,
    overrides: Partial<z.infer<T>> = {}
  ): z.infer<T> {
    // Parse empty object to get defaults
    const defaults = schema.parse({});
    
    // Merge with overrides
    return { ...defaults, ...overrides };
  }

  /**
   * Create a schema-compliant mock for a tool
   */
  static createSchemaMock<T extends BaseTool<any>>(
    Tool: new (cache: any) => T,
    options: {
      cache?: any;
      omniAutomation?: any;
      logger?: any;
    } = {}
  ): T {
    const mockCache = options.cache || {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
    };

    const mockOmniAutomation = options.omniAutomation || {
      buildScript: vi.fn(),
      execute: vi.fn(),
    };

    const mockLogger = options.logger || {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    const tool = new Tool(mockCache);
    tool['omniAutomation'] = mockOmniAutomation;
    tool['logger'] = mockLogger;
    
    return tool;
  }

  /**
   * Validate test data against a schema
   */
  static validateTestData<T extends ZodSchema>(
    schema: T,
    data: unknown
  ): { valid: boolean; errors?: z.ZodError } {
    const result = schema.safeParse(data);
    
    if (!result.success) {
      return { valid: false, errors: result.error };
    }
    
    return { valid: true };
  }

  /**
   * Create parameters that will pass schema validation
   * Handles coercion for Claude Desktop string conversion
   */
  static createValidParams<T extends ZodSchema>(
    schema: T,
    params: Record<string, any>
  ): z.infer<T> {
    // Convert params to strings as Claude Desktop would
    const stringified = this.stringifyParams(params);
    
    // Parse through schema to apply coercion
    return schema.parse(stringified);
  }

  /**
   * Stringify parameters as Claude Desktop does
   */
  static stringifyParams(params: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) {
        result[key] = value;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.stringifyParams(value);
      } else if (Array.isArray(value)) {
        result[key] = value.map(v => 
          typeof v === 'object' ? this.stringifyParams(v) : String(v)
        );
      } else if (typeof value === 'boolean') {
        result[key] = String(value);
      } else if (typeof value === 'number') {
        result[key] = String(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Extract required fields from a schema
   */
  static getRequiredFields<T extends ZodSchema>(schema: T): string[] {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const required: string[] = [];
      
      for (const [key, value] of Object.entries(shape)) {
        if (!(value instanceof z.ZodOptional) && 
            !(value instanceof z.ZodDefault) &&
            !(value instanceof z.ZodNullable)) {
          required.push(key);
        }
      }
      
      return required;
    }
    
    return [];
  }

  /**
   * Generate example values for a schema
   */
  static generateExample<T extends ZodSchema>(schema: T): z.infer<T> {
    if (schema instanceof z.ZodString) {
      return 'test-string' as any;
    }
    if (schema instanceof z.ZodNumber) {
      return 1 as any;
    }
    if (schema instanceof z.ZodBoolean) {
      return true as any;
    }
    if (schema instanceof z.ZodArray) {
      return [] as any;
    }
    if (schema instanceof z.ZodObject) {
      const result: any = {};
      const shape = schema.shape;
      
      for (const [key, value] of Object.entries(shape)) {
        if (value instanceof z.ZodDefault) {
          // Use default value
          result[key] = value._def.defaultValue();
        } else if (value instanceof z.ZodOptional) {
          // Skip optional fields
          continue;
        } else {
          // Generate example for required field
          result[key] = this.generateExample(value as ZodSchema);
        }
      }
      
      return result;
    }
    if (schema instanceof z.ZodEnum) {
      const values = schema._def.values;
      return values[0] as any;
    }
    if (schema instanceof z.ZodUnion) {
      const options = schema._def.options;
      return this.generateExample(options[0]);
    }
    
    // Default fallback
    return {} as any;
  }

  /**
   * Create a mock that validates inputs against schema
   */
  static createValidatingMock<T extends ZodSchema>(
    schema: T,
    mockImplementation: (params: z.infer<T>) => any
  ) {
    return vi.fn().mockImplementation((params) => {
      // Validate params match schema
      const validated = schema.parse(params);
      
      // Call mock implementation with validated params
      return mockImplementation(validated);
    });
  }
}
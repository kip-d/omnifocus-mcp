/**
 * Type-safe script result handling for OmniAutomation v2.1.0
 * 
 * This module defines discriminated unions and type guards to eliminate
 * scattered error checking and improve type safety across the codebase.
 */

import { z } from 'zod';

/**
 * Discriminated union for script execution results
 * Replaces manual checking of result.error/result.success patterns
 */
export type ScriptResult<T = unknown> = ScriptSuccess<T> | ScriptError;

export interface ScriptSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ScriptError {
  success: false;
  error: string;
  context?: string;
  details?: unknown;
  stack?: string;
}

/**
 * Type guards for ScriptResult discrimination
 */
export function isScriptSuccess<T>(result: ScriptResult<T>): result is ScriptSuccess<T> {
  return result.success === true;
}

export function isScriptError<T>(result: ScriptResult<T>): result is ScriptError {
  return result.success === false;
}

/**
 * Zod schema for validating script results from JXA
 * Creates a discriminated union schema for any data type
 */
export const ScriptResultSchema = <T extends z.ZodType>(dataSchema: T) => z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: dataSchema,
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    context: z.string().optional(),
    details: z.unknown().optional(),
    stack: z.string().optional(),
  }),
]);

/**
 * Common JXA script result patterns for OmniFocus operations
 * These provide validation for the most frequent script response shapes
 */

// For project operations (create, update, read)
export const ProjectResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().optional(),
  dueDate: z.string().nullish(),
  deferDate: z.string().nullish(),
  flagged: z.boolean().optional(),
  status: z.string().optional(),
});

// For task operations (create, update, read)
export const TaskResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().optional(),
  completed: z.boolean().optional(),
  dueDate: z.string().nullish(),
  deferDate: z.string().nullish(),
  flagged: z.boolean().optional(),
  projectId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// For operation results (create, update, delete responses)
export const OperationResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  changes: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  // Allow arbitrary additional data for specific operations
}).passthrough();

// Specific schema for project update operations
export const ProjectUpdateResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  changes: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  project: ProjectResultSchema.optional(),
});

/**
 * Helpers to create ScriptResult instances
 */
export function createScriptSuccess<T>(data: T): ScriptSuccess<T> {
  return { success: true, data };
}

export function createScriptError(
  error: string, 
  context?: string, 
  details?: unknown,
  stack?: string
): ScriptError {
  return { success: false, error, context, details, stack };
}

/**
 * Type-safe result unwrapping for error boundary patterns
 * Throws if the result is an error, otherwise returns the data
 */
export function unwrapScriptResult<T>(result: ScriptResult<T>): T {
  if (isScriptSuccess(result)) {
    return result.data;
  }
  
  const error = new Error(`Script execution failed: ${result.error}`);
  error.name = 'ScriptExecutionError';
  if (result.context) {
    error.message += ` (Context: ${result.context})`;
  }
  if (result.stack) {
    error.stack = result.stack;
  }
  throw error;
}
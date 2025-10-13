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

// Schema for task/project list results
export const ListResultSchema = z.object({
  items: z.array(z.unknown()), // Will be tasks or projects
  summary: z.object({
    total: z.number(),
    insights: z.array(z.string()).optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Schema for folder operations
export const FolderResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  parent: z.string().optional(),
  status: z.string().optional(),
});

// Schema for analytics results
export const AnalyticsResultSchema = z.object({
  summary: z.record(z.unknown()),
  data: z.record(z.unknown()).optional(),
  insights: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Schema for simple success/error operations
export const SimpleOperationResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.unknown().optional(),
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
  stack?: string,
): ScriptError {
  return { success: false, error, context, details, stack };
}


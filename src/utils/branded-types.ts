/**
 * Branded Type Utilities for OmniFocus MCP Server
 *
 * Provides type-safe branded types to prevent accidental mixing of different ID types.
 * This eliminates a common source of runtime errors by catching type mismatches at compile time.
 */

/**
 * Base branded type pattern
 */
type Brand<T, B> = T & { readonly __brand: B };

/**
 * OmniFocus ID Types
 * These branded types prevent accidental mixing of different ID types
 */
export type TaskId = Brand<string, 'TaskId'>;
export type ProjectId = Brand<string, 'ProjectId'>;

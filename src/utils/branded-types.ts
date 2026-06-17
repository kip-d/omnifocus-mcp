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
export type TagId = Brand<string, 'TagId'>;
export type FolderId = Brand<string, 'FolderId'>;
export type PerspectiveId = Brand<string, 'PerspectiveId'>;
export type ContextId = Brand<string, 'ContextId'>;

/**
 * Type Guards for Branded Types
 */
export function isTaskId(value: unknown): value is TaskId {
  return typeof value === 'string' && value.length >= 8 && value.length <= 50;
}

export function isProjectId(value: unknown): value is ProjectId {
  return typeof value === 'string' && value.length >= 8 && value.length <= 50;
}

export function isTagId(value: unknown): value is TagId {
  return typeof value === 'string' && value.length >= 8 && value.length <= 50;
}

export function isFolderId(value: unknown): value is FolderId {
  return typeof value === 'string' && value.length >= 8 && value.length <= 50;
}

export function isPerspectiveId(value: unknown): value is PerspectiveId {
  return typeof value === 'string' && value.length >= 8 && value.length <= 50;
}

export function isContextId(value: unknown): value is ContextId {
  return typeof value === 'string' && value.length >= 8 && value.length <= 50;
}

/**
 * Type-safe ID map for working with collections of branded IDs
 */
export type IdMap<T extends string, V> = Record<Brand<T, string>, V>;

/**
 * Create a type-safe ID map
 */
export function createIdMap<T extends string, V>(entries: [Brand<T, string>, V][]): IdMap<T, V> {
  return Object.fromEntries(entries) as IdMap<T, V>;
}

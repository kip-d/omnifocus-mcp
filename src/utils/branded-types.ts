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
 * Conversion Functions - Safe conversion from string to branded types
 */
export function asTaskId(id: string): TaskId {
  if (!isTaskId(id)) {
    throw new Error(`Invalid TaskId: ${id}`);
  }
  return id as TaskId;
}

export function asProjectId(id: string): ProjectId {
  if (!isProjectId(id)) {
    throw new Error(`Invalid ProjectId: ${id}`);
  }
  return id as ProjectId;
}

export function asTagId(id: string): TagId {
  if (!isTagId(id)) {
    throw new Error(`Invalid TagId: ${id}`);
  }
  return id as TagId;
}

export function asFolderId(id: string): FolderId {
  if (!isFolderId(id)) {
    throw new Error(`Invalid FolderId: ${id}`);
  }
  return id as FolderId;
}

export function asPerspectiveId(id: string): PerspectiveId {
  if (!isPerspectiveId(id)) {
    throw new Error(`Invalid PerspectiveId: ${id}`);
  }
  return id as PerspectiveId;
}

export function asContextId(id: string): ContextId {
  if (!isContextId(id)) {
    throw new Error(`Invalid ContextId: ${id}`);
  }
  return id as ContextId;
}

/**
 * Optional Conversion Functions - Safe conversion that returns undefined for invalid IDs
 */
export function tryAsTaskId(id: string): TaskId | undefined {
  return isTaskId(id) ? (id as TaskId) : undefined;
}

export function tryAsProjectId(id: string): ProjectId | undefined {
  return isProjectId(id) ? (id as ProjectId) : undefined;
}

export function tryAsTagId(id: string): TagId | undefined {
  return isTagId(id) ? (id as TagId) : undefined;
}

export function tryAsFolderId(id: string): FolderId | undefined {
  return isFolderId(id) ? (id as FolderId) : undefined;
}

export function tryAsPerspectiveId(id: string): PerspectiveId | undefined {
  return isPerspectiveId(id) ? (id as PerspectiveId) : undefined;
}

export function tryAsContextId(id: string): ContextId | undefined {
  return isContextId(id) ? (id as ContextId) : undefined;
}

/**
 * Generic branded type utilities
 */
export function createBrandedType<T extends string, B extends string>(value: T, _brand: B): Brand<T, B> {
  return value as Brand<T, B>;
}

export function isBrandedType<T extends string>(
  value: unknown,
  validator: (v: string) => boolean,
): value is Brand<T, string> {
  return typeof value === 'string' && validator(value);
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

/**
 * Type guards for safer type checking
 */

/**
 * Check if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Check if value has an error property
 */
export function hasErrorProperty(value: unknown): value is { error: boolean; message?: string } {
  return isObject(value) && 'error' in value && typeof value.error === 'boolean';
}

/**
 * Check if value is an error response
 */
export function isErrorResponse(value: unknown): value is { error: boolean; message: string } {
  return hasErrorProperty(value) && value.error === true && typeof value.message === 'string';
}

/**
 * Safely get a string property from an object
 */
export function getStringProperty(obj: unknown, key: string): string | undefined {
  if (!isObject(obj)) return undefined;
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Safely get a number property from an object
 */
export function getNumberProperty(obj: unknown, key: string): number | undefined {
  if (!isObject(obj)) return undefined;
  const value = obj[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Safely get a boolean property from an object
 */
export function getBooleanProperty(obj: unknown, key: string): boolean | undefined {
  if (!isObject(obj)) return undefined;
  const value = obj[key];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Safely get an array property from an object
 */
export function getArrayProperty<T = unknown>(obj: unknown, key: string): T[] | undefined {
  if (!isObject(obj)) return undefined;
  const value = obj[key];
  return Array.isArray(value) ? value as T[] : undefined;
}

/**
 * Safely parse JSON with type guard
 */
export function safeJsonParse<T = unknown>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Value is null or undefined');
  }
}

/**
 * Type guard for script results that may be string or object
 */
export function isScriptResult(value: unknown): value is string | Record<string, unknown> {
  return typeof value === 'string' || isObject(value);
}

/**
 * Safe toString that handles any value type
 */
export function safeToString(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

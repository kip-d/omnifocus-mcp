/**
 * Standardized response format utilities for OmniFocus MCP tools
 * Ensures consistent, predictable responses across all tools
 */

export interface StandardMetadata {
  // Operation info
  operation: string;
  timestamp: string;

  // Performance/source info
  from_cache: boolean;
  query_time_ms?: number;

  // Pagination/count info (for list operations)
  total_count?: number;
  returned_count?: number;
  has_more?: boolean;

  // Operation-specific metadata
  [key: string]: any;
}

export interface StandardResponse<T> {
  // Status
  success: boolean;

  // Main payload
  data: T;

  // Metadata
  metadata: StandardMetadata;

  // Error handling (only when success: false)
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Create a successful response with standardized format
 */
export function createSuccessResponse<T>(
  operation: string,
  data: T,
  metadata: Partial<StandardMetadata> = {},
): StandardResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      ...metadata,
    },
  };
}

/**
 * Create an error response with standardized format
 */
export function createErrorResponse<T = never>(
  operation: string,
  errorCode: string,
  message: string,
  details?: any,
  metadata: Partial<StandardMetadata> = {},
): StandardResponse<T> {
  return {
    success: false,
    data: null as T,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      ...metadata,
    },
    error: {
      code: errorCode,
      message,
      details,
    },
  };
}

/**
 * Create a list response with count information
 */
export function createListResponse<T>(
  operation: string,
  items: T[],
  metadata: Partial<StandardMetadata> = {},
): StandardResponse<{ items: T[] }> {
  return createSuccessResponse(
    operation,
    { items },
    {
      total_count: items.length,
      returned_count: items.length,
      ...metadata,
    },
  );
}

/**
 * Create a single entity response (for CRUD operations)
 */
export function createEntityResponse<T>(
  operation: string,
  entityType: string,
  entity: T,
  metadata: Partial<StandardMetadata> = {},
): StandardResponse<{ [key: string]: T }> {
  return createSuccessResponse(
    operation,
    { [entityType]: entity },
    metadata,
  );
}

/**
 * Create an analytics response with structured data and summary
 */
export function createAnalyticsResponse<T>(
  operation: string,
  stats: T,
  summary: any = {},
  metadata: Partial<StandardMetadata> = {},
): StandardResponse<{ stats: T; summary: any }> {
  return createSuccessResponse(
    operation,
    { stats, summary },
    metadata,
  );
}

/**
 * Wrap an existing response in the standard format (for gradual migration)
 */
export function wrapLegacyResponse<T>(
  operation: string,
  legacyResponse: T,
  metadata: Partial<StandardMetadata> = {},
): StandardResponse<T> {
  // If the legacy response already has error info, convert to error response
  if (typeof legacyResponse === 'object' && legacyResponse !== null && 'error' in legacyResponse) {
    const errorResponse = legacyResponse as any;
    return createErrorResponse(
      operation,
      'LEGACY_ERROR',
      errorResponse.message || 'Unknown error',
      errorResponse,
      metadata,
    );
  }

  return createSuccessResponse(operation, legacyResponse, metadata);
}

/**
 * Helper to measure operation timing
 */
export class OperationTimer {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  toMetadata(): { query_time_ms: number } {
    return { query_time_ms: this.getElapsedMs() };
  }
}

import type { ReadInput } from '../schemas/read-schema.js';

export interface CompiledQuery {
  type: 'tasks' | 'projects' | 'tags' | 'perspectives' | 'folders';
  mode: 'all' | 'search' | 'smart_suggest';
  filters: Record<string, any>;
  fields?: string[];
  sort?: Array<{ field: string; order: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
}

/**
 * QueryCompiler translates builder JSON into parameters for existing tools
 */
export class QueryCompiler {
  compile(input: ReadInput): CompiledQuery {
    const { query } = input;

    // Determine mode
    let mode: CompiledQuery['mode'] = 'all';
    if (query.mode === 'search') mode = 'search';
    else if (query.mode === 'smart_suggest') mode = 'smart_suggest';

    // Pass through filters (existing tools can handle the structure)
    const filters = query.filters || {};

    return {
      type: query.type,
      mode,
      filters,
      fields: query.fields,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
    };
  }
}

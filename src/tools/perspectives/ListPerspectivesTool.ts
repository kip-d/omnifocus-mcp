import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_PERSPECTIVES_SCRIPT } from '../../omnifocus/scripts/perspectives/list-perspectives.js';
import { createSuccessResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { StandardResponse } from '../../utils/response-format.js';
import { coerceBoolean } from '../schemas/coercion-helpers.js';

const ListPerspectivesSchema = z.object({
  includeFilterRules: coerceBoolean()
    .default(false)
    .describe('Include filter rules for custom perspectives'),
  
  sortBy: z.string()
    .default('name')
    .describe('Sort order for perspectives'),
});

interface PerspectiveInfo {
  name: string;
  identifier?: string;
  isBuiltIn?: boolean;
  isActive?: boolean;
  filterRules?: {
    available?: boolean | null;
    flagged?: boolean | null;
    duration?: number | null;
    tags?: string[];
  };
}

export class ListPerspectivesTool extends BaseTool<typeof ListPerspectivesSchema> {
  name = 'list_perspectives';
  description = 'List all available OmniFocus perspectives (built-in and custom) with their filter rules for understanding user workflows';
  schema = ListPerspectivesSchema;

  async executeValidated(args: z.infer<typeof ListPerspectivesSchema>): Promise<StandardResponse<{ perspectives: PerspectiveInfo[] }>> {
    const timer = new OperationTimer();

    try {
      const script = this.omniAutomation.buildScript(LIST_PERSPECTIVES_SCRIPT, {});
      const result = await this.omniAutomation.execute<any>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        return createErrorResponse(
          'list_perspectives',
          'SCRIPT_ERROR',
          result.message || 'Failed to list perspectives',
          { rawResult: result },
          timer.toMetadata(),
        );
      }

      // Parse the result
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        return createErrorResponse(
          'list_perspectives',
          'PARSE_ERROR',
          'Failed to parse perspective list',
          { rawResult: result },
          timer.toMetadata(),
        );
      }

      const perspectives = parsedResult.perspectives || [];
      
      // Sort perspectives
      if (args.sortBy === 'name') {
        perspectives.sort((a: PerspectiveInfo, b: PerspectiveInfo) => 
          a.name.localeCompare(b.name)
        );
      }

      // Filter out filter rules if not requested
      if (!args.includeFilterRules) {
        perspectives.forEach((p: PerspectiveInfo) => {
          delete p.filterRules;
        });
      }

      return createSuccessResponse(
        'list_perspectives',
        { perspectives },
        {
          ...timer.toMetadata(),
          ...parsedResult.metadata,
        },
      );
    } catch (error) {
      return this.handleError(error) as any;
    }
  }
}
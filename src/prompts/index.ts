import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { BasePrompt } from './base.js';
import { WeeklyReviewPrompt } from './gtd/WeeklyReviewPrompt.js';
import { InboxProcessingPrompt } from './gtd/InboxProcessingPrompt.js';
import { GTDPrinciplesPrompt } from './gtd/GTDPrinciplesPrompt.js';
import { EisenhowerMatrixPrompt } from './gtd/eisenhower-matrix.js';
import { TagPerformancePrompt } from './reference/TagPerformancePrompt.js';
import { ToolDiscoveryPrompt } from './reference/ToolDiscoveryPrompt.js';
import { CommonPatternsPrompt } from './reference/CommonPatternsPrompt.js';
import { TroubleshootingPrompt } from './reference/TroubleshootingPrompt.js';
import { QuickReferencePrompt } from './reference/QuickReferencePrompt.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('prompts');

export function registerPrompts(server: Server): void {
  const prompts: Map<string, BasePrompt> = new Map();

  // Register all prompts
  const promptInstances = [
    // GTD Workflow Prompts
    new GTDPrinciplesPrompt(),
    new WeeklyReviewPrompt(),
    new InboxProcessingPrompt(),
    new EisenhowerMatrixPrompt(),

    // Reference/Documentation Prompts
    new TagPerformancePrompt(),
    new ToolDiscoveryPrompt(),
    new CommonPatternsPrompt(),
    new TroubleshootingPrompt(),
    new QuickReferencePrompt(),
  ];

  promptInstances.forEach(prompt => {
    prompts.set(prompt.name, prompt);
  });

  // Handle list prompts request
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    logger.info('Listing available prompts');

    const promptList = Array.from(prompts.values()).map(prompt => prompt.toPrompt());

    return {
      prompts: promptList,
    };
  });

  // Handle get prompt request
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    logger.info(`Getting prompt: ${name}`, { args });

    const prompt = prompts.get(name);
    if (!prompt) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown prompt: ${name}`,
      );
    }

    // Validate required arguments
    for (const arg of prompt.arguments) {
      if (arg.required && !(arg.name in args)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Missing required argument: ${arg.name}`,
        );
      }
    }

    try {
      return prompt.toGetPromptResult(args);
    } catch (error) {
      logger.error(`Error generating prompt messages for ${name}:`, error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to generate prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  });

  logger.info(`Registered ${prompts.size} prompts`);
}

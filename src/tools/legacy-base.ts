import { CacheManager } from '../cache/CacheManager.js';
import { OmniAutomation } from '../omnifocus/OmniAutomation.js';
import { createLogger, Logger } from '../utils/logger.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Legacy base class for tools that haven't been migrated to Zod yet
 * This maintains backward compatibility while we migrate
 */
export abstract class LegacyBaseTool<TArgs = unknown, TResponse = unknown> {
  protected omniAutomation: OmniAutomation;
  protected cache: CacheManager;
  protected logger: Logger;

  constructor(cache: CacheManager) {
    this.cache = cache;
    this.omniAutomation = new OmniAutomation();
    this.logger = createLogger(this.constructor.name);
  }

  abstract name: string;
  abstract description: string;
  abstract inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };

  abstract execute(args: TArgs): Promise<TResponse>;

  protected handleError(error: unknown): never {
    this.logger.error(`Error in ${this.name}:`, error);

    // Check for permission errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('-1743') || errorMessage.includes('not allowed')) {
      throw new McpError(
        ErrorCode.InternalError,
        'Not authorized to send Apple events to OmniFocus',
        {
          code: 'PERMISSION_DENIED',
          instructions: `To grant permissions:
1. You may see a permission dialog - click "OK" to grant access
2. Or manually grant permissions:
   - Open System Settings → Privacy & Security → Automation
   - Find the app using this MCP server (Claude Desktop, Terminal, etc.)
   - Enable the checkbox next to OmniFocus
3. After granting permissions, try your request again`,
        },
      );
    }

    if (error instanceof Error && error.name === 'OmniAutomationError') {
      throw new McpError(
        ErrorCode.InternalError,
        error.message,
        {
          script: (error as any).script,
          stderr: (error as any).stderr,
        },
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'An unknown error occurred',
    );
  }
}
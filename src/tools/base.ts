import { CacheManager } from '../cache/CacheManager.js';
import { OmniAutomation } from '../omnifocus/OmniAutomation.js';
import { createLogger, Logger } from '../utils/logger.js';

export abstract class BaseTool {
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

  abstract execute(args: any): Promise<any>;

  protected handleError(error: any): any {
    this.logger.error(`Error in ${this.name}:`, error);
    
    if (error.name === 'OmniAutomationError') {
      return {
        error: true,
        message: error.message,
        details: {
          script: error.script,
          stderr: error.stderr,
        },
      };
    }
    
    return {
      error: true,
      message: error.message || 'An unknown error occurred',
    };
  }
}
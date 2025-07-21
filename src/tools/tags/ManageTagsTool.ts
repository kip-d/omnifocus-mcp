import { BaseTool } from '../base.js';
import { MANAGE_TAGS_SCRIPT } from '../../omnifocus/scripts/tags.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export class ManageTagsTool extends BaseTool {
  name = 'manage_tags';
  description = 'Create, rename, or delete tags in OmniFocus';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'rename', 'delete', 'merge'],
        description: 'The action to perform',
      },
      tagName: {
        type: 'string',
        description: 'The tag name to create or operate on',
      },
      newName: {
        type: 'string',
        description: 'New name for rename operation',
      },
      targetTag: {
        type: 'string',
        description: 'Target tag for merge operation',
      },
    },
    required: ['action', 'tagName'],
  };

  async execute(args: { action: string; tagName: string; newName?: string; targetTag?: string }): Promise<any> {
    try {
      const { action, tagName, newName, targetTag } = args;
      
      // Validate inputs
      if (action === 'rename' && !newName) {
        throw new McpError(ErrorCode.InvalidParams, 'New name is required for rename action');
      }
      
      if (action === 'merge' && !targetTag) {
        throw new McpError(ErrorCode.InvalidParams, 'Target tag is required for merge action');
      }
      
      // Execute script
      const script = this.omniAutomation.buildScript(MANAGE_TAGS_SCRIPT, { 
        action,
        tagName,
        newName,
        targetTag
      });
      const result = await this.omniAutomation.execute<any>(script);
      
      // Only invalidate cache after successful tag modification
      if (result && !result.error) {
        this.cache.invalidate('tags');
        // Tag changes might affect task filtering, so invalidate tasks too
        this.cache.invalidate('tasks');
      }
      
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }
}
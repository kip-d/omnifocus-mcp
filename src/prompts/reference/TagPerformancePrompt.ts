import { BasePrompt } from '../base.js';
import { TAG_PERFORMANCE_GUIDE } from '../tag-performance-guide.js';
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

export class TagPerformancePrompt extends BasePrompt {
  name = 'tag_performance_guide';
  description = 'Guide for optimizing tag queries in OmniFocus. Shows performance modes and best practices for different use cases.';
  arguments = [];

  generateMessages(_args: Record<string, unknown>): PromptMessage[] {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Show me how to efficiently query tags in OmniFocus.'
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: TAG_PERFORMANCE_GUIDE
        }
      }
    ];
  }
}
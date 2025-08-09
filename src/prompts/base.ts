import {
  PromptMessage,
  PromptReference,
  GetPromptResult,
  Prompt,
} from '@modelcontextprotocol/sdk/types.js';

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export abstract class BasePrompt {
  abstract name: string;
  abstract description: string;
  abstract arguments: PromptArgument[];

  abstract generateMessages(args: Record<string, unknown>): PromptMessage[];

  toPromptReference(): PromptReference {
    return {
      type: 'ref/prompt',
      name: this.name,
    };
  }

  toPrompt(): Prompt {
    return {
      name: this.name,
      description: this.description,
      arguments: this.arguments.map(arg => ({
        name: arg.name,
        description: arg.description,
        required: arg.required ?? false,
      })),
    };
  }

  toGetPromptResult(args: Record<string, unknown>): GetPromptResult {
    return {
      description: this.description,
      messages: this.generateMessages(args),
    };
  }
}

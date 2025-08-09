import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import { BasePrompt, PromptArgument } from '../base.js';

export class InboxProcessingPrompt extends BasePrompt {
  name = 'gtd_process_inbox';
  description = 'Process inbox items using GTD methodology (2-minute rule, delegate, defer, do)';

  arguments: PromptArgument[] = [
    {
      name: 'batch_size',
      description: 'Batch size for processing (default: 5)',
      required: false,
    },
    {
      name: 'auto_create_projects',
      description: 'Auto-create projects for multi-step items (default: false)',
      required: false,
    },
  ];

  generateMessages(args: Record<string, unknown>): PromptMessage[] {
    const batchSize = (args.batch_size as number) || 5;
    const autoCreateProjects = args.auto_create_projects === true;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'I need help processing my OmniFocus inbox using GTD principles.',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: 'I\'ll help you process your inbox using the GTD methodology. Let me first check what\'s in your inbox.',
        },
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Show me the first ${batchSize} items in my inbox with their creation dates.`,
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `For each inbox item, I'll help you decide:

1. **Is it actionable?**
   - If NO → Delete it, file it as reference, or move to someday/maybe
   - If YES → Continue to step 2

2. **Will it take less than 2 minutes?**
   - If YES → Do it now!
   - If NO → Continue to step 3

3. **Am I the right person to do this?**
   - If NO → Delegate it (add a "Waiting For" tag)
   - If YES → Continue to step 4

4. **Is it a single action or a project?**
   - Single action → Add to appropriate context/project
   - Project → ${autoCreateProjects ? 'Create a project with at least one next action' : 'Identify it as a project and define next actions'}

Let's start processing your inbox items one by one.`,
        },
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'For the first inbox item, help me determine if it\'s actionable and what to do with it.',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `After processing each item, I'll help you:

- Assign it to the right project or create a new one
- Add appropriate tags (contexts, energy levels, time estimates)
- Set defer/due dates if needed
- Ensure it has a clear, actionable next step

Common contexts to consider:
- @Computer, @Phone, @Office, @Home, @Errands
- @LowEnergy, @HighEnergy
- @Quick (< 15 min), @Medium (15-60 min), @Long (> 60 min)

Would you like to set up any specific contexts or tags before we continue processing?`,
        },
      },
    ];
  }
}

import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import { BasePrompt, PromptArgument } from '../base.js';

export class EisenhowerMatrixPrompt extends BasePrompt {
  name = 'eisenhower_matrix_inbox';
  description = 'Process inbox items using the Eisenhower Matrix (Urgent/Important quadrants)';

  arguments: PromptArgument[] = [
    {
      name: 'process_all',
      description: 'Process all inbox items (true) or just unprocessed ones (false)',
      required: false,
    },
    {
      name: 'auto_flag',
      description: 'Automatically flag urgent+important tasks',
      required: false,
    },
    {
      name: 'create_projects',
      description: 'Create projects for important but not urgent items',
      required: false,
    },
  ];

  generateMessages(args: Record<string, unknown>): PromptMessage[] {
    const processAll = args.process_all !== false;
    const autoFlag = args.auto_flag === true;
    const createProjects = args.create_projects === true;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'I need help processing my inbox using the Eisenhower Matrix method.',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `I'll help you process your OmniFocus inbox using the Eisenhower Matrix, categorizing tasks into four quadrants based on urgency and importance.

**Q1: Urgent & Important** - DO NOW (Flag + due today)
**Q2: Important, Not Urgent** - SCHEDULE (${createProjects ? 'Create projects' : 'Defer dates'})
**Q3: Urgent, Not Important** - DELEGATE (@waiting tag)
**Q4: Neither** - DELETE/SOMEDAY

Let me check what's in your ${processAll ? 'inbox' : 'unprocessed inbox items'}.`,
        },
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Show me my inbox items so we can categorize them.',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `For each inbox item, I'll help you determine:

1. **Is it important?** (Does it align with your goals/values?)
2. **Is it urgent?** (Is there a real deadline soon?)

Based on these answers, we'll place it in the right quadrant:

**Q1 (Urgent + Important)**: 
- ${autoFlag ? 'I\'ll automatically flag these' : 'You can flag these'}
- Set due date for today or tomorrow
- These need immediate attention

**Q2 (Important, Not Urgent)**:
- ${createProjects ? 'Create projects for multi-step items' : 'Add to existing projects'}
- Set defer dates to schedule work
- This is where you want to spend most time

**Q3 (Urgent, Not Important)**:
- Tag with @delegate or @waiting
- Assign to someone else if possible
- Track but don't do yourself

**Q4 (Neither)**:
- Delete or move to Someday/Maybe
- Be ruthless about eliminating these

Let's start categorizing your inbox items!`,
        },
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'For the first item, help me determine which quadrant it belongs in.',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `Questions to help categorize each task:

- What happens if I don't do this?
- Am I the best person to do this?
- Does this align with my current goals?
- Is there a real deadline or just perceived urgency?
- Can this be batched with similar tasks?

Remember: Most people spend too much time in Q1 (firefighting) and Q3 (interruptions). The goal is to maximize Q2 time (important but not urgent) through better planning.

After categorizing all items, we'll review your matrix distribution to ensure you're focusing on what truly matters.`,
        },
      },
    ];
  }
}
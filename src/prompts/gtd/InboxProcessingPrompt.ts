import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import { BasePrompt, PromptArgument } from '../base.js';

export class InboxProcessingPrompt extends BasePrompt {
  name = 'gtd_process_inbox';
  description = 'Comprehensive inbox processing using GTD methodology with step-by-step guidance through the clarify, organize, and engage workflow';

  arguments: PromptArgument[] = [
    {
      name: 'batch_size',
      description: 'Number of items to process at once (default: 5)',
      required: false,
    },
    {
      name: 'auto_create_projects',
      description: 'Automatically create projects for multi-step items (default: true)',
      required: false,
    },
    {
      name: 'suggest_contexts',
      description: 'Suggest appropriate context tags based on task content (default: true)',
      required: false,
    },
    {
      name: 'quick_mode',
      description: 'Skip detailed analysis, just show items and take action (default: false)',
      required: false,
    },
  ];

  generateMessages(args: Record<string, unknown>): PromptMessage[] {
    const batchSize = (args.batch_size as number) || 5;
    const autoCreateProjects = args.auto_create_projects !== false;
    const suggestContexts = args.suggest_contexts !== false;
    const quickMode = args.quick_mode === true;

    if (quickMode) {
      return [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'I need to quickly process my OmniFocus inbox. Show me what needs attention.',
          },
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: 'I\'ll help you quickly process your inbox. Let me get your inbox items.',
          },
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Show me my inbox items (limit ${batchSize}), sorted by creation date (oldest first). For each, show: name, creation date, and any notes.`,
          },
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `I'll go through each item quickly. For each one, I'll:
- Delete if not actionable
- Complete if it's a 2-minute task
- Move to the right project with appropriate tags
- ${autoCreateProjects ? 'Create a new project if it has multiple steps' : 'Flag it as a project if it needs multiple steps'}

Let's start with the first item.`,
          },
        },
      ];
    }

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'I need help processing my OmniFocus inbox using GTD principles. Guide me through the clarify and organize steps.',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `I'll guide you through comprehensive inbox processing using GTD methodology. This will help you:
- **Clarify** what each item means and whether it's actionable
- **Organize** items into the right projects with proper context
- **Engage** by defining clear next actions

Let me start by checking your inbox.`,
        },
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Show me the first ${batchSize} items in my inbox with:
- Task name and any notes
- Creation date (so I can see how long it's been sitting)
- Whether it has defer/due dates already set
- Any existing tags

Sort by creation date (oldest first) so we handle things that have been waiting longest.`,
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `## GTD Inbox Processing Framework

For each item, I'll guide you through these questions:

### 1. CLARIFY: Is it actionable?
- **NO** → Options:
  - Delete it (no longer relevant)
  - Reference it (useful info, but no action needed)
  - Someday/Maybe (might do later, not now)
- **YES** → Continue to step 2

### 2. DO IT NOW: Will it take less than 2 minutes?
- **YES** → Complete it immediately!
- **NO** → Continue to step 3

### 3. DELEGATE: Am I the right person?
- **NO** → Delegate it:
  - Add "Waiting For" tag
  - Note who you're waiting on
  - Set follow-up defer date
- **YES** → Continue to step 4

### 4. ORGANIZE: Single action or project?
- **Single action** → Assign to project, add context tags, set dates
- **Multiple steps** → ${autoCreateProjects ? "I'll create a project and define next actions" : 'Flag as project and define next actions'}

${suggestContexts ? `### Context Tags I'll Suggest:
**Location:** @computer, @phone, @office, @home, @errands, @anywhere
**Energy:** @high-energy, @low-energy
**Time:** @15min, @30min, @1hour, @deep-work
**People:** @waiting-for, @agenda-{person}
**Priority:** @urgent, @important, @someday` : ''}

Let's start with the first item. I'll analyze it and ask you clarifying questions.`,
        },
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'For the first inbox item, help me determine what it is and what action to take.',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `I'll analyze each item and ask you questions to clarify. After we decide on an action, I'll:

1. **Execute the action** using the appropriate tool:
   - Delete non-actionable items
   - Complete 2-minute tasks
   - Move to projects with context tags
   - Create new projects for multi-step items
   - Delegate with "Waiting For" tracking

2. **Provide a summary** of what was done

3. **Move to the next item** until the batch is complete

Let me look at the first item now and help you process it.`,
        },
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Go ahead and guide me through the first item.',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `Perfect! I'll now:

1. Read the first inbox item details
2. Analyze what it is (actionable? 2-minute task? single action vs project?)
${suggestContexts ? '3. Suggest appropriate context tags based on the content\n4. Ask clarifying questions if needed\n5. Take action based on your decisions' : '3. Ask clarifying questions if needed\n4. Take action based on your decisions'}

After each item is processed, I'll show you a summary and move to the next one.

**Tips for smooth processing:**
- Trust your gut reactions
- Don't overthink - you can always refine later
- Focus on defining the very next physical action
- When in doubt, break it down further

Ready to process the first item!`,
        },
      },
    ];
  }
}

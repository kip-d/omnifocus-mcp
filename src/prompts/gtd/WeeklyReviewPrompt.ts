import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import { BasePrompt, PromptArgument } from '../base.js';

export class WeeklyReviewPrompt extends BasePrompt {
  name = 'gtd_weekly_review';
  description = 'Guide through a complete GTD weekly review with focus on stale projects';
  
  arguments: PromptArgument[] = [
    {
      name: 'review_days',
      description: 'Number of days to look back for completed tasks (default: 7)',
      required: false
    },
    {
      name: 'stale_project_days',
      description: 'Consider projects stale if not reviewed in this many days (default: 30)',
      required: false
    },
    {
      name: 'include_someday_maybe',
      description: 'Include review of someday/maybe projects (default: true)',
      required: false
    }
  ];
  
  generateMessages(args: Record<string, unknown>): PromptMessage[] {
    const reviewDays = (args.review_days as number) || 7;
    const staleProjectDays = (args.stale_project_days as number) || 30;
    const includeSomedayMaybe = args.include_someday_maybe !== false;
    
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Let's do a comprehensive GTD weekly review. I'll guide you through each step to ensure nothing falls through the cracks.`
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `I'll help you with your GTD weekly review. Let me start by gathering information about your current state.

## Step 1: Empty Your Inbox
First, let's check your inbox to process any unprocessed items.`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Check my OmniFocus inbox for any unprocessed items.'
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `## Step 2: Review Completed Tasks
Now let's review what you accomplished in the last ${reviewDays} days to acknowledge your progress.`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Show me all tasks I completed in the last ${reviewDays} days, grouped by project.`
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `## Step 3: Review Active Projects
Next, let's review all your active projects, starting with those that haven't been reviewed in the longest time.`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `List all active projects sorted by last review date (oldest first). For each project, show:
- Name and folder
- Last review date
- Days since last review
- Number of available tasks
- Whether it's flagged
- Any due date

Highlight projects that haven't been reviewed in over ${staleProjectDays} days as these may be candidates for:
- Moving to someday/maybe
- Dropping entirely
- Breaking down into smaller, more actionable projects`
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `## Step 4: Check Project Health
Now I'll analyze each stale project to help you decide its fate.`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `For each project that hasn't been reviewed in over ${staleProjectDays} days, analyze:
1. Does it have any available next actions?
2. When was the last task completed in this project?
3. Is it truly actionable or should it be someday/maybe?
4. Could it be delegated or dropped?`
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `## Step 5: Review On-Hold Projects
Let's check your on-hold projects to see if any should be reactivated.`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Show me all on-hold projects with their defer dates and notes about why they are on hold.'
        }
      },
      ...(includeSomedayMaybe ? [{
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: '## Step 6: Someday/Maybe Review\nLet\'s review your someday/maybe items to see if any should become active.'
        }
      },
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: 'List all projects with status "onHold" that are in a Someday or Maybe folder, showing when they were last reviewed.'
        }
      }] : []),
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `## Step 7: Calendar Review
Review your calendar for the upcoming week to ensure your task list aligns with your commitments.`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Show me all tasks due in the next 7 days, grouped by day, so I can see if I\'m overcommitted on any particular day.'
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `## Step 8: Next Actions Review
Finally, let's ensure every active project has at least one clear next action.`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Find all active projects that have zero available tasks. These need immediate attention to define next actions.'
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `## Weekly Review Complete!

Based on this review, I recommend:
1. Processing any inbox items immediately
2. Celebrating your completed tasks
3. Making decisions about stale projects (move to someday/maybe, drop, or reactivate with clear next actions)
4. Ensuring every active project has at least one available next action
5. Adjusting any due dates that conflict with your calendar

Would you like me to help you take action on any of these recommendations?`
        }
      }
    ];
  }
}
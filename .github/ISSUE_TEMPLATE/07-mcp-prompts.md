---
name: MCP Prompts Implementation
about: Implement MCP prompts for GTD workflows
title: '[MCP] Add Prompts for Common GTD Workflows'
labels: 'enhancement, mcp-compliance, priority-low'
assignees: ''

---

## Overview
MCP prompts are reusable templates that guide users through common workflows. For a GTD-focused tool like OmniFocus, prompts could significantly improve user experience by providing structured workflows.

## Proposed Prompts

### 1. Weekly Review Prompt
```typescript
{
  name: "weekly_review",
  description: "Guide through a complete GTD weekly review",
  arguments: [
    {
      name: "include_completed",
      description: "Review completed tasks from the past week?",
      required: false
    },
    {
      name: "review_days",
      description: "Number of days to review",
      required: false
    }
  ],
  // The prompt would guide through:
  // 1. Inbox processing
  // 2. Project review
  // 3. Someday/maybe review
  // 4. Calendar sync
  // 5. Next actions identification
}
```

### 2. Inbox Processing
```typescript
{
  name: "process_inbox",
  description: "Process all inbox items using GTD methodology",
  arguments: [
    {
      name: "batch_size",
      description: "Process in batches of N items",
      required: false
    }
  ],
  // Guides through:
  // - Is it actionable?
  // - Single action or project?
  // - Delegate, defer, or do?
  // - Proper categorization
}
```

### 3. Daily Planning
```typescript
{
  name: "daily_planning",
  description: "Plan your day with time estimates and priorities",
  arguments: [
    {
      name: "include_overdue",
      description: "Include overdue tasks in planning?",
      required: false
    },
    {
      name: "max_hours",
      description: "Maximum hours to plan for",
      required: false
    }
  ]
}
```

### 4. Project Planning
```typescript
{
  name: "project_planning",
  description: "Natural planning model for new projects",
  arguments: [
    {
      name: "project_name",
      description: "Name of the project to plan",
      required: true
    }
  ],
  // Guides through:
  // 1. Purpose and principles
  // 2. Outcome visioning
  // 3. Brainstorming
  // 4. Organizing
  // 5. Next actions
}
```

## Implementation Plan

### 1. Create Prompt Infrastructure
```typescript
// src/prompts/base.ts
export abstract class BasePrompt {
  abstract name: string;
  abstract description: string;
  abstract arguments: PromptArgument[];
  
  abstract generateMessages(args: Record<string, any>): PromptMessage[];
}
```

### 2. Implement GTD Prompts
```typescript
// src/prompts/gtd/WeeklyReviewPrompt.ts
export class WeeklyReviewPrompt extends BasePrompt {
  name = "weekly_review";
  
  generateMessages(args: Record<string, any>): PromptMessage[] {
    return [
      {
        role: "user",
        content: {
          type: "text",
          text: "Let's do a GTD weekly review. First, let's process your inbox..."
        }
      },
      // Additional messages guiding through the review
    ];
  }
}
```

### 3. Register Prompts
```typescript
// src/prompts/index.ts
export function registerPrompts(server: Server) {
  const prompts = [
    new WeeklyReviewPrompt(),
    new InboxProcessingPrompt(),
    new DailyPlanningPrompt(),
    new ProjectPlanningPrompt()
  ];
  
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: prompts.map(p => p.toJSON()) };
  });
  
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    // Return specific prompt
  });
}
```

## Benefits
- **Guided Workflows**: Step-by-step GTD methodology
- **Consistency**: Standardized review processes
- **Learning**: Helps users learn GTD principles
- **Efficiency**: Faster than manual processing

## Testing Requirements
- [ ] Test each prompt workflow
- [ ] Validate argument handling
- [ ] Test with MCP Inspector
- [ ] User experience testing

## Documentation Needs
- [ ] GTD workflow documentation
- [ ] Prompt customization guide
- [ ] Best practices for prompt design
- [ ] Video tutorials for each workflow

## Future Enhancements
- Custom prompt creation
- Prompt templates marketplace
- AI-assisted prompt refinement
- Workflow analytics
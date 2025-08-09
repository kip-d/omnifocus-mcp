import { BasePrompt } from '../base.js';
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

const GTD_PRINCIPLES_GUIDE = `
# GTD Principles for OmniFocus MCP

Based on David Allen's Getting Things Done methodology and OmniFocus's implementation.

## The Five Stages of GTD

### 1. Capture (Collect)
Everything goes into the inbox first. Don't organize while capturing.
\`\`\`javascript
// Quick capture to inbox
await create_task({ 
  name: "Call Bob about project proposal",
  note: "He mentioned concerns in meeting"
  // No project assignment yet - that's processing
});
\`\`\`

### 2. Process (Clarify)
For each inbox item, ask:
- Is it actionable?
- What's the next action?
- Will it take less than 2 minutes?

\`\`\`javascript
// Get inbox items
const inbox = await list_tasks({ 
  inInbox: true,
  completed: false,
  limit: 10
});
\`\`\`

### 3. Organize
Assign to appropriate:
- **Project**: Multi-step outcomes
- **Context** (Tag): Where/when/with whom (@office, @phone, @errands)
- **Defer Date**: Hide until relevant
- **Due Date**: Hard deadlines only

\`\`\`javascript
// Organize from inbox
await update_task({
  taskId: inboxTask.id,
  updates: {
    projectId: "abc123",
    tags: ["@office", "high-energy"],
    deferDate: "2024-01-20"  // Not available until
  }
});
\`\`\`

### 4. Review
Weekly review is critical:
\`\`\`javascript
// Find stale projects (no changes in 30 days)
const projects = await list_projects({ 
  status: ["active"],
  includeStats: true 
});

const stale = projects.items.filter(p => 
  daysSince(p.modifiedDate) > 30
);
\`\`\`

### 5. Do (Engage)
Work from contexts and energy levels:
\`\`\`javascript
// What can I do at the office right now?
const officeTasks = await list_tasks({
  tags: ["@office"],
  available: true,  // Not deferred
  completed: false,
  sortBy: "dueDate"
});
\`\`\`

## Key GTD Concepts in OmniFocus

### Contexts vs Projects
- **Projects**: What you want to achieve (outcomes)
- **Contexts** (Tags): Where/when/how you can do it
- Tasks can have both!

### The 2-Minute Rule
If it takes less than 2 minutes, do it now:
\`\`\`javascript
// During inbox processing
if (estimatedMinutes <= 2) {
  // Just do it!
  await complete_task({ taskId: task.id });
} else {
  // Organize it properly
  await update_task({ /* ... */ });
}
\`\`\`

### Natural Planning Model
For new projects:
1. Purpose/principles
2. Outcome visioning
3. Brainstorming
4. Organizing
5. Next actions

### Weekly Review Checklist
1. **Get Clear**
   - Process inbox to zero
   - Process loose papers
   - Empty your head

2. **Get Current**
   - Review action lists
   - Review previous calendar
   - Review upcoming calendar
   - Review waiting-for list
   - Review project list
   - Review someday/maybe list

3. **Get Creative**
   - Any new projects?
   - Any project to activate?
   - Brainstorm on stuck projects

## GTD Best Practices with MCP

### Capture Without Thinking
\`\`\`javascript
// Brain dump - just capture
const thoughts = [
  "Website redesign",
  "Mom's birthday gift",
  "Fix leaky faucet",
  "Learn Spanish"
];

for (const thought of thoughts) {
  await create_task({ name: thought });
}
// Process and organize later!
\`\`\`

### Use Defer Dates Liberally
Hide future tasks to reduce overwhelm:
\`\`\`javascript
await update_task({
  taskId: task.id,
  updates: {
    deferDate: "2024-02-01",  // Hide until February
    tags: ["someday-maybe"]
  }
});
\`\`\`

### Contexts for Energy and Location
\`\`\`javascript
// High-energy morning work
const brainWork = await list_tasks({
  tags: ["high-energy", "@computer"],
  available: true
});

// Low-energy evening tasks
const easyStuff = await list_tasks({
  tags: ["low-energy", "@home"],
  available: true
});
\`\`\`

### Review Triggers
Find projects that need attention:
\`\`\`javascript
// Projects with no available next actions
const stuck = await analyze_productivity({
  groupBy: "project"
}).then(stats => 
  stats.projects.filter(p => p.availableTaskCount === 0)
);
\`\`\`

## Common GTD Contexts
- @computer, @office, @home, @phone
- @errands, @anywhere
- @waiting-for (delegated tasks)
- high-energy, low-energy
- quick-wins (< 15 minutes)

Remember: The system is only as good as your weekly review!
`;

export class GTDPrinciplesPrompt extends BasePrompt {
  name = 'gtd_principles';
  description = 'Core GTD (Getting Things Done) principles and how to implement them with OmniFocus MCP. Based on David Allen\'s methodology.';
  arguments = [];

  generateMessages(_args: Record<string, unknown>): PromptMessage[] {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Explain GTD principles and how to implement them with OmniFocus MCP.',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: GTD_PRINCIPLES_GUIDE,
        },
      },
    ];
  }
}

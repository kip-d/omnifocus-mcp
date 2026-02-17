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
omnifocus_write({ mutation: { operation: "create", target: "task", data: {
  name: "Call Bob about project proposal",
  note: "He mentioned concerns in meeting"
  // No project assignment = goes to inbox
}}})
\`\`\`

### 2. Process (Clarify)
For each inbox item, ask:
- Is it actionable?
- What's the next action?
- Will it take less than 2 minutes?
- Am I the right person? (If not, delegate)

\`\`\`javascript
// Get inbox items
omnifocus_read({ query: { type: "tasks", filters: { project: null }, limit: 10 } })
\`\`\`

### 3. Organize
Assign to appropriate:
- **Project**: Multi-step outcomes
- **Context** (Tag): Where/when/with whom (@office, @phone, @errands)
- **Defer Date**: Hide until relevant
- **Due Date**: Hard deadlines only

\`\`\`javascript
// Organize from inbox
omnifocus_write({ mutation: { operation: "update", target: "task", id: "...", changes: {
  project: "Project Name",
  addTags: ["@office", "@high-energy"],
  deferDate: "2026-02-20"  // Not available until then
}}})
\`\`\`

### 4. Review
Weekly review is critical:
\`\`\`javascript
// Find stale projects
omnifocus_read({ query: { type: "projects", filters: { status: "active" } } })

// Check which need review
omnifocus_analyze({ analysis: { type: "manage_reviews", params: { operation: "list_for_review" } } })
\`\`\`

### 5. Do (Engage)
Choose based on four criteria: context, time available, energy, priority.
\`\`\`javascript
// What can I do at the office right now?
omnifocus_read({ query: { type: "tasks", mode: "available",
  filters: { tags: { any: ["@office"] } },
  sort: [{ field: "dueDate", direction: "asc" }], limit: 20
} })
\`\`\`

## Key GTD Concepts in OmniFocus

### Contexts vs Projects
- **Projects**: What you want to achieve (outcomes)
- **Contexts** (Tags): Where/when/how you can do it
- Tasks can have both!

### The 2-Minute Rule
If it takes less than 2 minutes, do it now:
\`\`\`javascript
// Complete a quick task during inbox processing
omnifocus_write({ mutation: { operation: "complete", target: "task", id: "..." } })

// Organize longer tasks properly
omnifocus_write({ mutation: { operation: "update", target: "task", id: "...", changes: {
  project: "...", addTags: ["@computer"]
}}})
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
// Brain dump - batch capture to inbox
omnifocus_write({ mutation: { operation: "batch", target: "task", operations: [
  { operation: "create", target: "task", data: { name: "Website redesign" } },
  { operation: "create", target: "task", data: { name: "Mom's birthday gift" } },
  { operation: "create", target: "task", data: { name: "Fix leaky faucet" } },
  { operation: "create", target: "task", data: { name: "Learn Spanish" } },
]}})
// Process and organize later!
\`\`\`

### Use Defer Dates Liberally
Hide future tasks to reduce overwhelm:
\`\`\`javascript
omnifocus_write({ mutation: { operation: "update", target: "task", id: "...", changes: {
  deferDate: "2026-03-01",  // Hide until March
  addTags: ["@someday"]
}}})
\`\`\`

### Contexts for Energy and Location
\`\`\`javascript
// High-energy morning work
omnifocus_read({ query: { type: "tasks", mode: "available",
  filters: { tags: { any: ["@high-energy", "@computer"] } }, limit: 10
} })

// Low-energy evening tasks
omnifocus_read({ query: { type: "tasks", mode: "available",
  filters: { tags: { any: ["@low-energy", "@home"] } }, limit: 10
} })
\`\`\`

### Review Triggers
Find projects that need attention:
\`\`\`javascript
// Projects due for review
omnifocus_analyze({ analysis: { type: "manage_reviews", params: { operation: "list_for_review" } } })

// Overdue analysis for bottlenecks
omnifocus_analyze({ analysis: { type: "overdue_analysis" } })
\`\`\`

## Common GTD Contexts
- @computer, @office, @home, @phone
- @errands, @anywhere
- @waiting-for (delegated tasks)
- @high-energy, @low-energy
- @15min, @30min (quick wins by time)

Remember: The system is only as good as your weekly review!
`;

export class GTDPrinciplesPrompt extends BasePrompt {
  name = 'gtd_principles';
  description =
    "Core GTD (Getting Things Done) principles and how to implement them with OmniFocus MCP. Based on David Allen's methodology.";
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

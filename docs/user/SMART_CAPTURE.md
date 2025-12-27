# Smart Capture: Meeting Notes → OmniFocus Tasks

Extracts action items from unstructured text (meeting notes, transcripts, emails) and creates OmniFocus tasks.

## Overview

The `parse_meeting_notes` tool:

- **Extracts action items** - Identifies tasks from natural language
- **Detects projects** - Recognizes multi-step work as projects
- **Suggests context tags** - Auto-assigns @computer, @phone, @15min, @urgent, etc.
- **Parses due dates** - Converts "by Friday" → YYYY-MM-DD
- **Estimates duration** - Predicts task time based on keywords
- **Identifies assignees** - Creates tags like @john, @waiting-for-sarah, @agenda-bob
- **Matches to existing projects** - Links tasks to your current projects

## Quick Start

### Basic Usage

```javascript
// Extract and preview
{
  input: "Meeting notes: Send proposal by Friday. Call Sarah tomorrow.",
  returnFormat: "preview"
}
```

**Output:**

```json
{
  "extracted": {
    "tasks": [
      {
        "tempId": "task_1",
        "name": "Send proposal",
        "suggestedTags": ["@computer", "@30min"],
        "suggestedDueDate": "2025-10-05",
        "confidence": "high"
      },
      {
        "tempId": "task_2",
        "name": "Call Sarah",
        "suggestedTags": ["@phone", "@30min", "@sarah"],
        "suggestedDueDate": "2025-10-02",
        "confidence": "high"
      }
    ]
  },
  "summary": {
    "totalTasks": 2,
    "highConfidence": 2
  }
}
```

### Direct Creation

```javascript
// Format for batch_create
{
  input: "...",
  returnFormat: "batch_ready"
}

// Then use batch_create
batch_create({ items: result.batchItems })
```

## Use Cases

### 1. Meeting Notes

```
Meeting: Q4 Planning
- John to send quarterly report by Friday
- Website redesign project: wireframes, development, testing
- Waiting on budget approval from Sarah
- Follow up with client next Tuesday
```

**Extracted:**

- 3 projects with subtasks
- 2 standalone tasks
- Tags: @john, @waiting-for-sarah, @computer
- Due dates parsed from "by Friday", "next Tuesday"

### 2. Email Action Items

```
Hi team,

Quick summary from today's call:
- Send proposal to Acme Corp (urgent!)
- Review Q4 budget numbers
- Schedule demo for next week

Thanks!
```

**Extracted:**

- 3 tasks
- Tags: @urgent, @computer, @30min
- Due date: "next week" → calculated date

### 3. Voice Notes / Transcripts

```
I need to call the client about the proposal
then update the pricing doc
and send it by end of week
also ask Bob about timeline
```

**Extracted:**

- 4 sequential tasks
- Tags: @phone, @computer, @agenda-bob
- Due date: "end of week" → Friday

## Context Tag Detection

### Location Tags

- `@computer` - email, code, document, write, research
- `@phone` - call, contact, discuss
- `@office` - meeting, in-person, presentation
- `@home` - personal, household
- `@errands` - buy, pick up, shop, store
- `@anywhere` - think about, consider

### Time Estimate Tags

- `@15min` - quick, brief, short
- `@30min` - call, review, check
- `@1hour` - meeting, discussion
- `@deep-work` - plan, design, analyze, write

### Priority Tags

- `@urgent` - asap, urgent, critical, immediately
- `@important` - must, essential, required
- `@someday` - maybe, eventually, consider

### People Tags

- `@{name}` - "[Name] to..." (assignee)
- `@waiting-for-{name}` - "Waiting for [Name]"
- `@agenda-{name}` - "Ask/Discuss with [Name]"

## Natural Language Date Parsing

| Input | Result |
|-------|--------|
| `today` | current date |
| `tomorrow` | next day |
| `Monday`, `Tuesday`, etc. | next occurrence |
| `next week` | +7 days |
| `this week` / `end of week` | next Friday |
| `end of month` | last day of month |

**Date phrases:** "by Friday" → due date, "after Monday" → defer date, "before end of week" → due date - 1 day

## Duration Estimation

| Keyword Pattern         | Estimate   |
| ----------------------- | ---------- |
| quick, brief, short     | 15 minutes |
| call, phone, review     | 30 minutes |
| meeting, discussion     | 1 hour     |
| write, create, design   | 1.5 hours  |
| plan, analyze, research | 2 hours    |
| deep work, focus        | 3 hours    |

## Project Detection

1. **Explicit markers**: "Project:", "includes:", "involves:"
2. **Sequential steps**: "then", "after that", "followed by"
3. **Multiple tasks**: Grouped under headers

**Example:**

```
Website Redesign project:
- Review analytics
- Create wireframes
- User testing
```

**Result:** 1 project with 3 subtasks

## Parameters

### Required

- `input` (string) - Meeting notes, transcript, or text to parse

### Optional

**Extraction Control:**

- `extractMode` - What to extract: `"action_items"`, `"projects"`, or `"both"` (default)
- `returnFormat` - Output format: `"preview"` (default) or `"batch_ready"`

**Smart Suggestions:**

- `suggestProjects` (boolean, default: true) - Match to existing projects
- `suggestTags` (boolean, default: true) - Suggest context tags
- `suggestDueDates` (boolean, default: true) - Extract due dates
- `suggestEstimates` (boolean, default: true) - Estimate duration

**Output Control:**

- `groupByProject` (boolean, default: true) - Group tasks by project
- `existingProjects` (string[]) - Known project names for matching
- `defaultProject` (string) - Fallback project for unmatched items

## Confidence Scoring

- **High** - Clear action verb + tags/dates + good length
- **Medium** - Some indicators but missing context
- **Low** - Ambiguous or minimal information

Check `needsReview` in summary for low-confidence items.

## Integration with batch_create

```javascript
// Step 1: Extract
const result = await parse_meeting_notes({
  input: '...',
  returnFormat: 'batch_ready',
});

// Step 2: Create (one call for everything)
await batch_create({
  items: result.batchItems,
  atomicOperation: true,
});
```

## Best Practices

### 1. Structure Your Notes

**Clear:**
```
Action Items:
- Send proposal by Friday
- Call client tomorrow
```

**Vague:**
```
We should probably send the proposal sometime soon...
```

### 2. Use Action Verbs

**Clear:** Send, Call, Review, Update, Create, Schedule

**Vague:** Maybe think about possibly doing something

### 3. Include Context

"Send Q4 proposal to Acme Corp by Friday" beats "send proposal"

### 4. Mark Assignees Clearly

- "John to send report"
- "Waiting for Sarah's approval"
- "Ask Bob about timeline"

### 5. Specify Dates

**Clear:** "by Friday", "next Tuesday", "end of month"

**Vague:** "soon", "later", "sometime"

## Examples

### Example 1: Sprint Planning

**Input:**

```
Sprint Planning - Week of Oct 1

High Priority:
- Complete user authentication (estimate: 3 days)
- Fix payment gateway bug (urgent!)
- Review security audit

Lower Priority:
- Update documentation
- Refactor database queries

Waiting On:
- Design mockups from Sarah
- API keys from DevOps
```

**Result:**

- 5 tasks
- Tags: @urgent, @deep-work, @computer, @waiting-for-sarah, @waiting-for-devops
- Estimates: 3hr (deep work), 30min (review), etc.

### Example 2: Client Meeting

**Input:**

```
Client Call with Acme Corp - Oct 1

Discussed:
- Q4 roadmap priorities
- Timeline concerns

Action Items:
- Send updated proposal by end of week
- Schedule demo for next Tuesday
- John to follow up on pricing
- Check with legal about contract terms
```

**Result:**

- 4 tasks
- Tags: @computer, @john, @phone
- Due dates: Friday, next Tuesday
- Assignee: @john for follow-up

### Example 3: Project Kickoff

**Input:**

```
New Website Project Kickoff

Phase 1 - Research:
- Review current analytics
- User survey
- Competitor analysis

Phase 2 - Design:
- Wireframes
- Mockups
- Design system

Then development and testing
```

**Result:**

- 1 project: "New Website"
- 6 subtasks in sequential order
- Tags: @computer, @deep-work, @1hour

## Tips & Tricks

### Batch Multiple Meetings

```javascript
const meetings = ['Meeting 1: ...', 'Meeting 2: ...'];
const allItems = [];
for (const meeting of meetings) {
  const result = await parse_meeting_notes({ input: meeting, returnFormat: 'batch_ready' });
  allItems.push(...result.batchItems);
}
await batch_create({ items: allItems });
```

### Match to Existing Projects

```javascript
await parse_meeting_notes({
  input: 'Update Client Onboarding documentation',
  existingProjects: ['Client Onboarding', 'Documentation'],
  defaultProject: 'Miscellaneous',
});
// → Task matched to "Client Onboarding" project
```

### Review Before Creating

```javascript
// 1. Preview
const preview = await parse_meeting_notes({ input: '...', returnFormat: 'preview' });
console.log(preview.summary);

// 2. Create if good
const batch = await parse_meeting_notes({ input: '...', returnFormat: 'batch_ready' });
await batch_create({ items: batch.batchItems });
```

## Limitations

1. **Can't complete tasks** - Only you can mark physical tasks done
2. **Can't decide for you** - Tool suggests, you confirm
3. **Can't handle conditionals** - "If X then Y" needs manual review
4. **Needs explicit language** - Action verbs and dates required

**Review manually:** Low confidence items, ambiguous assignees, complex dependencies, sensitive tasks.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| No tasks extracted | No action verbs | Add: Send, Call, Review, Update |
| Wrong tags | Keyword matching imperfect | Review in preview mode |
| Dates not parsed | Unsupported format | Use: today, Friday, next week |
| Tasks not grouped | No project indicators | Use "Project:" or headers |

## See Also

- [batch_create documentation](BATCH_OPERATIONS.md) - For creating items in bulk
- [API Reference](API-REFERENCE-LLM.md) - Complete parameter list
- [GTD Workflow Manual](GTD-WORKFLOW-MANUAL.md) - Inbox processing workflows

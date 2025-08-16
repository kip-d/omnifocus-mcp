# Conversational Task Management Proposal
## Vision for OmniFocus MCP v2.1+

### Executive Summary
This proposal outlines a vision for natural, conversational interaction between users and their OmniFocus task management system via an LLM assistant. The goal is to enable fluid, context-aware task capture, organization, and review through natural language.

## User Stories

### Morning: Capture & Clarify
**User:** "Dump inbox: finalize slides for conference keynote, call Dr. Lee about travel vaccines, send thank-you card to Lynne, brainstorm 5 marketing taglines, check passport expiration."

**LLM:** Intelligently parses, categorizes, and creates tasks with appropriate projects, contexts, and dates based on learned patterns.

### Midday: Organize
**User:** "Break down the slides task"

**LLM:** Creates subtasks using OmniAutomation (via evaluateJavascript bridge)

### Afternoon: Reflect
**User:** "Give me my mini weekly review"

**LLM:** Provides intelligent summary of stalled projects, upcoming deadlines, and actionable suggestions

### Late Afternoon: Engage
**User:** "Give me 3 quick wins before 5 PM"

**LLM:** Suggests tasks based on estimated duration, context, and energy level

## Technical Implementation Path

### Phase 1: Enhanced Natural Language Processing (v2.1)

#### Multi-Task Parsing
```typescript
// New tool: intelligent_task_capture
{
  operation: "parse_dump",
  text: "finalize slides for conference, call Dr. Lee",
  apply_patterns: true // Use learned patterns from CLAUDE.md
}
```

#### Estimated Duration Support
- **Confirmed via API**: OmniFocus stores `estimatedMinutes: number | null` field on tasks
- Accept natural language input and convert to minutes
- Query user for estimates after suggesting based on patterns
- Example flow:
  ```
  LLM: "I'll estimate 'finalize slides' at 45 minutes based on similar tasks. Sound right?"
  User: "Make it 2 hours"
  LLM: [Converts to 120 minutes and updates task.estimatedMinutes]
  ```

##### Natural Language Duration Parser
```typescript
function parseEstimate(input: string): number {
  const patterns = {
    hours: /(\d+\.?\d*)\s*h(ours?)?/i,
    minutes: /(\d+)\s*m(ins?|inutes?)?/i,
    combined: /(\d+)\s*h.*?(\d+)\s*m/i
  };
  
  if (patterns.combined.test(input)) {
    const match = input.match(patterns.combined)!;
    return parseInt(match[1]) * 60 + parseInt(match[2]);
  }
  if (patterns.hours.test(input)) {
    const hours = parseFloat(input.match(patterns.hours)![1]);
    return Math.round(hours * 60);
  }
  if (patterns.minutes.test(input)) {
    return parseInt(input.match(patterns.minutes)![1]);
  }
  // Default: try parsing as number (assume minutes)
  return parseInt(input) || 30;
}
```

#### Subtask Creation via OmniAutomation
```javascript
// Use evaluateJavascript() bridge for subtask creation
app.evaluateJavascript(`
  (() => {
    const parentTask = Task.byIdentifier("${parentId}");
    const subtask = new Task("Polish visuals", parentTask);
    subtask.estimatedMinutes = 15;
    return subtask.id.primaryKey;
  })()
`);
```

### Phase 2: Intelligent Context System (v2.2)

#### Pattern Storage in OmniFocus

##### Recommended Approach: Specialized OmniFocus Project
Store patterns directly in OmniFocus using a dedicated project. This keeps data within the user's ecosystem and survives MCP updates.

```javascript
// Create a hidden pattern storage project
const patternProject = new Project(".LLM Assistant Patterns");
patternProject.status = Project.Status.OnHold; // Hide from active views
patternProject.containsSingletonActions = true;
patternProject.note = JSON.stringify({
  version: "1.0",
  created: new Date().toISOString(),
  description: "DO NOT DELETE - Used by LLM assistant for learning your preferences"
});

// Store patterns as completed tasks with JSON in notes
const createPattern = (type: string, pattern: any) => {
  const task = new Task(`Pattern: ${type}`, patternProject);
  task.note = JSON.stringify(pattern);
  task.completed = true; // Hide from active task lists
  task.completionDate = new Date();
  return task;
};

// Example: Task estimation patterns
createPattern("estimation", {
  match: "slides|presentation|keynote",
  estimatedMinutes: 45,
  confidence: 0.8,
  samples: 12
});

// Example: Project associations
createPattern("project_association", {
  keywords: ["vaccine", "passport", "visa"],
  project: "Travel - Japan 2025",
  confidence: 0.9
});
```

**Pros:**
- Data persists with user's OmniFocus database
- Syncs across all devices automatically
- Survives MCP server updates/reinstalls
- Version controlled with OmniFocus backups
- User maintains full control

**Cons:**
- Uses a project slot (though hidden)
- Could appear in searches unless filtered
- User might accidentally delete
- Requires careful data structure design

##### Alternative: CLAUDE.md File
```yaml
# Simpler but less persistent approach
task_patterns:
  - match: "slides|presentation"
    estimatedMinutes: 45
    learned_from: 12 # number of examples
```

**Recommendation**: Use OmniFocus project for persistence, CLAUDE.md for quick overrides

#### Smart Review Generation
```typescript
// Enhanced review tool
{
  operation: "intelligent_review",
  type: "mini", // or "full"
  // Returns:
  summary: {
    stalled_projects: [...],
    upcoming_deadlines: [...],
    quick_wins: [...], // Tasks < 15 min
    focus_suggestion: "Clear the 2 travel items before trip"
  }
}
```

### Phase 3: Conversational Intelligence (v2.3)

#### Calendar Interaction Pattern
- **No Integration Needed** - Guide user to check their calendar
- Example:
  ```
  LLM: "When would you like to rehearse? (Check your calendar for a 30-min slot tomorrow morning)"
  User: "I'm free at 9 AM"
  LLM: "Perfect, I'll defer 'Rehearse presentation' to tomorrow at 9 AM"
  ```

#### Quick Wins Algorithm
```typescript
interface QuickWin {
  task: Task;
  score: number; // Based on:
  // - estimatedMinutes (prefer < 15)
  // - availability (not deferred)
  // - context match (current location/mode)
  // - completion_likelihood (based on history)
}
```

## Key Technical Decisions

### 1. Context Window Management
**Problem**: Users may have thousands of tasks
**Solution**: 
- Load only active projects (not on-hold/dropped)
- Summarize patterns rather than listing all tasks
- Use smart compression for context

### 2. Natural Language Dates
**Solution Path**:
- Start with relative dates ("tomorrow", "next week")
- Use LLM to parse to specific dates
- Let user correct if needed

### 3. Subtask Creation
**Solution**: Use evaluateJavascript() bridge to access OmniAutomation
- Bypasses JXA limitation (JXA cannot create subtasks properly)
- OmniAutomation supports `new Task(name, parentTask)` constructor
- Maintains proper parent-child relationships
- Can set all properties including estimatedMinutes

### 4. Dynamic Task Breakdown vs Templates
**Decision**: Favor LLM-driven dynamic decomposition over rigid templates
- **Reasoning**: 
  - LLMs can adapt to context and provide reasoning
  - Users can correct and the LLM learns
  - More flexible than static templates
  - Users who want templates already use TaskPaper
- **Implementation**: LLM suggests subtasks, stores successful patterns

### 5. Calendar Integration
**Decision**: No direct integration needed
- **Approach**: Conversational guidance
  ```
  LLM: "When would you like to schedule this? (Check your calendar)"
  User: "Tuesday at 2pm works"
  LLM: "Setting defer date to Tuesday 2pm"
  ```
- **Benefits**: 
  - No complex calendar API needed
  - User maintains control
  - Natural conversation flow

### 6. Learning User Patterns
**Solution**: Hybrid approach using OmniFocus project + conversation history
- Store learned patterns in OmniFocus (persistent)
- Keep recent interactions in memory (responsive)
- Periodically extract patterns from history to OmniFocus

## Implementation Priority

### Must Have (v2.1)
- [x] Multi-task parsing from natural language
- [x] Estimated duration support
- [x] Subtask creation via OmniAutomation
- [x] Basic pattern matching

### Should Have (v2.2)
- [ ] Intelligent review summaries
- [ ] Quick wins suggestions
- [ ] Stalled project detection
- [ ] User preference system

### Nice to Have (v2.3)
- [ ] Completion streak tracking
- [ ] Energy-based task suggestions
- [ ] Automation rules
- [ ] Natural language date parsing

## Success Metrics

1. **Task Capture Speed**: Reduce from 5 individual creates to 1 bulk operation
2. **Review Efficiency**: Generate actionable insights in <2 seconds
3. **Task Selection Accuracy**: 90%+ correct project/context assignment
4. **User Satisfaction**: Reduce friction in daily/weekly reviews

## Conversation History Management

### Option A: Store in OmniFocus Pattern Project
```javascript
const conversationTask = new Task("Conversation: 2025-08-15", patternProject);
conversationTask.note = JSON.stringify({
  interactions: [
    {
      timestamp: "2025-08-15T10:00:00Z",
      user_input: "finalize slides for conference",
      llm_action: { 
        created_task: "Finalize slides",
        assigned_project: "Conference 2025",
        estimatedMinutes: 45
      },
      user_correction: { estimatedMinutes: 60 },
      pattern_learned: true
    }
  ]
});
conversationTask.completed = true;
```

### Option B: MCP Context Storage
- Leverage MCP's persistent context capabilities
- Research Claude Desktop's specific implementation
- May not survive server restarts

### Option C: Hybrid Approach (Recommended)
1. **Immediate**: Keep last 10 interactions in memory
2. **Short-term**: Store today's history in MCP context
3. **Long-term**: Extract patterns to OmniFocus nightly
4. **Learning**: Update confidence scores based on corrections

## Review Triggers

### Reactive Approach (Recommended)
Since LLMs primarily respond to user requests:
- Add metadata hints to responses
- Example: "BTW: You have 5 projects with no recent activity"
- Let user decide to investigate
- Store "last_review_date" in pattern project

### Proactive Possibilities
```javascript
// Store review preferences
createPattern("review_schedule", {
  weekly_review_day: "Friday",
  weekly_review_time: "16:00",
  mini_review_frequency: "daily",
  last_full_review: "2025-08-10",
  last_mini_review: "2025-08-15"
});
```

## Research Findings & Decisions

### Confirmed API Capabilities
- `estimatedMinutes: number | null` exists on Task objects
- Projects can store JSON in note fields
- evaluateJavascript() can access full OmniAutomation API
- Task constructor supports parent parameter for subtasks

### Key Design Decisions
1. **Pattern Storage**: OmniFocus project for persistence
2. **Duration Input**: Natural language with conversion to minutes
3. **Task Breakdown**: Dynamic LLM-driven, not template-based
4. **Calendar**: Conversational guidance, no integration
5. **Review Triggers**: Primarily reactive with metadata hints
6. **History**: Hybrid approach with pattern extraction

## Next Steps

1. **Prototype** multi-task parsing with pattern matching
2. **Test** evaluateJavascript() for subtask creation
3. **Design** user preference schema
4. **Build** intelligent review summarization
5. **Iterate** based on user feedback

## Implementation Challenges & Solutions

### Challenge 1: Context Window Limits
**Problem**: Power users may have 5000+ tasks
**Solution**: 
- Smart summarization focusing on active projects
- Pattern-based compression (store patterns, not raw data)
- Hierarchical loading (project → tasks → subtasks)

### Challenge 2: Pattern Conflicts
**Problem**: Multiple patterns might match user input
**Solution**:
- Confidence scoring based on match strength and usage frequency
- User confirmation for low-confidence matches
- Learning from corrections to adjust scores

### Challenge 3: Data Consistency
**Problem**: Patterns in OmniFocus might get out of sync
**Solution**:
- Version tracking in pattern project
- Checksum validation
- Rebuild command if corruption detected

## Conclusion

This conversational approach transforms OmniFocus from a database into an intelligent assistant. By leveraging the LLM's natural language understanding with the MCP server's data access, we can create a truly fluid task management experience.

The key insight is that we don't need perfect automation - we need intelligent conversation that guides users to make better decisions about their tasks and time.

### Critical Success Factors
1. **Use OmniFocus itself as the pattern database** - Elegant and user-controlled
2. **Natural language for duration** - User-friendly input with behind-scenes conversion
3. **Dynamic task breakdown** - LLM intelligence over rigid templates
4. **Conversational calendar coordination** - Guide don't integrate
5. **Hybrid history management** - Balance persistence with performance

---

*Proposal Date: 2025-08-15*
*Updated: 2025-08-15 with research findings*
*Target Release: v2.1+ (Post v2.0 stable)*
*Status: On hold pending v2.0 release - Comprehensive specification ready*
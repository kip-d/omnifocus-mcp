# TODO for Next Session

## PARADIGM SHIFT: Optimize for LLM+User Experience, Not Query Speed

### Context from 2025-08-13 Session
- **Discovery**: We've been optimizing the wrong thing
- **Reality**: Tool execution (5s) is only 50% of user experience (10s total)
- **Failed optimization**: Made performance 25% WORSE by optimizing JavaScript
- **New focus**: Reduce LLM confusion, retries, and processing time

## Priority 1: Tool Consolidation (Saves 5-10s per interaction)

### Task Tools Consolidation
- [ ] Merge into ONE unified `tasks` tool:
  - list_tasks
  - query_tasks
  - get_overdue_tasks
  - get_upcoming_tasks
  - todays_agenda
  - next_actions
  - blocked_tasks
  - available_tasks
  - query_tasks_by_date
- [ ] Use clear `mode` parameter: "list" | "overdue" | "upcoming" | "today" | "search"
- [ ] Remove all deprecated variants

### Project Tools Consolidation
- [ ] Merge project query tools
- [ ] Single `projects` tool with modes

### Why This Matters
- **Current**: LLM reads 15+ tool descriptions, analyzes similarities, picks one
- **After**: LLM reads 4 tools, instant decision
- **Time saved**: 2-3 seconds per query

## Priority 2: Smarter Response Format (Saves 2-3s processing)

### Add Summary to ALL Responses
- [ ] Every response includes `.summary` field
- [ ] Key insights at top level
- [ ] Counts and statistics pre-calculated
- [ ] Example:
```javascript
{
  summary: {
    total: 47,
    key_insight: "5 tasks overdue, 3 are high priority",
    most_overdue: "Tax return (30 days)"
  },
  tasks: [...] // Only if needed
}
```

### Reduce Default Data
- [ ] Change default limit from 100 to 25
- [ ] Return only essential fields by default
- [ ] Details only on request

### Why This Matters
- **Current**: LLM processes 100 tasks × 20 fields = 2000 data points
- **After**: LLM reads summary + 25 essential items
- **Time saved**: 2-3 seconds of LLM processing

## Priority 3: Error Prevention (Saves 5-10s from retries)

### Input Normalization
- [ ] Accept "today", "tomorrow", "next week" for dates
- [ ] Convert string booleans ("true"/"false") automatically
- [ ] Handle common LLM mistakes:
  - Empty strings for optional parameters
  - Quoted numbers
  - Wrong enum capitalization

### Clear Parameter Validation
- [ ] Return helpful errors immediately
- [ ] Suggest correct format in error message
- [ ] Never timeout - fail fast

### Why This Matters
- **Current**: Wrong params → 5s timeout → error → LLM retries → 10s+ wasted
- **After**: Auto-corrected or instant helpful error
- **Time saved**: 5-10 seconds per mistake

## Priority 4: Documentation Overhaul

### Tool Descriptions
- [ ] One-line purpose statement
- [ ] Clear parameter requirements
- [ ] Example response in description
- [ ] NO ambiguity about when to use

### Before:
```
"Query tasks with various filtering options and date ranges"
```

### After:
```
"Get overdue tasks. Returns incomplete tasks past due date. No parameters needed."
```

## What NOT to Do

### ❌ Don't Optimize JavaScript
- Already proven to make things worse
- JXA isn't Node.js
- Not where the time is spent

### ❌ Don't Add More Tools
- More tools = more confusion
- Consolidate instead

### ❌ Don't Return Raw Data
- LLM doesn't need everything
- Summaries are faster

## Success Metrics for v1.16.0

### Old (Wrong) Metrics
- ~~Query executes in <1 second~~
- ~~JavaScript optimization~~
- ~~Whose() elimination~~

### New (Right) Metrics
- ✅ Zero retry rate (first attempt succeeds)
- ✅ LLM picks correct tool 90%+ of time
- ✅ Response processing <2 seconds
- ✅ Total user experience <8 seconds
- ✅ No follow-up questions needed

## Testing Plan

### Create Real-World Test Suite
- [ ] Common user prompts (not tool calls)
- [ ] Measure total wall clock time
- [ ] Track retry rates
- [ ] Monitor LLM processing time

### Example Test Cases:
1. "What's overdue?"
2. "Show me today's tasks"
3. "What should I work on next?"
4. "Find tasks about the budget"

## Implementation Order

### Week 1: Tool Consolidation
1. Design unified tool interfaces
2. Implement mode-based routing
3. Remove deprecated tools
4. Update all tests

### Week 2: Response Optimization
1. Add summary generation
2. Reduce default limits
3. Implement progressive disclosure
4. Test with real LLM

### Week 3: Error Prevention
1. Add input normalization
2. Implement auto-correction
3. Improve error messages
4. Test common mistakes

### Week 4: Documentation & Release
1. Rewrite all tool descriptions
2. Update README
3. Create migration guide
4. Release v1.16.0

## Files to Review Next Session
- `/V1.16.0_REAL_UX_OPTIMIZATION.md` - The new strategy
- `/V1.16.0_OPTIMIZATION_FAILURE_ANALYSIS.md` - Why JS optimization failed
- Tool consolidation mapping (to be created)

## Key Insights to Remember

1. **User experience is 10+ seconds, not 5**
2. **LLM confusion costs more than slow queries**
3. **Retries are the enemy**
4. **Summaries beat raw data**
5. **Clear > Fast**

## Questions for Next Session

1. Should we version the API for backward compatibility?
2. How to handle existing users expecting old tools?
3. Should consolidated tools be one file or modular?
4. What's the best way to generate summaries efficiently?

---

*Updated: 2025-08-13 (Evening)*
*Paradigm Shift: From micro-optimization to macro UX*
*Focus: LLM experience, not JavaScript performance*
*Goal: <8 second total user experience*
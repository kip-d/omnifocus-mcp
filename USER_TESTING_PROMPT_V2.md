# OmniFocus MCP v2.0.0-alpha.3 User Testing Protocol

Welcome to the v2.0.0 testing! This version represents a paradigm shift from optimizing query speed to optimizing the overall LLM+User experience. Please run through these test scenarios and report your findings.

## Pre-Testing Setup
1. Ensure you've installed the latest version (2.0.0-alpha.3)
2. Restart both OmniFocus and Claude Desktop
3. Run the smoke test manually: `npx tsx tests/smoke-test-v2.ts`
4. Confirm all 3 tests pass in under 10 seconds

## Test Scenarios

Please test each scenario and note:
- Response time (fast/acceptable/slow)
- Whether Claude picked the right tool/mode
- If the response was helpful
- Any errors or retries

### 1. Daily Workflow Tests

#### Test 1.1: Morning Planning
Ask: "What should I work on right now?"

Expected: 
- Uses `smart_suggest` mode
- Returns prioritized list based on overdue/due today/flagged
- Provides clear reasoning for priorities
- Response in <8 seconds total

#### Test 1.2: Quick Status Check
Ask: "What's overdue?"

Expected:
- Uses `overdue` mode
- Shows summary first (count, oldest task)
- Lists tasks with days overdue
- No unnecessary details

#### Test 1.3: Today's Focus
Ask: "Show me today's tasks"

Expected:
- Uses `today` mode
- Groups by overdue vs due today
- Shows key insights (e.g., "3 high priority")
- Quick response with summary

### 2. Search and Filter Tests

#### Test 2.1: Text Search
Ask: "Find all tasks about the budget"

Expected:
- Uses `search` mode
- Returns relevant matches
- Shows match count in summary
- No type errors

#### Test 2.2: Project Filter
Ask: "What tasks are in my Work project?"

Expected:
- Correctly filters by project
- Shows project-specific insights
- Handles project name naturally

#### Test 2.3: Upcoming Planning
Ask: "What's coming up in the next week?"

Expected:
- Uses `upcoming` mode with 7 days
- Shows daily breakdown
- Highlights important items

### 3. Project Management Tests

#### Test 3.1: Project Overview
Ask: "Show me my active projects"

Expected:
- Uses projects tool with `active` operation
- Shows count breakdown (active/on-hold/review needed)
- Key insight about reviews
- Quick response

#### Test 3.2: Review Check
Ask: "Which projects need review?"

Expected:
- Uses `review` operation
- Lists projects with days since last review
- Provides actionable summary

#### Test 3.3: Project Creation
Ask: "Create a new project called 'Q1 Planning' with a weekly review"

Expected:
- Correctly creates project
- Sets review interval
- No parameter errors

### 4. Error Handling Tests

#### Test 4.1: Ambiguous Request
Ask: "Show me important stuff"

Expected:
- Claude asks for clarification OR
- Intelligently uses flagged mode
- Helpful response either way

#### Test 4.2: Natural Language Dates
Ask: "What's due tomorrow?"

Expected:
- Correctly interprets "tomorrow"
- No date parsing errors
- Returns appropriate tasks

#### Test 4.3: Mixed Request
Ask: "Show me overdue Work tasks"

Expected:
- Combines overdue + project filter
- Handles compound request correctly
- No confusion or retries

### 5. Performance Tests

#### Test 5.1: Large Query
Ask: "Show me all incomplete tasks" (with limit of 100)

Expected:
- Returns summary first
- Response time acceptable (<10s total)
- Memory/performance stable

#### Test 5.2: Cache Effectiveness
Ask the same question twice: "What's overdue?"

Expected:
- Second response faster (from cache)
- Same results
- Cache indicator in response

#### Test 5.3: Smart Insights
Ask: "What are my bottlenecks?"

Expected:
- Identifies blocked tasks or overloaded projects
- Provides actionable insights
- Goes beyond raw data

## Scoring Guide

Rate each test on a 1-5 scale:
- 5: Perfect - fast, accurate, helpful
- 4: Good - minor issues but usable
- 3: Acceptable - works but could be better
- 2: Poor - significant issues or confusion
- 1: Failed - doesn't work or major errors

## Key Metrics to Report

1. **Tool Selection Accuracy**: Did Claude pick the right tool/mode? (%)
2. **Response Time**: Average time from question to answer
3. **Retry Rate**: How often did Claude need to retry?
4. **Summary Quality**: Were the insights helpful?
5. **Error Recovery**: How well did it handle mistakes?

## Specific v2.0.0 Features to Validate

### ✅ Consolidated Tools
- Only 2 main tools (tasks, projects) instead of 15+
- Mode-based operation selection
- Cleaner tool descriptions

### ✅ Summary-First Responses
- Summary appears before data
- Key insights generated
- Breakdown statistics
- Preview of important items

### ✅ Smart Suggestions
- AI-powered prioritization
- Scoring based on overdue/flagged/due today
- Actionable recommendations

### ✅ Performance Metrics
- query_time_ms in metadata
- Cache hit indicators
- Optimization flags used

## Known Issues (Already Fixed in alpha.3)
- ✅ Type coercion for string parameters from MCP bridge
- ✅ .where() method in JXA context
- ✅ Boolean parameters passed as strings

## Reporting Template

Please provide feedback in this format:

```
Version Tested: 2.0.0-alpha.3
Database Size: [number of tasks/projects]
Testing Duration: [time spent testing]

Overall Score: X/5

Tool Selection Accuracy: X%
Average Response Time: Xs
Retry Rate: X%
Summary Quality: X/5
Error Recovery: X/5

Successes:
- [What worked well]

Issues Found:
- [Any problems encountered]

Suggestions:
- [Improvements for beta release]

Would you prefer v2.0 over v1.x? [Yes/No and why]
```

## Questions for Testers

1. Does the smart_suggest mode match your workflow priorities?
2. Are the summaries and insights actually helpful, or just noise?
3. Is the response time improvement noticeable vs v1.x?
4. Any confusion about which tool/mode Claude chooses?
5. Missing any functionality from the old separate tools?

## Thank You!

Your testing is crucial for validating this paradigm shift from raw performance to user experience optimization. The goal is <8 second total experience with zero retries and helpful insights.

Please report findings via GitHub issues or in the testing channel. Include this version hash for reference: `v2.0.0-alpha.3-d46ef8c`
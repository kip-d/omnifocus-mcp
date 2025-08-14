# Testing Protocol for OmniFocus MCP v2.0.0-alpha.2

## Quick Start

Run the smoke test first:
```bash
npm run build
npx tsx tests/smoke-test-v2.ts
```

If all 3 tests pass in <10 seconds, proceed to full testing.

---

## 1. Performance Baseline Matrix

| Operation Phase | Target Time | Maximum | Red Flag |
|-----------------|------------|---------|----------|
| Tool Selection | <300ms | 500ms | >1s |
| Query Execution | <1s typical | 3s complex | >5s |
| Summary Generation | <200ms | 500ms | >1s |
| LLM Processing | <2s | 3s | >5s |
| **Total End-to-End** | **<3s typical** | **5s** | **>8s** |

---

## 2. Expected v2 Response Structure

### Task Query Response
```json
{
  "success": true,
  "summary": {
    "total_count": 127,
    "returned_count": 25,
    "breakdown": {
      "overdue": 10,
      "due_today": 3,
      "upcoming": 12
    },
    "key_insights": [
      "Email migration project has 8 overdue tasks",
      "Purchase orders backlog growing - 5 items pending"
    ],
    "preview": [
      {"id": "abc", "name": "Critical task 1", "dueDate": "..."},
      {"id": "def", "name": "Critical task 2", "dueDate": "..."}
    ]
  },
  "data": {
    "tasks": [/* full results */]
  },
  "metadata": {
    "query_time_ms": 485,
    "from_cache": false,
    "optimization": "summary_first_v2"
  }
}
```

### Project Query Response
```json
{
  "success": true,
  "summary": {
    "total_projects": 47,
    "active": 35,
    "needs_review": 8,
    "overdue_reviews": 3,
    "key_insight": "3 projects haven't been reviewed in 30+ days",
    "bottlenecks": [
      "Email Migration hasn't been reviewed in 45 days",
      "5 active projects with no activity in 14+ days"
    ]
  },
  "data": {
    "projects": [/* project list */]
  }
}
```

---

## 3. Tool Consolidation Tests

### Test: Single Tool Efficiency
```
User: "What should I work on right now?"

V1 BEHAVIOR (avoid):
- 3 tool calls: get_overdue_tasks, todays_agenda, get_flagged_tasks
- Total time: 8s

V2 EXPECTED:
- 1 tool call: tasks(mode="smart_suggest")
- Total time: 3s
- ✅ 60% faster, 67% fewer tool calls
```

### Available Modes

#### Tasks Tool Modes
- `all` - All tasks with optional filters
- `search` - Text search in task names  
- `overdue` - Tasks past their due date
- `today` - Tasks due today or available now
- `upcoming` - Tasks due in next N days
- `available` - Tasks ready to work on
- `blocked` - Tasks waiting on others
- `flagged` - High priority tasks
- `smart_suggest` - AI-powered "what to work on" suggestions

#### Projects Tool Operations
- `list` - List projects with filters
- `create` - Create new project
- `update` - Update existing project
- `complete` - Mark project as done
- `delete` - Delete project

---

## 4. Real-World Workflow Tests

### Daily Review
```
Input: "Start my daily review"

MEASURE:
- Tool calls: ≤2 (target: 1)
- Time to results: <5s
- Summary provides overview: yes/no
- Insights highlight problems: yes/no
```

### Weekly Planning
```
Input: "Help me plan next week"

MEASURE:
- Single consolidated call: yes/no
- Identifies bottlenecks: yes/no
- Total time: <6s
```

### Problem Diagnosis
```
Input: "Why am I falling behind?"

SUCCESS CRITERIA:
- Uses insights from summary
- Identifies patterns in bottlenecks
- Suggests focus areas
- No raw data analysis needed
```

---

## 5. Parameter Type Validation

Ensure correct types are used:

| Parameter | Correct | Incorrect |
|-----------|---------|-----------|
| limit | `25` (number) | `"25"` (string) |
| details | `false` (boolean) | `"false"` (string) |
| mode | `"overdue"` (string) | `overdue` (unquoted) |
| tags | `["work", "urgent"]` | `"work, urgent"` |

---

## 6. Success Scoring Matrix

| Feature | Weight | Score (0-2) | Weighted | Notes |
|---------|--------|-------------|----------|-------|
| Summary-first responses | 3 | _/2 | _/6 | |
| Natural language dates | 2 | _/2 | _/4 | |
| Tool consolidation | 3 | _/2 | _/6 | |
| Response time <5s | 3 | _/2 | _/6 | |
| Error recovery | 2 | _/2 | _/4 | |
| Insights quality | 2 | _/2 | _/4 | |
| **Total** | | | **_/30** | |

**Success Threshold:** 24/30 (80%)

---

## 7. Test Report Template

```markdown
# OmniFocus MCP v2.0.0-alpha.2 Test Results

## Environment
- Version: v2.0.0-alpha.2  
- Date: [date]
- Tester: [name]

## Smoke Test
- [ ] Passed in <10s
- [ ] All 3 tests successful

## Performance
- Average response: __s (target: <3s)
- Tool consolidation: __% fewer calls
- Smart suggestions working: yes/no

## Feature Scores
[Insert scoring matrix]
Total: __/30

## Issues
1. [Issue description]
2. [Issue description]

## Recommendation
[ ] Ready for release
[ ] Minor fixes needed
[ ] Major issues - not ready
```

---

## 8. What NOT to Test

Skip testing these known limitations:
- ❌ Tags during task creation (JXA limitation)
- ❌ Moving tasks to parents after creation
- ❌ Direct perspective access
- ❌ Real-time sync issues

Focus on v2 improvements instead.

---

## Running Integration Tests

```bash
# Build the project
npm run build

# Run smoke test (quick validation)
npx tsx tests/smoke-test-v2.ts

# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Full test suite
npm run test:all
```

---

## Key v2.0.0-alpha.2 Improvements

1. **Summary-First Responses**: All responses lead with actionable summaries
2. **Smart Insights**: Automatic bottleneck and pattern detection
3. **Preview Data**: Top 3 most important items in summary
4. **Performance Metrics**: Query time tracked in metadata
5. **Smart Suggest Mode**: AI-powered task prioritization
6. **Tool Consolidation**: ~20 tools instead of 90+ (with legacy disabled)

---

## Support

For issues or questions about testing, reference:
- GitHub Issues: https://github.com/[your-repo]/issues
- Test session: 2025-08-14 v2.0.0-alpha.2
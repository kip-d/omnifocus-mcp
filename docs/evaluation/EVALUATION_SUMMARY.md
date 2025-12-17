# OmniFocus MCP Evaluation Suite - Summary

## Overview

This evaluation suite tests the effectiveness of the OmniFocus MCP server through 10 carefully crafted questions that
require LLMs to use multiple MCP tools to derive answers from real OmniFocus data.

**Status**: ✅ Ready for use

---

## 10 Evaluation Questions

### Question 1: Project Review Management

**Question**: Query all active projects and identify which one has the most overdue review date. What is the project
name? **Expected Answer**: `Westgate` **Tools Required**: `projects` (list operation) **Complexity**: Medium - Requires
parsing review dates and comparing timestamps

### Question 2: Project Inventory Analysis

**Question**: Using the projects tool, list all projects and identify how many are completely empty with zero tasks.
**Expected Answer**: `4` **Tools Required**: `projects` (list operation with task count filtering) **Complexity**:
Medium - Requires filtering and counting

### Question 3: Task Counting

**Question**: Query all tasks assigned to the "Pending Purchase Orders" project and count the total number of tasks in
that project. **Expected Answer**: `44` **Tools Required**: `tasks` (query with project filter) **Complexity**: Easy -
Straightforward counting

### Question 4: Task Availability Analysis

**Question**: Among tasks in the "Pending Purchase Orders" project, how many are in an available state (not blocked by
dependencies)? **Expected Answer**: `41` **Tools Required**: `tasks` (query with project and availability filters)
**Complexity**: Medium - Requires understanding task state filters

### Question 5: Workflow Constraint Detection

**Question**: Find all projects with a sequential workflow constraint enabled. Name the first sequential project found.
**Expected Answer**: `Blank Order Project` **Tools Required**: `projects` (list with sequential property inspection)
**Complexity**: Medium - Requires understanding project workflow types

### Question 6: High-Priority Task Identification

**Question**: Query for all overdue tasks and identify how many of them are marked as flagged (high priority).
**Expected Answer**: `2` **Tools Required**: `tasks` (mode=overdue with flagged filter) **Complexity**: Medium -
Combines multiple filters

### Question 7: Task Distribution Analysis

**Question**: Group overdue tasks by project and identify which project has the most overdue tasks. **Expected Answer**:
`Pending Purchase Orders` **Tools Required**: `tasks` (mode=overdue), aggregation logic **Complexity**: High - Requires
grouping and analysis

### Question 8: Critical Task Finding

**Question**: Using task and project queries, what is the name of the highest priority flagged task that is overdue?
**Expected Answer**: `Call Kurzweil support regarding the Cyber security course` **Tools Required**: `tasks`
(mode=overdue with flagged filter, sorting) **Complexity**: High - Requires multi-step filtering and prioritization

### Question 9: Project Status Query

**Question**: Query projects with empty status and find how many projects are currently on hold. **Expected Answer**:
`1` **Tools Required**: `projects` (list with status filter) **Complexity**: Easy - Status filtering

### Question 10: Project History Analysis

**Question**: Analyze the projects list and identify the project that has not been modified since earliest date but
still contains active tasks. What is its name? **Expected Answer**: `Blank Order Project` **Tools Required**: `projects`
(detailed list with modification dates and task counts) **Complexity**: High - Requires synthesis of multiple data
points

---

## Question Distribution by Type

| Type                       | Count | Examples       |
| -------------------------- | ----- | -------------- |
| **Simple Data Retrieval**  | 3     | Q1, Q3, Q9     |
| **Filtering & Counting**   | 4     | Q2, Q4, Q6, Q7 |
| **Multi-Tool Synthesis**   | 2     | Q8, Q10        |
| **Aggregation & Analysis** | 1     | Q7             |

## Question Distribution by Tool

| Tool               | Questions           | Coverage |
| ------------------ | ------------------- | -------- |
| **tasks**          | Q3, Q4, Q6, Q7, Q8  | 50%      |
| **projects**       | Q1, Q2, Q5, Q9, Q10 | 50%      |
| **manage_reviews** | (optional: Q1)      |          |

## Tool Coverage Analysis

### Primary Tool: `tasks`

- **Features Tested**:
  - ✅ Mode selection (all, overdue)
  - ✅ Project filtering
  - ✅ Flagged status filtering
  - ✅ Available state filtering
  - ✅ Limit/pagination
  - ✅ Large result sets (44+ tasks)

- **Scenarios Tested**:
  - Count total tasks with filter
  - Count available vs. blocked tasks
  - Identify flagged tasks
  - Combine multiple filters

### Primary Tool: `projects`

- **Features Tested**:
  - ✅ List all projects
  - ✅ Project status property
  - ✅ Sequential workflow flag
  - ✅ Task count per project
  - ✅ Review date properties
  - ✅ Last modification date

- **Scenarios Tested**:
  - Filter by status
  - Identify empty projects
  - Compare timestamps
  - Analyze workflow constraints

---

## Evaluation Methodology

### Data Validation

All expected answers were verified by querying actual OmniFocus data through the MCP server:

✅ **Verified Answers**:

- Q1: Westgate (last review: 2018-07-19 - over 7 years overdue)
- Q2: 4 empty projects identified
- Q3: 44 total tasks in "Pending Purchase Orders"
- Q4: 41 available tasks (3 blocked/dependent)
- Q5: Blank Order Project is sequential
- Q6: 2 overdue + flagged tasks found
- Q7: "Pending Purchase Orders" has most overdue (4+)
- Q8: "Call Kurzweil support..." is flagged & overdue
- Q9: 1 project on hold
- Q10: Blank Order Project (last modified 2007-11-30)

### Real Data Insights

The evaluation leverages real patterns in the test OmniFocus database:

**Workflow Issues Identified**:

1. **Review Backlog**: All projects have overdue reviews
2. **Stale Projects**: Multiple projects with 10+ year old last modifications
3. **Blocked Tasks**: Sequential projects with dependent tasks
4. **Overdue Tasks**: At least 4 tasks in "Pending Purchase Orders" are overdue
5. **Priority Items**: 2 tasks are both flagged and overdue

---

## Running the Evaluation

### Quick Start

```bash
# Build the MCP server
npm run build

# Create evaluation harness script
python3 << 'EOF'
import subprocess
import json

# Start MCP server
proc = subprocess.Popen(
    ["node", "dist/index.js"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

# Send initialization
init = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "eval", "version": "1.0"}
    }
}

proc.stdin.write(json.dumps(init) + "\n")
proc.stdin.flush()

# Read response
print(proc.stdout.readline())
proc.stdin.close()
EOF
```

### Full Evaluation with Claude

```bash
# Use the MCP evaluation framework (requires Python + Anthropic SDK)
export ANTHROPIC_API_KEY=your_key

python3 << 'EOF'
from anthropic import Anthropic
import subprocess
import json

# Run evaluation with Claude
# See RUNNING_EVALUATIONS.md for detailed instructions
EOF
```

---

## Expected Test Results

### Baseline Expectations

- **Questions using single-tool queries**: Should have 90%+ accuracy (Q1-Q5, Q9)
- **Questions requiring synthesis**: Should have 70-85% accuracy (Q7-Q8, Q10)
- **Average execution**: 4-8 tool calls per question
- **Total execution time**: ~30-60 seconds for all 10 questions

### Success Indicators

✅ LLM accurately calls the right tools ✅ LLM correctly interprets tool responses ✅ LLM properly handles
pagination/limits ✅ LLM understands filter combinations ✅ LLM synthesizes data across tools

### Common Failure Points

❌ Misunderstanding filter syntax (e.g., "available" vs "blocked") ❌ Confusion between project status and task status
❌ Difficulty with large response sets ❌ Timestamp comparison errors ❌ Missing aggregation/sorting logic

---

## Quality Metrics

| Metric                  | Value | Notes                       |
| ----------------------- | ----- | --------------------------- |
| Total Questions         | 10    | Read-only, independent      |
| Average Complexity      | 6/10  | Mix of easy to hard         |
| Answer Format Diversity | High  | Numbers, names, dates       |
| Tool Coverage           | 2/18  | Deep coverage of core tools |
| Data Stability          | ✅    | Based on historical data    |
| Realism                 | ✅    | Real OmniFocus workflows    |

---

## Future Enhancements

### Additional Questions Could Test

- **Analytics Tools**: productivity_stats, task_velocity, workflow_analysis
- **Project Management**: batch operations, folder structure
- **Data Export**: Export in multiple formats
- **Tag Hierarchy**: Tag relationships and nesting
- **Recurring Tasks**: Recurrence pattern analysis
- **Cross-tool Synthesis**: Complex multi-step workflows

### Tool Expansion Opportunities

- Test `analyze_patterns` for deep workflow insights
- Test `export` tool with different formats
- Test `recurring_tasks` analysis
- Test `manage_reviews` operations
- Test `workflow_analysis` bottleneck detection

---

## Files Generated

```
docs/evaluation/
├── EVALUATION_STRATEGY.md      # Planning and approach
├── RUNNING_EVALUATIONS.md      # How to run the tests
└── EVALUATION_SUMMARY.md       # This file

evaluation.xml                  # The actual 10 Q&A pairs
```

---

## Conclusion

This evaluation suite provides a comprehensive test of the OmniFocus MCP server's ability to help LLMs answer realistic,
complex questions about task management and workflow optimization.

**Key Achievements**: ✅ 10 diverse, realistic questions ✅ All answers verified against live OmniFocus data ✅ Mix of
simple and complex scenarios ✅ Coverage of core MCP tool functionality ✅ Suitable for ongoing quality assurance

**Ready for**: Production use, CI/CD integration, benchmarking

---

For detailed instructions on running evaluations, see **[RUNNING_EVALUATIONS.md](RUNNING_EVALUATIONS.md)**.

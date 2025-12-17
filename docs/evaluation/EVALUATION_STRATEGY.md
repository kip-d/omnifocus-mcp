# OmniFocus MCP Evaluation Strategy

## Overview

This document outlines the strategy for creating comprehensive evaluations for the OmniFocus MCP server. The evaluations
test whether LLMs can effectively use the MCP tools to answer realistic, complex questions about task management,
productivity, and workflow analysis.

## Tools Available for Evaluation

### Read-Only Analytics Tools (Primary Evaluation Focus)

1. **tasks** - Query tasks with filters, search, date ranges
2. **productivity_stats** - GTD health metrics (completed, overdue, trends)
3. **task_velocity** - Completion trends over time
4. **analyze_overdue** - Bottleneck analysis
5. **workflow_analysis** - Deep workflow patterns
6. **analyze_patterns** - Database-wide pattern detection
7. **perspectives** - Query any OmniFocus perspective
8. **projects** - Project operations and stats
9. **tags** - Tag operations and hierarchy
10. **export** - Export data in multiple formats
11. **recurring_tasks** - Recurring task analysis

### Evaluation Constraints

- **Must use READ-ONLY operations only** (no create/update/delete)
- **Questions must be independent** (not dependent on other question answers)
- **Answers must be stable** (won't change over time)
- **Answers must be verifiable** (single string comparison)

## Question Categories

### 1. Temporal Analysis Questions (3-4 questions)

- Questions about task completion patterns across time periods
- Examples: "In which month of 2024 were the most tasks completed?"
- Tests: task_velocity, productivity_stats, time series reasoning

### 2. Complexity & Effort Questions (2-3 questions)

- Questions about task complexity, estimated minutes, or completion rates
- Examples: "What is the average estimated time for completed tasks?"
- Tests: Task aggregation, estimation accuracy, calculations

### 3. Workflow Pattern Questions (2-3 questions)

- Questions about workflow analysis, bottlenecks, and GTD health
- Examples: "What is the primary bottleneck in your workflow?"
- Tests: workflow_analysis, pattern detection, insight synthesis

### 4. Data Synthesis Questions (2 questions)

- Questions requiring cross-tool synthesis (projects + tasks + analytics)
- Examples: "Which project had the highest completion rate despite being classified as blocked?"
- Tests: Multi-tool coordination, context synthesis, advanced filtering

## Evaluation Process

### Phase 1: Tool Understanding (DONE)

- [x] Document all available tools
- [x] Understand input/output schemas
- [x] Identify read-only operations

### Phase 2: Data Exploration (PENDING)

- [ ] Query tasks to understand project structure
- [ ] Explore productivity stats patterns
- [ ] Identify historical data suitable for stable questions
- [ ] Find natural patterns in workflow data

### Phase 3: Question Generation (PENDING)

- [ ] Create 10 complex questions
- [ ] Verify all are read-only and independent
- [ ] Ensure answers are stable and verifiable

### Phase 4: Answer Verification (PENDING)

- [ ] Solve each question using actual MCP tools
- [ ] Document answer derivation steps
- [ ] Verify answers are stable and correct

### Phase 5: Output (PENDING)

- [ ] Generate evaluation.xml file
- [ ] Document all questions and answers
- [ ] Create evaluation runner script

## Key Design Principles

1. **Realism**: Questions reflect actual use cases (GTD review, productivity analysis)
2. **Complexity**: Each requires multiple tool calls and synthesis
3. **Stability**: Based on closed/historical data that won't change
4. **Clarity**: Questions are unambiguous with single correct answer
5. **Diversity**: Answer types include numbers, dates, project names, categories

## Success Criteria

- ✅ 10 questions generated
- ✅ All questions are read-only and independent
- ✅ All answers are stable and verifiable by string comparison
- ✅ Average question complexity: 4-6 tool calls
- ✅ Mix of question types (temporal, complexity, workflow, synthesis)

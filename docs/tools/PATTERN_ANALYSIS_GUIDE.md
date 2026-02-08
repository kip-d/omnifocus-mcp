# Pattern Analysis Tool Guide

The `analyze_patterns` tool provides database-wide insights by detecting patterns, inefficiencies, and opportunities for
improvement across your entire OmniFocus system.

## Overview

This tool analyzes your tasks and projects to identify:

- Duplicate or near-duplicate tasks
- Dormant projects that haven't been updated
- Tag usage patterns and inefficiencies
- Deadline clustering and overdue patterns
- Tasks that appear to be waiting or blocked
- Unclear next actions
- Projects missing review schedules
- Time estimation patterns

## Basic Usage

Via the unified `omnifocus_analyze` tool:

```javascript
// Analyze all patterns (default when no insights specified)
omnifocus_analyze({
  analysis: { type: 'pattern_analysis' },
});

// Analyze specific patterns
omnifocus_analyze({
  analysis: {
    type: 'pattern_analysis',
    params: { insights: ['duplicates', 'dormant_projects', 'tag_audit'] },
  },
});
```

## Pattern Types

### 1. Duplicate Detection (`duplicates`)

Finds tasks with similar names that might be duplicates.

**Example Request:**

```javascript
omnifocus_analyze({
  analysis: {
    type: 'pattern_analysis',
    params: { insights: ['duplicates'] },
  },
});
// Internal tool defaults: 85% similarity threshold, max 3000 tasks
```

**Example Response:**

```json
{
  "findings": {
    "duplicates": {
      "type": "duplicates",
      "severity": "warning",
      "count": 3,
      "items": [
        {
          "cluster_size": 2,
          "tasks": [
            { "id": "abc123", "name": "Review quarterly report", "project": "Q4 Planning" },
            { "id": "def456", "name": "Review quarterly reports", "project": "Admin" }
          ]
        }
      ],
      "recommendation": "Found 3 potential duplicate task clusters. Review and merge or clarify distinctions."
    }
  }
}
```

### 2. Dormant Projects (`dormant_projects`)

Identifies projects that haven't been modified recently.

**Example Request:**

```javascript
omnifocus_analyze({
  analysis: {
    type: 'pattern_analysis',
    params: { insights: ['dormant_projects'] },
  },
});
// Internal tool default: 90 days dormant threshold
```

**Example Response:**

```json
{
  "findings": {
    "dormant_projects": {
      "type": "dormant_projects",
      "severity": "warning",
      "count": 5,
      "items": [
        {
          "id": "proj789",
          "name": "Website Redesign",
          "days_dormant": 92,
          "last_modified": "2025-05-26T10:30:00Z",
          "task_count": 15,
          "available_tasks": 3
        }
      ],
      "recommendation": "5 projects haven't been modified in over 60 days. Consider reviewing, completing, or dropping them."
    }
  }
}
```

### 3. Tag Audit (`tag_audit`)

Analyzes tag usage patterns, finds underused tags, and identifies potential synonyms.

**Example Request:**

```javascript
omnifocus_analyze({
  analysis: {
    type: 'pattern_analysis',
    params: { insights: ['tag_audit'] },
  },
});
```

**Example Response:**

```json
{
  "findings": {
    "tag_audit": {
      "type": "tag_audit",
      "severity": "info",
      "count": 25,
      "items": {
        "total_tags": 25,
        "underused_tags": [
          { "tag": "someday", "count": 2 },
          { "tag": "waiting-for", "count": 1 }
        ],
        "overused_tags": [{ "tag": "email", "count": 156, "project_spread": 23 }],
        "potential_synonyms": [{ "tag1": "email", "tag2": "e-mail", "similarity": 0.86, "combined_usage": 170 }],
        "entropy": "3.24",
        "entropy_interpretation": "Moderate diversity"
      },
      "recommendation": "7 tags are rarely used. Consider removing or merging them. Found 2 potential tag synonyms that could be merged."
    }
  }
}
```

### 4. Deadline Health (`deadline_health`)

Analyzes overdue tasks and deadline clustering.

**Example Request:**

```javascript
omnifocus_analyze({
  analysis: {
    type: 'pattern_analysis',
    params: { insights: ['deadline_health'] },
  },
});
```

**Example Response:**

```json
{
  "findings": {
    "deadline_health": {
      "type": "deadline_health",
      "severity": "critical",
      "count": 12,
      "items": {
        "overdue_count": 12,
        "overdue_samples": [{ "id": "task001", "name": "Submit expense report", "days_overdue": 5 }],
        "due_today_count": 3,
        "due_this_week_count": 18,
        "bunched_dates": [{ "date": "2025-08-30", "task_count": 8 }]
      },
      "recommendation": "12 tasks are overdue. Prioritize or reschedule them. 2 dates have 5+ tasks due. Consider spreading deadlines more evenly."
    }
  }
}
```

### 5. Waiting For Analysis (`waiting_for`)

Identifies tasks that appear to be waiting or blocked.

**Example Response:**

```json
{
  "findings": {
    "waiting_for": {
      "type": "waiting_for",
      "severity": "info",
      "count": 8,
      "items": [
        {
          "id": "task123",
          "name": "Waiting for client feedback on proposal",
          "project": "Client Project A",
          "reason": "name_pattern",
          "days_waiting": 14
        }
      ],
      "recommendation": "8 tasks appear to be waiting. Review blockers and follow up on dependencies."
    }
  }
}
```

### 6. Next Actions Clarity (`next_actions`)

Finds tasks with vague or unclear action items.

**Example Response:**

```json
{
  "findings": {
    "next_actions": {
      "type": "next_actions",
      "severity": "warning",
      "count": 15,
      "items": [
        {
          "id": "task456",
          "name": "Think about marketing strategy",
          "project": "Q1 Marketing",
          "problems": ["vague_action"]
        },
        {
          "id": "task789",
          "name": "Research options and decide on vendor and create purchase order",
          "problems": ["too_long", "multiple_actions"]
        }
      ],
      "recommendation": "15 tasks may not be clear next actions. Review and clarify with specific, actionable verbs."
    }
  }
}
```

### 7. Review Gaps (`review_gaps`)

Identifies projects that need review attention.

**Example Response:**

```json
{
  "findings": {
    "review_gaps": {
      "type": "review_gaps",
      "severity": "warning",
      "count": 7,
      "items": [
        {
          "id": "proj123",
          "name": "Home Renovation",
          "issue": "never_reviewed",
          "task_count": 24
        },
        {
          "id": "proj456",
          "name": "Learning Spanish",
          "issue": "overdue_review",
          "days_overdue": 21
        }
      ],
      "recommendation": "7 projects need review attention. Schedule a weekly review to stay on top of them."
    }
  }
}
```

## Options

The internal `PatternAnalysisTool` uses these defaults (not directly configurable via the unified API):

| Option                           | Default | Description                                            |
| -------------------------------- | ------- | ------------------------------------------------------ |
| `dormant_threshold_days`         | 90      | Days without activity to consider a project dormant    |
| `duplicate_similarity_threshold` | 0.85    | Similarity threshold for duplicate detection (0.5-1.0) |
| `include_completed`              | false   | Include completed tasks in analysis                    |
| `max_tasks`                      | 3000    | Maximum number of tasks to analyze                     |
| `wip_limit`                      | 5       | WIP limit threshold for analysis                       |

## Complete Examples

### Weekly Review Helper

```javascript
// Get a comprehensive weekly review analysis
omnifocus_analyze({
  analysis: {
    type: 'pattern_analysis',
    params: {
      insights: ['dormant_projects', 'review_gaps', 'deadline_health', 'waiting_for'],
    },
  },
});

// The response will include:
// - Projects that need attention
// - Overdue reviews
// - Critical deadlines
// - Blocked tasks
```

### GTD Cleanup Session

```javascript
// Find inefficiencies and cleanup opportunities
omnifocus_analyze({
  analysis: {
    type: 'pattern_analysis',
    params: {
      insights: ['duplicates', 'tag_audit', 'next_actions'],
    },
  },
});

// The response will identify:
// - Duplicate tasks to merge
// - Unused or redundant tags
// - Vague tasks that need clarification
```

### Project Health Check

```javascript
// Analyze overall system health (default: all patterns)
omnifocus_analyze({
  analysis: { type: 'pattern_analysis' },
});

// Returns comprehensive analysis with health score
// and prioritized recommendations
```

## Understanding the Response

Each pattern analysis returns:

1. **Summary**: Overall health score and key insights
2. **Findings**: Detailed results for each pattern analyzed
3. **Metadata**: Performance metrics and analysis scope

### Severity Levels

- **`info`**: Normal findings, no action required
- **`warning`**: Issues that should be addressed
- **`critical`**: Urgent issues requiring immediate attention

### Health Score

The overall health score (0-100) is calculated based on:

- Number and severity of issues found
- Ratio of problematic items to total items
- Specific pattern thresholds

**Score Interpretation:**

- 80-100: Good - System is well-maintained
- 60-79: Fair - Some attention needed
- Below 60: Needs Attention - Multiple issues requiring action

## Performance Considerations

- The tool uses a "slimmed" data format to minimize memory usage
- Large databases (3000+ tasks) may take 5-10 seconds to analyze
- Results are not cached by default as patterns change frequently
- Set `max_tasks` to limit scope for faster analysis

## Use Cases

### 1. Weekly GTD Review

Run pattern analysis during your weekly review to identify:

- Projects needing review
- Stale or dormant projects
- Overdue and upcoming deadlines
- Waiting/blocked items to follow up

### 2. Quarterly Cleanup

Use for periodic maintenance:

- Merge duplicate tasks
- Consolidate similar tags
- Archive dormant projects
- Clarify vague next actions

### 3. System Optimization

Improve your GTD implementation:

- Identify workflow bottlenecks
- Find deadline clustering
- Analyze tag effectiveness
- Improve task clarity

### 4. Onboarding Analysis

When taking over or auditing a system:

- Get quick overview of system health
- Identify immediate issues
- Find cleanup opportunities
- Understand usage patterns

## Tips and Best Practices

1. **Start Broad, Then Focus**: Run `patterns: ['all']` first to get an overview, then drill into specific patterns.

2. **Adjust Thresholds**: Tune `dormant_threshold_days` and `duplicate_similarity_threshold` based on your workflow.

3. **Regular Reviews**: Run pattern analysis weekly or monthly as part of your review process.

4. **Act on Findings**: The tool identifies issues but doesn't fix them automatically. Use other MCP tools to:
   - Update tasks via `omnifocus_write` with `operation: "update", target: "task"`
   - Complete projects via `omnifocus_write` with `operation: "complete", target: "project"`
   - Manage tags via `omnifocus_write` with `target: "tag"`

5. **Monitor Trends**: Save results over time to track improvement in your system's health score.

## Limitations

- Duplicate detection uses text similarity only (doesn't consider context)
- Waiting task detection relies on naming patterns
- Cannot measure actual time spent vs. estimates
- Pattern detection may have false positives
- Analysis is read-only (doesn't modify data)

## Integration with Other Tools

Combine with other MCP tools for a complete workflow:

```javascript
// 1. Analyze patterns
omnifocus_analyze({
  analysis: {
    type: 'pattern_analysis',
    params: { insights: ['duplicates', 'dormant_projects'] },
  },
});

// 2. Complete a dormant project
omnifocus_write({
  mutation: {
    operation: 'complete',
    target: 'project',
    id: 'proj789', // from analysis results
  },
});

// 3. Delete a duplicate task
omnifocus_write({
  mutation: {
    operation: 'delete',
    target: 'task',
    id: 'task456', // from analysis results
  },
});
```

## Troubleshooting

**Tool times out on large databases:**

- Reduce `max_tasks` option
- Analyze fewer patterns at once
- Run during off-peak hours

**Too many false positive duplicates:**

- Increase `duplicate_similarity_threshold` to 0.9 or higher
- Review naming conventions for consistency

**Not finding expected patterns:**

- Check `include_completed` setting
- Verify `max_tasks` isn't too restrictive
- Ensure OmniFocus has a document open

**Unexpected results:**

- Pattern detection uses heuristics that may not match your workflow
- Adjust thresholds and options to fit your needs
- Some patterns may be intentional (e.g., similar task names in templates)

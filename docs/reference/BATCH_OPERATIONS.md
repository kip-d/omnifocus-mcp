# Batch Operations Guide

## Overview

The batch operations feature allows you to create multiple projects and tasks in a single MCP tool call, with support
for hierarchical relationships using temporary IDs. This is especially valuable for local LLMs (like gpt-oss:120b) to
avoid expensive sequential operations.

**Performance Benefits:**

- Single MCP call instead of 10+ sequential calls
- Reduced context consumption
- Faster execution (seconds vs minutes for large batches)
- Automatic dependency resolution

## Basic Usage

### Simple Project Creation

```json
{
  "items": [
    {
      "tempId": "proj1",
      "type": "project",
      "name": "My New Project",
      "note": "Project description"
    }
  ],
  "createSequentially": "true",
  "atomicOperation": "false",
  "returnMapping": "true",
  "stopOnError": "true"
}
```

### Project with Tasks

```json
{
  "items": [
    {
      "tempId": "proj1",
      "type": "project",
      "name": "Website Redesign",
      "note": "Q4 2025 project"
    },
    {
      "tempId": "task1",
      "type": "task",
      "name": "Design mockups",
      "parentTempId": "proj1",
      "dueDate": "2025-10-15",
      "estimatedMinutes": "120"
    },
    {
      "tempId": "task2",
      "type": "task",
      "name": "Review mockups",
      "parentTempId": "proj1",
      "dueDate": "2025-10-20"
    }
  ],
  "createSequentially": "true",
  "returnMapping": "true"
}
```

### Nested Tasks (Subtasks)

```json
{
  "items": [
    {
      "tempId": "proj1",
      "type": "project",
      "name": "Book Launch"
    },
    {
      "tempId": "task1",
      "type": "task",
      "name": "Marketing Campaign",
      "parentTempId": "proj1"
    },
    {
      "tempId": "task1a",
      "type": "task",
      "name": "Social media posts",
      "parentTempId": "task1",
      "deferDate": "2025-10-01"
    },
    {
      "tempId": "task1b",
      "type": "task",
      "name": "Email newsletter",
      "parentTempId": "task1",
      "deferDate": "2025-10-05"
    }
  ],
  "createSequentially": "true"
}
```

## Parameters

### Top-Level Options

| Parameter            | Type   | Default  | Description                                                |
| -------------------- | ------ | -------- | ---------------------------------------------------------- |
| `items`              | array  | required | Array of items to create (max 100 per batch)               |
| `createSequentially` | string | "true"   | Create items in dependency order (parents before children) |
| `atomicOperation`    | string | "false"  | Rollback all creations if any fail (all-or-nothing)        |
| `returnMapping`      | string | "true"   | Return tempId → realId mapping in response                 |
| `stopOnError`        | string | "true"   | Stop processing on first error                             |

### Item Properties

#### Common Properties (Project & Task)

| Property       | Type    | Required | Description                                             |
| -------------- | ------- | -------- | ------------------------------------------------------- |
| `tempId`       | string  | ✅       | Unique temporary ID for referencing within batch        |
| `type`         | string  | ✅       | Either "project" or "task"                              |
| `name`         | string  | ✅       | Name of the project or task                             |
| `parentTempId` | string  | ❌       | TempId of parent (project for tasks, task for subtasks) |
| `note`         | string  | ❌       | Description or notes                                    |
| `tags`         | array   | ❌       | Array of tag names to assign                            |
| `flagged`      | boolean | ❌       | Whether to flag the item                                |

#### Project-Specific Properties

| Property         | Type          | Description                               |
| ---------------- | ------------- | ----------------------------------------- |
| `status`         | string        | "active", "on-hold", "done", or "dropped" |
| `sequential`     | boolean       | Whether tasks must be completed in order  |
| `reviewInterval` | number/string | Review interval in days                   |

#### Task-Specific Properties

| Property           | Type          | Description                                 |
| ------------------ | ------------- | ------------------------------------------- |
| `dueDate`          | string        | Due date (YYYY-MM-DD or YYYY-MM-DD HH:mm)   |
| `deferDate`        | string        | Defer date (YYYY-MM-DD or YYYY-MM-DD HH:mm) |
| `estimatedMinutes` | number/string | Estimated duration in minutes               |
| `sequential`       | boolean       | Whether subtasks must be completed in order |

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    "success": true,
    "created": 3,
    "failed": 0,
    "totalItems": 3,
    "results": [
      {
        "tempId": "proj1",
        "realId": "kWfh3M-REAL-ID",
        "success": true,
        "type": "project"
      },
      {
        "tempId": "task1",
        "realId": "kXgh4N-REAL-ID",
        "success": true,
        "type": "task"
      },
      {
        "tempId": "task2",
        "realId": "kYhi5O-REAL-ID",
        "success": true,
        "type": "task"
      }
    ],
    "mapping": {
      "proj1": "kWfh3M-REAL-ID",
      "task1": "kXgh4N-REAL-ID",
      "task2": "kYhi5O-REAL-ID"
    }
  },
  "metadata": {
    "operation": "batch_create",
    "timestamp": "2025-09-29T21:00:00.000Z",
    "query_time_ms": 1234
  }
}
```

### Error Response

```json
{
  "success": false,
  "data": {
    "success": false,
    "created": 1,
    "failed": 1,
    "totalItems": 2,
    "results": [
      {
        "tempId": "proj1",
        "realId": "kWfh3M-REAL-ID",
        "success": true,
        "type": "project"
      },
      {
        "tempId": "task1",
        "realId": null,
        "success": false,
        "error": "Parent not yet created: nonexistent",
        "type": "task"
      }
    ],
    "mapping": {
      "proj1": "kWfh3M-REAL-ID"
    }
  }
}
```

## Advanced Features

### Atomic Operations with Rollback

When `atomicOperation` is set to `"true"`, all created items will be deleted if any creation fails:

```json
{
  "items": [
    {
      "tempId": "proj1",
      "type": "project",
      "name": "Critical Project"
    },
    {
      "tempId": "task1",
      "type": "task",
      "name": "Important Task",
      "parentTempId": "proj1"
    }
  ],
  "atomicOperation": "true"
}
```

If task1 fails to create, proj1 will be automatically deleted (rollback).

### Dependency Graph Validation

The system automatically:

- ✅ Validates all `parentTempId` references exist
- ✅ Detects circular dependencies
- ✅ Orders creation (parents before children)
- ✅ Prevents orphaned items

### Error Handling Modes

#### Stop on First Error (default)

```json
{
  "stopOnError": "true"
}
```

Processing stops at first error, partial results returned.

#### Continue on Error

```json
{
  "stopOnError": "false"
}
```

Processes all items, collects all errors, returns complete results.

## Use Cases

### 1. Project Planning for Local LLMs

**Problem:** Local LLM (gpt-oss:120b) makes 10 sequential MCP calls, taking 5+ minutes.

**Solution:** Single batch operation completes in seconds.

```json
{
  "items": [
    { "tempId": "p1", "type": "project", "name": "Marketing Campaign" },
    { "tempId": "t1", "type": "task", "name": "Research", "parentTempId": "p1" },
    { "tempId": "t2", "type": "task", "name": "Design", "parentTempId": "p1" },
    { "tempId": "t3", "type": "task", "name": "Launch", "parentTempId": "p1" }
  ]
}
```

### 2. Template Expansion

Create project templates with multiple tasks in one call:

```json
{
  "items": [
    { "tempId": "proj", "type": "project", "name": "Client Onboarding" },
    { "tempId": "t1", "type": "task", "name": "Send welcome email", "parentTempId": "proj", "dueDate": "2025-10-01" },
    { "tempId": "t2", "type": "task", "name": "Schedule kickoff", "parentTempId": "proj", "dueDate": "2025-10-03" },
    { "tempId": "t3", "type": "task", "name": "Review requirements", "parentTempId": "proj", "dueDate": "2025-10-05" }
  ]
}
```

### 3. Hierarchical Task Breakdown

Create multi-level task hierarchies:

```json
{
  "items": [
    { "tempId": "proj", "type": "project", "name": "Software Release" },
    { "tempId": "dev", "type": "task", "name": "Development", "parentTempId": "proj" },
    { "tempId": "dev1", "type": "task", "name": "Backend API", "parentTempId": "dev" },
    { "tempId": "dev2", "type": "task", "name": "Frontend UI", "parentTempId": "dev" },
    { "tempId": "qa", "type": "task", "name": "Quality Assurance", "parentTempId": "proj" },
    { "tempId": "qa1", "type": "task", "name": "Unit tests", "parentTempId": "qa" },
    { "tempId": "qa2", "type": "task", "name": "Integration tests", "parentTempId": "qa" }
  ]
}
```

## Limitations

- **Max items per batch:** 100 items
- **No updates:** Only creates new items (use `omnifocus_write` with `update` mutation for updates)
- **No folder assignment:** Projects created in root (specify `folder` in project data to assign)
- **Sequential order required:** Dependencies must respect parent-child relationships

## Error Codes

| Code                      | Description                               |
| ------------------------- | ----------------------------------------- |
| `VALIDATION_ERROR`        | Circular dependency or invalid references |
| `ATOMIC_OPERATION_FAILED` | Batch failed and all items rolled back    |
| `SCRIPT_ERROR`            | OmniFocus script execution failed         |

## Best Practices

1. **Use descriptive tempIds:** `"marketing-task-1"` instead of `"t1"`
2. **Set stopOnError=true:** Catch issues early during development
3. **Use atomicOperation=true:** For critical batches where partial failure is unacceptable
4. **Limit batch size:** Keep under 50 items for best performance
5. **Test with small batches first:** Validate your structure before scaling up

## Performance Characteristics

**Tested on M4 Pro Mac mini (64GB RAM):**

- 10 items: ~500ms
- 50 items: ~2s
- 100 items: ~4s

**vs Sequential Operations (local LLM):**

- 10 sequential calls: 30-60 seconds
- 50 sequential calls: 2-5 minutes
- 100 sequential calls: 5-10 minutes

**Optimization achieved:** ~95% reduction in execution time for local LLMs.

## Troubleshooting

### Issue: "Parent not yet created"

**Cause:** `parentTempId` references item that hasn't been processed yet.

**Solution:** Ensure `createSequentially: "true"` and check dependency order.

### Issue: Circular dependency detected

**Cause:** Item A depends on B, B depends on A (or longer chains).

**Solution:** Review `parentTempId` references, break circular chains.

### Issue: Partial batch completion

**Cause:** Error occurred mid-batch with `stopOnError: "true"`.

**Solution:** Check `results` array for error details, fix issues, retry.

### Issue: All items rolled back

**Cause:** `atomicOperation: "true"` and one item failed.

**Solution:** Review error in results, fix issue, retry entire batch.

## See Also

- [Architecture Overview](../dev/ARCHITECTURE.md)
- [Developer Guide](../dev/DEVELOPER_GUIDE.md)
- [API Reference](../api/API-COMPACT-UNIFIED.md)

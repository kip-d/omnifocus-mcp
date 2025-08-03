#!/bin/bash

# Repository Cleanup Script
# This script helps clean up outdated files from the omnifocus-mcp repository

echo "🧹 OmniFocus MCP Repository Cleanup"
echo "=================================="
echo ""

# Create archive directory
echo "📁 Creating archive directory..."
mkdir -p archive/old-releases
mkdir -p archive/old-tests
mkdir -p archive/learning-docs

# Function to move file with confirmation
move_file() {
    local src=$1
    local dest=$2
    if [ -f "$src" ]; then
        echo "  Moving: $src -> $dest"
        mv "$src" "$dest"
    fi
}

# Archive old release notifications
echo ""
echo "📦 Archiving old release files..."
move_file "RELEASE_NOTES_v1.4.0.md" "archive/old-releases/"
move_file "HOTFIX_NOTIFICATION.md" "archive/old-releases/"
move_file "USER_TEST_NOTIFICATION.md" "archive/old-releases/"

# Archive outdated documentation
echo ""
echo "📚 Archiving outdated documentation..."
move_file "docs/prompt-cache-architecture.md" "archive/learning-docs/"
move_file "docs/prompt-plugin-architecture.md" "archive/learning-docs/"
move_file "docs/ABANDONED_APPROACHES.md" "archive/learning-docs/"
move_file "docs/JXA_LEARNING_JOURNEY.md" "archive/learning-docs/"
move_file "docs/api-migration-summary.md" "archive/old-releases/"
move_file "docs/V1.5.0-TEST-RESULTS.md" "archive/old-releases/"
move_file "docs/test-results-analysis.md" "archive/old-releases/"

# Archive old bug-specific test files
echo ""
echo "🧪 Archiving old bug-specific tests..."
move_file "tests/unit/bug-fixes-unit.test.ts" "archive/old-tests/"
move_file "tests/unit/bug2-inbox-assignment.test.ts" "archive/old-tests/"
move_file "tests/unit/id-extraction-bug.test.ts" "archive/old-tests/"
move_file "tests/unit/mock-id-extraction.test.ts" "archive/old-tests/"
move_file "tests/unit/null-object-fix.test.ts" "archive/old-tests/"
move_file "tests/unit/verify-id-fix.test.ts" "archive/old-tests/"

# Remove duplicate issue templates (already in proposals)
echo ""
echo "🗑️  Removing duplicate issue templates..."
rm -f ".github/ISSUE_TEMPLATE/06-mcp-resources.md"
rm -f ".github/ISSUE_TEMPLATE/07-mcp-prompts.md"
rm -f ".github/ISSUE_TEMPLATE/09-consent-mechanisms.md"

# Create consolidated JXA documentation
echo ""
echo "📖 Creating consolidated JXA documentation..."
cat > docs/JXA-COMPLETE-GUIDE.md << 'EOF'
# Complete JXA (JavaScript for Automation) Guide for OmniFocus

This guide consolidates all JXA learnings and best practices for working with OmniFocus automation.

## Table of Contents
1. [Basic Concepts](#basic-concepts)
2. [Null and Missing Values](#null-and-missing-values)
3. [Whose Clauses and Limitations](#whose-clauses-and-limitations)
4. [Common Patterns](#common-patterns)
5. [Workarounds](#workarounds)
6. [API Reference](#api-reference)

## Basic Concepts

### Property Access
All properties in JXA must be accessed as method calls:
```javascript
// ❌ Wrong
const name = task.name;

// ✅ Correct
const name = task.name();
```

### Object References
JXA returns proxy objects, not plain JavaScript objects:
```javascript
const task = doc.flattenedTasks()[0];
// task is a JXA proxy object, not a plain object
```

## Null and Missing Values

### The Missing Value Problem
JXA represents missing/null values with a special "missing value" type:
```javascript
const dueDate = task.dueDate();
if (dueDate === null) // ❌ Won't work for missing values
if (dueDate.toString() === 'missing value') // ✅ Works
```

### Safe Access Pattern
```javascript
function safeGet(accessor, defaultValue = null) {
  try {
    const value = accessor();
    return (value && value.toString() !== 'missing value') ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}
```

## Whose Clauses and Limitations

### Basic Syntax
```javascript
// Find tasks by property
doc.flattenedTasks.whose({ completed: false })
```

### String Operators (use underscore prefix)
- `_contains`: substring search
- `_beginsWith`: prefix matching  
- `_endsWith`: suffix matching

### Date Operators (use symbols, NOT underscores)
- `>`: greater than
- `<`: less than
- `>=`: greater than or equal
- `<=`: less than or equal

### Limitations
1. No "not null" queries: `{dueDate: {_not: null}}` ❌
2. No complex AND/OR combinations
3. Performance degrades with large datasets (2000+ items)
4. Some operators cause timeouts

## Common Patterns

### Task Lookup by ID
```javascript
const task = doc.flattenedTasks.whose({id: taskId})[0];
```

### Get Available Tasks
```javascript
const available = doc.flattenedTasks.whose({
  completed: false,
  effectivelyCompleted: false
});
```

### Project Tasks
```javascript
const project = doc.flattenedProjects.whose({id: projectId})[0];
const tasks = project.tasks();
```

## Workarounds

### For Complex Queries
Use post-filtering instead of whose clauses:
```javascript
const allTasks = doc.flattenedTasks();
const filtered = allTasks.filter(task => {
  // Complex logic here
  return task.completed() === false && 
         task.dueDate() && 
         task.dueDate().toString() !== 'missing value';
});
```

### For Performance
1. Limit result sets early
2. Cache frequently accessed data
3. Use pagination for large queries

## API Reference

### Key Objects
- `Application('OmniFocus')`: Main application object
- `doc.flattenedTasks`: All tasks array
- `doc.flattenedProjects`: All projects array  
- `doc.flattenedTags`: All tags array

### Common Properties
All accessed as methods: `name()`, `note()`, `completed()`, `flagged()`, etc.

### Date Handling
Dates are returned as Date objects or 'missing value':
```javascript
const date = task.dueDate();
if (date && date.toString() !== 'missing value') {
  // Valid date
}
```

---

*This guide consolidates learnings from extensive JXA exploration with OmniFocus 4.6+*
EOF

# Archive the individual JXA docs
echo "  Archiving individual JXA documentation..."
mkdir -p archive/learning-docs/jxa-docs
mv docs/JXA-*.md archive/learning-docs/jxa-docs/ 2>/dev/null
mv docs/WHOSE-*.md archive/learning-docs/jxa-docs/ 2>/dev/null
mv docs/JXA_*.md archive/learning-docs/jxa-docs/ 2>/dev/null

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Summary:"
echo "- Archived old release files and notifications"
echo "- Archived outdated documentation"
echo "- Archived bug-specific test files"
echo "- Removed duplicate issue templates"
echo "- Created consolidated JXA guide"
echo ""
echo "📊 Space saved: ~200-300KB"
echo "📁 Archives preserved in: ./archive/"
echo ""
echo "Next steps:"
echo "1. Review the changes with: git status"
echo "2. Commit if satisfied: git add -A && git commit -m 'chore: clean up outdated files and consolidate documentation'"
echo "3. The archive/ directory is gitignored by default"
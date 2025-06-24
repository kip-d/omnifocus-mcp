My Understanding of the Root Cause

1. The Confusion Timeline

- Initially: The codebase used task.id.primaryKey (property access)
- First Fix: Changed to task.id.primaryKey() (method call) based on FIXES_SUMMARY.md
- Recent Fix (commit 3b240de): For projects, changed back from project.id.primaryKey() to project.id.primaryKey (property)
- Current State: Mixed usage - projects use property, tasks use method

2. The Actual Problem

The error "Can't convert types" occurs when calling task.id.primaryKey() on SOME tasks, not all. Our test showed:
- task.completed() ✓ works
- task.flagged() ✓ works
- task.inInbox() ✓ works
- task.id.primaryKey() ✗ fails with "Can't convert types"
- task.name() ✓ works

This suggests the issue is specific to the id property of certain tasks.

3. The Inconsistency Pattern

Looking at the codebase:
- Line 36 in projects.ts: id: project.id.primaryKey (property)
- Line 125 in projects.ts: id: project.id.primaryKey() (method)
- All of tasks.ts: Uses task.id.primaryKey() (method)

This inconsistency within the same file suggests confusion about the API.

4. The Real Root Cause

Based on the evidence:
1. Some OmniFocus tasks have an id object that throws "Can't convert types" when accessing primaryKey()
2. This is NOT about property vs method - it's about certain tasks having malformed or inaccessible id objects
3. The JXA bridge fails to serialize certain task IDs, possibly due to:
   - Tasks in specific states (recurring, deferred, templates)
   - Tasks without proper initialization
   - Tasks with circular references or complex object structures

5. Why Previous Solutions Were Incomplete

- Changing between property/method access doesn't solve the core issue
- The real problem is that some tasks have IDs that can't be accessed at all
- We need to handle the case where the id object itself is problematic

6. Key Insight

The commit message for projects saying "primaryKey is actually a property" might be wrong. The real issue is that for some objects, accessing the ID fails
regardless of whether we use property or method syntax.

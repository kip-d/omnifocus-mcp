# Pattern Recognition Guide for AI Development

## The Problem

Even with excellent architectural documentation (CLAUDE.md, ARCHITECTURE.md, LESSONS_LEARNED.md), AI assistants sometimes fail to consult them before diving into debugging. This leads to:

- Rediscovering documented solutions
- Wasting time on problems already solved
- Not using existing helper functions
- Violating established patterns

## Example: The Tag Creation Bug

### What I Should Have Done

1. **Read CLAUDE.md FIRST** when I saw "tags not working"
2. **Immediately checked** the "Bridge is REQUIRED for:" section
3. **Looked for existing bridge code** before debugging
4. **Recognized** that `getMinimalTagBridge()` was already included in CREATE_TASK_SCRIPT (line 13!)

Instead, I went into debugging mode and "rediscovered" what was already documented.

## Solutions Implemented

### 1. **Create a PATTERNS.md decision tree**
```markdown
# Common Issue → Pattern Lookup

## Tags not working?
→ Check CLAUDE.md "Bridge is REQUIRED for: Tag assignment"
→ Look for bridgeSetTags() function (already exists in minimal-tag-bridge.ts)
→ Verify CREATE_TASK_SCRIPT includes getMinimalTagBridge()

## Task creation failing?
→ Check ARCHITECTURE.md decision tree
→ Start with Pure JXA, add bridge only when needed

## Performance issues?
→ Check LESSONS_LEARNED.md for empirically verified limits
```

### 2. **Pre-flight Checklist System**
Add to CLAUDE.md:
```markdown
## 🚨 BEFORE DEBUGGING - MANDATORY CHECKLIST
[ ] Searched CLAUDE.md for the feature/error keyword
[ ] Checked ARCHITECTURE.md decision tree
[ ] Looked for existing helper functions (helpers.ts, bridge-helpers.ts)
[ ] Verified current implementation against documented patterns
```

### 3. **Symptom → Documentation Index**
```markdown
# Quick Lookup Index

- **Tags empty/not saving** → CLAUDE.md line 95 "Bridge is REQUIRED"
- **Script timeouts** → LESSONS_LEARNED.md "JXA Performance Rules"
- **Date handling** → CLAUDE.md "Date Formats"
- **MCP testing hangs** → CLAUDE.md "CLI Testing Pattern"
```

### 4. **Explicit Pattern Examples in CLAUDE.md**
```markdown
## Tag Operations - COMPLETE EXAMPLE

❌ DON'T: Use JXA methods
```javascript
task.addTags(tags);  // Fails silently in OF4.x
```

✅ DO: Use bridgeSetTags (already available)
```javascript
const bridgeResult = bridgeSetTags(app, taskId, tagNames);
```

Location: `src/omnifocus/scripts/shared/minimal-tag-bridge.ts:41`
Already included in: CREATE_TASK_SCRIPT via getMinimalTagBridge()
```

## The Real Issue

The documentation is excellent - **AI assistants just need to follow the "Read Architecture Documentation First!" rule**. The structural aids above help enforce this discipline by:

1. Making patterns searchable by symptom
2. Forcing a checklist before debugging
3. Providing concrete code examples at point of need
4. Creating explicit "if you see X, look at Y" mappings

## For Future Development

When encountering ANY issue:
1. **STOP** - Don't start debugging
2. **SEARCH** - Grep for keywords in docs/
3. **CHECK** - Consult the decision trees
4. **VERIFY** - Look for existing helper functions
5. **ONLY THEN** - Begin implementation

This pattern recognition failure cost ~30 minutes of rediscovery. Following the checklist would have taken ~2 minutes and led directly to the solution.

---
name: engage
description: Choose what to work on — context-aware task selection
---

## GTD Principle

Choose based on context, time available, energy, and priority.

## CLI Mode

```bash
# Smart suggestions (considers due dates, flags, context)
omnifocus suggest

# What's due today?
omnifocus today

# Available tasks (not blocked, not deferred)
omnifocus tasks --available

# Flagged priorities
omnifocus flagged

# Quick wins (estimated < 15 min)
omnifocus tasks --available --format json | # filter by estimate
```

## MCP Mode

```json
{ "command": "suggest" }
{ "command": "today" }
{ "command": "flagged" }
```

## Selection Criteria

1. **Context** — What tools/location do I have?
2. **Time** — How much time before next commitment?
3. **Energy** — High energy → complex tasks; low → routine
4. **Priority** — Flagged items, approaching due dates

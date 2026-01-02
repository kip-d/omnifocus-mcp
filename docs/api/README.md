# API Reference Documentation

Complete API specifications for the OmniFocus MCP server v3.0.0.

## Current API (v3.0.0 Unified Builder API)

### **API-COMPACT-UNIFIED.md** - Primary Reference

The v3.0.0 API consolidates 17 legacy tools into **4 unified tools**:

| Tool                | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `omnifocus_read`    | Query tasks, projects, tags, perspectives   |
| `omnifocus_write`   | Create, update, complete, delete, batch ops |
| `omnifocus_analyze` | Productivity stats, velocity, patterns      |
| `system`            | Version, diagnostics, metrics, cache        |

**Benefits:**

- 76% reduction in tool schemas (4 vs 17)
- Discriminated unions for type safety
- countOnly queries (33x faster for counts)
- dryRun mode for batch preview
- Export to JSON/CSV/Markdown

**Use this for:**

- All new implementations
- Claude Desktop Instructions
- LLM system prompts
- API reference

---

## Legacy API (Archived)

The v2.x API documentation (18 individual tools) has been archived to `.archive/api-v2-legacy/`:

- `API-REFERENCE-V2.md` - Full v2 reference
- `API-REFERENCE-LLM.md` - v2 LLM-optimized
- `API-COMPACT.md` - v2 compact version
- `API-REFERENCE.md` - v2 original
- `TOOLS.md` - v2 tool documentation

These are preserved for historical reference but should not be used for new implementations.

---

## Quick Start

```typescript
// Query inbox tasks
{query: {type: "tasks", filters: {project: null}}}

// Create task
{mutation: {operation: "create", target: "task", data: {name: "Call Sarah", flagged: true}}}

// Get productivity stats
{analysis: {type: "productivity_stats", params: {groupBy: "week"}}}

// System version
{operation: "version"}
```

See [API-COMPACT-UNIFIED.md](./API-COMPACT-UNIFIED.md) for complete documentation.

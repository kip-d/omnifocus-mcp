# API Reference Documentation

Complete API specifications for the OmniFocus MCP server. We maintain three versions optimized for different use cases:

## API Reference Versions

### **API-REFERENCE-V2.md** - Main Developer Reference

Comprehensive specification of all tools, parameters, return values, and error codes. Use this when:

- Implementing against the API
- Debugging tool call failures
- Understanding complete parameter schemas
- Learning about all available options and modes

**Best for:** Implementation, detailed specifications, complete reference

---

### **API-REFERENCE-LLM.md** - Claude Desktop Instructions Version

Optimized for Claude Desktop's Instructions feature. This version is designed to be loaded into Claude's system prompt
to improve how the AI assistant uses your tools.

**Use this by:**

1. Opening Claude Desktop
2. Going to Settings → Developer
3. Loading this document into the Instructions/System Prompt section

**Benefits:** Better tool selection, fewer errors, more natural task completion

**Best for:** Improving Claude's understanding of your tools

---

### **API-COMPACT.md** - Context Window Optimized

Ultra-compact version for use in scenarios with limited token budgets. Includes essential information while minimizing
token usage (~30% of full reference).

**Use this when:**

- Embedding API docs in limited-context scenarios
- Working with smaller AI models with tight context windows
- Creating custom system prompts with strict token limits

**Best for:** Token efficiency, embedded scenarios, resource-constrained environments

---

## Choosing the Right Reference

| Use Case                          | Version     | Reason                           |
| --------------------------------- | ----------- | -------------------------------- |
| Implementing code against the API | **V2**      | Need complete specifications     |
| Improving Claude's tool usage     | **LLM**     | Optimized for AI understanding   |
| Limited context window            | **Compact** | ~30% token usage                 |
| Debugging specific tool           | **V2**      | Full error details and specs     |
| Quick reference                   | **Compact** | Fast lookup, essential info only |

---

## API Stability

All API reference documents are maintained in sync. If you find inconsistencies between versions, please report them as
bugs.

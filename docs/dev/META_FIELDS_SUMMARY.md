# Meta Fields Feature - Executive Summary

## Quick Overview

**Meta fields** are optional metadata that can be attached to MCP tools to provide machine-readable information about
tool capabilities, performance, and constraints.

- **Status**: Available in @modelcontextprotocol/sdk@^1.20.1 ✅ (We're on 1.20.1!)
- **Impact**: High (enables intelligent tool selection and error prevention)
- **Implementation Time**: 20-50 minutes
- **Breaking Changes**: None (purely additive)

---

## 8 Strategic Opportunities for OmniFocus MCP

| #     | Opportunity                   | Value  | Time   | Example Use Case                             |
| ----- | ----------------------------- | ------ | ------ | -------------------------------------------- |
| **1** | Tool Organization & Discovery | ⭐⭐⭐ | 5 min  | Group tasks, projects, analytics by category |
| **2** | Performance Hints             | ⭐⭐⭐ | 10 min | LLM knows analytics tools are slow (60s)     |
| **3** | Stability & Deprecation       | ⭐⭐   | 5 min  | Future-proof API evolution                   |
| **4** | Capability Documentation      | ⭐⭐⭐ | 15 min | "Max 2000 results" prevents query failures   |
| **5** | Auth & Permission Tracking    | ⭐⭐   | 10 min | Declare permission requirements              |
| **6** | Token Estimation              | ⭐⭐⭐ | 15 min | Budget tokens: avoid 10K token responses     |
| **7** | Tool Relationships            | ⭐⭐   | 10 min | LLM understands query dependencies           |
| **8** | Feature Flags & Testing       | ⭐     | 10 min | Gradual rollout, A/B testing                 |

---

## Highest-Value Implementation (Phase 1)

### Add 4 Essential Fields to All 17 Tools

**Time**: ~20 minutes **Implementation Effort**: Low (copy-paste pattern) **Impact**: Immediate organization and
discovery benefits

```typescript
// Pattern for all tools

meta: {
  // Essential metadata
  category: "Task Management",        // or "Organization", "Analytics", "Utility"
  stability: "stable",                // stable, beta, experimental
  complexity: "moderate",             // simple, moderate, complex
  performanceClass: "fast",           // fast (< 500ms), moderate (500ms-10s), slow (10s+)

  // Tool tags
  tags: ["queries", "read-only"],     // Operations: queries, mutations, analysis

  // Capabilities
  capabilities: ["search", "filter"]  // What this tool can do
}
```

### Tool Categorization Blueprint

```
📊 TASK MANAGEMENT (3 tools)
├── tasks             [queries, read-only]
├── manage_task       [mutations, write]
└── batch_create      [mutations, write]

📦 ORGANIZATION (3 tools)
├── projects          [queries, read-only]
├── folders           [queries & mutations]
└── tags              [queries & mutations]

📈 ANALYTICS (5 tools)
├── productivity_stats     [complex, slow]
├── task_velocity          [complex, slow]
├── analyze_overdue        [moderate, moderate]
├── workflow_analysis      [complex, slow]
└── analyze_patterns       [complex, slow]

🛠️ UTILITIES (6 tools)
├── recurring_tasks       [queries, read-only]
├── perspectives          [queries, read-only]
├── manage_reviews        [mutations, write]
├── export                [queries, read-only]
├── parse_meeting_notes   [mutations, transform]
└── system                [queries, read-only]
```

---

## Implementation Roadmap

### Phase 1: Essential (v2.3.0) - **20 minutes**

Add to all 17 tools:

- ✅ `category` - Tool grouping
- ✅ `stability` - All "stable" for v2.2.0
- ✅ `complexity` - Simple/moderate/complex
- ✅ `performanceClass` - Fast/moderate/slow

**Result**: Immediate tool organization benefits

### Phase 2: Capability (v2.4.0) - **30 minutes**

Add to relevant tools:

- ✅ `limitations` - Known constraints
- ✅ `capabilities` - What tool can do
- ✅ `maxResults` - Upper limit on results
- ✅ `maxQueryDuration` - Timeout in ms

**Result**: Dramatically reduced failed queries

### Phase 3: Advanced (Future) - **30 minutes**

Optional advanced features:

- Token estimation
- Tool relationships
- Feature flags
- Cost metrics

---

## Real-World Impact

### Example 1: Intelligent Tool Selection

**Before Meta Fields**:

```
User: "Analyze my productivity trends"
LLM: *calls productivity_stats* (waits 60 seconds, uses 8,000 tokens)
```

**After Meta Fields**:

```
User: "Analyze my productivity trends"
LLM: Sees meta.performanceClass: "slow", meta.expectedTokens: 8000
LLM: *calls tool* (prepared for 60s wait, budgeted tokens)
```

### Example 2: Error Prevention

**Before**:

```
LLM: "Get all 10,000 tasks"
Tool: Error - max 2,000 results
LLM: ❌ Failed query
```

**After**:

```
LLM: Sees meta.maxResults: 2000
LLM: "Get first 2,000 tasks" ✅
```

### Example 3: Better Workflows

**Before**:

```
LLM: "Should I use tasks or analyze_overdue?"
LLM: 🤷 Tries random tool
```

**After**:

```
LLM: Sees categories and relationships
LLM: "tasks is read-only, analyze_overdue is analysis"
LLM: Uses optimal tool ✅
```

---

## What You'll Get

### For Users

- ✅ Better Claude Desktop tool organization
- ✅ Fewer failed queries
- ✅ Faster, more efficient workflows
- ✅ Better error messages

### For LLMs/Claude

- ✅ Understand tool capabilities before using
- ✅ Optimize queries based on performance class
- ✅ Avoid tools that can't handle the query
- ✅ Better multi-step workflow planning

### For Your Codebase

- ✅ Self-documenting tools
- ✅ Machine-readable tool specifications
- ✅ Foundation for future features
- ✅ Type-safe metadata

---

## Comparison: With & Without Meta Fields

| Aspect                   | Without          | With Meta Fields                            |
| ------------------------ | ---------------- | ------------------------------------------- |
| **Tool Discovery**       | "I see 17 tools" | "5 task tools, 3 org tools, 5 analytics..." |
| **Performance Planning** | Guess            | "Fast (500ms), Moderate (10s), Slow (60s)"  |
| **Query Limits**         | Trial & error    | "Max 2,000 results"                         |
| **Error Recovery**       | Retry            | Prevented entirely                          |
| **Documentation**        | Manual           | Auto-generated                              |
| **LLM Reasoning**        | Basic            | Sophisticated                               |

---

## Why This Matters for OmniFocus MCP

### Current Strengths

✅ 17 well-designed tools ✅ 100% MCP spec compliance ✅ 655 passing tests ✅ Production-ready

### Meta Fields Unlock

🎯 **Intelligent automation**: LLMs know which tool to use before trying 🎯 **Error prevention**: Constraints are known
upfront 🎯 **Better UX**: Tools are organized and discoverable 🎯 **Future-proofing**: Foundation for v3.0+

---

## Quick Start

### Step 1: Review This Document

Understand what meta fields offer (you're reading it!)

### Step 2: Read the Opportunities Document

`docs/dev/META_FIELDS_OPPORTUNITIES.md` - Detailed breakdown

### Step 3: Implement Phase 1

Add 4 fields to each tool (~20 min)

### Step 4: Test

Verify meta fields appear in tool list responses

### Step 5: Measure Impact

Track improved workflow success rates

---

## Questions Answered

**Q: Will this break anything?** A: No. Meta fields are optional and purely additive.

**Q: Do I have to do Phase 1?** A: No, but it takes 20 minutes and provides immediate value.

**Q: When should I implement this?** A: After the SDK upgrade (you just did it!) is the perfect time.

**Q: Can I add more metadata later?** A: Yes. Meta fields can be extended at any time.

**Q: Will Claude Desktop show these?** A: Maybe someday. But LLMs will definitely use them.

---

## Decision Matrix

| If You Want...                      | Implement       | Time    |
| ----------------------------------- | --------------- | ------- |
| Tool organization in Claude Desktop | Phase 1         | 20 min  |
| Prevent query failures              | Phase 1 + 2     | 50 min  |
| Token-aware query planning          | Phase 1 + 2 + 6 | 70 min  |
| Complete feature                    | All phases      | 80+ min |

---

## Recommendation

**✅ Implement Phase 1 now** (20 minutes)

- Immediate value with minimal effort
- No risk (purely additive)
- Foundation for Phase 2

**📅 Schedule Phase 2 for next iteration** (30 minutes)

- Dramatically reduces query failures
- Data-driven (analyze logs first)
- Significant impact on UX

---

## See Also

- **Detailed Opportunities**: `META_FIELDS_OPPORTUNITIES.md`
- **MCP Specification**: https://modelcontextprotocol.io/specification/2025-06-18/
- **Your Tools**: `src/tools/*/`
- **Tool Registration**: `src/tools/index.ts`

---

## Current Project Status

- ✅ MCP SDK upgraded to 1.20.1
- ✅ All tests passing (655/655)
- ✅ Meta fields available & ready
- ⏳ Next: Implement Phase 1 metadata

**Ready to boost your MCP server's intelligence!**

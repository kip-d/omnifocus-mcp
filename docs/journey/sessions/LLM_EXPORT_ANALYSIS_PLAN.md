# LLM Export Analysis Plan

## Context
**Date**: Current session  
**Database Size**: 1,158 active tasks, 124 projects, 50 tags  
**Problem**: Raw OmniFocus export exceeds LLM context limits (507k tokens vs 200k context)

## Key Findings

### ❌ Raw Export (Current Format)
- **Tokens**: 507,204 (254% of 200k context)
- **Scaling**: ~438 tokens per task
- **Status**: Completely unusable for LLM analysis

### ✅ Compressed Approaches

#### 1. Query-Based Export
- **Tokens**: 338 (0.2% of context)
- **Use Case**: Focused analysis (overdue, blocked, next actions)
- **Scaling**: Constant regardless of database size
- **Priority**: **HIGHEST** - immediate value

#### 2. Smart Summary
- **Tokens**: 192 (0.1% of context)
- **Use Case**: System-wide insights and overview
- **Scaling**: Minimal scaling with database size
- **Priority**: **HIGH** - comprehensive analysis

#### 3. Hierarchical Compression
- **Tokens**: 19,344 (9.7% of context)
- **Use Case**: Project structure and relationship analysis
- **Scaling**: Scales with project count, not task count
- **Priority**: **MEDIUM** - relationship preservation

## Implementation Plan

### Phase 1: Query-Based Export (Immediate Value)
- **Goal**: Enable AI assistance with specific queries
- **Examples**: "Show overdue tasks", "Find blocked items", "List next actions"
- **Token Usage**: ~338 tokens
- **Timeline**: Next session

### Phase 2: Smart Summary (System Insights)
- **Goal**: Provide comprehensive system overview
- **Examples**: "System health analysis", "Productivity patterns", "Project status overview"
- **Token Usage**: ~192 tokens
- **Timeline**: After Phase 1

### Phase 3: Hierarchical Compression (Relationship Analysis)
- **Goal**: Enable structural analysis and reorganization
- **Examples**: "Project structure optimization", "Task dependency analysis"
- **Token Usage**: ~19,344 tokens
- **Timeline**: After Phase 2

## Technical Notes

### Why Raw Export Failed
- **Timeout**: 10 seconds insufficient for 1,200+ items
- **JXA Processing**: Each item processed individually
- **Serialization Overhead**: JSON conversion adds significant time
- **Context Limits**: 507k tokens vs 200k LLM context

### Compression Benefits
- **Efficiency**: 99%+ reduction in token usage
- **Scalability**: Performance doesn't degrade with database growth
- **Focus**: AI concentrates on analysis, not data parsing
- **Usability**: Fits within LLM context windows

## Next Session Actions

1. **✅ Updated database analysis script** - Increased timeout to 5 minutes, removed artificial limits
2. **✅ Fixed 25-task limit issue** - Now using export_tasks tool for full database access
3. **Run full database analysis** - Get actual token counts for all 1,158+ tasks
4. **Implement query-based export tool** - Based on actual data analysis
5. **Test with real queries** (overdue, blocked, next actions)
6. **Plan smart summary implementation**

## Files Created
- `scripts/simple-token-analysis.js` - Token usage analysis
- `scripts/analyze-token-usage.js` - Full database analysis (✅ **UPDATED** - 5min timeout, full database)

## Key Insight
**Compressed, LLM-optimized exports are essential, not optional, for databases of this size. Raw exports simply won't work with current LLM context limits.**

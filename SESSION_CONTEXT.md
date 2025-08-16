# Session Context - 2025-08-15

## Current Status
- **Version**: 2.0.0-alpha.6 (mature alpha with all critical bugs fixed)
- **Last Commit**: "fix: Align 'today' mode with typical OmniFocus Today perspective"
- **All Tests Passing**: Smoke tests 3/3 passing in <8 seconds
- **Repository**: Fully up to date with all changes pushed

## Version Progression Since v2.0.0-alpha.2

### v2.0.0-alpha.3
- **Critical Fix**: MCP bridge type coercion issue
- **Problem**: Claude Desktop passes ALL parameters as strings
- **Solution**: Added Zod schema type coercion for all numeric/boolean parameters
- **Impact**: Fixed type errors when using through Claude Desktop

### v2.0.0-alpha.4
- **User Testing Score**: 84% (significant improvement)
- **Fixes Implemented**:
  - Project creation parameter structure fixed
  - Added project name filtering (not just projectId)
  - Search performance optimized with caching
  - skipAnalysis flag added for faster searches
- **Metrics**:
  - Tool Selection: 90% accuracy ✅
  - Response Time: 2.1s average ✅
  - Zero retry rate ✅
  - Summaries: 5/5 quality ✅

### v2.0.0-alpha.5
- **Major Performance Breakthrough**: Search 13.3s → <2s
- **Critical Fixes**:
  - Search now has early exit when limit reached
  - 'Today' mode fixed (was showing ALL available tasks)
  - Project creation reviewInterval type conversion fixed
  - Added prominent tag limitation warning to README
- **User Testing Results**: 3.5/5 (performance was the blocker)

### v2.0.0-alpha.6 (Current)
- **Today Mode Enhancement**: Aligned with OmniFocus Today perspective
- **Behavior**: Shows tasks due within 3 days OR flagged tasks
- **Impact**: Matches standard GTD workflow expectations
- **Implementation**: Uses in-memory filtering for OR condition

## Key Technical Achievements

### Performance Optimizations
```javascript
// Search performance fix - early exit
for (let i = 0; i < allTasks.length && results.length < limit; i++) {
  // Process only until limit reached
}
```

### MCP Bridge Type Coercion Pattern
```typescript
// All schemas now handle string parameters from Claude Desktop
limit: z.union([
  z.number(),
  z.string().transform(val => parseInt(val, 10))
]).pipe(z.number().min(1).max(200)).default(25)
```

### Today Mode Alignment
```javascript
// Now matches OmniFocus Today perspective
mode: 'today' => tasks due within 3 days OR flagged
// Not just tasks due today
```

## Current Architecture

### V2 Tools (Consolidated)
- `QueryTasksToolV2` - All task queries with modes
- `ProjectsToolV2` - Project operations
- Summary-first response format
- Smart insights generation
- Performance metrics in metadata

### Response Structure Pattern
```javascript
{
  summary: {
    total_count: 100,
    returned_count: 25,
    breakdown: { overdue: 10, today: 5, ... },
    key_insights: ["10 tasks overdue", "Project X needs review"]
  },
  data: { tasks: [...] },
  metadata: { 
    query_time_ms: 250, 
    from_cache: false,
    optimization_flags: { skipAnalysis: true }
  }
}
```

## Testing Status
- **Smoke Tests**: 3/3 passing ✅
- **Performance**: <8 seconds total ✅
- **Search Performance**: <2 seconds for 2000+ tasks ✅
- **User Testing Score**: Improved from 3.5/5 to ~4.5/5
- **Tool Selection Accuracy**: 90%+ ✅

## Known Issues & Workarounds

### Tag Assignment (Still Present)
- **Limitation**: Cannot assign tags during task creation (JXA constraint)
- **Workaround**: Create task first, then update with tags
- **Documented**: Prominently in README with example code

### JXA Context Limitations
- **No .where() method**: Must use standard JavaScript iteration
- **No OmniJS-specific methods**: Stick to standard JS
- **Well documented**: CLAUDE.md has comprehensive warnings

## User Feedback Summary
- **Performance**: Now acceptable with real databases (2000+ tasks)
- **Smart Suggest**: Working well for prioritization
- **Today Mode**: Finally matches user expectations
- **Project Creation**: Fully functional
- **Search**: Fast enough for interactive use

## Environment Details
- Node.js v24.5.0
- OmniFocus 4.6+ on macOS
- TypeScript project
- MCP SDK 1.13.0
- Testing with 2,400+ tasks

## Git Remote
- Repository: github.com:kip-d/omnifocus-mcp.git
- Main branch: main
- Latest version: 2.0.0-alpha.6
- All changes committed and pushed

## What's Ready for Beta

### Fully Functional
- ✅ Task queries (all modes including smart_suggest)
- ✅ Project operations (create, list, update)
- ✅ Search with caching
- ✅ Today perspective alignment
- ✅ Performance optimizations
- ✅ Type coercion for MCP bridge

### Well Tested
- ✅ Smoke tests passing consistently
- ✅ User testing showing 90%+ tool selection accuracy
- ✅ Performance under 2s for most operations
- ✅ Works with both direct Node.js and Claude Desktop

### Production Ready Features
- Smart task prioritization
- Summary-first responses
- Intelligent caching
- Performance metrics
- Error handling with suggestions

---

*Session saved at: 2025-08-15*
*Version: 2.0.0-alpha.6*
*Status: Feature complete, performance optimized, ready for beta consideration*
*Key achievement: All critical bugs fixed, performance goals met*
# Daily-First Philosophy

## Core Principle

The OmniFocus MCP bridge is optimized for **daily workflows** - the quick, frictionless interactions that make up 90% of GTD usage. Deep analysis and comprehensive data retrieval remain available but are opt-in rather than default.

## Usage Patterns

### Daily Use (90% of interactions)
- **Quick capture**: Add a task and move on
- **Status checks**: What's due today? Any overdue tasks?
- **Task completion**: Mark done and continue
- **Project navigation**: See project list, pick one to focus on
- **Tag reference**: Quick tag lookup for context

**Optimization**: Minimal data, maximum speed (<500ms response)

### Weekly Use (8% of interactions)
- **Weekly GTD review**: Comprehensive project review
- **Planning sessions**: Reorganizing projects and tasks
- **Analytics review**: Productivity trends and patterns
- **Cleanup**: Finding stale projects, orphaned tasks

**Optimization**: Complete data, acceptable latency (1-5s response)

### Occasional Use (2% of interactions)
- **Bulk operations**: Mass updates or migrations
- **Exports**: Full database exports for backup/analysis
- **Troubleshooting**: Diagnostic runs and deep inspection

**Optimization**: Thoroughness over speed (5s+ acceptable)

## Default Settings for Daily Use

### Task Tools
- **limit**: 25 (was 100) - Most daily queries need just a handful of tasks
- **skipAnalysis**: true (was false) - Skip expensive recurring pattern analysis
- **includeDetails**: false (was mixed) - Just names and dates for scanning

### Project Tools
- **limit**: 20 (was 100) - Quick project overview
- **performanceMode**: 'lite' (was 'normal') - Skip task counts and next actions
- **includeStats**: false - Reserve statistics for reviews

### Tag Tools
- **includeTaskCounts**: false (was true) - Just tag names for context
- **fastMode**: true (was false) - Skip hierarchy processing
- **namesOnly**: false - Still need IDs for operations

## Performance Impact

### Before (Default Heavy)
- `list_tasks`: 2-5 seconds with 100 tasks + analysis
- `list_projects`: 5-10 seconds with all details
- `list_tags`: 700ms with full hierarchy

### After (Daily-First)
- `list_tasks`: 200-500ms with 25 tasks, no analysis
- `list_projects`: 200-300ms with basic info
- `list_tags`: 130ms with names only

**Result**: 5-10x faster for daily operations

## Override for Deep Work

When you need comprehensive data (weekly reviews, analysis), simply specify:

```javascript
// For weekly review - get everything
list_projects({ 
  performanceMode: 'normal',
  includeStats: true,
  limit: 1000 
})

// For task analysis - include patterns
list_tasks({ 
  skipAnalysis: false,
  includeDetails: true,
  limit: 100 
})

// For tag management - get counts
list_tags({ 
  includeTaskCounts: true,
  fastMode: false 
})
```

## GTD Alignment

This philosophy aligns with core GTD principles:

1. **Capture quickly**: Reduced friction for adding tasks
2. **Clarify efficiently**: Fast access to inbox items
3. **Organize smoothly**: Quick project/context switching
4. **Review comprehensively**: Full data available when needed
5. **Engage confidently**: Instant access to next actions

## Implementation Guide

### For Tool Developers

When creating new tools, ask:
1. Is this primarily for daily use or weekly/occasional?
2. What's the minimum data needed for the common case?
3. Can expensive operations be opt-in via parameters?

Default to:
- Small limits (10-25 items)
- Minimal data (names, dates, status)
- Skip analysis/statistics
- Fast modes where available

### For Users

**Daily workflow**: Use defaults - they're optimized for you
**Weekly review**: Add `performanceMode: 'normal'` or similar
**Deep analysis**: Explicitly request with parameters

## Metrics

Target response times:
- **Daily tools**: <500ms (achieved: 200-500ms)
- **Weekly tools**: <5s (achieved: 1-3s)
- **Bulk operations**: <30s (achieved: varies)

Cache strategy:
- **Daily data**: 30-60s TTL (tasks, quick lists)
- **Weekly data**: 5-10min TTL (projects, tags)
- **Analytics**: 1hr TTL (expensive computations)

## Future Enhancements

Potential optimizations:
1. **Smart limits**: Adjust based on time of day (morning = smaller limits)
2. **User profiles**: Learn individual patterns and adapt
3. **Progressive loading**: Return basic data immediately, details on request
4. **Predictive caching**: Pre-warm cache for likely next actions
5. **Differential updates**: Only fetch changes since last query

## Summary

By defaulting to daily-use patterns, the OmniFocus MCP bridge becomes a **fast, responsive** tool for GTD practitioners while maintaining **full power** for weekly reviews and deep work. This approach reduces friction for the 90% case while keeping the 10% case fully supported.
# OmniFocus MCP Development Journey

This directory contains the historical documentation of how the OmniFocus MCP server evolved from initial concept to production-ready v2.0.0.

## The Story

### Performance Evolution (`performance/`)
The dramatic journey from 25+ second query times to sub-second responses:
- **PERFORMANCE_BREAKTHROUGH.md** - The discovery that changed everything
- **V1.15.0_PERFORMANCE_REALITY_CHECK.md** - When we realized the true scale of the problem
- **V1.16.0_OPTIMIZATION_*.md** - Various optimization attempts and analyses
- **PERFORMANCE_TEST_*.md** - Test results from different versions

### Technical Discoveries (`technical/`)
Critical technical findings that shaped the architecture:
- **EVALUATEJAVASCRIPT_BRIDGE_RESEARCH.md** - Understanding the OmniFocus JavaScript bridge
- **FIX_TAG_VISIBILITY.md** - Solving the tag consistency problem
- **DEBUG_UPDATE_TASK_BISECT.md** - Tracking down the 51KB script truncation issue
- **SAFGET_REMOVAL_TRADEOFFS.md** - Performance vs safety tradeoffs
- **JXA_CAPABILITIES_AUDIT.md** - What JXA can and cannot do
- **HYBRID_*.md** - Research into hybrid JXA/OmniJS approaches
- **CRITICAL_FIXES_SUMMARY.md** - Summary of all critical bug fixes
- **PROFILING_ANALYSIS.md** - Deep performance profiling results
- **SCRIPT_STANDARDIZATION_PLAN.md** - Plans for script consistency

### Development Sessions (`sessions/`)
Detailed session notes from key development milestones:
- **SESSION_CONTEXT.md** - The final v2.0.0 release session
- **V2_COMPREHENSIVE_FINAL_TEST.md** - Achieving 100% test pass rate
- **V2_FINAL_TEST_*.md** - Final testing rounds before release
- **V2.0.0_ALPHA_IMPLEMENTATION.md** - Alpha version development
- **V2_ALPHA_TEST_PROMPT.md** - Testing protocols for v2 alpha

## Key Lessons Learned

### 1. The whose() Method Catastrophe
The single most important discovery: JXA's `whose()` method is catastrophically slow, taking 25+ seconds for queries that should take milliseconds. Removing all `whose()` calls reduced query time by 95%.

### 2. Script Size Limits
JXA scripts over ~50KB get truncated by osascript, causing "Unexpected end of script" errors. Solution: pass complex data as JSON strings and parse inside the script (90% size reduction).

### 3. Bridge Consistency
Writing via `evaluateJavascript()` but reading via direct JXA causes invisible changes. Solution: use the same context for both operations.

### 4. Parameter Sanitization
Parameters can be silently filtered out by sanitization functions. Always verify that parameters are whitelisted in sanitization logic.

### 5. Tool Consistency
Multiple tools should use the same calculation methods to avoid user confusion. Inconsistencies between tools (like different available rate calculations) create misleading insights and reduce user confidence.

## Timeline

- **v1.0-1.12**: Initial implementation, basic functionality
- **v1.13**: Discovery of whose() performance issue
- **v1.14**: First major performance improvements
- **v1.15**: Optimized JavaScript filtering (<1 second queries)
- **v1.16**: Further optimizations and reality checks
- **v2.0.0-alpha**: Complete rewrite with lessons learned
- **v2.0.0**: Production release with 100% test pass rate

## Why This History Matters

This journey documents:
1. **Problem-solving approaches** that worked and didn't work
2. **Performance optimization techniques** specific to JXA/OmniFocus
3. **Debugging strategies** for complex automation issues
4. **Architectural decisions** and their rationales
5. **Testing evolution** from manual to comprehensive automated testing

These documents serve as a reference for future development and a cautionary tale about the complexities of automation scripting on macOS.
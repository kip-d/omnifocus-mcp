# TODO Next Session

## Immediate Priority - User Testing Results for v2.0.0-alpha.2
- [ ] Review user testing feedback for v2.0.0-alpha.2
- [ ] Address any bugs or issues reported
- [ ] Consider if we need alpha.3 or can move to beta
- [ ] Check if smart_suggest mode is working as expected

## Status Check
✅ **COMPLETED IN v2.0.0-alpha.2:**
- Tool consolidation (tasks and projects tools)
- Summary-first response format
- Smart insights generation
- Performance metrics in metadata
- Quick smoke test validation
- Fixed .where() bug in hybrid scripts

## Potential Issues to Watch
1. **Performance with large databases** - Smoke test uses only 25 items, need real-world testing
2. **Smart suggest algorithm** - May need tuning based on user feedback
3. **Legacy tool loading** - Check if OMNIFOCUS_MCP_ENABLE_LEGACY_TOOLS env var is working
4. **Error messages** - Verify v2 error responses are helpful with suggestions

## Known Bugs Fixed
✅ **JXA vs OmniJS Context** - .where() method removed from all scripts
✅ **Projects script template** - Fixed {{limit}} parameter passing
✅ **Smoke test parameters** - Fixed boolean type issues

## Testing Improvements Needed
- [ ] Add stress test with 5000+ tasks
- [ ] Measure actual LLM processing time with v2 format
- [ ] Validate smart_suggest scoring algorithm
- [ ] Test cache effectiveness with new structure
- [ ] Benchmark v2 vs v1 total user experience time

## Documentation Updates
- [ ] Update main README with v2.0 changes
- [ ] Create v1 to v2 migration guide
- [ ] Document OMNIFOCUS_MCP_ENABLE_LEGACY_TOOLS usage
- [ ] Add smart_suggest mode examples
- [ ] Update API documentation with new response format

## Remaining v2 Migration Tasks
- [ ] Migrate batch operations to v2 pattern
- [ ] Convert review tools to consolidated pattern
- [ ] Update folder management tools
- [ ] Enhance export tools with progressive disclosure

## Future Optimizations (Post v2.0 stable)

### 1. Reconsider evaluateJavascript Bridge
- Now we know .where() was the issue, not the bridge itself
- Could get true OmniJS performance
- **BUT**: Must avoid ALL OmniJS-specific methods, not just .where()

### 2. Progressive Data Loading
- Return first 10 results immediately
- Load more on demand
- Stream responses for better perceived performance

### 3. Intelligent Caching
- Pre-cache common queries during idle time
- Predictive cache warming based on usage patterns
- Background cache refresh

## Critical Reminders
⚠️ **NEVER use .where() or other OmniJS-specific methods** - We run in JXA context
⚠️ **Always use standard JavaScript iteration** - for loops, not OmniJS methods
⚠️ **Test with real data** - Smoke tests with 25 items don't catch performance issues
⚠️ **Summary-first is non-negotiable** - LLMs process summaries 10x faster than raw data

## Success Metrics for v2.0.0

### What We're Measuring
- ✅ Zero retry rate (first attempt succeeds)
- ✅ Correct tool selection >90% of time  
- ✅ Response processing <2 seconds
- ✅ Total user experience <8 seconds
- ✅ Smoke tests pass in <10 seconds

### Current Status (v2.0.0-alpha.2)
- Smoke tests: 3/3 passing ✅
- Total smoke test time: 7.82 seconds ✅
- Response structure: Summary-first ✅
- Tool consolidation: Implemented ✅
- Smart insights: Working ✅

## Questions for User Testing Group

1. **Performance**: Is the response time acceptable with your real database?
2. **Smart Suggest**: Does the prioritization match your workflow?
3. **Summaries**: Are the key insights helpful and accurate?
4. **Tool Selection**: Is the LLM choosing the right tool/mode?
5. **Error Recovery**: Are error messages helpful when things go wrong?

## Session Context Summary
- **Version**: 2.0.0-alpha.2
- **Status**: All smoke tests passing, ready for user testing
- **Key Achievement**: Paradigm shift implemented, .where() bug fixed
- **Waiting for**: User testing feedback
- **Next Step**: Address feedback, potentially release beta

---

*Last updated: 2025-08-14*
*Ready for: User testing evaluation*
*Focus: Validate v2 paradigm shift with real users*
# TODO Next Session

## Current Version: 2.0.0-alpha.6
**Status**: Feature complete, performance optimized, ready for beta consideration

## Immediate Priority - Beta Release Decision

### Ready for v2.0.0-beta.1? ✅
Based on alpha.6 results:
- Performance goals met (<2s for most operations)
- User testing showing 90%+ tool selection accuracy
- All critical bugs fixed
- Today mode aligned with user expectations
- Search performance acceptable (2s for 2000+ tasks)

### Pre-Beta Checklist
- [ ] Run comprehensive integration tests one more time
- [ ] Verify all smoke tests still passing
- [ ] Test with Claude Desktop (not just direct Node.js)
- [ ] Update version to 2.0.0-beta.1
- [ ] Create git tag for beta.1
- [ ] Update README with v2.0.0 features

## What's Been Fixed Since alpha.2 ✅

### alpha.3
- ✅ MCP bridge type coercion (all parameters as strings)
- ✅ Zod schema updates for number/boolean coercion

### alpha.4
- ✅ Project creation parameter structure
- ✅ Project name filtering support
- ✅ Search performance with caching
- ✅ 84% user testing score achieved

### alpha.5
- ✅ Search performance (13.3s → <2s)
- ✅ Today mode showing correct tasks
- ✅ Project reviewInterval type conversion
- ✅ README tag limitation warning

### alpha.6
- ✅ Today mode aligned with OmniFocus perspective
- ✅ Shows tasks due within 3 days OR flagged
- ✅ Matches GTD workflow expectations

## Remaining V2 Migration Tasks (Post-Beta)

### Nice to Have for v2.0.0 Final
- [ ] Migrate batch operations to v2 pattern
- [ ] Convert review tools to consolidated pattern
- [ ] Update folder management tools
- [ ] Enhance export tools with progressive disclosure

### Documentation Updates Needed
- [ ] Update main README with v2.0 changes
- [ ] Create v1 to v2 migration guide
- [ ] Document OMNIFOCUS_MCP_ENABLE_LEGACY_TOOLS usage
- [ ] Add smart_suggest mode examples
- [ ] Update API documentation with new response format

## Known Limitations (Won't Fix for Beta)

### Tag Assignment During Creation
- **Status**: Documented workaround in README
- **Impact**: Low - users understand the two-step process
- **Fix**: Would require OmniFocus API changes

### JXA Context Restrictions
- **Status**: Well documented in CLAUDE.md
- **Impact**: Low - developers know to avoid .where()
- **Fix**: Architectural limitation, won't change

## User Testing Feedback Summary

### What's Working Well
- Tool selection accuracy: 90%+ ✅
- Response times: <2.1s average ✅
- Smart suggestions: Helpful prioritization ✅
- Summary-first format: Fast LLM processing ✅
- Zero retry rate achieved ✅

### What Users Love
- "Today mode finally makes sense!"
- "Search is fast enough now"
- "Smart suggest helps me focus"
- "Summaries save so much time"

## Performance Metrics (Current)

### v2.0.0-alpha.6 Performance
- Smoke tests: <8 seconds total
- Search: <2 seconds (2000+ tasks)
- Today query: <1 second (with caching)
- Project operations: <500ms
- Tool selection: 90%+ accuracy

### Comparison to alpha.2
- Search: 25s → 2s (92% improvement)
- Today mode: Broken → Working
- Type errors: Frequent → None
- User satisfaction: 3.5/5 → ~4.5/5

## Beta Testing Plan

### Focus Areas for Beta
1. **Stability** - No crashes or hangs
2. **Performance** - Consistent <2s responses
3. **Accuracy** - Tool selection remains 90%+
4. **Usability** - Intuitive without documentation
5. **Compatibility** - Works with various OmniFocus setups

### Success Criteria for v2.0.0 Final
- [ ] 95%+ tool selection accuracy
- [ ] Zero critical bugs for 1 week
- [ ] 5+ beta testers approve
- [ ] Performance stable across database sizes
- [ ] Documentation complete

## Future Optimizations (v2.1+)

### Performance Enhancements
- Progressive data loading (stream first 10 results)
- Predictive cache warming
- Background cache refresh
- Parallel script execution

### Feature Additions
- Natural language date parsing
- Bulk operations with progress
- Custom perspective support
- Attachment handling
- Note formatting preservation

## Session Action Items

### If Moving to Beta
1. Run final integration tests
2. Update version in package.json to 2.0.0-beta.1
3. Create beta release tag
4. Update README with beta announcement
5. Notify testing group of beta availability

### If Staying in Alpha
1. Identify specific blockers
2. Create targeted fixes
3. Run focused tests
4. Release alpha.7

## Critical Issues from Code Review (Must Fix Before Beta)

### 🔴 High Priority - Runtime Failures
1. **Type Coercion Missing in V2 Tools** - Will fail in Claude Desktop
   - [ ] Add proper Zod schema coercion to all V2 tool parameters
   - [ ] Test with both direct Node.js and Claude Desktop

2. **Script Injection Vulnerability** - Security risk in template system
   - [ ] Sanitize all template inputs
   - [ ] Use parameterized script generation

3. **Base Tool Type Safety** - Violates TypeScript-first principle
   - [ ] Fix `any` return types in base tool class
   - [ ] Ensure proper type inference throughout

### 🟡 Medium Priority - Architecture Issues
4. **Analytics Tools Not V2 Compliant** - Breaking paradigm consistency
   - [ ] Migrate all analytics tools to v2 response format
   - [ ] Ensure summary-first structure

5. **Script Variations Chaos** - Maintenance nightmare
   - [ ] Evaluate 25+ whose() instances
   - [ ] Standardize on v3 optimized scripts
   - [ ] Remove unused script variations

### JXA Performance Guidelines (From Expert Review)
- **whose() Usage Audit Needed** - 25+ instances found
  - Acceptable: Single conditions like `{completed: false}`
  - Acceptable: ID lookups like `{id: taskId}`
  - Problem: Complex date queries, multiple whose() in sequence
  - [ ] Test under load with 2000+ tasks

## Critical Reminders (NEVER FORGET)
⚠️ **NEVER use .where() or other OmniJS-specific methods** - We run in JXA context
⚠️ **Always use standard JavaScript iteration** - for loops, not OmniJS methods
⚠️ **Test with real data** - Smoke tests with 25 items don't catch performance issues
⚠️ **Summary-first is non-negotiable** - LLMs process summaries 10x faster than raw data

## Questions to Answer
1. Are we confident enough for beta? (Not yet - critical issues found)
2. Any critical bugs discovered? (Yes - type coercion, security)
3. Performance acceptable? (Yes, but whose() needs evaluation)
4. User feedback positive? (Yes, 4.5/5 rating)
5. Documentation ready? (Mostly, can finish during beta)

---

*Last updated: 2025-08-15*
*Current version: 2.0.0-alpha.6*
*Recommendation: **Fix critical issues first, then beta.1***
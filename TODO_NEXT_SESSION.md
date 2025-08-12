# TODO for Next Session

## Critical Performance Follow-up

### 1. Monitor v1.15.0 Performance in Production ⚠️ HIGH PRIORITY
- [ ] Get user testing feedback using PERFORMANCE_TEST_v1.15.0.md
- [ ] Validate sub-second query times with large databases (2000+ tasks)
- [ ] Check if any edge cases cause performance regressions
- [ ] Gather metrics on real-world usage patterns

### 2. Investigate evaluateJavascript() Bridge Potential
- [ ] Now that whose() is eliminated, revisit hybrid approach
- [ ] Test if Omni Automation can provide even faster filtering
- [ ] Explore using bridge for batch operations
- [ ] Document safe vs unsafe bridge usage patterns

## Immediate Tasks

### 3. Clean Up Performance Test Files ✅ PARTIALLY COMPLETE
- [x] Created PERFORMANCE_TEST_v1.15.0.md for user validation
- [x] Committed v1.15 integration tests
- [ ] Document performance testing procedures
- [ ] Create benchmark suite for regression testing

### 4. Implement Project Template Prompts
- [ ] Create `project_template` prompt using research from PROJECT_TEMPLATE_RESEARCH.md
- [ ] Support templates: Client Project, Product Launch, Event Planning, etc.
- [ ] Add parameter system for customizing templates
- [ ] Test template creation with real OmniFocus data

### 5. Enhance Perspective Tools with New Performance
- [ ] Apply v1.15.0 optimizations to perspective queries
- [ ] Remove any remaining whose() usage in perspective code
- [ ] Add perspective statistics (task counts per perspective)
- [ ] Create prompt that uses perspectives for workflow guidance

## Performance Optimization Opportunities

### 6. Apply Learnings to Other Tools
- [ ] Audit all scripts for remaining whose() usage
- [ ] Replace safeGet() with direct try/catch where appropriate
- [ ] Convert to timestamp comparisons throughout
- [ ] Implement early exit patterns in all loops

### 7. Create Performance Guidelines
- [ ] Document JXA performance anti-patterns (especially whose())
- [ ] Create filtering best practices guide
- [ ] Add performance testing to CI/CD pipeline
- [ ] Set performance budgets for each tool

### 8. Optimize Remaining Slow Operations
- [ ] Profile project queries for optimization opportunities
- [ ] Investigate tag operations performance
- [ ] Optimize recurring task analysis
- [ ] Consider lazy loading for large result sets

## Code Quality & Maintenance

### 9. Update Documentation with Performance Learnings
- [ ] Add performance section to README
- [ ] Document the whose() catastrophe for future reference
- [ ] Create JXA performance tips guide
- [ ] Update CLAUDE.md with optimization patterns

### 10. Lint and Type Safety Cleanup ✅ PARTIALLY COMPLETE
- [x] Fixed 458 lint issues (formatting and critical type safety)
- [x] Created type-guards.ts for safer type checking
- [x] Configured practical ESLint rules
- [ ] Address remaining 1,436 warnings (mostly unavoidable any-types)
- [ ] Consider using type assertion libraries for script results
- [ ] Create pre-commit hooks for code quality

## Nice-to-Have Features

### 11. Performance Monitoring Dashboard
- [ ] Add performance metrics to tool responses
- [ ] Create performance tracking over time
- [ ] Alert on performance regressions
- [ ] Generate performance reports

### 12. Smart Query Optimization
- [ ] Detect query patterns and auto-optimize
- [ ] Implement query result prediction/prefetching
- [ ] Add intelligent caching based on usage
- [ ] Create query complexity analyzer

### 13. Enhanced MCP Prompts
- [ ] Perspective-based weekly review with sub-second response
- [ ] Lightning-fast project breakdown assistant
- [ ] Instant daily planning with Today perspective
- [ ] Real-time context switching prompts

## Known Issues to Monitor

### From Today's Session
1. **whose() method** - NEVER use it, always filter manually
2. **safeGet() overhead** - Replace with direct try/catch where possible
3. **Date object creation** - Use timestamps for comparisons

### Ongoing Technical Debt
1. **Tag assignment during creation** - Still requires update after create
2. **Transaction support** - No native atomic operations
3. **Lint warnings** - ~1800 warnings need addressing

## Research Items

### 14. Performance Research
- [ ] Benchmark OmniFocus API methods systematically
- [ ] Test performance with 10,000+ task databases
- [ ] Investigate native Omni Automation performance limits
- [ ] Research AppleScript vs JXA performance differences

### 15. Alternative Approaches
- [ ] Investigate direct SQLite access (if possible)
- [ ] Research OmniFocus URL scheme performance
- [ ] Explore batch operation possibilities
- [ ] Consider WebSocket for real-time updates

## Success Metrics for Next Session

⬜ User feedback confirms v1.15.0 performance improvements
⬜ All remaining whose() usage eliminated
⬜ At least one project template prompt implemented
⬜ Performance regression test suite created
⬜ Documentation updated with performance guidelines

## Lessons Learned to Remember

1. **Always question assumptions** - The hybrid approach wasn't the problem
2. **Measure everything** - Simple benchmarks revealed the whose() catastrophe
3. **User feedback is gold** - Each complaint led to a breakthrough
4. **Small optimizations compound** - 67% + 93% = 95%+ total improvement
5. **Direct is often better** - try/catch beats safeGet() wrapper

---

## Progress Today (2025-08-12)
- ✅ Documentation overhaul (CONTRIBUTING.md, test suite cleanup)
- ✅ Closed old PRs and housekeeping
- ✅ Fixed 458 lint issues and established type safety baseline
- ✅ Created v1.15.0 performance test prompt for user validation

---

*Updated: 2025-08-12 (Evening)*
*For: Next development session*
*Priority: Get v1.15.0 performance validation, implement project templates*
*Note: Lint infrastructure now working - 1,436 remaining issues are mostly unavoidable*
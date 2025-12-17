# Next Priorities - Brainstorming Session (2025-10-16)

**Generated**: October 16, 2025, 6:00 PM **Status**: Ready to execute - Choose your path! **Foundation**: All Quick Win
phases completed, bulk optimizations shipped today

## 🎉 What We Just Achieved

**Today's Commits:**

- ✅ `4f36d2e` - perf: implement optimized bulk complete using single-pass pattern
- ✅ `7d48b49` - docs: add profiling analysis results identifying bulk_complete as next optimization

**Overall Completion Status (as of Oct 8 roadmap update):**

- ✅ 18 major features implemented across foundation, optimization, and high-value feature phases
- ✅ Bulk operations fully optimized (70-80% performance improvements)
- ✅ Advanced search with operators (CONTAINS, OR/AND, date ranges)
- ✅ Smart Capture from meeting notes with AI extraction
- ✅ Real LLM testing with Ollama (validated on M2 Air, M4 Pro, M2 Ultra)
- ✅ Database export, cache validation, granular cache invalidation
- ✅ Comprehensive error taxonomy with recovery guidance
- ✅ ~71 hours of implementation work completed

**The verdict from IMPROVEMENT_ROADMAP.md line 5:**

> "ALL Quick Win Phases COMPLETED + Advanced Search + Smart Capture - Foundation solid, high-value features delivered"

## 🚀 Three Clear Paths Forward

### Option A: Workflow Automation Bundles (2-3 days)

**Best for**: Immediate user value, leveraging existing prompt infrastructure

**What it is**: Composite tools that combine multiple operations into single workflows

- Example: `plan_my_day()` → internally calls `tasks(mode: today)` + `productivity_stats()` + `analyze_overdue()`
- Example: `weekly_review()` → orchestrates multiple review operations

**Why now**:

- Prompts already exist (see `src/prompts/gtd/`)
- Tool layer is straightforward (glue existing tools together)
- High user impact (Claude users love single-step workflows)
- Natural progression from individual tools

**Roadmap reference**: Line 486, "Workflow Automation" listed as major feature **Implementation time**: 2-3 days
**Dependencies**: None (all tools exist)

---

### Option B: Mac mini CI Deployment (1-2 days, mostly operational)

**Best for**: System health, catching OmniFocus-specific issues early

**What it is**: Self-hosted GitHub runner on Mac hardware to run full integration tests

- Currently: Linux CI only (can't run OmniFocus operations)
- Problem: Cache warming, real permission checks, actual OmniFocus interactions not tested
- Solution: Deploy documented Mac runner to get full CI coverage

**Why now**:

- Documentation complete (see `docs/SELF_HOSTED_CI_MAC.md`)
- Integration tests broken by cache warming initially (commit 532efbc fixed it)
- Catch regressions before they hit production
- Validates real workflows vs simulations

**Roadmap reference**: Line 1070-1094, fully documented as optional enhancement **Implementation time**: 1-2 days
(mostly operational setup) **Dependencies**: Mac mini hardware, OmniFocus license, test database

---

### Option C: Data-Driven Auto-Recovery (1-2 hours analysis, 6-8 hours if implementing)

**Best for**: Solving transient failure problems if they exist

**What it is**: Intelligent retry with exponential backoff for recoverable failures

- Only implement if error metrics warrant it (>10% of failures are recoverable)
- Logging infrastructure already exists to measure this

**Why now**:

- Error taxonomy complete (categorizes recoverable vs permanent)
- Correlation ID system enables request tracing
- Need empirical data to decide if worth building
- Analysis step is trivial (1-2 hours to review error logs)

**Roadmap reference**: Line 176-196, deferred pending error metrics analysis **Implementation time**: 1-2 hours to
analyze, then conditional 6-8 hours to implement **Dependencies**: Access to error metrics from production usage

---

## 🎯 Decision Matrix

| Factor              | Workflow Bundles | Mac CI           | Auto-Recovery        |
| ------------------- | ---------------- | ---------------- | -------------------- |
| **Time Investment** | 2-3 days         | 1-2 days         | 1-2h + conditional   |
| **User Impact**     | High (immediate) | Medium (quality) | High (reliability)   |
| **Complexity**      | Low (glue)       | Medium (ops)     | Medium (logic)       |
| **Dependencies**    | None             | Hardware         | Data collection      |
| **Ready to Start**  | Yes, now         | Yes, now         | Needs analysis first |
| **Risk Level**      | Low              | Low              | Low                  |

## 💡 Recommendation

**Start with: Workflow Automation Bundles**

Rationale:

1. **Highest ROI**: User-facing, immediate value, no blockers
2. **Natural progression**: All building blocks exist, just orchestration
3. **Momentum**: Fresh off bulk operation victories, energy high
4. **Parallel opportunity**: Could do Mac CI setup in parallel (mostly waiting)

### Next Session Blueprint

1. **First 30 min**: Read the Brainstorming skill (you have it)
2. **Next 1.5 hours**: Design the Workflow Bundles architecture
   - How many bundles? (estimate 3-5 high-value ones)
   - Data flow between tools?
   - LLM-friendly descriptions?
3. **Decision point**: Approve design or refine
4. **Then**: Choose between implementation, Mac CI setup, or auto-recovery analysis

## 📚 Key Reference Documents

- **Improvement Roadmap**: `docs/IMPROVEMENT_ROADMAP.md` (full roadmap with all completed items)
- **Profiling Analysis**: `docs/PROFILING_ANALYSIS_COMPLETE.md` (bulk operation optimization details)
- **Bulk Operations Pattern**: `docs/BULK_OPERATIONS_PATTERN.md` (reference for similar patterns)
- **Mac CI Setup**: `docs/SELF_HOSTED_CI_MAC.md` (deployment guide if choosing that path)
- **GTD Prompts**: `src/prompts/gtd/` (existing prompt classes to wrap)

## 🔗 Related Git History

```
4f36d2e perf: implement optimized bulk complete using single-pass pattern
7d48b49 docs: add profiling analysis results identifying bulk_complete as next optimization
d4f5837 docs: add bulk operations pattern documentation and profiling plan
27e60a6 perf: implement optimized bulk delete using single-pass bridge pattern
```

Last major feature (before optimizations): Smart Capture (Oct 1, 2025)

---

**Ready to pick this up when you get home?** Pull this commit, review the three options, and we can jump into whichever
path resonates most!

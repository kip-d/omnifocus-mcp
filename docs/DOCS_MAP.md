# OmniFocus MCP Documentation Map

**Quick navigation to all documentation in this repository.**

---

## 🚀 Start Here

**Essential documents for AI assistants and developers:**

- **[CLAUDE.md](../CLAUDE.md)** - Essential guide for Claude Code (AI assistant instructions)
- **[README.md](../README.md)** - Project overview, installation, and quick start
- **[docs/dev/PATTERNS.md](dev/PATTERNS.md)** - Quick symptom lookup and common solutions (SEARCH HERE FIRST when debugging!)
- **[docs/dev/ARCHITECTURE.md](dev/ARCHITECTURE.md)** - Complete technical implementation details (START HERE for development)
- **[docs/dev/LESSONS_LEARNED.md](dev/LESSONS_LEARNED.md)** - Hard-won insights that save hours of debugging

---

## 👥 For End Users

**Getting started and daily use:**

- **[docs/user/GETTING_STARTED.md](user/GETTING_STARTED.md)** - First conversation with Claude and natural language examples
- **[docs/user/SMART_CAPTURE.md](user/SMART_CAPTURE.md)** - Parse meeting notes and transcripts into tasks
- **[docs/user/TROUBLESHOOTING.md](user/TROUBLESHOOTING.md)** - Common issues and solutions
- **[docs/user/PERMISSIONS.md](user/PERMISSIONS.md)** - macOS permissions setup and configuration
- **[docs/user/PRIVACY_AND_LOGGING.md](user/PRIVACY_AND_LOGGING.md)** - Privacy practices and logging information

**Prompts and workflows:**

- **[prompts/README.md](../prompts/README.md)** - Manual copy/paste prompts for testing and workflows
- **[src/prompts/README.md](../src/prompts/README.md)** - Built-in MCP prompts (programmatic)

---

## 💻 For Developers

### Core Development Docs

- **[docs/dev/DEVELOPER_GUIDE.md](dev/DEVELOPER_GUIDE.md)** - Complete API reference with JSON examples
- **[docs/dev/ARCHITECTURE.md](dev/ARCHITECTURE.md)** - JXA + OmniJS Bridge implementation patterns
- **[docs/dev/PATTERNS.md](dev/PATTERNS.md)** - Quick symptom lookup and proven solutions
- **[docs/dev/PATTERN_INDEX.md](dev/PATTERN_INDEX.md)** - Code pattern library (bridge helpers, field access patterns)
- **[docs/dev/LESSONS_LEARNED.md](dev/LESSONS_LEARNED.md)** - Critical insights from development (MCP lifecycle, async operations, etc.)
- **[docs/dev/DEBUGGING_WORKFLOW.md](dev/DEBUGGING_WORKFLOW.md)** - Systematic debugging methodology
- **[docs/dev/JXA-VS-OMNIJS-PATTERNS.md](dev/JXA-VS-OMNIJS-PATTERNS.md)** - When to use JXA vs OmniJS bridge

### Technical Deep Dives

- **[docs/dev/SCRIPT_SIZE_LIMITS.md](dev/SCRIPT_SIZE_LIMITS.md)** - Empirical JXA/OmniJS script size testing (523KB JXA, 261KB bridge)
- **[docs/dev/BENCHMARK_RESULTS.md](dev/BENCHMARK_RESULTS.md)** - Performance metrics across hardware (M1, M2, M4)
- **[docs/dev/BENCHMARK-ANALYSIS-OCT-2025.md](dev/BENCHMARK-ANALYSIS-OCT-2025.md)** - October 2025 benchmark deep dive
- **[docs/dev/HARDWARE_PERFORMANCE_ANALYSIS.md](dev/HARDWARE_PERFORMANCE_ANALYSIS.md)** - Hardware-specific performance characteristics
- **[docs/dev/PERFORMANCE_COMPARISON_CHARTS.md](dev/PERFORMANCE_COMPARISON_CHARTS.md)** - Visual performance comparisons
- **[docs/dev/PERFORMANCE-BOTTLENECK-ANALYSIS.md](dev/PERFORMANCE-BOTTLENECK-ANALYSIS.md)** - Identifying and fixing performance issues
- **[docs/dev/INSTRUMENTS_PROFILING_GUIDE.md](dev/INSTRUMENTS_PROFILING_GUIDE.md)** - Using Xcode Instruments for profiling

### Implementation Checkpoints

- **[docs/dev/CHECKPOINT-OMNIJS-V3-BREAKTHROUGH.md](dev/CHECKPOINT-OMNIJS-V3-BREAKTHROUGH.md)** - OmniJS v3 implementation breakthrough
- **[docs/dev/CHECKPOINT-ADDED-DATE-FIELDS-OCT-2025.md](dev/CHECKPOINT-ADDED-DATE-FIELDS-OCT-2025.md)** - Date field additions checkpoint
- **[docs/dev/SESSION-CHECKPOINT-OCT-2025.md](dev/SESSION-CHECKPOINT-OCT-2025.md)** - October 2025 development session summary
- **[docs/dev/BRANCH-SUMMARY-profiling-benchmarking.md](dev/BRANCH-SUMMARY-profiling-benchmarking.md)** - Profiling/benchmarking branch summary

### Specific Technical Topics

- **[docs/dev/FIELD_INVENTORY_ANALYSIS.md](dev/FIELD_INVENTORY_ANALYSIS.md)** - Available OmniFocus fields and properties
- **[docs/dev/TAG_FILTERING_BUG_ANALYSIS.md](dev/TAG_FILTERING_BUG_ANALYSIS.md)** - Tag filtering implementation analysis
- **[docs/dev/META_FIELDS_OPPORTUNITIES.md](dev/META_FIELDS_OPPORTUNITIES.md)** - Metadata field enhancement opportunities
- **[docs/dev/META_FIELDS_SUMMARY.md](dev/META_FIELDS_SUMMARY.md)** - Metadata field summary
- **[docs/dev/MCP_SPECIFICATION_ALIGNMENT.md](dev/MCP_SPECIFICATION_ALIGNMENT.md)** - MCP protocol compliance details
- **[docs/dev/SDK_UPGRADE_RECOMMENDATION.md](dev/SDK_UPGRADE_RECOMMENDATION.md)** - MCP SDK upgrade guidance

### Testing

- **[docs/dev/TEST_CLEANUP_GUIDE.md](dev/TEST_CLEANUP_GUIDE.md)** - Test suite maintenance guide
- **[docs/dev/SKIPPED_TESTS.md](dev/SKIPPED_TESTS.md)** - Documentation of skipped tests and why
- **[docs/dev/TEST_PERFORMANCE_ANALYSIS_2025-10-20.md](dev/TEST_PERFORMANCE_ANALYSIS_2025-10-20.md)** - Test suite performance analysis

---

## 📖 API Reference

**Three versions optimized for different use cases:**

- **[docs/api/API-REFERENCE-V2.md](api/API-REFERENCE-V2.md)** - Main developer reference (complete specifications)
- **[docs/api/API-REFERENCE-LLM.md](api/API-REFERENCE-LLM.md)** - Optimized for Claude Desktop Instructions
- **[docs/api/API-COMPACT.md](api/API-COMPACT.md)** - Context window optimized (~30% of full reference)

**Version selection guide:**

| Use Case | Version | Reason |
|----------|---------|--------|
| Implementing code against the API | **V2** | Complete specifications |
| Improving Claude's tool usage | **LLM** | Optimized for AI understanding |
| Limited context window | **Compact** | ~30% token usage |
| Debugging specific tool | **V2** | Full error details |
| Quick reference | **Compact** | Fast lookup |

---

## 🔧 Operational & Testing

**Testing infrastructure:**

- **[docs/operational/TESTING_TOOLS.md](operational/TESTING_TOOLS.md)** - Testing infrastructure overview and tools
- **[docs/operational/REAL_LLM_TESTING.md](operational/REAL_LLM_TESTING.md)** - Real LLM integration testing with Ollama
- **[docs/operational/TEST_SUITE_ARCHITECTURE.md](operational/TEST_SUITE_ARCHITECTURE.md)** - Test suite design and organization
- **[docs/TEST_OPTIMIZATION_RESULTS.md](TEST_OPTIMIZATION_RESULTS.md)** - Test suite optimization results

**Configuration and usage:**

- **[docs/operational/LLM_USAGE_GUIDE.md](operational/LLM_USAGE_GUIDE.md)** - Optimizing context usage with Claude
- **[docs/operational/PROMPT_DISCOVERY.md](operational/PROMPT_DISCOVERY.md)** - MCP prompt discovery and listing
- **[docs/claude-desktop-config.md](claude-desktop-config.md)** - Claude Desktop-specific configuration

---

## 📚 Reference Materials

**Feature-specific references:**

- **[docs/TOOLS.md](TOOLS.md)** - Complete tool listing and descriptions
- **[docs/reference/BATCH_OPERATIONS.md](reference/BATCH_OPERATIONS.md)** - Batch task operations reference
- **[docs/reference/GTD-WORKFLOW-MANUAL.md](reference/GTD-WORKFLOW-MANUAL.md)** - GTD workflow implementation guide
- **[docs/reference/LLM_FILTER_CONVERSION.md](reference/LLM_FILTER_CONVERSION.md)** - Converting natural language to query filters

**Performance references:**

- **[docs/reference/PERFORMANCE.md](reference/PERFORMANCE.md)** - Performance optimization techniques
- **[docs/reference/PERFORMANCE_EXPECTATIONS.md](reference/PERFORMANCE_EXPECTATIONS.md)** - Performance characteristics by hardware
- **[docs/PERFORMANCE_M4PRO_2025-10-20.md](PERFORMANCE_M4PRO_2025-10-20.md)** - M4 Pro performance benchmarks
- **[docs/PERFORMANCE_M4_COMPARISON_2025-10-21.md](PERFORMANCE_M4_COMPARISON_2025-10-21.md)** - M4 vs other hardware comparison

**Technical patterns:**

- **[docs/BULK_OPERATIONS_PATTERN.md](BULK_OPERATIONS_PATTERN.md)** - Bulk operation implementation patterns
- **[docs/SCRIPT_GENERATION_STANDARDS.md](SCRIPT_GENERATION_STANDARDS.md)** - Script generation best practices
- **[docs/tools/PATTERN_ANALYSIS_GUIDE.md](tools/PATTERN_ANALYSIS_GUIDE.md)** - Pattern analysis tool guide

**Operations profiling:**

- **[docs/OPERATION_PROFILING_RESULTS.md](OPERATION_PROFILING_RESULTS.md)** - Profiling results for operations
- **[docs/PROFILING_ANALYSIS_COMPLETE.md](PROFILING_ANALYSIS_COMPLETE.md)** - Complete profiling analysis
- **[docs/CACHE_WARMING_ANALYSIS_2025-10-20.md](CACHE_WARMING_ANALYSIS_2025-10-20.md)** - Cache warming analysis
- **[docs/CACHE_WARMING_OPTIMIZATION_ANALYSIS.md](CACHE_WARMING_OPTIMIZATION_ANALYSIS.md)** - Cache optimization analysis

**Query alternatives:**

- **[docs/OMNIFOCUS_QUERY_ALTERNATIVES.md](OMNIFOCUS_QUERY_ALTERNATIVES.md)** - Alternative query approaches

**Benchmarking:**

- **[docs/BENCHMARK_ANALYSIS.md](BENCHMARK_ANALYSIS.md)** - Benchmark analysis
- **[docs/BENCHMARK_GUIDE.md](BENCHMARK_GUIDE.md)** - How to run benchmarks
- **[docs/BENCHMARK_MYSTERY_SOLVED.md](BENCHMARK_MYSTERY_SOLVED.md)** - Benchmark investigation results

---

## 🧪 Evaluation & Testing

**LLM evaluation suite:**

- **[docs/evaluation/README.md](evaluation/README.md)** - Evaluation suite overview
- **[docs/evaluation/EVALUATION_STRATEGY.md](evaluation/EVALUATION_STRATEGY.md)** - Planning, approach, and methodology
- **[docs/evaluation/RUNNING_EVALUATIONS.md](evaluation/RUNNING_EVALUATIONS.md)** - Step-by-step guide to running evaluations
- **[docs/evaluation/EVALUATION_SUMMARY.md](evaluation/EVALUATION_SUMMARY.md)** - Detailed breakdown of all 10 questions
- **[docs/evaluation/INDEX.md](evaluation/INDEX.md)** - Evaluation index

**Testing prompts:**

- **[TESTING_PROMPT.md](../TESTING_PROMPT.md)** - Unified testing guide for v3.0.0 API (4 tools) with natural language scenarios, technical validation, error handling, performance tests, and cleanup system
- **[.archive/testing-prompts/](../.archive/testing-prompts/)** - Archived testing prompts (consolidated November 2025)

---

## 🗺️ Plans & Roadmap

**Implementation plans:**

- **[docs/plans/2025-10-16-omnifocus-4.7-upgrade.md](plans/2025-10-16-omnifocus-4.7-upgrade.md)** - OmniFocus 4.7 upgrade plan
- **[docs/plans/2025-10-18-multi-machine-session-sync.md](plans/2025-10-18-multi-machine-session-sync.md)** - Multi-machine session sync plan
- **[docs/plans/README-MULTI-MACHINE-SYNC.md](plans/README-MULTI-MACHINE-SYNC.md)** - Multi-machine sync overview

**Project status:**

- **[docs/IMPROVEMENT_ROADMAP.md](IMPROVEMENT_ROADMAP.md)** - Completed features and future plans
- **[docs/NEXT_PRIORITIES_2025-10-16.md](NEXT_PRIORITIES_2025-10-16.md)** - Development priorities as of Oct 2025
- **[docs/OMNIFOCUS_4.7_UPGRADE_PLAN.md](OMNIFOCUS_4.7_UPGRADE_PLAN.md)** - OmniFocus 4.7 upgrade planning
- **[docs/OMNIFOCUS_4.7_UPGRADE_COMPLETE.md](OMNIFOCUS_4.7_UPGRADE_COMPLETE.md)** - OmniFocus 4.7 upgrade completion summary

---

## 🏗️ Infrastructure & CI/CD

- **[docs/SELF_HOSTED_CI_MAC.md](SELF_HOSTED_CI_MAC.md)** - Self-hosted CI on macOS setup guide

---

## 📦 Archived Documentation

**Historical documentation and deprecated features:**

- **[docs/ARCHIVED_DOCUMENTATION_AUDIT_SUMMARY.md](ARCHIVED_DOCUMENTATION_AUDIT_SUMMARY.md)** - Documentation archival audit summary
- **[docs/ARCHIVED_DOCUMENTATION_COMPLETE.md](ARCHIVED_DOCUMENTATION_COMPLETE.md)** - Complete archived documentation listing
- **[docs/ARCHIVED_DOCUMENTATION_STATUS.md](ARCHIVED_DOCUMENTATION_STATUS.md)** - Archival status tracking

**Archive repository:** https://github.com/kip-d/omnifocus-mcp-archive

---

## 🔍 Quick Problem Lookup

**Having an issue? Find the solution quickly:**

| Symptom | Go To | Quick Fix |
|---------|-------|-----------|
| Tool returns 0s/empty but has data | [PATTERNS.md](dev/PATTERNS.md) → "Tool Returns Empty/Zero Values" | Test MCP integration first! |
| Test expects data.id but gets undefined | [PATTERNS.md](dev/PATTERNS.md) → "Response Structure Mismatches" | Test MCP response structure! |
| Tool works in CLI but test fails | [PATTERNS.md](dev/PATTERNS.md) → "Response Structure Mismatches" | Compare actual response structure |
| Tags not saving/empty | [PATTERNS.md](dev/PATTERNS.md) → "Tags Not Working" | Use `bridgeSetTags()` |
| Script timeout (25+ seconds) | [PATTERNS.md](dev/PATTERNS.md) → "Performance Issues" | Never use `.where()/.whose()` |
| Dates wrong time | [PATTERNS.md](dev/PATTERNS.md) → "Date Handling" | Use `YYYY-MM-DD HH:mm` not ISO+Z |
| MCP test hangs | [PATTERNS.md](dev/PATTERNS.md) → "MCP Testing" | Stdin close = correct behavior |
| "Script too large" error | [SCRIPT_SIZE_LIMITS.md](dev/SCRIPT_SIZE_LIMITS.md) | Limits are 523KB - check syntax |
| Function not found | Search `src/omnifocus/scripts/shared/` | Use existing helpers |
| Integration test timeout | [PATTERNS.md](dev/PATTERNS.md) → "Integration Tests" | 60s requests, 90s tests |

**Not listed? Search [PATTERNS.md](dev/PATTERNS.md) for keywords before debugging!**

---

## 📂 Documentation by Category

### By Audience

- **End Users**: `docs/user/`, `prompts/`, Getting Started, Troubleshooting
- **Developers**: `docs/dev/`, `docs/api/`, Architecture, Patterns, Lessons Learned
- **Operations**: `docs/operational/`, Testing Tools, LLM Testing
- **Contributors**: Development guides, architecture docs, pattern libraries

### By Topic

- **Architecture**: ARCHITECTURE.md, JXA-VS-OMNIJS-PATTERNS.md, SCRIPT_SIZE_LIMITS.md
- **Debugging**: PATTERNS.md, DEBUGGING_WORKFLOW.md, LESSONS_LEARNED.md
- **Performance**: BENCHMARK_RESULTS.md, PERFORMANCE.md, Hardware analysis docs
- **Testing**: TEST_CLEANUP_GUIDE.md, REAL_LLM_TESTING.md, Evaluation suite
- **API**: API-REFERENCE-V2.md, API-REFERENCE-LLM.md, API-COMPACT.md
- **Workflows**: GTD-WORKFLOW-MANUAL.md, SMART_CAPTURE.md, Built-in prompts

---

## 🎯 Most Important Documents

**If you only read 5 documents, read these:**

1. **[CLAUDE.md](../CLAUDE.md)** - Essential for AI assistants working with this codebase
2. **[docs/dev/PATTERNS.md](dev/PATTERNS.md)** - Symptom lookup saves hours of debugging
3. **[docs/dev/ARCHITECTURE.md](dev/ARCHITECTURE.md)** - Understanding the technical implementation
4. **[docs/dev/LESSONS_LEARNED.md](dev/LESSONS_LEARNED.md)** - Critical insights from development
5. **[docs/user/GETTING_STARTED.md](user/GETTING_STARTED.md)** - Natural language usage examples

---

## 📝 Documentation Standards

**When adding new documentation:**

1. Add it to this map in the appropriate section
2. Include a one-line description
3. Cross-reference related docs
4. Follow existing naming conventions
5. Update the "Quick Problem Lookup" table if it solves a common issue

---

**Last Updated**: 2025-10-29
**Total Documents**: 85+
**Documentation Coverage**: Comprehensive (user, developer, API, operations, evaluation)

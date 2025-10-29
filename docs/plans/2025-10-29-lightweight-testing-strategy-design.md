# Lightweight Testing Strategy Design

**Date:** 2025-10-29
**Status:** Approved
**Goal:** Enable unattended single-session testing of all 31 MCP tools

## Problem Statement

User Testing hit Claude Desktop's conversation length limit at test 21/31 (68% through). Current testing prompt is too verbose, making complete testing impossible in a single session. This breaks the unattended testing workflow where User Testing needs to paste prompt and walk away.

## Requirements

1. **Primary:** Single-session unattended testing (paste and walk away)
2. **Coverage:** All 31 tools tested
3. **Debugging:** Detailed investigation for failures
4. **Acceptable:** 2-3 pre-planned sessions if single session proves impossible

## Solution: Two-Phase Auto-Transition Testing

### Architecture

**One Prompt, Two Phases:**
- **Phase 1:** Lightweight pass (all 31 tools, concise output)
- **Phase 2:** Automatic detailed investigation (failures only, triggered in same session)

### Phase 1: Lightweight Pass

**Output Format:**
```
✅ Test N: tool_name(key_params) - brief_result
❌ Test N: tool_name - FAIL: one_line_error
⚠️ Test N: tool_name - WARNING: issue (e.g., slow query >10s)
```

**Included:**
- Pass/fail indicator
- Tool name + key parameters
- Brief result (count, success message)
- Timing only if > 10 seconds
- One-line error for failures

**Excluded:**
- Full JSON tool calls (except failures)
- Complete responses (except failures)
- Detailed analysis (except failures)
- Field-by-field validation (except failures)

**Token Budget:** ~15-20k tokens (vs current ~60-80k)

### Phase 2: Detailed Investigation (Auto-Triggered)

**Trigger Condition:** Phase 1 detects any failures or warnings

**Output for Each Failure:**
```markdown
🔍 Test N: tool_name - DETAILED ANALYSIS

Tool Call: {full JSON}
Response: {relevant excerpt}
Issue Analysis: {root cause}
File Locations: {paths}
Recommendations: {specific fixes}
```

**Token Budget:** ~500-1000 tokens per failed test

### Token Estimates

**Successful run (no failures):**
- Phase 1: 15-20k tokens
- Claude responses: 20-30k tokens
- **Total: 35-50k tokens** ✅

**With failures (2-3 typical):**
- Phase 1: 15-20k tokens
- Phase 2: 2-3k tokens (3 failures × 1k each)
- Claude responses: 25-35k tokens
- **Total: 42-58k tokens** ✅

**Current baseline:** Hit limits at ~120-140k tokens (test 21/31)

## Implementation

### File: `docs/operational/TESTING_PROMPT_LIGHTWEIGHT.md`

Structure:
```markdown
# OmniFocus MCP Comprehensive Test Suite

## Instructions
- Phase 1: Run all 31 tests with lightweight format
- Phase 2: IF failures detected, automatically investigate

## Output Format
[Format specifications]

## Phase 1: All Tests
[31 tests organized by category]

## Phase 2: Detailed Investigation Template
[Investigation format for failures]
```

### Migration Plan

1. **Create new prompt** based on existing `TESTING_PROMPTS_CLAUDE_DESKTOP.md`
2. **Preserve test cases** (same 31 tools, same test scenarios)
3. **Update output instructions** to lightweight format
4. **Add Phase 2 auto-trigger** instructions
5. **Test with User Testing** (single session)
6. **Iterate if needed** based on actual token usage

## Success Criteria

✅ User Testing can paste ONE prompt
✅ Walk away (unattended execution)
✅ All 31 tools tested in single session
✅ Failures get automatic detailed investigation
✅ Total token usage < 60-70k (comfortable margin)

## Fallback Plan

If single session still doesn't work after optimization:
- **Split at natural boundary:** Tests 1-16 (queries) vs 17-31 (analytics/mutations)
- **Two separate prompts** with clear handoff
- **Still unattended per session**

## Notes

- Current test suite: 20/31 tests before hitting limits
- Token reduction needed: 60-70%
- Lightweight format achieves 75-80% reduction
- Phase 2 keeps debugging capability intact

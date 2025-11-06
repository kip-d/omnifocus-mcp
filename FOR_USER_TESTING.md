# Instructions for User Testing Team

## 📋 What You're Testing

We've built 3 new unified MCP tools that potentially replace 17 existing tools:

**New Tools:**
- `omnifocus_read` - Query builder
- `omnifocus_write` - Mutation builder
- `omnifocus_analyze` - Analysis router

**Critical Question:** Can these 3 tools do everything the 17 old tools could do?

---

## 🎯 Your Mission

Test in TWO phases:

### Phase 1: Test with Both (3 new + 17 old tools)
Verify the new tools work correctly alongside the old ones.

### Phase 2: Test with ONLY the 3 new tools 🚨
**THIS IS THE CRITICAL TEST**

Remove the 17 old tools and verify everything still works. If Phase 2 passes, we can confidently delete 17 tools from production and save massive context window space for LLMs.

---

## 📦 What I'm Giving You

**In this branch (`feature/three-tool-builder-api`):**

1. **`QUICK_START_TESTING.md`** ⭐ START HERE
   - 5-minute setup guide
   - Quick reference for both test phases
   - Clear success/failure criteria

2. **`TESTING_PROMPT.md`** ⭐ COPY INTO CLAUDE DESKTOP
   - Natural language conversation to test all functionality
   - Copy/paste this into Claude Desktop
   - Use TWICE: once for Phase 1, once for Phase 2

3. **`TESTING_INSTRUCTIONS.md`**
   - Complete detailed instructions
   - Troubleshooting guide
   - Report template

4. **`scripts/toggle-legacy-tools.sh`** ⭐ AUTOMATION TOOL
   - Easy enable/disable of the 17 legacy tools
   - Run `./scripts/toggle-legacy-tools.sh disable` for Phase 2
   - Run `./scripts/toggle-legacy-tools.sh enable` to restore

---

## 🚀 Quick Start for Testers

```bash
# 1. Get the branch
cd ~/src/omnifocus-mcp
git checkout feature/three-tool-builder-api
git pull

# 2. Build and test
npm install
npm run build
npm run test:integration -- tests/integration/tools/unified

# 3. Follow QUICK_START_TESTING.md for Claude Desktop testing
```

---

## 🎯 Critical Success Criteria

### Phase 1 (All Tools): Must Pass ✅
- Read operations work
- Write operations work (create, update, complete, delete)
- Analyze operations work
- Legacy tools still work

### Phase 2 (Only 3 Tools): Must Pass ✅⚠️
**SAME TESTS as Phase 1, but with 17 legacy tools disabled**
- Read operations STILL work
- Write operations STILL work
- Analyze operations STILL work
- **Zero functionality lost**

### Decision Point

**If Phase 2 passes:** ✅
- We can safely remove 17 legacy tools
- Massive context window savings
- Green light to merge and deploy

**If Phase 2 fails:** ❌
- Report what broke
- Need to fix unified tools
- Cannot remove legacy tools yet

---

## 📊 What We Need from Testing

### Required Deliverable

A completed report answering:

1. **Phase 1 Results:** All tests passing? YES / NO
2. **Phase 2 Results:** All tests passing? YES / NO
3. **Critical Question:** Can we remove the 17 legacy tools? YES / NO
4. **Issues Found:** List any problems
5. **Recommendation:** Merge / Do Not Merge

---

## 💡 Testing Tips

### Use the Natural Language Prompt
`TESTING_PROMPT.md` is designed to be copy/pasted directly into Claude Desktop. It walks Claude through:
- Testing all read operations
- Testing full CRUD cycle (create/update/complete/delete)
- Testing analysis operations
- Verifying legacy tools (Phase 1 only)

### The Toggle Script is Your Friend
```bash
# For Phase 2 testing
./scripts/toggle-legacy-tools.sh disable

# When done
./scripts/toggle-legacy-tools.sh enable
```

### Don't Panic If Something Breaks
`TESTING_INSTRUCTIONS.md` has a troubleshooting section. Most issues are easy fixes.

---

## 🔍 What Success Looks Like

```
✅ Phase 1: All 20 tools working
✅ Phase 2: All functionality working with only 3 tools
✅ Decision: Can remove 17 legacy tools
✅ Merge approved
```

## ⚠️ What Failure Looks Like

```
✅ Phase 1: All 20 tools working
❌ Phase 2: [SPECIFIC TEST] fails with only 3 tools
❌ Decision: Cannot remove legacy tools yet
❌ Need fixes before merge
```

---

## 📞 Questions?

Check the docs:
- Quick reference: `QUICK_START_TESTING.md`
- Detailed guide: `TESTING_INSTRUCTIONS.md`
- Testing script: `TESTING_PROMPT.md`

---

## 🎯 TL;DR

1. Run `QUICK_START_TESTING.md` setup
2. Copy `TESTING_PROMPT.md` into Claude Desktop (Phase 1)
3. Run `./scripts/toggle-legacy-tools.sh disable`
4. Copy `TESTING_PROMPT.md` into Claude Desktop again (Phase 2)
5. Report results

**Critical Test:** Does Phase 2 pass? That determines if we can remove 17 tools.

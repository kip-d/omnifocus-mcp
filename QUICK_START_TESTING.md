# Quick Start: Testing the Three-Tool Builder API

## 🎯 Goal
Test if 3 new unified tools can fully replace the existing 17 legacy tools.

---

## ⚡ Quick Setup (5 minutes)

```bash
# 1. Get the code
cd ~/src/omnifocus-mcp
git checkout feature/three-tool-builder-api
git pull origin feature/three-tool-builder-api

# 2. Build
npm install
npm run build

# 3. Verify
npm run test:integration -- tests/integration/tools/unified

# Expected: All tests passing ✅
```

---

## 🧪 Two-Phase Testing

### Phase 1: Test with ALL Tools (3 new + 17 old)

**Purpose:** Verify new tools work alongside old ones

```bash
# Server should have 20 tools total
# New: omnifocus_read, omnifocus_write, omnifocus_analyze
# Old: tasks, manage_task, projects, etc.
```

**Steps:**
1. Update Claude Desktop config to point to this branch
2. Restart Claude Desktop
3. Copy/paste `TESTING_PROMPT.md` into Claude Desktop
4. Claude will test all operations
5. Save results

**Expected:** All operations work ✅

---

### Phase 2: Test with ONLY 3 New Tools 🎯

**Purpose:** CRITICAL TEST - Can 3 tools do everything 17 tools did?

```bash
# Disable legacy tools
./scripts/toggle-legacy-tools.sh disable

# This will:
# - Comment out 17 legacy tools
# - Rebuild
# - Verify only 3 tools registered
```

**Steps:**
1. Restart Claude Desktop (to pick up new build)
2. Copy/paste `TESTING_PROMPT.md` again
3. Claude will test same operations
4. **ALL tests must still pass** ⚠️

**Critical Success Criteria:**
- ✅ Read operations work
- ✅ Write operations work (create/update/complete/delete)
- ✅ Analyze operations work
- ✅ No functionality missing

If any test fails → **3 tools cannot replace 17 tools** → Report immediately

```bash
# Restore all tools when done
./scripts/toggle-legacy-tools.sh enable
```

---

## 📊 Report Template

### Test Results: Three-Tool Builder API

**Date:** ___________
**Tester:** ___________
**Branch:** feature/three-tool-builder-api

#### Phase 1: All Tools (3+17) ✅❌
- [ ] Read operations work
- [ ] Write operations work
- [ ] Analyze operations work

#### Phase 2: Only 3 Tools ✅❌
- [ ] Read operations work
- [ ] Write operations work
- [ ] Analyze operations work
- [ ] **Can remove 17 legacy tools?** YES / NO

#### Issues Found
- ________________________________
- ________________________________

#### Decision
- [ ] **READY TO REMOVE 17 LEGACY TOOLS**
- [ ] **NOT READY - Issues found:**
  - ________________________________

---

## 🚨 If Something Goes Wrong

### Build fails
```bash
rm -rf dist/ node_modules/
npm install
npm run build
```

### Can't restore tools
```bash
git checkout src/tools/index.ts
npm run build
```

### Claude Desktop not connecting
```bash
# Check config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Check logs
tail -f ~/Library/Logs/Claude/mcp*.log
```

---

## ✅ Success Looks Like

1. **Phase 1:** All tests pass with 20 tools ✅
2. **Phase 2:** All tests pass with 3 tools ✅
3. **Conclusion:** We can remove 17 legacy tools safely! 🎉

## ❌ Failure Looks Like

1. **Phase 1:** Tests pass ✅
2. **Phase 2:** Some test fails ❌
3. **Conclusion:** Need to fix unified tools before removing legacy tools

---

## 📚 Full Documentation

- **Complete instructions:** `TESTING_INSTRUCTIONS.md`
- **Natural language prompt:** `TESTING_PROMPT.md`
- **Implementation details:** `docs/plans/2025-11-04-three-tool-builder-api-implementation.md`

---

## 🎯 The Big Question

**Can these 3 tools replace 17 tools?**

That's what Phase 2 testing answers. If yes → massive context window savings for LLMs! 🚀
